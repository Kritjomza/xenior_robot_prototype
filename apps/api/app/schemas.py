import json
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter

from app.domain.commands import RobotCommand
from app.domain.program import RobotProgramV1
from app.domain.state import RobotState


def schemas() -> dict[str, dict[str, Any]]:
    models = {
        "robot-command.schema.json": TypeAdapter(RobotCommand).json_schema(),
        "robot-program.schema.json": RobotProgramV1.model_json_schema(),
        "robot-state.schema.json": RobotState.model_json_schema(mode="serialization"),
    }
    return {
        name: {"$schema": "https://json-schema.org/draft/2020-12/schema", **schema}
        for name, schema in models.items()
    }


def export() -> None:
    destination = Path(__file__).resolve().parents[3] / "protocol"
    destination.mkdir(exist_ok=True)
    for name, schema in schemas().items():
        (destination / name).write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")
