import asyncio
from contextlib import suppress
from uuid import uuid4

from app.adapters.base import RobotAdapter
from app.domain.program import RobotProgramV1
from app.domain.state import RobotState


class BusyError(Exception):
    """A run is active, or a fault requires reset."""


class RunNotFoundError(Exception):
    """Only the current/latest run can be stopped."""


class Executor:
    def __init__(self, adapter: RobotAdapter) -> None:
        self.adapter = adapter
        self._state = RobotState()
        self._lock = asyncio.Lock()
        self._task: asyncio.Task[None] | None = None
        self._subscribers: set[asyncio.Queue[RobotState]] = set()

    @property
    def state(self) -> RobotState:
        return self._state.model_copy(deep=True)

    async def connect(self) -> None:
        await self.adapter.connect()
        await self._refresh()
        self._publish()

    async def _refresh(self) -> None:
        physical = await self.adapter.get_state()
        for field in ("x_mm", "y_mm", "z_mm", "joints_deg", "speed_mm_s", "gripper", "connected"):
            setattr(self._state, field, getattr(physical, field))

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

    async def start(self, program: RobotProgramV1) -> str:
        async with self._lock:
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

    async def _run(self, program: RobotProgramV1) -> None:
        try:
            for command in program.commands:
                self._state.active_command_id = command.id
                self._state.active_command_type = command.type
                self._publish()
                await self.adapter.execute(command)
                await self._refresh()
                self._state.completed_commands += 1
                self._publish()
                if command.type == "stop":
                    self._state.status = "stopped"
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
            try:
                await self.adapter.stop()
                await self._refresh()
            except Exception as stop_error:
                self._state.error += f"; stop failed: {stop_error}"
        finally:
            self._state.active_command_id = None
            self._state.active_command_type = None
            self._publish()

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
        except Exception as error:
            self._state.status = "faulted"
            self._state.error = str(error)
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
            await self._stop_locked()
            await self.adapter.reset()
            revision = self._state.revision
            self._state = RobotState(revision=revision)
            await self._refresh()
            self._publish()
            return self.state

    async def close(self) -> None:
        async with self._lock:
            await self._stop_locked()
