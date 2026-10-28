# Unified Python robot workspace

The Program destination now contains Python authoring, an interactive schematic digital twin, manual controls, and live telemetry. The previous Control destination was component state rather than a URL route; it has been removed from navigation and conditional rendering. Projects remains available. The editor toggles between Python and Blockly. Entering Blockly compiles Python through the existing backend; block edits update the same Python source used for validation, execution and saving. Disconnected block stacks are rejected rather than partially executed. Legacy IR endpoints remain available for compatibility.

## Execution path

1. Monaco uses the Python language contribution and sends source text to authenticated FastAPI endpoints:
   - `POST /api/v1/programs/python/validate` with `{source, name}` returns validation status, command count and canonical program IR.
   - `POST /api/v1/programs/python/runs` parses the same source again and submits the validated IR to the existing executor.
2. `app/domain/dsl.py` uses Python's `ast.parse`. This is a restricted Python robot-command dialect, not an arbitrary Python interpreter. Supported calls are `home()`, `set_speed(number)`, `move_to(x=number, y=number, z=number, speed=number)` (speed optional), `grip()`, `release()`, `wait(number)`, and `stop()`.
3. Comments and Python numeric literals are supported. Imports, variables, loops, functions, attributes, indirect calls, argument expressions and arbitrary libraries are rejected. Source is never evaluated with browser JavaScript, `eval`, or `exec`.
4. Existing strict command schemas, adapter capabilities, lock/connection checks, speed clamping, executor serialization, cancellation and WebSocket lease locking still apply. Jogging uses the existing server-bound incremental limits (up to 10 mm/degrees) and kinematics checks. Mock geometry is illustrative and its fixed joints are not physical inverse kinematics.
5. Manual Home/Grip/Release submit ordinary one-command programs through the existing run interface. XYZ/RZ jogging uses the existing jog endpoint. All movement and tool changes reach the twin through the same server telemetry stream.

Example:

```python
# Simulation example
home()
set_speed(40)
move_to(x=50, y=20, z=-250)
grip()
wait(1)
release()
home()
```

## Layout and persistence

The desktop editor/twin separator supports pointer dragging and keyboard Left/Right/Home/End; its position is saved locally. The default editor/twin split is 64/36, with a taller twin viewport matching the supplied reference proportions. Below 1050px, panels stack. The twin offers orbit, zoom, reset and fit. Manual controls expose 0.1/0.5/1/5/10-unit increments; the shared speed control uses server state. RoboDK's absent RZ/gripper capabilities remain disabled. Connection loss visibly marks telemetry as stale and disables movement.

Projects retain the existing Supabase `dsl` source discriminator and store Python in `dsl_source`, with the canonical IR in `program_ir`; no database migration is needed. Repeated saves retain the active project's ID. Local drafts and snapshots can be saved without a backend connection (including unfinished programs). Local drafts persist Python, old JSON drafts migrate to Python on load, and local version snapshots now persist independently. Projects exposes both local and connected cloud revisions, timestamps, and confirmed loading into the editor without modifying saved versions. Cloud integration still depends on the existing Supabase configuration and ownership policies.

## Raspberry Pi and physical robot dependency

Repository tracing found only Mock and RoboDK adapters (`app/adapters`), a simulation-only mode enum (`main.py`, `domain/state.py`), and explicitly disabled Pi/physical controls. `docs/phase-2-setup.md` and the Phase 2 design explicitly prohibit hardware execution. There is no Pi service source, GPIO/serial/network robot transport, Python device upload/run API, physical authorization protocol, or hardware stop/acknowledgement implementation to connect.

Accordingly, physical execution remains unavailable and the server rejects physical mode. Simulation actions cannot be routed to hardware by this implementation. The Python backend integration is complete for the supported simulation adapters. To enable physical execution, the device service/driver and its documented transport, capabilities, limits, cancellation/stop acknowledgements, and authorization protocol must first be supplied. A physical adapter and explicit per-run authorization can then be implemented against that actual contract. Merely hosting FastAPI on a Raspberry Pi does not provide a robot driver.

## Verification

- Backend: 174 passed, 2 environment-dependent tests skipped.
- Frontend unit: 34 passed.
- Browser: Python sample, rejection before motion, stop/reset, delayed run response, manual jogging/gripper/Home, resizing, project navigation, revision loading and phone overflow checks passed. Additional stale-state capture verifies movement locks on connection loss.
- TypeScript/build and Python lint pass. ESLint has one pre-existing Blockly effect-dependency warning in the retained compatibility component.
- Impeccable detector: no findings. Hallmark static floor checks pass; inherited mixed spacing is explicitly waived. Hallmark render could not run because puppeteer-core is absent; Playwright supplied desktop/mobile and state-specific visual verification.
- Physical hardware, RoboDK Desktop/station, and live cloud persistence were not exercised in this environment.
