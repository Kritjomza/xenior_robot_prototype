import asyncio
from uuid import UUID

import pytest
from app.adapters.mock import MockRobotAdapter
from app.auth import Principal, require_principal
from app.domain.program import RobotProgramV1
from app.domain.safety import (
    SafetyController,
    SafetyLockedError,
    SafetyUnlockError,
)
from app.main import create_app
from app.services.executor import Executor, RunSummary
from fastapi.testclient import TestClient
from pydantic import ValidationError

PRINCIPAL = Principal(
    user_id=UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    email="operator@example.com",
)


def make_program(*commands: dict[str, object]) -> RobotProgramV1:
    return RobotProgramV1.model_validate(
        {
            "version": 1,
            "name": "safety-test",
            "commands": [
                {"id": f"c{index}", **command} for index, command in enumerate(commands)
            ],
        }
    )


def test_safety_starts_locked_and_requires_acknowledged_connected_valid_state():
    safety = SafetyController()

    assert safety.locked is True
    assert safety.lock_reason == "startup"
    with pytest.raises(SafetyUnlockError, match="connected simulator"):
        safety.unlock(PRINCIPAL, acknowledgement=True)

    safety.connected("mock")
    with pytest.raises(SafetyUnlockError, match="acknowledgement"):
        safety.unlock(PRINCIPAL, acknowledgement=False)

    safety.fault("drive fault")
    with pytest.raises(SafetyUnlockError, match="valid state"):
        safety.unlock(PRINCIPAL, acknowledgement=True)

    safety.reset(connected=True)
    safety.unlock(PRINCIPAL, acknowledgement=True)
    assert safety.locked is False
    assert safety.lock_reason is None
    assert safety.unlocked_by == PRINCIPAL.user_id


@pytest.mark.parametrize(
    ("event", "reason"),
    [
        (lambda safety: safety.connected("mock"), "adapter connected: mock"),
        (lambda safety: safety.reconnected("mock"), "adapter reconnected: mock"),
        (lambda safety: safety.adapter_changed("robodk"), "adapter changed: robodk"),
        (lambda safety: safety.fault("collision"), "fault: collision"),
        (lambda safety: safety.reset(connected=True), "reset"),
        (lambda safety: safety.lease_expired(), "websocket lease expired"),
        (lambda safety: safety.session_expired(), "session expired"),
        (lambda safety: safety.logout(), "logout"),
    ],
)
def test_every_safety_event_relocks(event, reason):
    safety = SafetyController()
    safety.connected("mock")
    safety.unlock(PRINCIPAL, acknowledgement=True)

    event(safety)

    assert safety.locked is True
    assert safety.lock_reason == reason
    assert safety.unlocked_by is None


@pytest.mark.parametrize("global_percent", [0, 101, True, 25.5])
def test_global_speed_only_accepts_integer_percent_from_one_to_one_hundred(global_percent):
    with pytest.raises((TypeError, ValueError, ValidationError)):
        SafetyController(global_speed_percent=global_percent)


def test_speed_multiplier_is_enforced_and_clamped_to_simulator_limit():
    safety = SafetyController(global_speed_percent=25, maximum_speed=15)
    assert safety.effective_speed(40) == 10
    assert safety.effective_speed(80) == 15


@pytest.fixture
async def runtime():
    executor = Executor(MockRobotAdapter())
    await executor.connect()
    yield executor
    await executor.close()


async def test_locked_executor_rejects_run(runtime):
    with pytest.raises(SafetyLockedError):
        await runtime.start(make_program({"type": "home"}))


async def test_executor_applies_global_speed_without_mutating_program(runtime):
    runtime.set_global_speed(25)
    runtime.unlock(PRINCIPAL, acknowledgement=True)
    program = make_program(
        {"type": "set_speed", "speed_mm_s": 80},
        {"type": "move_xyz", "x_mm": 1, "y_mm": 2, "z_mm": -210, "speed_mm_s": 200},
    )
    queue = runtime.subscribe()

    await runtime.start(program)
    while (state := await asyncio.wait_for(queue.get(), 2)).status != "completed":
        pass

    assert state.speed_mm_s == 50
    assert program.commands[0].speed_mm_s == 80
    assert program.commands[1].speed_mm_s == 200


