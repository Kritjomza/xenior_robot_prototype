# Coordinate convention

Phase 1 uses a right-handed Cartesian frame fixed to the centre of the stationary robot base plate.

- Origin `(0, 0, 0)`: centre of the base plate, in its plane.
- `+X`: operator's right when looking at the robot from the front.
- `+Y`: away from the operator, towards the rear of the robot.
- `+Z`: upward, away from the working area below the base.
- Positions describe the tool centre point (TCP) in **millimetres**. Normal illustrative positions below the base have negative Z.
- Linear speed: **millimetres per second** (`speed_mm_s`).
- Joint angles: **degrees** (`joints_deg`), ordered J1, J2, J3.
- Wait duration: **seconds** (`seconds`).

The mock home pose is `(0, 0, -200)` mm. Its three joint values are always `[0, 0, 0]` degrees. These are fixed mock values and have no geometric relationship to XYZ; no inverse/forward kinematics are computed. `home` restores position and mock joints but preserves speed and gripper. Reset restores the full default state: home, speed 100 mm/s, released gripper, idle, connected, and cleared run/error metadata.

An optional fourth axis would rotate the gripper about +Z, positive by the right-hand rule (counter-clockwise viewed from above). It is **not implemented** in V1: no fourth joint or rotation field is accepted or displayed as available. Axis count, calibration, joint zero references and mounting transforms require later decisions before kinematics/hardware work.

All finite XYZ coordinates are accepted in Phase 1, including positions outside a real delta robot's reach. Workspace, joint, collision, acceleration and travel-time checks are deliberately absent until a robot geometry and digital twin exist. The mock sets positions immediately and never claims physical reachability.
