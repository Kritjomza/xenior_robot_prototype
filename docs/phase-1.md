# Phase 1 architecture and limitations

## Decisions

The repository initially contained only the supplied plan. Its bytes were preserved. An npm workspace hosts React/TypeScript/Vite under `apps/web`; Python modules under `apps/api` are isolated with `.venv`. The implementation is on local branch `phase-1`, in small logical commits.

Strict Pydantic models are the authoritative input contract. JSON schemas and TypeScript types are checked in for shared use. The frontend only parses JSON and sends it to the same server-side validator used by Run; it does not compile or execute user source. A small explicit telemetry decoder checks incoming WebSocket values before displaying them.

`RobotAdapter` separates command execution and physical mock state from program lifecycle. It exposes async connect, execute, stop, reset, and get_state methods. Only `MockRobotAdapter` exists. The API never accepts a mode selector and cannot instantiate real hardware.

`Executor` owns run metadata and one task. A control lock serializes start, stop, reset and shutdown. Command execution yields between immediate commands so cancellation and telemetry can be processed. Wait uses a cancellable asyncio sleep. Cancellation is awaited before reset returns or a replacement run can start. Stop preserves the last pose/speed/grip; an instantaneous move already completed is not rolled back. On shutdown the active run is cancelled.

WebSocket clients have independent bounded queues of full snapshots. A receive task detects disconnects even during idle periods, and both socket tasks and the subscription are cleaned up. The UI reconnects, shows stale state until valid telemetry arrives, and exposes request errors separately from robot faults. HTTP responses never overwrite the WebSocket state with potentially older snapshots. Run is disabled without live connected telemetry or while running/faulted; Stop can still be requested from retained active state if the WebSocket disconnects. Stop and Reset remain available when telemetry confirms execution but the original Run HTTP response is delayed. Later responses from superseded requests cannot overwrite cancellation feedback.

Dependencies are locked by `package-lock.json` and `apps/api/requirements-lock.txt`. Tests were authored before the corresponding domain/runtime/UI implementation. Red runs initially failed on absent modules; protocol tests then caught null-speed acceptance. Browser tests use real FastAPI and browser WebSockets, with transport interception only for forced disconnects.

## Limits of the foundation

- Immediate mock position updates; no interpolation, move-duration calculation, acceleration, robot geometry, inverse/forward kinematics, workspace/joint-limit or collision checking.
- Joints remain explicitly labelled fixed mock values. No fourth rotation axis is implemented.
- No RoboDK, Blockly, Monaco, Robot DSL, Raspberry Pi or real-hardware execution.
- All runtime state and the latest run ID are memory-only. Reloading the browser restores the sample editor; restarting the API restores idle defaults. No run history, persistence, import/export workflow, user authentication or collaborative editing.
- One API worker/process. Concurrent submissions receive 409; no run queue.
- The browser connection has no authority to emergency-stop hardware. Disconnecting the browser does not stop a mock run. Stop is a software cancellation operation.
- Wait durations are positive and limited to 3600 seconds per command; programs contain at most 1000 commands. Speeds must be finite and positive, but are not robot-specific motion limits.
- A slow subscriber can miss intermediate snapshots. Reconnect restores current state, not a replay of every command event.
- A HTTP timeout may occur after a Run was accepted; the UI does not retry automatically. Check live run state before deciding whether to retry.
- Production output is built locally; deployment, containers, LAN access controls and multi-host operation are outside Phase 1. The compiled web app requires a same-origin `/api` HTTP/WebSocket proxy.

## Implementation references

The strict validation and WebSocket boundaries follow the official [Pydantic strict-mode documentation](https://docs.pydantic.dev/latest/concepts/strict_mode/) and [FastAPI WebSocket documentation](https://fastapi.tiangolo.com/advanced/websockets/). Toolchain requirements were checked against [Vite's guide](https://vite.dev/guide/) and the installed package engine declarations.
