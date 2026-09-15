import pytest
from app.domain.dsl import DslError, format_dsl, parse_dsl


def test_dsl_parses_allowlisted_commands() -> None:
    source = "\n".join(
        [
            "home()",
            "set_speed(80)",
            "move_to(x=10, y=20, z=-200, speed=40)",
            "grip()",
            "wait(0.5)",
            "release()",
            "stop()",
        ]
    )
    program = parse_dsl(source)
    assert len(program.commands) == 7
    assert program.commands[2].type == "move_xyz"
    assert "move_to" in format_dsl(program)


@pytest.mark.parametrize(
    "source", ["import os", "x = 1", "robot.home()", "for x in y: home()", "eval('x')"]
)
def test_dsl_rejects_unsafe_syntax(source: str) -> None:
    with pytest.raises(DslError):
        parse_dsl(source)


def test_dsl_rejects_wrong_signature() -> None:
    with pytest.raises(DslError, match="move_to requires"):
        parse_dsl("move_to(x=1)")
