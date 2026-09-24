import json
import os
import time
from uuid import UUID

import pytest
from app.auth import Principal, require_principal
from app.main import create_app
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    class VerifiedPrincipal:
        async def verify(self, token):
            assert token == "phase-one-token"
            return Principal(
                user_id=UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
                email="phase-one@example.com",
            )

    app = create_app()
    app.state.principal_verifier = VerifiedPrincipal()
    app.dependency_overrides[require_principal] = lambda: Principal(
        user_id=UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
        email="phase-one@example.com",
    )
    with TestClient(app, headers={"Authorization": "Bearer phase-one-token"}) as connection:
        response = connection.post("/api/v1/safety/unlock", json={"acknowledgement": True})
        assert response.status_code == 200
        yield connection


def program(*commands):
    return {
        "version": 1,
        "name": "API test",
        "commands": [{"id": f"c{i}", **command} for i, command in enumerate(commands)],
    }


@pytest.mark.parametrize("path", ["programs/validate", "runs"])
@pytest.mark.parametrize(
    "raw",
    [
        '{"version":2,"name":"bad","commands":[{"id":"c","type":"home"}]}',
        '{"version":1,"name":"bad","commands":[{"id":"c","type":"unknown"}]}',
        '{"version":1,"name":"bad","commands":[{"id":"c","type":"wait","seconds":NaN}]}',
        '{"version":1,"name":"bad","commands":[{"id":"c","type":"wait","seconds":Infinity}]}',
        '{"version":1,"name":"bad","commands":[{"id":"c","type":"wait","seconds":1e999}]}',
        '{"version":1,"name":"bad","commands":[{"id":"c","type":"wait","seconds":-1}]}',
        '{"version":1,"name":"bad","commands":[{"id":"c","type":"set_speed","speed_mm_s":true}]}',
        "{broken",
        "null",
        "[]",
    ],
)
def test_invalid_program_never_executes_and_errors_are_json_safe(client, path, raw):
    response = client.post(
        f"/api/v1/{path}", content=raw, headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 422
    assert response.json()["detail"]
    state = client.get("/api/v1/state").json()
    assert state["status"] == "idle" and state["run_id"] is None


def test_validation_is_side_effect_free_and_live_websocket_run_completes(client):
    data = program(
        {"type": "home"}, {"type": "grip"}, {"type": "wait", "seconds": 0.02}, {"type": "release"}
    )
    response = client.post("/api/v1/programs/validate", json=data)
    assert response.status_code == 200 and response.json()["valid"] is True
    assert client.get("/api/v1/state").json()["status"] == "idle"
    with client.websocket_connect("/api/v1/ws/state?access_token=phase-one-token") as ws:
        assert ws.receive_json()["connected"] is True
        response = client.post("/api/v1/runs", json=data)
        assert response.status_code == 202
        run_id = response.json()["run_id"]
        states = []
        while True:
            state = ws.receive_json()
            states.append(state)
            if state["status"] == "completed":
                break
        assert any(s["active_command_type"] == "wait" for s in states)
        assert state["run_id"] == run_id and state["completed_commands"] == 4
    with client.websocket_connect("/api/v1/ws/state?access_token=phase-one-token") as ws:
        assert ws.receive_json()["status"] == "completed"


def test_api_conflict_stop_and_reset(client):
    data = program({"type": "wait", "seconds": 60}, {"type": "grip"})
    run_id = client.post("/api/v1/runs", json=data).json()["run_id"]
    assert client.post("/api/v1/runs", json=data).status_code == 409
    assert client.post("/api/v1/runs/unknown/stop").status_code == 404
    response = client.post(f"/api/v1/runs/{run_id}/stop")
    assert response.status_code == 200 and response.json()["status"] == "stopped"
    assert client.post(f"/api/v1/runs/{run_id}/stop").status_code == 200
    state = client.post("/api/v1/reset").json()
    assert state["status"] == "idle" and state["run_id"] is None
    assert state["gripper"] == "released"


def test_sample_program_matches_shared_schema(client):
    from pathlib import Path

    from jsonschema import Draft202012Validator

    root = Path(__file__).resolve().parents[3]
    sample = json.loads((root / "protocol/examples/pick-and-place.json").read_text())
    schema = json.loads((root / "protocol/robot-program.schema.json").read_text())
    Draft202012Validator(schema).validate(sample)
    assert client.post("/api/v1/programs/validate", json=sample).status_code == 200


def test_selecting_robodk_reports_station_incompatibility_without_mock_fallback(
    client, monkeypatch
):
    from app.adapters.robodk import RoboDKRobotAdapter, RoboDKUnavailableError

    async def unavailable(self):
        raise RoboDKUnavailableError("station has no compatible robot")

    monkeypatch.setattr(RoboDKRobotAdapter, "connect", unavailable)
    response = client.post("/api/v1/mode", json={"mode": "robodk"})
    assert response.status_code == 503
    state = client.get("/api/v1/state").json()
    assert state["mode"] == "robodk"
    assert state["connected"] is False
    assert state["locked"] is True
    assert "compatible robot" in state["error"]


def test_robodk_mode_rejects_gripper_program_before_run(client):
    client.app.state.executor._state.mode = "robodk"
    response = client.post("/api/v1/programs/validate", json=program({"type": "grip"}))
    assert response.status_code == 409
    assert "gripper" in response.json()["detail"]
    assert client.get("/api/v1/state").json()["run_id"] is None


def test_real_robodk_mode_serves_station_image_and_actual_pose(client):
    if os.getenv("RUN_ROBODK_INTEGRATION") != "1":
        pytest.skip("Set RUN_ROBODK_INTEGRATION=1 with RoboDK Desktop available")
    selected = client.post("/api/v1/mode", json={"mode": "robodk"})
    assert selected.status_code == 200, selected.text
    state = selected.json()
    assert state["mode"] == "robodk" and state["connected"] and state["locked"]
    assert state["z_mm"] < -300
    assert client.post("/api/v1/twin/view", json={"action": "fit"}).status_code == 200
    assert client.post("/api/v1/safety/unlock", json={"acknowledgement": True}).status_code == 200
    assert client.post("/api/v1/jog", json={"x_mm": 1}).status_code == 200
    assert client.post("/api/v1/jog", json={"x_mm": -1}).status_code == 200
    from pathlib import Path

    sample_path = Path(__file__).resolve().parents[3] / "protocol/examples/robodk-xyz.json"
    sample = json.loads(sample_path.read_text())
    assert client.post("/api/v1/programs/validate", json=sample).status_code == 200
    assert client.post("/api/v1/runs", json=sample).status_code == 202
    for _ in range(100):
        if client.get("/api/v1/state").json()["status"] != "running":
            break
        time.sleep(0.05)
    assert client.get("/api/v1/state").json()["status"] == "completed"
    assert client.post("/api/v1/mode", json={"mode": "mock"}).json()["mode"] == "mock"