async def test_global_speed_rescales_inherited_program_speed(runtime):
    runtime.set_global_speed(25)
    runtime.unlock(PRINCIPAL, acknowledgement=True)
    queue = runtime.subscribe()

    await runtime.start(
        make_program({"type": "move_xyz", "x_mm": 1, "y_mm": 2, "z_mm": -210})
    )
    while (state := await asyncio.wait_for(queue.get(), 2)).status != "completed":
        pass

    assert state.speed_mm_s == 25


async def test_connect_reset_and_fault_relock_executor(runtime):
    runtime.unlock(PRINCIPAL, acknowledgement=True)
    await runtime.reset()
    assert runtime.state.locked is True
    assert runtime.state.lock_reason == "reset"

    runtime.unlock(PRINCIPAL, acknowledgement=True)
    await runtime.connect()
    assert runtime.state.locked is True
    assert runtime.state.lock_reason == "adapter reconnected: mock"

    class BrokenAdapter(MockRobotAdapter):
        async def execute(self, command):
            raise RuntimeError("simulator fault")

    broken = Executor(BrokenAdapter())
    await broken.connect()
    broken.unlock(PRINCIPAL, acknowledgement=True)
    queue = broken.subscribe()
    await broken.start(make_program({"type": "home"}))
    while (state := await asyncio.wait_for(queue.get(), 2)).status != "faulted":
        pass
    assert state.locked is True
    assert state.lock_reason == "fault: simulator fault"
    await broken.close()


async def test_reconnect_serializes_with_execution_and_cancels_remaining_motion(runtime):
    queue = runtime.subscribe()
    runtime.unlock(PRINCIPAL, acknowledgement=True)
    await runtime.start(
        make_program({"type": "wait", "seconds": 60}, {"type": "grip"})
    )
    while (await asyncio.wait_for(queue.get(), 2)).active_command_type != "wait":
        pass

    await runtime.connect()

    state = runtime.state
    assert state.locked is True
    assert state.lock_reason == "adapter reconnected: mock"
    assert state.status == "stopped"
    assert state.gripper == "released"
    assert state.completed_commands == 0


async def test_executor_rechecks_safety_before_each_command_dispatch():
    waiting = asyncio.Event()
    release_wait = asyncio.Event()
    dispatched: list[str] = []

    class GatedAdapter(MockRobotAdapter):
        async def execute(self, command):
            dispatched.append(command.type)
            if command.type == "wait":
                waiting.set()
                await release_wait.wait()
                return
            await super().execute(command)

    runtime = Executor(GatedAdapter())
    await runtime.connect()
    runtime.unlock(PRINCIPAL, acknowledgement=True)
    queue = runtime.subscribe()
    await runtime.start(make_program({"type": "wait", "seconds": 1}, {"type": "grip"}))
    await asyncio.wait_for(waiting.wait(), 2)

    runtime.safety.lock("adapter lifecycle changed")
    release_wait.set()
    while (state := await asyncio.wait_for(queue.get(), 2)).status != "faulted":
        pass

    assert dispatched == ["wait"]
    assert state.gripper == "released"
    assert state.locked is True
    await runtime.close()


