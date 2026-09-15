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

Set host, port, and station path through user settings/environment. Use RoboDK simulation mode only. Station must contain:

`DeltaRobot`, `TCP_Gripper`, `PickObject`, `WorldFrame`, `WorkFrame`, `Home`, `ApproachPick`, `Pick`, `RetractPick`, `ApproachPlace`, `Place`, `RetractPlace`.

Open RoboDK Desktop, load station, run real integration checks. Missing Desktop/station must remain an unavailable error; never falls back silently to Mock.

## Safety

Simulation starts locked. Unlock only after connected-state confirmation. Software Stop is not physical emergency stop. Physical robot and Raspberry Pi remain disabled.

## Geometry

Current dimensions are simulation defaults only. Replace only with verified DeltaX dimensions and rerun FK/IK/reachability tests.
