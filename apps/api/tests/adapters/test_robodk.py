import os
from pathlib import Path

import pytest
from app.adapters.robodk import RoboDKRobotAdapter, RoboDKUnavailableError
from app.domain.commands import MoveXYZ

STATION = Path(__file__).resolve().parents[4] / "assets/robodk/delta_robot.rdk"


@pytest.mark.asyncio
async def test_missing_station_fails_before_connecting_to_robodk(tmp_path: Path) -> None:
    adapter = RoboDKRobotAdapter(station_path=str(tmp_path / "missing.rdk"))
    with pytest.raises(RoboDKUnavailableError, match="station file"):
        await adapter.connect()


@pytest.mark.asyncio
async def test_real_station_xyz_motion_and_telemetry() -> None:
    if os.getenv("RUN_ROBODK_INTEGRATION") != "1":
        pytest.skip("Set RUN_ROBODK_INTEGRATION=1 with RoboDK Desktop available")
    adapter = RoboDKRobotAdapter(station_path=str(STATION))
    await adapter.connect()
    before = await adapter.get_state()
    assert before.mode == "robodk" and before.connected
    await adapter.view("fit")
    await adapter.view("reset")
    target = (before.x_mm + 1, before.y_mm, before.z_mm)
    try:
        await adapter.execute(
            MoveXYZ(id="step", type="move_xyz", x_mm=target[0], y_mm=target[1], z_mm=target[2])
        )
        after = await adapter.get_state()
        assert after.x_mm == pytest.approx(target[0], abs=0.5)
    finally:
        await adapter.execute(
            MoveXYZ(
                id="restore",
                type="move_xyz",
                x_mm=before.x_mm,
                y_mm=before.y_mm,
                z_mm=before.z_mm,
            )
        )