@pytest.mark.parametrize("failure_stage", ["reset", "refresh"])
async def test_reset_failure_publishes_locked_fault(failure_stage):
    class FailingResetAdapter(MockRobotAdapter):
        fail_refresh = False

        async def reset(self) -> None:
            if failure_stage == "reset":
                raise RuntimeError("reset actuator unavailable")
            await super().reset()
            self.fail_refresh = True

        async def get_state(self):
            if self.fail_refresh:
                raise RuntimeError("reset telemetry unavailable")
            return await super().get_state()

    runtime = Executor(FailingResetAdapter())
    await runtime.connect()
    runtime.unlock(PRINCIPAL, acknowledgement=True)
    queue = runtime.subscribe()

    state = await runtime.reset()

    assert state.status == "faulted"
    assert state.locked is True
    assert state.connected is False
    assert state.lock_reason.startswith("fault: reset failed:")
    assert failure_stage in state.error or "telemetry" in state.error
    snapshots = [queue.get_nowait() for _ in range(queue.qsize())]
    assert any(snapshot.locked and snapshot.lock_reason == "reset" for snapshot in snapshots)
    assert snapshots[-1].status == "faulted"
    await runtime.close()


async def test_reconnect_refresh_failure_publishes_locked_fault():
    class FailingRefreshAdapter(MockRobotAdapter):
        fail_refresh = False

        async def get_state(self):
            if self.fail_refresh:
                raise RuntimeError("reconnect telemetry unavailable")
            return await super().get_state()

    adapter = FailingRefreshAdapter()
    runtime = Executor(adapter)
    await runtime.connect()
    runtime.unlock(PRINCIPAL, acknowledgement=True)
    queue = runtime.subscribe()
    adapter.fail_refresh = True

    with pytest.raises(RuntimeError, match="reconnect telemetry unavailable"):
        await runtime.connect()

    state = runtime.state
    assert state.status == "faulted"
    assert state.connected is False
    assert state.locked is True
    assert state.lock_reason == "fault: connection failed: reconnect telemetry unavailable"
    snapshots = [queue.get_nowait() for _ in range(queue.qsize())]
    assert snapshots[-1].status == "faulted"
    await runtime.close()


async def test_failed_reconnect_and_stop_failure_relock_executor():
    class UnreliableAdapter(MockRobotAdapter):
        def __init__(self) -> None:
            super().__init__()
            self.fail_connect = False
            self.fail_stop = False

        async def connect(self) -> None:
            if self.fail_connect:
                raise RuntimeError("connection lost")
            await super().connect()

        async def stop(self) -> None:
            if self.fail_stop:
                raise RuntimeError("stop failed")

    adapter = UnreliableAdapter()
    runtime = Executor(adapter)
    await runtime.connect()
    runtime.unlock(PRINCIPAL, acknowledgement=True)
    adapter.fail_connect = True
    with pytest.raises(RuntimeError, match="connection lost"):
        await runtime.connect()
    assert runtime.state.locked is True
    assert runtime.state.connected is False

    adapter.fail_connect = False
    await runtime.connect()
    runtime.unlock(PRINCIPAL, acknowledgement=True)
    run_id = await runtime.start(make_program({"type": "wait", "seconds": 60}))
    adapter.fail_stop = True
    state = await runtime.stop(run_id)
    assert state.status == "faulted"
    assert state.locked is True
    assert state.lock_reason == "fault: stop failed"
    await runtime.close()


async def test_software_stop_records_one_summary_and_retains_pose():
    summaries: list[RunSummary] = []

    async def record(summary: RunSummary) -> None:
        summaries.append(summary)

    runtime = Executor(MockRobotAdapter(), run_history_hook=record)
    await runtime.connect()
    runtime.unlock(PRINCIPAL, acknowledgement=True)
    run_id = await runtime.start(
        make_program(
            {"type": "move_xyz", "x_mm": 12, "y_mm": 3, "z_mm": -220},
            {"type": "wait", "seconds": 60},
        )
    )
    queue = runtime.subscribe()
    while (await asyncio.wait_for(queue.get(), 2)).active_command_type != "wait":
        pass

    state = await runtime.stop(run_id)
    await runtime.stop(run_id)

    assert state.status == "stopped"
    assert (state.x_mm, state.y_mm, state.z_mm) == (12, 3, -220)
    assert len(summaries) == 1
    assert summaries[0].model_dump() == {
        "run_id": run_id,
        "program_name": "safety-test",
        "status": "stopped",
        "completed_commands": 1,
        "total_commands": 2,
        "error": None,
    }
    await runtime.close()


