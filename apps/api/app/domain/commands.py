from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.json_schema import SkipJsonSchema

FiniteNumber = Annotated[float, Field(allow_inf_nan=False)]
PositiveSpeed = Annotated[float, Field(gt=0, allow_inf_nan=False)]
Identifier = Annotated[str, Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")]


class StrictModel(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", validate_assignment=True)


class Command(StrictModel):
    id: Identifier


class Home(Command):
    type: Literal["home"]


class MoveXYZ(Command):
    type: Literal["move_xyz"]
    x_mm: FiniteNumber
    y_mm: FiniteNumber
    z_mm: FiniteNumber
    speed_mm_s: PositiveSpeed | SkipJsonSchema[None] = None

    @field_validator("speed_mm_s", mode="before")
    @classmethod
    def explicit_speed_must_be_numeric(cls, value: object) -> object:
        if value is None:
            raise ValueError("omit speed_mm_s to inherit speed; null is not a speed")
        return value


class SetSpeed(Command):
    type: Literal["set_speed"]
    speed_mm_s: PositiveSpeed


class Grip(Command):
    type: Literal["grip"]


class Release(Command):
    type: Literal["release"]


class Wait(Command):
    type: Literal["wait"]
    seconds: Annotated[float, Field(gt=0, le=3600, allow_inf_nan=False)]


class Stop(Command):
    type: Literal["stop"]


RobotCommand = Annotated[
    Home | MoveXYZ | SetSpeed | Grip | Release | Wait | Stop, Field(discriminator="type")
]
