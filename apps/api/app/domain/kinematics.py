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
            base_width_mm=220.0 * math.sqrt(3),
            moving_platform_width_mm=90.0 * math.sqrt(3),
            upper_arm_length_mm=150.0,
            lower_arm_length_mm=400.0,
            joint_limits_deg=(-45.0, 85.0),
            rz_limit_deg=(-180.0, 180.0),
            home_joints_deg=(4.730137264504335,) * 3,
            home_pose=CartesianPose(0.0, 0.0, -350.0),
            workspace_min_mm=(-240.0, -240.0, -550.0),
            workspace_max_mm=(240.0, 240.0, -200.0),
            maximum_simulation_speed_mm_s=100.0,
            tolerance_mm=0.01,
        )


class DeltaKinematics:
    """Geometric delta model with radial axes at 0, 120 and 240 degrees.

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
        # Work coordinates retain the existing home Z; geometry uses the motor plane.
        z = z_mm - self.geometry.home_pose.z_mm + self._home_z()
        r = (self.geometry.base_width_mm - self.geometry.moving_platform_width_mm) / (2 * math.sqrt(3))
        length = self.geometry.upper_arm_length_mm
        lower = self.geometry.lower_arm_length_mm
        result = []
        for angle in (0, 2 * math.pi / 3, 4 * math.pi / 3):
            radial = x_mm * math.cos(angle) + y_mm * math.sin(angle)
            tangent = -x_mm * math.sin(angle) + y_mm * math.cos(angle)
            u = radial - r
            c = (u*u + tangent*tangent + z*z + length*length - lower*lower) / (2*length)
            radius = math.hypot(u, z)
            if radius < 1e-9 or abs(c) > radius + 1e-9:
                raise KinematicsError("Cartesian target is geometrically unreachable")
            phase = math.atan2(-z, u)
            opening = math.acos(max(-1.0, min(1.0, c / radius)))
            candidates = [math.degrees((phase + sign*opening + math.pi) % (2*math.pi) - math.pi) for sign in (-1, 1)]
            valid = [v for v in candidates if self.geometry.joint_limits_deg[0] <= v <= self.geometry.joint_limits_deg[1]]
            if not valid:
                raise KinematicsError("joint target exceeds configured limit")
            result.append(min(valid, key=abs))
        j1, j2, j3 = result
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
        # Three equal-radius spheres intersect at two points; choose the lower assembly.
        r = (self.geometry.base_width_mm - self.geometry.moving_platform_width_mm) / (2 * math.sqrt(3))
        centers = []
        for angle, joint in zip((0, 2*math.pi/3, 4*math.pi/3), checked.values_deg):
            theta = math.radians(joint)
            radius = r + self.geometry.upper_arm_length_mm * math.cos(theta)
            centers.append((radius*math.cos(angle), radius*math.sin(angle), -self.geometry.upper_arm_length_mm*math.sin(theta)))
        def sub(a, b): return tuple(x-y for x,y in zip(a,b))
        def dot(a, b): return sum(x*y for x,y in zip(a,b))
        def norm(a): return math.sqrt(dot(a,a))
        a, b, c = centers
        ab = sub(b,a); d = norm(ab)
        if d < 1e-9: raise KinematicsError("Singular joint configuration")
        ex = tuple(v/d for v in ab)
        ac = sub(c,a); i = dot(ex,ac)
        temp = tuple(v-i*w for v,w in zip(ac,ex)); j = norm(temp)
        if j < 1e-9: raise KinematicsError("Singular joint configuration")
        ey = tuple(v/j for v in temp)
        ez = (ex[1]*ey[2]-ex[2]*ey[1], ex[2]*ey[0]-ex[0]*ey[2], ex[0]*ey[1]-ex[1]*ey[0])
        x = d/2; y = (i*i+j*j-2*i*x)/(2*j)
        h2 = self.geometry.lower_arm_length_mm**2-x*x-y*y
        if h2 <= 1e-9: raise KinematicsError("Unreachable or singular joint configuration")
        points = [tuple(a[k]+x*ex[k]+y*ey[k]+sign*math.sqrt(h2)*ez[k] for k in range(3)) for sign in (-1,1)]
        x_mm, y_mm, z = min(points, key=lambda p:p[2])
        z_mm = z - self._home_z() + self.geometry.home_pose.z_mm
        self._check_pose(x_mm, y_mm, z_mm)
        return CartesianPose(x_mm, y_mm, z_mm, rotation)

    def _home_z(self) -> float:
        r = (self.geometry.base_width_mm - self.geometry.moving_platform_width_mm) / (2 * math.sqrt(3))
        theta = math.radians(self.geometry.home_joints_deg[0])
        h2 = self.geometry.lower_arm_length_mm**2 - (r + self.geometry.upper_arm_length_mm * math.cos(theta))**2
        if h2 <= 0:
            raise KinematicsError("Invalid simulation geometry")
        return -self.geometry.upper_arm_length_mm * math.sin(theta) - math.sqrt(h2)

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
