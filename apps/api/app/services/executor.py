import asyncio
from collections.abc import Awaitable, Callable
from contextlib import suppress
from typing import Literal
from uuid import uuid4

from app.adapters.base import RobotAdapter
from app.auth import Principal
from app.domain.commands import MoveXYZ, RobotCommand, SetSpeed, StrictModel
from app.domain.kinematics import DeltaGeometry, DeltaKinematics
from app.domain.program import RobotProgramV1
from app.domain.safety import JogRequest, SafetyController
from app.domain.state import RobotState


class BusyError(Exception):
    """A run is active, or a fault requires reset."""


class RunNotFoundError(Exception):
    """Only the current/latest run can be stopped."""


class RunSummary(StrictModel):
    run_id: str
    program_name: str
    status: Literal["stopped"]
    completed_commands: int
    total_commands: int
    error: str | None


RunHistoryHook = Callable[[RunSummary], Awaitable[None]]


class Executor:
    def __init__(
        self,
        adapter: RobotAdapter,
        *,
        safety: SafetyController | None = None,
        run_history_hook: RunHistoryHook | None = None,
    ) -> None:
        self.adapter = adapter
        self.safety = safety or SafetyController()
        self._run_history_hook = run_history_hook
        self._state = RobotState()
        self._lock = asyncio.Lock()
        self._task: asyncio.Task[None] | None = None
        self._subscribers: set[asyncio.Queue[RobotState]] = set()
        self._connected_once = False
        self._recorded_stops: set[str] = set()
        self._program_speed_mm_s = 100.0
        self._kinematics = DeltaKinematics(DeltaGeometry.simulation_defaults())
        self._sync_safety_state()

    @property
    def state(self) -> RobotState:
        return self._state.model_copy(deep=True)

    async def connect(self) -> None:
        async with self._lock:
            reconnecting = self._connected_once
            if reconnecting:
                self.safety.lock(f"adapter reconnecting: {self._state.mode}")
                self._sync_safety_state()
                self._publish()
                await self._stop_locked()
            try:
                await self.adapter.connect()
                await self._refresh()
            except Exception as error:
                self._publish_lifecycle_fault("connection failed", error)
                raise
            if reconnecting:
                self.safety.reconnected(self._state.mode)
                if self._state.status == "faulted":
                    self._state.status = "idle"
                    self._state.error = None
            else:
                self.safety.connected(self._state.mode)
                self._connected_once = True
            self._sync_safety_state()
            self._publish()

    async def _refresh(self) -> None:
        physical = await self.adapter.get_state()
        for field in (
            "x_mm",
            "y_mm",
            "z_mm",
            "joints_deg",
            "rz_deg",
            "speed_mm_s",
            "gripper",
            "connected",
        ):
            setattr(self._state, field, getattr(physical, field))

    def _sync_safety_state(self) -> None:
        self._state.global_speed_percent = self.safety.global_speed_percent
        self._state.locked = self.safety.locked
        self._state.lock_reason = self.safety.lock_reason

    def _publish_lifecycle_fault(self, operation: str, error: Exception) -> None:
        message = f"{operation}: {error}"
        self._state.status = "faulted"
        self._state.error = message
        self._state.connected = False
        self.safety.fault(message)
        self._sync_safety_state()
        self._publish()

    def _publish(self) -> None:
        self._state.revision += 1
        for queue in self._subscribers:
            if queue.full():
                queue.get_nowait()
            queue.put_nowait(self.state)

    def subscribe(self) -> asyncio.Queue[RobotState]:
        queue: asyncio.Queue[RobotState] = asyncio.Queue(maxsize=64)
        self._subscribers.add(queue)
        queue.put_nowait(self.state)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[RobotState]) -> None:
        self._subscribers.discard(queue)

    def unlock(self, principal: Principal, acknowledgement: bool) -> RobotState:
        self.safety.unlock(principal, acknowledgement)
        self._sync_safety_state()
        self._publish()
        return self.state

    async def lock(self, reason: str, *, stop_active: bool = False) -> RobotState:
        async with self._lock:
            if stop_active:
                await self._stop_locked()
            self.safety.lock(reason)
            self._sync_safety_state()
            self._publish()
            return self.state

    def set_global_speed(self, percent: int) -> RobotState:
        self.safety.set_global_speed(percent)
        self._sync_safety_state()
        self._publish()
        return self.state

    async def start(self, program: RobotProgramV1) -> str:
        async with self._lock:
            self.safety.ensure_motion_allowed()
            if self._task is not None and not self._task.done():
                raise BusyError("Another program is already running")
            if self._state.status == "faulted" or not self._state.connected:
                raise BusyError("Reset the mock before starting another program")
            run_id = str(uuid4())
            self._state.run_id = run_id
            self._state.program_name = program.name
            self._state.status = "running"
            self._state.error = None
            self._state.completed_commands = 0
            self._state.total_commands = len(program.commands)
            self._publish()
            # Own a copy so callers cannot mutate an accepted program mid-run.
            self._task = asyncio.create_task(self._run(program.model_copy(deep=True)))
            return run_id

    async def jog(self, request: JogRequest) -> RobotState:
        async with self._lock:
            self.safety.ensure_motion_allowed()
            if self._task is not None and not self._task.done():
                raise BusyError("Cannot jog while a program is active")
            target = MoveXYZ(
                id="jog",
                type="move_xyz",
                x_mm=self._state.x_mm + request.x_mm,
                y_mm=self._state.y_mm + request.y_mm,
                z_mm=self._state.z_mm + request.z_mm,
                speed_mm_s=self.safety.effective_speed(self._program_speed_mm_s),
            )
            self._kinematics.inverse(
                target.x_mm, target.y_mm, target.z_mm, self._state.rz_deg + request.rz_deg
            )
            await self.adapter.execute(target)
            await self._refresh()
            self._state.rz_deg += request.rz_deg
            self._publish()
            return self.state

    async def _run(self, program: RobotProgramV1) -> None:
        try:
            for command in program.commands:
                if command.type != "stop":
                    self.safety.ensure_motion_allowed()
                self._state.active_command_id = command.id
                self._state.active_command_type = command.type
                self._publish()
                await self.adapter.execute(self._with_effective_speed(command))
                await self._refresh()
                self._state.completed_commands += 1
                self._publish()
                if command.type == "stop":
                    self._state.status = "stopped"
                    self._publish()
                    await self._record_stop()
                    break
                # Even immediate mock commands must yield to Stop and telemetry.
                await asyncio.sleep(0)
            else:
                self._state.status = "completed"
        except asyncio.CancelledError:
            raise
        except Exception as error:
            self._state.status = "faulted"
            self._state.error = str(error)
            self.safety.fault(str(error))
            self._sync_safety_state()
            try:
                await self.adapter.stop()
                await self._refresh()
            except Exception as stop_error:
                self._state.error += f"; stop failed: {stop_error}"
        finally:
            self._state.active_command_id = None
            self._state.active_command_type = None
            self._publish()

    def _with_effective_speed(self, command: RobotCommand) -> RobotCommand:
        if isinstance(command, SetSpeed):
            self._program_speed_mm_s = command.speed_mm_s
            return command.model_copy(
                update={"speed_mm_s": self.safety.effective_speed(command.speed_mm_s)}
            )
        if isinstance(command, MoveXYZ):
            if command.speed_mm_s is not None:
                self._program_speed_mm_s = command.speed_mm_s
            return command.model_copy(
                update={"speed_mm_s": self.safety.effective_speed(self._program_speed_mm_s)}
            )
        return command

    async def _record_stop(self) -> None:
        if (
            self._run_history_hook is None
            or self._state.run_id is None
            or self._state.run_id in self._recorded_stops
        ):
            return
        self._recorded_stops.add(self._state.run_id)
        summary = RunSummary(
            run_id=self._state.run_id,
            program_name=self._state.program_name or "",
            status="stopped",
            completed_commands=self._state.completed_commands,
            total_commands=self._state.total_commands,
            error=self._state.error,
        )
        # A history outage must never prevent or roll back a software stop.
        with suppress(Exception):
            await self._run_history_hook(summary)

    async def _stop_locked(self) -> None:
        if self._task is None or self._task.done():
            return
        self._state.status = "stopping"
        self._publish()
        self._task.cancel()
        with suppress(asyncio.CancelledError):
            await self._task
        try:
            await self.adapter.stop()
            await self._refresh()
            self._state.status = "stopped"
            self._state.active_command_id = None
            self._state.active_command_type = None
            self._publish()
            await self._record_stop()
            return
        except Exception as error:
            self._state.status = "faulted"
            self._state.error = str(error)
            self.safety.fault(str(error))
            self._sync_safety_state()
        self._state.active_command_id = None
        self._state.active_command_type = None
        self._publish()

    async def stop(self, run_id: str) -> RobotState:
        async with self._lock:
            if self._state.run_id != run_id:
                raise RunNotFoundError("Run not found; only the latest run is retained")
            await self._stop_locked()
            return self.state

    async def reset(self) -> RobotState:
        async with self._lock:
            self.safety.lock("reset")
            self._sync_safety_state()
            self._publish()
            await self._stop_locked()
            try:
                await self.adapter.reset()
                self._program_speed_mm_s = 100.0
                revision = self._state.revision
                self._state = RobotState(revision=revision)
                await self._refresh()
            except Exception as error:
                self._publish_lifecycle_fault("reset failed", error)
                return self.state
            self.safety.reset(connected=self._state.connected)
            self._sync_safety_state()
            self._publish()
            return self.state

    async def close(self) -> None:
        async with self._lock:
            await self._stop_locked()
