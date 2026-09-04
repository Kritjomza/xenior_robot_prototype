# Delta Robot Web MVP Implementation Plan

> **For agentic workers:** Implement phase-by-phase with tests and review gates. Track work using the checkboxes below. Do not enable real-robot control until hardware integration is explicitly authorized.

**Goal:** Build a web MVP where users program a 4-axis delta robot using either Google Blockly or a safe Python-like Robot DSL, run the same program against a RoboDK digital twin, and later connect to a Raspberry Pi over LAN/Wi-Fi without changing user programs.

**Architecture:** React/TypeScript hosts Blockly, Monaco, controls, and live status. Both editors compile to one versioned `RobotProgram` IR. FastAPI parses and validates the IR, computes delta kinematics, and executes commands through a `RobotAdapter`. Use `RoboDKRobotAdapter` now; add `PiRobotAdapter` later. RoboDK Desktop and the `.rdk` station run on the host PC, outside containers.

**Stack:** React, TypeScript, Vite, Blockly, Monaco Editor, FastAPI, Pydantic, Python, RoboDK Python API, WebSocket, pytest, Vitest, Playwright, Docker Compose for web/API only.

## Global Constraints

- Default mode is always `simulation`; never send commands to physical hardware during this MVP.
- Blockly and the DSL must compile to the same `RobotProgramV1` IR and use one validator/executor.
- Never run user text with `exec`, `eval`, shell, or subprocess. Parse an allowlisted Robot DSL only.
- Validate workspace, joint limits, speed, and collision before every move reaches an adapter.
- Browser Stop is a software stop, not a hardware emergency stop. A physical robot requires a separate wired E-stop.
- Standard units: millimetres, mm/s, degrees, seconds.
- Use one documented coordinate convention across UI, IR, kinematics, RoboDK, and Pi protocol.
- MVP commands: `home`, `move_xyz`, `set_speed`, `grip`, `release`, `wait`, `stop`.
- Raspberry Pi is a communication gateway; deterministic motor control belongs on a microcontroller/motion controller.

## Repository Layout

```text
delta-robot-web/
├── apps/
│   ├── web/src/
│   │   ├── features/programming/{blockly,code,ir}/
│   │   ├── features/simulation/
│   │   └── services/api/
│   └── api/
│       ├── app/
│       │   ├── api/{routes.py,websocket.py}
│       │   ├── adapters/{base.py,mock.py,robodk.py,pi.py}
│       │   ├── domain/{commands.py,program.py,state.py,safety.py}
│       │   ├── kinematics/delta.py
│       │   ├── services/{dsl_parser.py,executor.py,safety_controller.py}
│       │   └── validation/motion.py
│       └── tests/
├── simulation/{delta_robot_station.rdk,models/,README.md}
├── protocol/{robot-command.schema.json,robot-state.schema.json,README.md}
├── tests/{integration,e2e}/
├── tools/pi_simulator/
├── docs/
└── docker-compose.yml
```

## Core Contract

```python
from dataclasses import dataclass
from typing import Literal, Protocol

Mode = Literal["simulation", "mock", "robot"]

@dataclass(frozen=True)
class MoveXYZ:
    x_mm: float
    y_mm: float
    z_mm: float
    speed_mm_s: float

class RobotAdapter(Protocol):
    async def connect(self) -> None: ...
    async def execute(self, command: "RobotCommand") -> None: ...
    async def stop(self) -> None: ...
    async def get_state(self) -> "RobotState": ...
```

Example IR:

```json
{"version":1,"name":"pick-and-place-demo","commands":[
  {"id":"c1","type":"home"},
  {"id":"c2","type":"move_xyz","x_mm":100,"y_mm":30,"z_mm":-250,"speed_mm_s":100},
  {"id":"c3","type":"grip"},
  {"id":"c4","type":"move_xyz","x_mm":-100,"y_mm":30,"z_mm":-250,"speed_mm_s":100},
  {"id":"c5","type":"release"}
]}
```

---

# Phase 1 — Foundation and Executable Mock (Weeks 1–2)

**Outcome:** Runnable web shell, stable schemas, mock execution, and live state with no RoboDK dependency.

### 1.1 Coordinates and protocol

**Create:** `docs/coordinate-system.md`, both JSON schemas, `domain/commands.py`, and domain tests.

- [ ] Define origin, axes, units, home pose, and optional fourth gripper-rotation axis.
- [ ] Define Pydantic discriminated unions for the seven commands, `RobotProgramV1`, and `RobotState`.
- [ ] Test unknown commands, unsupported versions, NaN/Infinity, invalid types, and non-positive speed/time.
- [ ] Run `pytest apps/api/tests/domain/test_commands.py -v`.
- [ ] Commit: `feat: define robot command protocol`.

### 1.2 Web/API shell and mock runtime

