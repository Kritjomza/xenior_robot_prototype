# DeltaX Phase 2 Design

## Scope

Phase 2 replaces the Phase 1 demonstration surface with an authenticated, simulation-only robot workspace while preserving `RobotProgramV1`, existing command semantics, executor cancellation, the Mock adapter, WebSocket snapshots, and all Phase 1 routes. Physical robot and Raspberry Pi execution remain impossible.

Work is delivered as one `phase-2` branch with milestone commits. External services remain explicit blockers: the implementation includes mocks, configuration guides, and fail-closed states but never claims live Supabase, Google, or RoboDK verification without those systems.

## Architecture

The backend keeps Pydantic models as protocol authority. New modules add authentication, safety state, kinematics, adapter selection, jog control, and project/run persistence around the existing executor. Motion-capable endpoints depend on an authenticated principal and the same server-owned safety controller. The adapter registry exposes only `mock` and `robodk`; RoboDK imports lazily and is forced into simulation mode.

The frontend becomes a routed application shell. An auth provider guards workspace routes and attaches Supabase access tokens to HTTP and WebSocket connections. A central workspace store owns current project source, compiled IR, save state, selected adapter, lock, global speed, live robot state, and editor continuity. Monaco and Blockly compile into the same `RobotProgramV1` representation.

Supabase owns identity and durable project records. Browser data calls are protected by RLS; FastAPI validates Supabase JWTs and derives `user_id` from verified `sub`. No service-role key enters browser code.

## Delivery decomposition

1. Foundation: dependencies, configuration, auth boundary, migrations, RLS.
2. Robot domain: safety controller, global speed, delta kinematics, adapter registry, RoboDK contract, jog executor.
3. Programming: strict DSL parser, Blockly conversion, revision-backed project service.
4. Workspace UI: login, application shell, editors, digital twin, control and project pages.
5. Verification: unit, integration, migration, browser flows, visual inspection, setup documentation.

Each slice is independently testable and preserves a runnable Mock path.

## Authentication and identity

The browser initializes Supabase only when both `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` exist. Missing values render a setup-required screen. Supabase handles email registration, login, verification, reset, persistent sessions, OAuth redirect, and logout. Google uses `signInWithOAuth({ provider: 'google', options: { redirectTo } })`.

FastAPI accepts `Authorization: Bearer <token>`, verifies asymmetric JWTs against the project JWKS with issuer and audience checks, rejects expired or malformed tokens, and exposes a typed principal. Tests inject a fake verifier; production never accepts test headers or caller-supplied user IDs.

## Database and RLS

Migration creates `profiles`, `robot_projects`, `project_revisions`, and `robot_runs`, enums/checks, foreign keys, uniqueness, indexes, timestamps, and ownership-preserving triggers. All public tables enable RLS and explicitly grant required table/sequence access to `authenticated`, accounting for current Supabase Data API exposure defaults.

Policies use `to authenticated`, `(select auth.uid())`, `using`, and `with check`. Revision and run access joins through owned projects where needed. Project ownership is immutable. Profile creation is handled by a narrowly scoped auth-user trigger; editable metadata is display-only and never authorizes.

## Safety and runtime

`SafetyController` starts locked and relocks on connect, reconnect, adapter change, fault, reset, WebSocket lease expiry, session expiry, and logout. Unlock requires an authenticated user, connected simulator, valid state, and an acknowledgement flag. Run, Step, Home, Grip, Release, and Jog all enforce lock and connection server-side. Validate and Stop remain allowed.

Global speed is an integer from 1–100. Every executable speed is clamped to configured simulator limits after applying `program_speed * global_percent / 100`. Run, Step, and Jog use the same function.

Software Stop cancels executor or jog work, calls adapter stop, publishes retained pose and `stopped`, and records a run summary. It is never labeled as a physical E-stop.

## Kinematics and adapters

`DeltaGeometry` contains validated simulation defaults for base/platform dimensions, arms, joint limits, J4 limit, home, workspace, maximum speed, and tolerance. Documentation labels all values simulated. `DeltaKinematics.inverse` and `.forward` use delta geometry for J1–J3; J4/RZ stays separate. Validation order is finite values, speed, Cartesian bounds, IK, joint limits, optional RoboDK collision, then lock/connection.

`RoboDKRobotAdapter` imports RoboDK only in `connect`, forces simulation mode, loads or attaches to configured station path, validates all required item names, and fails closed. No `.rdk` file is generated. Contract tests use fakes; real tests carry an integration marker and skip without desktop/station configuration.

## Editors and projects

The DSL parser uses Python AST only as a parser, rejects every node except expression statements containing one allowlisted direct call, validates exact keyword/positional signatures, and emits `RobotProgramV1`; it never evaluates or executes Python. Formatter and diagnostics are derived from parsed commands.

Blockly custom blocks emit the IR directly and keep block IDs as command IDs. IR-to-DSL and IR-to-Blockly conversions reject exact lossy cases. Both editors use one project store and remain mounted or state-preserved across navigation.

Draft save is debounced. Save Version and Run create immutable revisions. Opening restores original editable source. New, Open, Save, Save Version, Rename, Duplicate, Delete, Import, Export, revision inspection, and restore live in one project service.

## UI direction

Mode is Operate. Visual world is a calibration-bench commissioning console: white instrument surfaces, navy structural rails, blue telemetry, orange active/primary controls, and amber/danger only for safety. Layout uses a compact top status strip, collapsible left rail, and one large task surface rather than a dashboard of decorative cards.

The first viewport shows the current editor or twin at working scale. Connection, lock, speed, Stop, faults, project save state, and identity remain visible. Dense numerical values use tabular figures; labels use a workhorse system sans. Corners are restrained, borders thin, shadows minimal, motion limited to state transitions and active-command tracking.

Manual-reference discipline contributes clear tab extent and literal state labeling. Viewfinder discipline contributes persistent live-state framing. Drum-machine discipline contributes active-command progression without adopting its dark entertainment styling.

Responsive target is desktop at 1366×768 and larger. Tablet collapses the rail and secondary inspector. Mobile may show account/project reading states but does not promise robot control.

## Error handling

Every external dependency has distinct unavailable, connecting, incompatible, disconnected, and faulted states. Selecting RoboDK never falls back to Mock. Authentication expiry immediately stops active work, locks safety state, closes protected streams, and returns to Login. Errors are concise, actionable, and associated with the control or source location that caused them.

## Testing

Python unit tests cover JWT verification boundaries, safety transitions, speed calculation, DSL rejection, kinematics, jog cancellation, adapter contract, and persistence service behavior. Migration tests inspect table definitions, RLS, policy predicates, grants, constraints, and ownership protection. TypeScript tests cover auth state, routing, project store, conversions, editor persistence, controls, and unavailable integrations. Playwright covers the eight requested flows with explicit fake Supabase/RoboDK boundaries. Real RoboDK and remote Supabase checks stay separately reported.

## Acceptance

Every criterion from the user brief is mapped to tests or an explicit external blocker. Phase 2 is not called passed if live credentials, Google provider setup, a real station, or real dimensions are absent.

