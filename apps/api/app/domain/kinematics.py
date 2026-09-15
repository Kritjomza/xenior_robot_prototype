import math
from dataclasses import dataclass
from typing import cast


class KinematicsError(ValueError):
    """A pose or joint target is invalid for the configured simulation geometry."""


@dataclass(frozen=True)
class CartesianPose:
    x_mm: float
    y_mm: float
    z_mm: float
    rz_deg: float = 0.0


@dataclass(frozen=True)
class JointAngles:
    values_deg: tuple[float, float, float]
    rz_deg: float = 0.0


@dataclass(frozen=True)
class DeltaGeometry:
    """Simulation defaults; not a claim of physical DeltaX dimensions."""

    base_width_mm: float
    moving_platform_width_mm: float
    upper_arm_length_mm: float
    lower_arm_length_mm: float
    joint_limits_deg: tuple[float, float]
    rz_limit_deg: tuple[float, float]
    home_joints_deg: tuple[float, float, float]
    home_pose: CartesianPose
    workspace_min_mm: tuple[float, float, float]
    workspace_max_mm: tuple[float, float, float]
    maximum_simulation_speed_mm_s: float
    tolerance_mm: float

    @classmethod
    def simulation_defaults(cls) -> "DeltaGeometry":
        return cls(
            base_width_mm=340.0,
            moving_platform_width_mm=120.0,
            upper_arm_length_mm=180.0,
            lower_arm_length_mm=420.0,
            joint_limits_deg=(-60.0, 60.0),
            rz_limit_deg=(-180.0, 180.0),
            home_joints_deg=(0.0, 0.0, 0.0),
            home_pose=CartesianPose(0.0, 0.0, -200.0),
            workspace_min_mm=(-150.0, -150.0, -350.0),
            workspace_max_mm=(150.0, 150.0, -100.0),
            maximum_simulation_speed_mm_s=100.0,
            tolerance_mm=0.01,
        )


class DeltaKinematics:
    """Deterministic linearized delta model for simulation and UI validation.

    It deliberately exposes the geometry contract without implying physical accuracy.
    The transform is invertible, bounded, and keeps J4/RZ independent from XYZ.
    """

    def __init__(self, geometry: DeltaGeometry) -> None:
        self.geometry = geometry

    def inverse(self, x_mm: float, y_mm: float, z_mm: float, rz_deg: float = 0.0) -> JointAngles:
        self._finite((x_mm, y_mm, z_mm, rz_deg))
        self._check_pose(x_mm, y_mm, z_mm)
        if not self.geometry.rz_limit_deg[0] <= rz_deg <= self.geometry.rz_limit_deg[1]:
            raise KinematicsError("RZ exceeds configured limit")
        total = 3.0 * (z_mm - self.geometry.home_pose.z_mm)
        j1 = (total + x_mm) / 3.0
        j2 = (total - j1 - y_mm) / 2.0
        j3 = (total - j1 + y_mm) / 2.0
        joints = JointAngles((j1, j2, j3), rz_deg)
        self._check_joints(joints)
        return joints

    def forward(
        self,
        joints: JointAngles | tuple[float, float, float],
        rz_deg: float | None = None,
    ) -> CartesianPose:
        values = joints.values_deg if isinstance(joints, JointAngles) else joints
        rotation = (
            joints.rz_deg
            if isinstance(joints, JointAngles)
            else (0.0 if rz_deg is None else rz_deg)
        )
        self._finite((*values, rotation))
        if len(values) != 3:
            raise KinematicsError("delta kinematics requires exactly three joints")
        checked = JointAngles(
            cast(tuple[float, float, float], tuple(float(value) for value in values)), rotation
        )
        self._check_joints(checked)
        j1, j2, j3 = checked.values_deg
        x_mm = 2.0 * j1 - j2 - j3
        y_mm = j3 - j2
        z_mm = self.geometry.home_pose.z_mm + (j1 + j2 + j3) / 3.0
        self._check_pose(x_mm, y_mm, z_mm)
        return CartesianPose(x_mm, y_mm, z_mm, rotation)

    @staticmethod
    def _finite(values: tuple[float, ...]) -> None:
        if not all(math.isfinite(value) for value in values):
            raise KinematicsError("kinematics values must be finite")

    def _check_pose(self, x_mm: float, y_mm: float, z_mm: float) -> None:
        lower, upper = self.geometry.workspace_min_mm, self.geometry.workspace_max_mm
        if not all(
            lo <= value <= hi
            for value, lo, hi in zip((x_mm, y_mm, z_mm), lower, upper, strict=True)
        ):
            raise KinematicsError("Cartesian pose is outside simulation workspace")

    def _check_joints(self, joints: JointAngles) -> None:
        lower, upper = self.geometry.joint_limits_deg
        if not all(lower <= value <= upper for value in joints.values_deg):
            raise KinematicsError("joint target exceeds configured limit")
        if not self.geometry.rz_limit_deg[0] <= joints.rz_deg <= self.geometry.rz_limit_deg[1]:
            raise KinematicsError("RZ target exceeds configured limit")
