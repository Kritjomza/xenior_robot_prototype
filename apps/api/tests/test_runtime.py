import asyncio
from uuid import UUID

import pytest
from app.adapters.mock import MockRobotAdapter
from app.auth import Principal
from app.domain.program import RobotProgramV1
from app.domain.safety import SafetyLockedError
from app.services.executor import BusyError, Executor, RunNotFoundError

TEST_PRINCIPAL = Principal(
    user_id=UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"), email="runtime@example.com"
)


def make_program(*commands):
    return RobotProgramV1.model_validate(
        {
            "version": 1,
            "name": "test",
            "commands": [{"id": f"c{i}", **command} for i, command in enumerate(commands)],
        }
    )


async def next_status(queue, status):
    async def receive():
        while True:
            state = await queue.get()
            if state.status == status:
                return state

    return await asyncio.wait_for(receive(), 2)


@pytest.fixture
async def executor():
    runtime = Executor(MockRobotAdapter())
    await runtime.connect()
    runtime.unlock(TEST_PRINCIPAL, acknowledgement=True)
    yield runtime
    await runtime.close()


async def test_pick_place_executes_in_order_and_publishes_state(executor):
    queue = executor.subscribe()
    await executor.start(
        make_program(
            {"type": "home"},
            {"type": "set_speed", "speed_mm_s": 60},
            {"type": "move_xyz", "x_mm": 100, "y_mm": 30, "z_mm": -250},
            {"type": "grip"},
            {"type": "wait", "seconds": 0.01},
            {"type": "move_xyz", "x_mm": -100, "y_mm": 30, "z_mm": -250, "speed_mm_s": 80},
            {"type": "release"},
        )
    )
    snapshots = []
    while True:
        state = await asyncio.wait_for(queue.get(), 2)
        snapshots.append(state)
        if state.status == "completed":
            break
    active = list(dict.fromkeys(s.active_command_id for s in snapshots if s.active_command_id))
    assert active == ["c0", "c1", "c2", "c3", "c4", "c5", "c6"]
    assert any(s.x_mm == 100 and s.gripper == "gripped" for s in snapshots)
    assert any(s.x_mm == 100 and s.speed_mm_s == 60 for s in snapshots)
    assert state.x_mm == -100 and state.y_mm == 30 and state.z_mm == -250
    assert state.gripper == "released" and state.speed_mm_s == 80
    assert state.completed_commands == 7 and state.mode == "mock"
    assert state.active_command_id is None
    assert [s.revision for s in snapshots] == sorted({s.revision for s in snapshots})


async def test_stop_interrupts_wait_and_does_not_execute_next_command(executor):
    queue = executor.subscribe()
    run_id = await executor.start(make_program({"type": "wait", "seconds": 60}, {"type": "grip"}))
    while (await asyncio.wait_for(queue.get(), 2)).active_command_type != "wait":
        pass
    state = await asyncio.wait_for(executor.stop(run_id), 0.5)
    assert state.status == "stopped" and state.gripper == "released"
    assert state.completed_commands == 0 and state.active_command_id is None
    assert (await executor.stop(run_id)).status == "stopped"


async def test_concurrent_start_has_only_one_winner(executor):
    program = make_program({"type": "wait", "seconds": 60})
    results = await asyncio.gather(
        executor.start(program), executor.start(program), return_exceptions=True
    )
    assert sum(isinstance(result, str) for result in results) == 1
    assert sum(isinstance(result, BusyError) for result in results) == 1


async def test_stop_command_ends_program_before_subsequent_commands(executor):
    queue = executor.subscribe()
    await executor.start(make_program({"type": "grip"}, {"type": "stop"}, {"type": "release"}))
    state = await next_status(queue, "stopped")
    assert state.gripper == "gripped" and state.completed_commands == 2


async def test_reset_cancels_active_run_and_restores_mock_state(executor):
    queue = executor.subscribe()
    await executor.start(
        make_program(
            {"type": "move_xyz", "x_mm": 42, "y_mm": 5, "z_mm": -300, "speed_mm_s": 20},
            {"type": "grip"},
            {"type": "wait", "seconds": 60},
        )
    )
    while (await asyncio.wait_for(queue.get(), 2)).active_command_type != "wait":
        pass
    state = await asyncio.wait_for(executor.reset(), 0.5)
    assert (state.x_mm, state.y_mm, state.z_mm) == (0, 0, -200)
    assert state.speed_mm_s == 100 and state.gripper == "released"
    assert state.status == "idle" and state.run_id is None and state.error is None
    assert state.completed_commands == state.total_commands == 0
    assert state.connected and state.joints_deg == [0, 0, 0]
    executor.unlock(TEST_PRINCIPAL, acknowledgement=True)
    await executor.start(make_program({"type": "home"}))
    assert (await next_status(queue, "completed")).completed_commands == 1


async def test_unknown_stop_does_not_cancel_active_run(executor):
    await executor.start(make_program({"type": "wait", "seconds": 60}))
    with pytest.raises(RunNotFoundError):
        await executor.stop("not-this-run")
    assert executor.state.status == "running"


async def test_fault_is_published_and_reset_recovers():
    class BrokenAdapter(MockRobotAdapter):
        async def execute(self, command):
            raise RuntimeError("mock actuator failure")

    runtime = Executor(BrokenAdapter())
    await runtime.connect()
    runtime.unlock(TEST_PRINCIPAL, acknowledgement=True)
    queue = runtime.subscribe()
    await runtime.start(make_program({"type": "home"}, {"type": "grip"}))
    state = await next_status(queue, "faulted")
    assert "mock actuator failure" in state.error
    assert state.completed_commands == 0 and state.gripper == "released"
    with pytest.raises(SafetyLockedError):
        await runtime.start(make_program({"type": "home"}))
    assert (await runtime.reset()).error is None
    runtime.unlock(TEST_PRINCIPAL, acknowledgement=True)
    await runtime.close()


async def test_slow_subscriber_is_bounded_and_retains_latest_state(executor):
    queue = executor.subscribe()
    fast = executor.subscribe()
    await executor.start(make_program(*[{"type": "home"} for _ in range(100)]))
    await next_status(fast, "completed")
    assert queue.qsize() <= 64
    states = [queue.get_nowait() for _ in range(queue.qsize())]
    assert states[-1].status == "completed"
    executor.unsubscribe(queue)
