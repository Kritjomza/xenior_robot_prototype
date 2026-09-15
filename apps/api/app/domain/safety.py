import math
from uuid import UUID

from pydantic import Field, StrictBool, StrictInt

from app.auth import Principal
from app.domain.commands import StrictModel


class SafetyLockedError(Exception):
    """Motion was requested while the server-owned safety state was locked."""


class SafetyUnlockError(Exception):
    """The simulation cannot be unlocked from its current state."""


class UnlockSafetyRequest(StrictModel):
    acknowledgement: StrictBool


class SetGlobalSpeedRequest(StrictModel):
    global_speed_percent: StrictInt = Field(ge=1, le=100)


class SafetyController:
    def __init__(
        self,
        *,
        global_speed_percent: int = 100,
        maximum_speed: float = 100.0,
    ) -> None:
        self._global_speed_percent = self._validate_percent(global_speed_percent)
        if (
            isinstance(maximum_speed, bool)
            or not isinstance(maximum_speed, (int, float))
            or not math.isfinite(maximum_speed)
            or maximum_speed <= 0
        ):
            raise ValueError("maximum speed must be a positive finite number")
        self.maximum_speed = float(maximum_speed)
        self.locked = True
        self.lock_reason: str | None = "startup"
        self.unlocked_by: UUID | None = None
        self._connected = False
        self._valid_state = True

    @staticmethod
    def _validate_percent(value: int) -> int:
        if type(value) is not int or not 1 <= value <= 100:
            raise ValueError("global speed percent must be an integer from 1 to 100")
        return value

    @property
    def global_speed_percent(self) -> int:
        return self._global_speed_percent

    def set_global_speed(self, value: int) -> None:
        self._global_speed_percent = self._validate_percent(value)

    def effective_speed(self, program_speed: float) -> float:
        if (
            isinstance(program_speed, bool)
            or not isinstance(program_speed, (int, float))
            or not math.isfinite(program_speed)
            or program_speed <= 0
        ):
            raise ValueError("program speed must be a positive finite number")
        scaled = float(program_speed) * self.global_speed_percent / 100.0
        return min(self.maximum_speed, scaled)

    def ensure_motion_allowed(self) -> None:
        if self.locked:
            raise SafetyLockedError(self.lock_reason or "simulation is locked")
        if not self._connected:
            self.lock("simulator disconnected")
            raise SafetyLockedError("simulator disconnected")
        if not self._valid_state:
            self.lock("simulator state is invalid")
            raise SafetyLockedError("simulator state is invalid")

    def unlock(self, principal: Principal, acknowledgement: bool) -> None:
        if not isinstance(principal, Principal):
            raise SafetyUnlockError("an authenticated principal is required")
        if acknowledgement is not True:
            raise SafetyUnlockError("simulation acknowledgement is required")
        if not self._connected:
            raise SafetyUnlockError("a connected simulator is required")
        if not self._valid_state:
            raise SafetyUnlockError("simulator must have a valid state")
        self.locked = False
        self.lock_reason = None
        self.unlocked_by = principal.user_id

    def lock(self, reason: str) -> None:
        if not reason.strip():
            raise ValueError("lock reason must not be empty")
        self.locked = True
        self.lock_reason = reason
        self.unlocked_by = None

    def connected(self, adapter: str) -> None:
        self._connected = True
        self._valid_state = True
        self.lock(f"adapter connected: {adapter}")

    def reconnected(self, adapter: str) -> None:
        self._connected = True
        self._valid_state = True
        self.lock(f"adapter reconnected: {adapter}")

    def disconnected(self, reason: str = "simulator disconnected") -> None:
        self._connected = False
        self.lock(reason)

    def adapter_changed(self, adapter: str) -> None:
        self._connected = False
        self.lock(f"adapter changed: {adapter}")

    def fault(self, reason: str) -> None:
        self._valid_state = False
        self.lock(f"fault: {reason}")

    def reset(self, *, connected: bool) -> None:
        self._connected = connected
        self._valid_state = True
        self.lock("reset")

    def lease_expired(self) -> None:
        self.lock("websocket lease expired")

    def session_expired(self) -> None:
        self.lock("session expired")

    def logout(self) -> None:
        self.lock("logout")
