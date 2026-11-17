from uuid import UUID

import pytest
from app.adapters.mock import MockRobotAdapter
from app.auth import Principal
from app.domain.kinematics import KinematicsError
from app.domain.safety import JogRequest, SafetyLockedError
from app.services.executor import Executor


@pytest.mark.asyncio
async def test_jog_requires_unlock_and_validates_workspace() -> None:
    principal = Principal(
        user_id=UUID("00000000-0000-0000-0000-000000000001"), email="user@example.com"
    )
    executor = Executor(MockRobotAdapter())
    await executor.connect()
    with pytest.raises(SafetyLockedError):
        await executor.jog(JogRequest(x_mm=1))
    executor.unlock(principal, True)
    with pytest.raises(KinematicsError):
        for _ in range(25):
            await executor.jog(JogRequest(x_mm=10))


@pytest.mark.asyncio
async def test_joint_jog_updates_joint_and_cartesian_telemetry() -> None:
    executor = Executor(MockRobotAdapter())
    await executor.connect()
    executor.unlock(Principal(user_id=UUID("00000000-0000-0000-0000-000000000001"), email="user@example.com"), True)
    before = executor.state
    after = await executor.jog(JogRequest(j1_deg=1))
    assert after.joints_deg[0] == pytest.approx(before.joints_deg[0] + 1, abs=0.01)
    assert (after.x_mm, after.y_mm, after.z_mm) != (before.x_mm, before.y_mm, before.z_mm)
    await executor.close()
