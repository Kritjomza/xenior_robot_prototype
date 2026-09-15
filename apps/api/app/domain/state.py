from typing import Annotated, Literal

from pydantic import ConfigDict, Field, StrictInt

from app.domain.commands import FiniteNumber, PositiveSpeed, StrictModel


class RobotState(StrictModel):
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)

    version: Literal[1] = 1
    revision: int = 0
    mode: Literal["mock"] = "mock"
    connected: bool = False
    status: Literal["idle", "running", "stopping", "completed", "stopped", "faulted"] = "idle"
    x_mm: FiniteNumber = 0.0
    y_mm: FiniteNumber = 0.0
    z_mm: FiniteNumber = -200.0
    joints_deg: Annotated[list[FiniteNumber], Field(min_length=3, max_length=3)] = Field(
        default_factory=lambda: [0.0, 0.0, 0.0]
    )
    rz_deg: FiniteNumber = 0.0
    speed_mm_s: PositiveSpeed = 100.0
    global_speed_percent: StrictInt = Field(default=100, ge=1, le=100)
    locked: bool = True
    lock_reason: str | None = "startup"
    gripper: Literal["released", "gripped"] = "released"
    run_id: str | None = None
    program_name: str | None = None
    active_command_id: str | None = None
    active_command_type: str | None = None
    completed_commands: int = 0
    total_commands: int = 0
    error: str | None = None
