# Phase 2 external setup

## Supabase

1. Create/select Supabase project.
2. Apply `supabase/migrations/20260915000000_phase_2.sql`.
3. Set frontend environment values:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

4. In Supabase Auth, set Site URL and redirect URLs for `http://127.0.0.1:5173` and deployed origin.
5. Enable email confirmation and Google provider. Put Google OAuth client ID/secret in Supabase Dashboard only; never in React.
6. Configure FastAPI token verification with Supabase issuer/JWKS environment settings. Do not use service-role keys in browser.

## RoboDK

Place `delta_robot.rdk` at `assets/robodk/delta_robot.rdk`, or set
`ROBODK_STATION_PATH` to its absolute path. `ROBODK_HOST` defaults to
`127.0.0.1`; `ROBODK_PORT` defaults to `20500`. Install Python dependencies
from `apps/api/requirements-lock.txt` and install RoboDK Desktop locally.
Run one API worker. Select **RoboDK Digital Twin** in the Robot menu, then
unlock simulation control. The API loads the station, forces RoboDK simulation
mode, and refuses a physical robot connection. Browser shows an interactive
three-dimensional schematic driven by RoboDK XYZ and joint telemetry. It is
not the station's exact CAD mesh; open RoboDK Desktop to inspect that model.

The supplied station contains one autonox RL3-600 three-axis delta robot.
It has no J4, gripper, pick object, or named pick/place targets. RZ jog is
disabled, and programs with `grip` or `release` are rejected. The browser
loads `protocol/examples/robodk-xyz.json` when switching from its untouched
default Mock example. Reachability and joint limits are checked by RoboDK.
No physical robot path is exposed.

For real integration checks with RoboDK running:

```powershell
$env:RUN_ROBODK_INTEGRATION='1'
.venv/Scripts/python -m pytest apps/api/tests/adapters/test_robodk.py apps/api/tests/test_api.py -q
```

## Safety

Simulation starts locked. Unlock only after connected-state confirmation. Software Stop is not physical emergency stop. Physical robot and Raspberry Pi remain disabled.

## Geometry

Current dimensions are simulation defaults only. Replace only with verified DeltaX dimensions and rerun FK/IK/reachability tests.