- [ ] Implement `POST /api/v1/programs/validate`, `POST /api/v1/runs`, `POST /api/v1/runs/{id}/stop`, `GET /api/v1/state`, and `WS /api/v1/ws/state`.
- [ ] Implement `MockRobotAdapter`; test ordered execution and cancellation during `wait`.
- [ ] Build Programming, Twin/Status, and Run Controls panels.
- [ ] Add WebSocket reconnection and explicit disconnected state.
- [ ] Run backend/frontend tests and a browser smoke test.
- [ ] Commit: `feat: add mock robot execution shell`.

**Gate:** Sample pick-and-place completes in Mock mode; invalid IR never executes; Run, Stop, Reset, and reconnect work.

---

# Phase 2 — RoboDK Digital Twin (Weeks 3–5)

**Outcome:** FastAPI loads the station and simulates validated motion, gripping, collision state, and telemetry.

### 2.1 RoboDK station

- [ ] Create `simulation/delta_robot_station.rdk` with base, three driven arms, parallel links, moving platform, optional fourth-axis servo, gripper, table, and workpiece.
- [ ] Use stable names: `DeltaRobot`, `TCP_Gripper`, `PickObject`, `WorldFrame`, `WorkFrame`.
- [ ] Configure joint limits, home joints, TCP, and collision pairs.
- [ ] Add targets: `Home`, `ApproachPick`, `Pick`, `RetractPick`, `ApproachPlace`, `Place`, `RetractPlace`.
- [ ] Verify pick-and-place manually and document station setup.
- [ ] Commit: `feat: add RoboDK delta station`.

### 2.2 Kinematics and validation

- [ ] Configure actual base/platform dimensions, arm lengths, joint limits, and tolerances.
- [ ] Implement `inverse(x_mm, y_mm, z_mm) -> JointAngles` and `forward(joints) -> CartesianPose`.
- [ ] Test home, centre, known poses, boundaries, unreachable points, singularities, and invalid numbers.
- [ ] Require `FK(IK(point))` within the documented tolerance.
- [ ] Validate workspace, joints, speed, and collision before execution.
- [ ] Commit: `feat: add validated delta kinematics`.

### 2.3 RoboDK adapter

- [ ] Connect using `Robolink`, open the `.rdk` file, verify required items, and force `RUNMODE_SIMULATE`.
- [ ] Convert `move_xyz` to joint targets and move the digital twin.
- [ ] Simulate `grip`/`release` by attaching/detaching the workpiece.
- [ ] Publish joint, Cartesian, gripper, run, and collision state via WebSocket.
- [ ] Fail closed when RoboDK is unavailable, items are missing, a point is unreachable, or collision validation fails.
- [ ] Add adapter contract and RoboDK integration tests.
- [ ] Commit: `feat: connect RoboDK simulation adapter`.

**Gate:** Repeat pick-and-place 20 times without state drift. Reject unreachable points and collisions before motion.

---

# Phase 3 — Blockly and Code Editor, One Runtime (Weeks 6–8)

**Outcome:** Users author the same safe robot program with blocks or text and run it against RoboDK.

### 3.1 Google Blockly

- [ ] Add Start, Home, Move XYZ, Set Speed, Grip, Release, Wait, and Stop blocks.
- [ ] Restrict numeric fields and show units.
- [ ] Generate `RobotProgramV1` directly; do not generate executable Python.
- [ ] Save/load Blockly workspace JSON separately from the IR.
- [ ] Attach validation errors to the originating block.
- [ ] Add generator/editor tests.
- [ ] Commit: `feat: add Blockly robot programming`.

### 3.2 Safe Robot DSL

```python
home()
move_to(x=100, y=30, z=-250, speed=100)
grip()
wait(0.5)
move_to(x=-100, y=30, z=-250, speed=100)
release()
```

- [ ] Add Monaco autocomplete for allowlisted Robot DSL functions only.
- [ ] Parse with Python AST; allow only supported calls, literals, and keyword arguments.
- [ ] Reject imports, assignments, attributes, loops, definitions, comprehensions, file/network access, and arbitrary Python.
- [ ] Convert valid input to `RobotProgramV1`; return line/column diagnostics.
- [ ] Add `POST /api/v1/programs/parse` and parser tests.
- [ ] Commit: `feat: add safe robot code editor`.

### 3.3 Unified authoring modes

- [ ] Support Blockly → IR → DSL for every supported block.
- [ ] Support DSL → IR → Blockly only when all commands map to blocks; block unsafe mode switching.
- [ ] Add Validate, Run, Step, Pause, Stop, and Reset.
- [ ] Highlight the active block/code line using command ID.
- [ ] Persist source type, source document, generated IR, and schema version.
- [ ] Add unit and Playwright tests for both modes.
- [ ] Commit: `feat: unify Blockly and code execution`.

**Gate:** Equivalent Blockly and DSL programs generate semantically identical IR. No user path executes code outside the allowlist.

---

# Phase 4 — Robot-Ready LAN/Wi-Fi Interface (Weeks 9–11)

**Outcome:** Disabled-by-default Pi adapter, network simulator, and safety state machine tested without motors.

### 4.1 Pi protocol

