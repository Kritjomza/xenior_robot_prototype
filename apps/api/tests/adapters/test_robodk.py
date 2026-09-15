import pytest
from app.adapters.robodk import REQUIRED_ITEMS, RoboDKRobotAdapter, RoboDKUnavailableError


def test_required_station_contract_is_explicit() -> None:
    assert "DeltaRobot" in REQUIRED_ITEMS
    assert "TCP_Gripper" in REQUIRED_ITEMS
    assert len(REQUIRED_ITEMS) == 12


@pytest.mark.asyncio
async def test_missing_robo_dk_fails_closed() -> None:
    adapter = RoboDKRobotAdapter()
    with pytest.raises(RoboDKUnavailableError, match="unavailable"):
        await adapter.connect()
