import asyncio

from app.domain.commands import RobotCommand
from app.domain.state import RobotState


class MockRobotAdapter:
    """Immediate pose changes, fixed mock joints, cancellable real-time waits."""

    def __init__(self) -> None:
        self._state = RobotState()

    async def connect(self) -> None:
        self._state.connected = True

    async def execute(self, command: RobotCommand) -> None:
        if not self._state.connected:
            raise RuntimeError("Mock adapter is disconnected")
        if command.type == "home":
            self._state.x_mm, self._state.y_mm, self._state.z_mm = 0.0, 0.0, -200.0
            self._state.joints_deg = [0.0, 0.0, 0.0]
        elif command.type == "move_xyz":
            self._state.x_mm = command.x_mm
            self._state.y_mm = command.y_mm
            self._state.z_mm = command.z_mm
            if command.speed_mm_s is not None:
                self._state.speed_mm_s = command.speed_mm_s
        elif command.type == "set_speed":
            self._state.speed_mm_s = command.speed_mm_s
        elif command.type == "grip":
            self._state.gripper = "gripped"
        elif command.type == "release":
            self._state.gripper = "released"
        elif command.type == "wait":
            await asyncio.sleep(command.seconds)
        elif command.type == "stop":
            await self.stop()

    async def stop(self) -> None:
        # The executor cancels the wait task before calling this. There is no
        # motion in flight in the immediate-position mock. Preserve pose/grip.
        return None

    async def reset(self) -> None:
        self._state = RobotState(connected=True)

    async def get_state(self) -> RobotState:
        return self._state.model_copy(deep=True)
