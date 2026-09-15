import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.adapters.mock import MockRobotAdapter
from app.auth import (
    Principal,
    PrincipalVerifier,
    TokenVerificationError,
    principal_verifier_from_environment,
    require_principal,
    require_websocket_principal,
)
from app.domain.program import RobotProgramV1
from app.domain.state import RobotState
from app.services.executor import BusyError, Executor, RunNotFoundError

AuthenticatedPrincipal = Annotated[Principal, Depends(require_principal)]


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

    @app.post("/api/v1/programs/validate")
    async def validate(
        program: RobotProgramV1, principal: AuthenticatedPrincipal
    ) -> dict[str, bool | int]:
        return {"valid": True, "command_count": len(program.commands)}

    @app.post("/api/v1/runs", status_code=202)
    async def start(
        program: RobotProgramV1,
        request: Request,
        principal: AuthenticatedPrincipal,
    ) -> dict[str, str]:
        runtime: Executor = request.app.state.executor
        return {"run_id": await runtime.start(program)}

    @app.post("/api/v1/runs/{run_id}/stop")
    async def stop(
        run_id: str, request: Request, principal: AuthenticatedPrincipal
    ) -> RobotState:
        runtime: Executor = request.app.state.executor
        return await runtime.stop(run_id)

    @app.post("/api/v1/reset")
    async def reset(
        request: Request, principal: AuthenticatedPrincipal
    ) -> RobotState:
        runtime: Executor = request.app.state.executor
        return await runtime.reset()

    @app.get("/api/v1/state")
    async def state(
        request: Request, principal: AuthenticatedPrincipal
    ) -> RobotState:
        runtime: Executor = request.app.state.executor
        return runtime.state

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

        async def send_states() -> None:
            while True:
                try:
                    snapshot = await asyncio.wait_for(queue.get(), timeout=5)
                except asyncio.TimeoutError:
                    snapshot = runtime.state
                await websocket.send_json(snapshot.model_dump(mode="json"))

        async def receive_disconnect() -> None:
            while True:
                await websocket.receive_text()

        sender = asyncio.create_task(send_states())
        receiver = asyncio.create_task(receive_disconnect())
        try:
            done, _ = await asyncio.wait([sender, receiver], return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()
        except (WebSocketDisconnect, OSError):
            pass
        finally:
            sender.cancel()
            receiver.cancel()
            await asyncio.gather(sender, receiver, return_exceptions=True)
            runtime.unsubscribe(queue)

    return app


app = create_app()
