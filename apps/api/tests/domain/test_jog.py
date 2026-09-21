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
    for _ in range(15):
        await executor.jog(JogRequest(x_mm=10))
    with pytest.raises(KinematicsError):
        await executor.jog(JogRequest(x_mm=1))
