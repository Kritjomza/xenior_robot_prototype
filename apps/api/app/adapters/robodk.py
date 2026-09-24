import asyncio
from pathlib import Path
from typing import Any

from app.domain.commands import RobotCommand
from app.domain.state import RobotState


class RoboDKUnavailableError(RuntimeError):
    """RoboDK is not installed or cannot be reached in simulation mode."""


class RoboDKRobotAdapter:
    """Simulation-only adapter for the supplied three-axis delta station."""

    def __init__(
        self,
        *,
        host: str = "127.0.0.1",
        port: int = 20500,
        station_path: str | None = None,
    ) -> None:
        self.host, self.port = host, port
        self.station_path = Path(station_path).resolve() if station_path else None
        self._state = RobotState(mode="robodk")
        self._link: Any = None
        self._robot: Any = None
        self._home_joints: list[float] = []
        self._initial_view: Any = None

    async def connect(self) -> None:
        if self.station_path is None or not self.station_path.is_file():
            raise RoboDKUnavailableError("RoboDK station file is missing")
        try:
            await asyncio.to_thread(self._connect_sync)
        except RoboDKUnavailableError:
            raise
        except Exception as error:
            raise RoboDKUnavailableError(f"RoboDK connection failed: {error}") from error

    def _connect_sync(self) -> None:
        from robodk.robolink import (  # type: ignore[import-untyped]
            ITEM_TYPE_ROBOT,
            RUNMODE_SIMULATE,
            Robolink,
        )

        link = Robolink(robodk_ip=self.host, port=self.port)
        link.setRunMode(RUNMODE_SIMULATE)
        loaded_path = str(link.getParam("PATH_OPENSTATION") or "")
        if Path(loaded_path).resolve() != self.station_path:
            station = link.AddFile(str(self.station_path))
            if not station.Valid():
                raise RoboDKUnavailableError("RoboDK could not load station file")
        robots = link.ItemList(ITEM_TYPE_ROBOT)
        if len(robots) != 1:
            raise RoboDKUnavailableError("RoboDK station must contain exactly one robot")
        robot = robots[0]
        joints = robot.Joints().list()
        if len(joints) != 3:
            raise RoboDKUnavailableError("RoboDK station robot must have three axes")
        connection, _ = robot.ConnectedState()
        if connection >= 0:
            raise RoboDKUnavailableError("RoboDK robot is connected to physical hardware")
        self._link = link
        self._robot = robot
        lower, upper, _ = robot.JointLimits()
        if any(not lo <= 0 <= hi for lo, hi in zip(lower.list(), upper.list(), strict=True)):
            raise RoboDKUnavailableError("RoboDK station zero-joint home exceeds joint limits")
        self._home_joints = [0.0, 0.0, 0.0]
        self._initial_view = link.ViewPose()
        self._state.connected = True
        self._read_state_sync()

    def _read_state_sync(self) -> RobotState:
        if self._robot is None:
            return self._state.model_copy(deep=True)
        connection, _ = self._robot.ConnectedState()
        if connection >= 0:
            raise RoboDKUnavailableError("RoboDK robot is connected to physical hardware")
        self._state.joints_deg = [float(v) for v in self._robot.Joints().list()]
        self._state.x_mm, self._state.y_mm, self._state.z_mm = map(float, self._robot.Pose().Pos())
        return self._state.model_copy(deep=True)

    async def execute(self, command: RobotCommand) -> None:
        if not self._state.connected or self._robot is None:
            raise RoboDKUnavailableError("RoboDK adapter is disconnected")
        if command.type == "move_xyz":
            await asyncio.to_thread(
                self._begin_move_sync,
                command.x_mm,
                command.y_mm,
                command.z_mm,
                command.speed_mm_s,
            )
            while await asyncio.to_thread(self._robot.Busy):  # noqa: ASYNC110
                await asyncio.sleep(0.05)
            await self.get_state()
        elif command.type == "home":
            await asyncio.to_thread(self._robot.MoveJ, self._home_joints, False)
            while await asyncio.to_thread(self._robot.Busy):  # noqa: ASYNC110
                await asyncio.sleep(0.05)
            await self.get_state()
        elif command.type in ("grip", "release"):
            raise RoboDKUnavailableError("Station has no gripper or pick object")
        elif command.type == "set_speed":
            await asyncio.to_thread(self._robot.setSpeed, command.speed_mm_s)
            self._state.speed_mm_s = command.speed_mm_s
        elif command.type == "wait":
            await asyncio.sleep(command.seconds)
        elif command.type == "stop":
            await self.stop()

    def _begin_move_sync(self, x: float, y: float, z: float, speed: float | None) -> None:
        connection, _ = self._robot.ConnectedState()
        if connection >= 0:
            raise RoboDKUnavailableError("RoboDK robot is connected to physical hardware")
        pose = self._robot.Pose()
        pose.setPos([x, y, z])
        joints = self._robot.SolveIK(pose).list()
        if len(joints) != 3:
            raise RoboDKUnavailableError("Target is outside RoboDK robot workspace")
        lower, upper, _ = self._robot.JointLimits()
        if any(
            not lo <= value <= hi
            for value, lo, hi in zip(joints, lower.list(), upper.list(), strict=True)
        ):
            raise RoboDKUnavailableError("Target exceeds RoboDK joint limits")
        if speed is not None:
            self._robot.setSpeed(speed)
            self._state.speed_mm_s = speed
        self._robot.MoveJ(joints, False)

    async def stop(self) -> None:
        if self._robot is not None:
            await asyncio.to_thread(self._robot.Stop)

    async def reset(self) -> None:
        await self.stop()
        await self.get_state()

    async def get_state(self) -> RobotState:
        return await asyncio.to_thread(self._read_state_sync)

    async def view(self, action: str) -> None:
        if self._link is None or not self._state.connected:
            raise RoboDKUnavailableError("RoboDK adapter is disconnected")
        if action == "fit":
            await asyncio.to_thread(self._link.Command, "FitAll")
        elif action == "reset":
            await asyncio.to_thread(self._link.setViewPose, self._initial_view)
        elif action == "show":
            await asyncio.to_thread(self._link.ShowRoboDK)
        else:
            raise ValueError("Unknown RoboDK view action")
