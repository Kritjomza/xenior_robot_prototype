from pathlib import Path
from typing import Any

from app.domain.commands import RobotCommand
from app.domain.state import RobotState

REQUIRED_ITEMS = (
    "DeltaRobot",
    "TCP_Gripper",
    "PickObject",
    "WorldFrame",
    "WorkFrame",
    "Home",
    "ApproachPick",
    "Pick",
    "RetractPick",
    "ApproachPlace",
    "Place",
    "RetractPlace",
)


class RoboDKUnavailableError(RuntimeError):
    """RoboDK is not installed or cannot be reached in simulation mode."""


class RoboDKRobotAdapter:
    """Lazy, simulation-only RoboDK adapter contract.

    RoboDK is imported only during connect, allowing Mock mode and CI to run without it.
    """

    def __init__(
        self,
        *,
        host: str = "127.0.0.1",
        port: int = 20500,
        station_path: str | None = None,
    ) -> None:
        self.host, self.port = host, port
        self.station_path = Path(station_path) if station_path else None
        self._state = RobotState(mode="robodk")
        self._robot: Any = None

    async def connect(self) -> None:
        try:
            from robodk.robolink import ITEM_TYPE_ROBOT, Robolink  # type: ignore[import-not-found]
        except ImportError as error:
            raise RoboDKUnavailableError("RoboDK Python API is unavailable") from error
        try:
            link = Robolink(args=f"-HOST {self.host} -PORT {self.port}")
            link.setRunMode(1)  # RUNMODE_SIMULATE
            if self.station_path:
                link.AddFile(str(self.station_path))
            missing = [name for name in REQUIRED_ITEMS if not link.Item(name).Valid()]
            if missing:
                raise RoboDKUnavailableError(f"RoboDK station missing items: {', '.join(missing)}")
            robot = link.Item("DeltaRobot", ITEM_TYPE_ROBOT)
            if not robot.Valid():
                raise RoboDKUnavailableError("RoboDK station item DeltaRobot is not a robot")
            self._robot = robot
            self._state.connected = True
        except RoboDKUnavailableError:
            raise
        except Exception as error:
            raise RoboDKUnavailableError(f"RoboDK connection failed: {error}") from error

    async def execute(self, command: RobotCommand) -> None:
        if not self._state.connected or self._robot is None:
            raise RoboDKUnavailableError("RoboDK adapter is disconnected")
        if command.type == "move_xyz":
            self._robot.MoveJ([command.x_mm, command.y_mm, command.z_mm])
            self._state.x_mm = command.x_mm
            self._state.y_mm = command.y_mm
            self._state.z_mm = command.z_mm
        elif command.type == "home":
            self._robot.MoveJ(self._robot.Joints())
        elif command.type == "grip":
            self._state.gripper = "gripped"
        elif command.type == "release":
            self._state.gripper = "released"
        elif command.type == "set_speed":
            self._state.speed_mm_s = command.speed_mm_s
        elif command.type == "wait":
            import asyncio

            await asyncio.sleep(command.seconds)

    async def stop(self) -> None:
        if self._robot is not None:
            self._robot.Stop()

    async def reset(self) -> None:
        self._state = RobotState(mode="robodk", connected=self._state.connected)

    async def get_state(self) -> RobotState:
        return self._state.model_copy(deep=True)