async def test_software_stop_publishes_stopped_before_waiting_for_history():
    release_history = asyncio.Event()

    async def record(summary: RunSummary) -> None:
        await release_history.wait()

    runtime = Executor(MockRobotAdapter(), run_history_hook=record)
    await runtime.connect()
    runtime.unlock(PRINCIPAL, acknowledgement=True)
    run_id = await runtime.start(make_program({"type": "wait", "seconds": 60}))
    queue = runtime.subscribe()
    while (await asyncio.wait_for(queue.get(), 2)).active_command_type != "wait":
        pass

    stop_task = asyncio.create_task(runtime.stop(run_id))
    while (await asyncio.wait_for(queue.get(), 2)).status != "stopped":
        pass
    assert stop_task.done() is False
    release_history.set()
    assert (await stop_task).status == "stopped"
    await runtime.close()


async def test_stop_command_records_run_summary():
    summaries: list[RunSummary] = []

    async def record(summary: RunSummary) -> None:
        summaries.append(summary)

    runtime = Executor(MockRobotAdapter(), run_history_hook=record)
    await runtime.connect()
    runtime.unlock(PRINCIPAL, acknowledgement=True)
    queue = runtime.subscribe()
    await runtime.start(make_program({"type": "stop"}, {"type": "grip"}))
    while (state := await asyncio.wait_for(queue.get(), 2)).status != "stopped":
        pass

    assert state.completed_commands == 1
    assert len(summaries) == 1
    assert summaries[0].status == "stopped"
    await runtime.close()


def test_safety_api_requires_server_unlock_and_updates_speed():
    app = create_app()
    app.dependency_overrides[require_principal] = lambda: PRINCIPAL
    program = {
        "version": 1,
        "name": "api safety",
        "commands": [{"id": "c0", "type": "home"}],
    }
    with TestClient(app) as client:
        assert client.post("/api/v1/runs", json=program).status_code == 423
        assert client.post(
            "/api/v1/safety/unlock", json={"acknowledgement": False}
        ).status_code == 409
        unlocked = client.post(
            "/api/v1/safety/unlock", json={"acknowledgement": True}
        )
        assert unlocked.status_code == 200
        assert unlocked.json()["locked"] is False

        changed = client.post(
            "/api/v1/safety/speed", json={"global_speed_percent": 35}
        )
        assert changed.status_code == 200
        assert changed.json()["global_speed_percent"] == 35
        assert client.post("/api/v1/runs", json=program).status_code == 202

        locked = client.post("/api/v1/safety/lock")
        assert locked.status_code == 200
        assert locked.json()["locked"] is True


def test_websocket_lease_expiry_stops_active_work_and_relocks():
    class VerifiedPrincipal:
        async def verify(self, token: str) -> Principal:
            assert token == "verified-token"
            return PRINCIPAL

    app = create_app(VerifiedPrincipal())
    app.dependency_overrides[require_principal] = lambda: PRINCIPAL
    program = {
        "version": 1,
        "name": "lease safety",
        "commands": [{"id": "c0", "type": "wait", "seconds": 60}],
    }
    with TestClient(app) as client:
        client.post("/api/v1/safety/unlock", json={"acknowledgement": True})
        with client.websocket_connect(
            "/api/v1/ws/state?access_token=verified-token"
        ) as websocket:
            response = client.post("/api/v1/runs", json=program)
            assert response.status_code == 202
            while websocket.receive_json()["active_command_type"] != "wait":
                pass

        state = client.get("/api/v1/state").json()
        assert state["status"] == "stopped"
        assert state["locked"] is True
        assert state["lock_reason"] == "websocket lease expired"


async def test_state_keeps_three_delta_joints_and_exposes_j4_separately(runtime):
    state = runtime.state
    assert state.joints_deg == [0, 0, 0]
    assert state.rz_deg == 0