Envelope: `protocol_version`, `command_id`, `sequence`, `timestamp`, `type`, `payload`, `checksum`. ACK states: `accepted`, `running`, `completed`, `rejected`, `faulted`.

- [ ] Define handshake, capability negotiation, heartbeat, timeout, cancellation, and reconnect behavior.
- [ ] Retry idempotent messages only; deduplicate by command ID and sequence.
- [ ] Define state/fault codes and stale-state handling.
- [ ] Implement `PiRobotAdapter` behind `ENABLE_REAL_ROBOT=false`.
- [ ] Test disconnects, delayed ACKs, duplicates, out-of-order packets, and stale telemetry.
- [ ] Commit: `feat: add Raspberry Pi communication contract`.

### 4.2 Pi simulator

- [ ] Create `tools/pi_simulator/main.py` using the real protocol.
- [ ] Simulate limit switch, motor fault, timeout, lost heartbeat, and E-stop faults.
- [ ] Test on localhost and a second LAN host.
- [ ] Prove the same Blockly/DSL program works by changing adapters only.
- [ ] Commit: `test: add Raspberry Pi network simulator`.

### 4.3 Safety state machine

States: `DISCONNECTED`, `IDLE`, `HOMING`, `READY`, `RUNNING`, `PAUSED`, `STOPPING`, `FAULT`, `ESTOP`.

- [ ] Document transitions and test all rejected transitions.
- [ ] Require connected, homed, and ready before motion in robot mode.
- [ ] Stop on heartbeat loss, fault, operator stop, or E-stop state.
- [ ] Allow one active operator session in robot mode.
- [ ] Document that software controls never replace a hardware E-stop.
- [ ] Commit: `feat: add robot safety state machine`.

**Gate:** Network-fault tests pass. Robot commands are rejected while disconnected, unhomed, faulted, or disabled. Simulation remains default.

---

# Phase 5 — Integrated MVP and Acceptance (Weeks 12–13)

**Outcome:** Installable demo with operator UI, documentation, acceptance tests, and hardware-integration handoff.

### 5.1 Operator UI

- [ ] Display mode, connection, safety state, XYZ, joints, speed, gripper, active command, and faults.
- [ ] Embed RoboDK Local Web View when available; otherwise show live status and an Open RoboDK View action.
- [ ] Include ready-to-run Blockly and DSL pick-and-place examples.
- [ ] Require confirmation before requesting robot mode; server still rejects it while the flag is false.
- [ ] Add versioned project JSON import/export, run history, and E2E tests.
- [ ] Commit: `feat: finish operator workspace`.

### 5.2 Packaging and deployment

- [ ] Containerize web/API only; document RoboDK Desktop installation on the host.
- [ ] Configure RoboDK, Web View, and Pi host/ports through environment variables.
- [ ] Bind API to LAN only through explicit configuration; restrict trusted origins.
- [ ] Add API, RoboDK, and WebSocket health/readiness checks.
- [ ] Document station loading, startup, browser access, demo, and shutdown.
- [ ] Commit: `chore: package delta robot MVP`.

### 5.3 Acceptance and handoff

- [ ] Run backend, frontend, parser, kinematics, integration, and E2E tests.
- [ ] Test Blockly/DSL pick-and-place, invalid point, collision, Stop, disconnect, and reconnect.
- [ ] Record LAN latency baseline. Never use browser/network timing for motor pulses.
- [ ] Demonstrate from a Wi-Fi client to the host PC running FastAPI and RoboDK.
- [ ] Create `docs/acceptance-test.md` and `docs/hardware-integration-checklist.md`.
- [ ] Commit: `docs: complete MVP acceptance handoff`.

**Final acceptance:**

- Blockly and DSL execute pick-and-place successfully in RoboDK.
- Twin motion, gripper, command state, and workpiece attachment stay synchronized.
- Invalid workspace, joint limit, collision, unsafe state, and unsupported DSL input never execute.
- Stop reaches the documented safe state.
- Pi simulator passes handshake, ACK, heartbeat, reconnect, deduplication, cancellation, and fault tests.
- A new PC can be installed from the docs; another LAN/Wi-Fi device can operate the simulation UI.

## Decisions Required Before Phase 2

1. Base/platform dimensions and upper/lower arm lengths.
2. Final axis count: 3-axis delta or 3 axes plus gripper-rotation servo.
3. Gripper type: servo jaws or vacuum.
4. Twin display: embedded RoboDK Local Web View or separate RoboDK window.
5. Target RoboDK host PC and operating system.

## Out of Scope

- Direct step-pulse/PWM generation from browser, FastAPI, or Raspberry Pi Linux.
- Arbitrary Python execution.
- Computer vision/object detection.
- Multi-user collaborative editing.
- Internet/cloud control of physical hardware.
- Calibration, encoder tuning, and motor PID before assembly.

## Execution Rule

Complete phases in order. At each gate, run the listed tests, record failures, and stop until the gate passes. Keep real-robot support disabled until a separate hardware-in-the-loop plan, physical E-stop, limit switches, controller firmware, and supervised commissioning are ready.
