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
