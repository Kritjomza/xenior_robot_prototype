import pytest
from app.domain.kinematics import CartesianPose, DeltaGeometry, DeltaKinematics, KinematicsError


@pytest.fixture
def kinematics() -> DeltaKinematics:
    return DeltaKinematics(DeltaGeometry.simulation_defaults())


def test_home_round_trip(kinematics: DeltaKinematics) -> None:
    joints = kinematics.inverse(0, 0, -200)
    pose = kinematics.forward(joints)
    assert pose.x_mm == pytest.approx(0)
    assert pose.y_mm == pytest.approx(0)
    assert pose.z_mm == pytest.approx(-200)


def test_reachable_pose_has_three_limited_joints(kinematics: DeltaKinematics) -> None:
    joints = kinematics.inverse(60, -30, -220)
    assert len(joints.values_deg) == 3
    assert all(-60 <= value <= 60 for value in joints.values_deg)


@pytest.mark.parametrize("pose", [(200, 0, -200), (0, 0, -80), (float("nan"), 0, -200)])
def test_unreachable_or_nonfinite_pose_rejected(
    kinematics: DeltaKinematics, pose: tuple[float, float, float]
) -> None:
    with pytest.raises(KinematicsError):
        kinematics.inverse(*pose)


def test_forward_rejects_joint_limits(kinematics: DeltaKinematics) -> None:
    with pytest.raises(KinematicsError):
        kinematics.forward((100, 0, 0))


def test_cartesian_pose_keeps_rz_separate() -> None:
    pose = CartesianPose(x_mm=0, y_mm=0, z_mm=-200, rz_deg=45)
    assert pose.rz_deg == 45

@pytest.mark.parametrize('target', [(0,0,-200),(60,-30,-220),(-50,70,-240),(90,40,-180)])
def test_geometric_roundtrip_and_link_closure(kinematics, target):
    import math
    joints = kinematics.inverse(*target)
    pose = kinematics.forward(joints)
    assert (pose.x_mm, pose.y_mm, pose.z_mm) == pytest.approx(target, abs=1e-7)
    g = kinematics.geometry
    r = (g.base_width_mm-g.moving_platform_width_mm)/(2*math.sqrt(3))
    z = target[2]-g.home_pose.z_mm+kinematics._home_z()
    for angle, joint in zip((0,2*math.pi/3,4*math.pi/3), joints.values_deg):
        q = math.radians(joint)
        radial = r+g.upper_arm_length_mm*math.cos(q)
        distance = math.sqrt((target[0]-radial*math.cos(angle))**2+(target[1]-radial*math.sin(angle))**2+(z+g.upper_arm_length_mm*math.sin(q))**2)
        assert distance == pytest.approx(g.lower_arm_length_mm, abs=1e-7)
