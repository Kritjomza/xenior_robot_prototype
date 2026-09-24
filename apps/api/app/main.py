import asyncio
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal

from dotenv import find_dotenv, load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.adapters.mock import MockRobotAdapter
from app.adapters.robodk import RoboDKRobotAdapter, RoboDKUnavailableError
from app.auth import (
    Principal,
    PrincipalVerifier,
    TokenVerificationError,
    principal_verifier_from_environment,
    require_principal,
    require_websocket_principal,
)
from app.domain.commands import StrictModel
from app.domain.program import RobotProgramV1
from app.domain.safety import (
    JogRequest,
    SafetyLockedError,
    SafetyUnlockError,
    SetGlobalSpeedRequest,
    UnlockSafetyRequest,
)
from app.domain.state import RobotState
from app.services.executor import BusyError, Executor, RunNotFoundError

load_dotenv(find_dotenv())
DEFAULT_ROBODK_STATION = (
    Path(__file__).resolve().parents[3] / "assets" / "robodk" / "delta_robot.rdk"
)

AuthenticatedPrincipal = Annotated[Principal, Depends(require_principal)]


class ModeRequest(StrictModel):
    mode: Literal["mock", "robodk"]


class TwinViewRequest(StrictModel):
    action: Literal["reset", "fit", "show"]


def check_station_capabilities(program: RobotProgramV1, runtime: Executor) -> None:
    if runtime.state.mode == "robodk" and any(
        command.type in ("grip", "release") for command in program.commands
    ):
        raise HTTPException(status_code=409, detail="RoboDK station has no gripper or pick object")


def create_app(principal_verifier: PrincipalVerifier | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        runtime = Executor(MockRobotAdapter())
        await runtime.connect()
        app.state.executor = runtime
        try:
            yield
        finally:
            await runtime.close()

    app = FastAPI(title="Delta Robot Mock API", version="1.0.0", lifespan=lifespan)
    app.state.principal_verifier = principal_verifier or principal_verifier_from_environment()

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError) -> JSONResponse:
        # Never echo non-finite input or Pydantic's exception objects into JSON.
        return JSONResponse(
            status_code=422,
            content={
                "detail": [
                    {"loc": list(item["loc"]), "msg": item["msg"], "type": item["type"]}
                    for item in error.errors()
                ]
            },
        )

    @app.exception_handler(BusyError)
    async def busy_error(request: Request, error: BusyError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(error)})

    @app.exception_handler(RunNotFoundError)
    async def missing_run(request: Request, error: RunNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(error)})

    @app.exception_handler(SafetyLockedError)
    async def safety_locked(request: Request, error: SafetyLockedError) -> JSONResponse:
        return JSONResponse(status_code=423, content={"detail": str(error)})

    @app.exception_handler(SafetyUnlockError)
    async def safety_unlock_error(request: Request, error: SafetyUnlockError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(error)})

    @app.exception_handler(RoboDKUnavailableError)
    async def robodk_unavailable(request: Request, error: RoboDKUnavailableError) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": str(error)})

    @app.post("/api/v1/mode")
    async def select_mode(
        payload: ModeRequest, request: Request, principal: AuthenticatedPrincipal
    ) -> RobotState:
        runtime: Executor = request.app.state.executor
        if payload.mode == "mock":
            return await runtime.select_adapter(MockRobotAdapter(), "mock")
        station_path = os.getenv("ROBODK_STATION_PATH") or str(DEFAULT_ROBODK_STATION)
        adapter = RoboDKRobotAdapter(
            host=os.getenv("ROBODK_HOST", "127.0.0.1"),
            port=int(os.getenv("ROBODK_PORT", "20500")),
            station_path=station_path,
        )
        return await runtime.select_adapter(adapter, "robodk")

    @app.post("/api/v1/programs/validate")
    async def validate(
        program: RobotProgramV1, request: Request, principal: AuthenticatedPrincipal
    ) -> dict[str, bool | int]:
        check_station_capabilities(program, request.app.state.executor)
        return {"valid": True, "command_count": len(program.commands)}

    @app.post("/api/v1/runs", status_code=202)
    async def start(
        program: RobotProgramV1,
        request: Request,
        principal: AuthenticatedPrincipal,
    ) -> dict[str, str]:
        runtime: Executor = request.app.state.executor
        check_station_capabilities(program, runtime)
        return {"run_id": await runtime.start(program)}

    @app.post("/api/v1/runs/{run_id}/stop")
    async def stop(run_id: str, request: Request, principal: AuthenticatedPrincipal) -> RobotState:
        runtime: Executor = request.app.state.executor
        return await runtime.stop(run_id)

    @app.post("/api/v1/safety/unlock")
    async def unlock_safety(
        payload: UnlockSafetyRequest,
        request: Request,
        principal: AuthenticatedPrincipal,
    ) -> RobotState:
        runtime: Executor = request.app.state.executor
        return runtime.unlock(principal, payload.acknowledgement)

    @app.post("/api/v1/safety/lock")
    async def lock_safety(request: Request, principal: AuthenticatedPrincipal) -> RobotState:
        runtime: Executor = request.app.state.executor
        return await runtime.lock("operator locked", stop_active=True)

    @app.post("/api/v1/safety/speed")
    async def set_global_speed(
        payload: SetGlobalSpeedRequest,
        request: Request,
        principal: AuthenticatedPrincipal,
    ) -> RobotState:
        runtime: Executor = request.app.state.executor
        return runtime.set_global_speed(payload.global_speed_percent)

    @app.post("/api/v1/jog")
    async def jog(
        payload: JogRequest,
        request: Request,
        principal: AuthenticatedPrincipal,
    ) -> RobotState:
        runtime: Executor = request.app.state.executor
        return await runtime.jog(payload)

    @app.post("/api/v1/reset")
    async def reset(request: Request, principal: AuthenticatedPrincipal) -> RobotState:
        runtime: Executor = request.app.state.executor
        return await runtime.reset()

    @app.get("/api/v1/state")
    async def state(request: Request, principal: AuthenticatedPrincipal) -> RobotState:
        runtime: Executor = request.app.state.executor
        return await runtime.poll()

    @app.post("/api/v1/twin/view")
    async def twin_view(
        payload: TwinViewRequest, request: Request, principal: AuthenticatedPrincipal
    ) -> dict[str, bool]:
        runtime: Executor = request.app.state.executor
        if not isinstance(runtime.adapter, RoboDKRobotAdapter) or not runtime.state.connected:
            raise HTTPException(status_code=503, detail="RoboDK twin is disconnected")
        await runtime.adapter.view(payload.action)
        return {"ok": True}

    @app.websocket("/api/v1/ws/state")
    async def websocket_state(websocket: WebSocket) -> None:
        try:
            await require_websocket_principal(websocket)
        except TokenVerificationError:
            await websocket.close(code=4401, reason="Bearer authentication required")
            return
        await websocket.accept()
        runtime: Executor = websocket.app.state.executor
        queue = runtime.subscribe()

        try:
            while True:
                try:
                    snapshot = await asyncio.wait_for(queue.get(), timeout=5)
                except asyncio.TimeoutError:
                    snapshot = await runtime.poll()
                await websocket.send_json(snapshot.model_dump(mode="json"))
        except (WebSocketDisconnect, OSError, asyncio.CancelledError):
            pass
        finally:
            runtime.unsubscribe(queue)
            await runtime.lock("websocket lease expired", stop_active=True)

    return app


app = create_app()
