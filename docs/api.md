# Phase 1 API

Base URL: `http://127.0.0.1:8000`. Interactive OpenAPI docs: [Swagger UI](http://127.0.0.1:8000/docs).

| Method | Path | Request | Success |
| --- | --- | --- | --- |
| POST | `/api/v1/programs/validate` | `RobotProgramV1` JSON | 200 `{ "valid": true, "command_count": 9 }` |
| POST | `/api/v1/runs` | `RobotProgramV1` JSON | 202 `{ "run_id": "UUID" }`; acceptance, not completion |
| POST | `/api/v1/runs/{run_id}/stop` | no body | 200 current `RobotState` after cancellation settles |
| POST | `/api/v1/reset` | no body | 200 restored `RobotState` after cancellation settles |
| GET | `/api/v1/state` | no body | 200 complete current `RobotState` |
| WS | `/api/v1/ws/state` | no messages required | Complete `RobotState` JSON snapshots |

Example PowerShell session from the root:

```powershell
$programJson = Get-Content -Raw protocol/examples/pick-and-place.json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/v1/programs/validate -ContentType application/json -Body $programJson
$robotRun = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/v1/runs -ContentType application/json -Body $programJson
Invoke-RestMethod http://127.0.0.1:8000/api/v1/state
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/api/v1/runs/$($robotRun.run_id)/stop"
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/v1/reset
```

Equivalent validation with curl (use `curl.exe` on Windows PowerShell):

```sh
curl -X POST http://127.0.0.1:8000/api/v1/programs/validate -H "Content-Type: application/json" --data-binary @protocol/examples/pick-and-place.json
```

Subscribe from a JavaScript client:

```javascript
const socket = new WebSocket('ws://127.0.0.1:8000/api/v1/ws/state');
socket.onmessage = event => console.log(JSON.parse(event.data));
```

## Error responses

Invalid programs return **422**, with structured `detail` entries containing `loc`, `msg`, and `type`. No execution starts. Error serialization excludes rejected values so even non-finite inputs produce valid JSON errors. Example:

```json
{
  "detail": [{
    "loc": ["body", "commands", 0, "wait", "seconds"],
    "msg": "Input should be greater than 0",
    "type": "greater_than"
  }]
}
```

**409** means a program already runs, or a fault/disconnection requires reset. Run requests are never queued. **404** on Stop means the ID is not the current/latest retained run. Stopping a finished latest run is idempotent and returns its terminal state. After reset the previous run is no longer retained. Other errors have `{ "detail": "message" }`.

Adapter errors during a run terminate execution, attempt an adapter stop, publish `faulted` and an error message, and require reset before another run. A `stop` command counts as completed; an interrupted `wait` does not. Active command metadata clears at every terminal state.

Reset is an added Phase 1 endpoint: it holds the same control lock as Run and Stop while cancelling and awaiting the current task, restoring adapter defaults and clearing run/errors. A new run cannot slip between cancellation and reset. It does not clear the browser's program editor.

This local mock API has no authentication, user sessions, durable history, or hardware access. It is intended for loopback use. Its in-memory lock only protects a single process: do not use multiple workers or replicas.
