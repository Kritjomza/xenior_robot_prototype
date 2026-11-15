# Simulation verification report — November 7, 2026

## Changes
Replaced the linear XYZ/angle transform with geometric inverse kinematics for three radial arms at 0/120/240 degrees, and forward kinematics using intersection of three forearm spheres. The inverse selects the joint-limit-compatible solution nearest zero; forward selects the lower assembly. Checks reject nonfinite inputs, unreachable sphere intersections, degenerate configurations, workspace violations and joint-limit violations. RZ remains independent.

Mock XYZ commands now compute joint telemetry before changing state. The schematic uses the same default link dimensions and coordinate offset for mock telemetry; RoboDK retains its existing view convention.

## Coordinate contract
Dimensions are millimeters; joint angles are degrees, zero horizontal, positive downward. Base/platform widths denote equilateral-triangle sides. Defaults remain 340/120 mm triangle sides, 180 mm upper arm and 420 mm lower arm. Work home remains XYZ=(0,0,-200), with motor-plane Z offset derived from geometric zero-joint closure. These are simulation defaults, not measured CAD dimensions. Home-joint defaults are zero; custom nonzero home calibration is not implemented.

## Verified
Backend: 178 passed, 2 skipped. Added four asymmetric/symmetric round trips with independent forearm-length closure checks at 1e-7 mm tolerance. Existing frontend production build passes. Numerical agreement verifies the ideal model, not real hardware accuracy.

## Outstanding work
The simulation is improved but the full calibrated digital twin is not complete. STEP remains a static reference, not articulated CAD. The mock adapter still applies endpoint poses immediately rather than integrating time-dependent trajectories. No dynamics, collision detection, force/torque model, or complete Jacobian singularity analysis is supplied. Workspace-box checks alone cannot guarantee safe paths between endpoints.

The proposal PDF and video were not successfully reviewed in this implementation pass; no claim is made that their equations were verified. PDF extraction failed because the attempted local Python PDF packages were unavailable.

Next: extract and verify CAD pivot geometry and proposal equations; configure measured link lengths and encoder offsets; map CAD parts to joints; implement path sampling plus velocity/acceleration-limited playback; add Jacobian conditioning and collision checks; compare measured hardware poses before enabling physical motion. Review frontend in a real browser at desktop and phone widths.
