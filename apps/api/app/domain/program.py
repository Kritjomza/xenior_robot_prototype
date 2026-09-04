from typing import Annotated, Literal

from pydantic import Field, field_validator

from app.domain.commands import RobotCommand, StrictModel


class RobotProgramV1(StrictModel):
    version: Literal[1]
    name: Annotated[str, Field(min_length=1, max_length=200)]
    commands: Annotated[list[RobotCommand], Field(min_length=1, max_length=1000)]

    @field_validator("version", mode="before")
    @classmethod
    def integer_version(cls, value: object) -> object:
        if type(value) is not int:
            raise ValueError("version must be the integer 1")
        return value

    @field_validator("commands")
    @classmethod
    def unique_ids(cls, commands: list[RobotCommand]) -> list[RobotCommand]:
        if len({command.id for command in commands}) != len(commands):
            raise ValueError("command IDs must be unique")
        return commands
