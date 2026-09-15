import ast
from typing import Any

from app.domain.commands import Grip, Home, MoveXYZ, Release, RobotCommand, SetSpeed, Stop, Wait
from app.domain.program import RobotProgramV1


class DslError(ValueError):
    """Robot DSL contains unsupported syntax or invalid command arguments."""


def parse_dsl(source: str, *, name: str = "Untitled program") -> RobotProgramV1:
    try:
        tree = ast.parse(source, mode="exec")
    except SyntaxError as error:
        raise DslError(f"line {error.lineno}: invalid syntax") from error
    commands: list[RobotCommand] = []
    for statement in tree.body:
        if not isinstance(statement, ast.Expr) or not isinstance(statement.value, ast.Call):
            raise DslError(f"line {statement.lineno}: only direct allowlisted calls are supported")
        call = statement.value
        if not isinstance(call.func, ast.Name):
            raise DslError(f"line {statement.lineno}: attributes and indirect calls are forbidden")
        try:
            commands.append(_command(call.func.id, call, statement.lineno))
        except DslError as error:
            raise DslError(f"line {statement.lineno}: {error}") from error
    if not commands:
        raise DslError("program must contain at least one command")
    return RobotProgramV1(version=1, name=name, commands=commands)


def format_dsl(program: RobotProgramV1) -> str:
    lines: list[str] = []
    for command in program.commands:
        if isinstance(command, Home):
            lines.append("home()")
        elif isinstance(command, SetSpeed):
            lines.append(f"set_speed({command.speed_mm_s:g})")
        elif isinstance(command, MoveXYZ):
            speed = "" if command.speed_mm_s is None else f", speed={command.speed_mm_s:g}"
            lines.append(
                f"move_to(x={command.x_mm:g}, y={command.y_mm:g}, z={command.z_mm:g}{speed})"
            )
        elif isinstance(command, Grip):
            lines.append("grip()")
        elif isinstance(command, Wait):
            lines.append(f"wait({command.seconds:g})")
        elif isinstance(command, Release):
            lines.append("release()")
        elif isinstance(command, Stop):
            lines.append("stop()")
    return "\n".join(lines)


def _command(name: str, call: ast.Call, line: int) -> RobotCommand:
    values = [_literal(argument) for argument in call.args]
    keywords = {
        keyword.arg: _literal(keyword.value) for keyword in call.keywords if keyword.arg is not None
    }
    if len(keywords) != len(call.keywords):
        raise DslError("**kwargs are forbidden")
    command_id = f"line-{line}"
    if name == "home" and not values and not keywords:
        return Home(id=command_id, type="home")
    if name == "set_speed" and len(values) == 1 and not keywords:
        return SetSpeed(id=command_id, type="set_speed", speed_mm_s=values[0])
    if name == "move_to" and not values and set(keywords) <= {"x", "y", "z", "speed"}:
        if not {"x", "y", "z"} <= set(keywords):
            raise DslError("move_to requires x, y, and z")
        return MoveXYZ(
            id=command_id,
            type="move_xyz",
            x_mm=keywords["x"],
            y_mm=keywords["y"],
            z_mm=keywords["z"],
            speed_mm_s=keywords.get("speed"),
        )
    if name == "grip" and not values and not keywords:
        return Grip(id=command_id, type="grip")
    if name == "wait" and len(values) == 1 and not keywords:
        return Wait(id=command_id, type="wait", seconds=values[0])
    if name == "release" and not values and not keywords:
        return Release(id=command_id, type="release")
    if name == "stop" and not values and not keywords:
        return Stop(id=command_id, type="stop")
    raise DslError(f"unsupported call or wrong signature: {name}")


def _literal(node: ast.expr) -> Any:
    if (
        isinstance(node, ast.UnaryOp)
        and isinstance(node.op, ast.USub)
        and isinstance(node.operand, ast.Constant)
    ):
        value = node.operand.value
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return -value
    if (
        isinstance(node, ast.Constant)
        and isinstance(node.value, (int, float))
        and not isinstance(node.value, bool)
    ):
        return node.value
    raise DslError("arguments must be finite numeric literals")
