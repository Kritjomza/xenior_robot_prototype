import json
from pathlib import Path

import pytest
from app.domain.program import RobotProgramV1
from pydantic import ValidationError


def program(command):
    return {"version": 1, "name": "test", "commands": [{"id": "c1", **command}]}


@pytest.mark.parametrize("version", [0, 2, "1", True, 1.0, None])
def test_reject_unsupported_or_non_integer_version(version):
    data = program({"type": "home"})
    data["version"] = version
    with pytest.raises(ValidationError):
        RobotProgramV1.model_validate(data)


@pytest.mark.parametrize(
    "command",
    [
        {"type": "unknown"},
        {"type": "home", "unexpected": 1},
        {"type": "move_xyz", "x_mm": 0, "y_mm": 0},
        {"type": "wait", "seconds": 0},
        {"type": "wait", "seconds": -1},
        {"type": "wait", "seconds": 3601},
        {"type": "grip", "id": ""},
    ],
)
def test_reject_invalid_commands(command):
    with pytest.raises(ValidationError):
        RobotProgramV1.model_validate(program(command))


@pytest.mark.parametrize("value", ["12", True, None, [], float("nan"), float("inf"), float("-inf")])
@pytest.mark.parametrize("field", ["x_mm", "y_mm", "z_mm", "speed_mm_s", "seconds"])
def test_reject_invalid_numeric_values(field, value):
    if field == "seconds":
        command = {"type": "wait", "seconds": value}
    else:
        command = {
            "type": "move_xyz",
            "x_mm": 0,
            "y_mm": 0,
            "z_mm": -200,
            "speed_mm_s": 100,
            field: value,
        }
    with pytest.raises(ValidationError):
        RobotProgramV1.model_validate(program(command))


@pytest.mark.parametrize("speed", [0, -1, "100", True, float("nan"), float("inf")])
@pytest.mark.parametrize("command_type", ["set_speed", "move_xyz"])
def test_reject_non_positive_or_invalid_speed(speed, command_type):
    command = {"type": command_type, "speed_mm_s": speed}
    if command_type == "move_xyz":
        command.update(x_mm=0, y_mm=0, z_mm=-200)
    with pytest.raises(ValidationError):
        RobotProgramV1.model_validate(program(command))


def test_reject_duplicate_ids_empty_program_and_unknown_fields():
    data = program({"type": "home"})
    for invalid in [
        dict(data, commands=[]),
        dict(data, mode="robot"),
        dict(data, commands=data["commands"] * 2),
    ]:
        with pytest.raises(ValidationError):
            RobotProgramV1.model_validate(invalid)


def test_accept_all_commands_and_integer_coordinates():
    commands = [
        {"type": "home"},
        {"type": "set_speed", "speed_mm_s": 50},
        {"type": "move_xyz", "x_mm": 100, "y_mm": 30, "z_mm": -250},
        {"type": "grip"},
        {"type": "release"},
        {"type": "wait", "seconds": 0.01},
        {"type": "stop"},
    ]
    data = {
        "version": 1,
        "name": "all",
        "commands": [{"id": f"c{i}", **c} for i, c in enumerate(commands)],
    }
    assert len(RobotProgramV1.model_validate(data).commands) == 7


def test_checked_in_schemas_match_models():
    from app.domain.state import RobotState
    from app.schemas import schemas

    root = Path(__file__).resolve().parents[4] / "protocol"
    for filename, schema in schemas().items():
        assert json.loads((root / filename).read_text()) == schema
    assert RobotState().mode == "mock"
