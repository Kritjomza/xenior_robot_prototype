import asyncio
import math
from collections.abc import Callable

from app.domain.commands import RobotCommand
from app.domain.kinematics import DeltaGeometry, DeltaKinematics
from app.domain.state import RobotState


class MockRobotAdapter:
    """Simulate Cartesian motion and publish consistent pose and joint telemetry."""

    def __init__(self) -> None:
        self._kinematics = DeltaKinematics(DeltaGeometry.simulation_defaults())
        self._state = RobotState()
        self.on_state: Callable[[RobotState], None] | None = None

    async def connect(self) -> None:
        self._state.connected = True

    async def execute(self, command: RobotCommand) -> None:
        if not self._state.connected:
            raise RuntimeError("Mock adapter is disconnected")
        if command.type in ("home", "move_xyz"):
            target = (
                (0.0, 0.0, -350.0)
                if command.type == "home"
                else (command.x_mm, command.y_mm, command.z_mm)
            )
            self._kinematics.inverse(*target)
            start = (self._state.x_mm, self._state.y_mm, self._state.z_mm)
            # Check the path before moving to reject unreachable intermediate poses.
            count = max(2, math.ceil(math.dist(start, target)))
            for step in range(1, count + 1):
                self._kinematics.inverse(
                    *(a + (b - a) * step / count for a, b in zip(start, target, strict=True))
                )
            speed = (
                (command.speed_mm_s or self._state.speed_mm_s)
                if command.type == "move_xyz"
                else self._state.speed_mm_s
            )
            self._state.speed_mm_s = speed
            duration = math.dist(start, target) / speed
            loop = asyncio.get_running_loop()
            started = loop.time()
            while True:
                fraction = min(1.0, (loop.time() - started) / duration) if duration else 1.0
                position = tuple(a + (b - a) * fraction for a, b in zip(start, target, strict=True))
                joints = self._kinematics.inverse(*position)
                self._state.x_mm, self._state.y_mm, self._state.z_mm = position
                self._state.joints_deg = list(joints.values_deg)
                if self.on_state:
                    self.on_state(self._state)
                if fraction >= 1:
                    break
                await asyncio.sleep(min(0.04, duration * (1 - fraction)))
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

    def set_home_speed(self, speed: float) -> None:
        self._state.speed_mm_s = speed

    def set_rotation(self, rz_deg: float) -> None:
        self._state.rz_deg = rz_deg

    async def stop(self) -> None:
        # The executor cancels the active motion before stopping.
        return None

    async def reset(self) -> None:
        self._state = RobotState(connected=True)

    async def get_state(self) -> RobotState:
        return self._state.model_copy(deep=True)
