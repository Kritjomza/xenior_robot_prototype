# Delta Lab — Phase 1

A complete mock-only foundation for the Delta Robot Web MVP: edit versioned JSON, validate it, run an ordered program, stop or reset, and watch live state.

## Setup

Use Python 3.10+ and Node.js 22.12+ (tested with Python 3.10.11 and Node 24.4.0). Run from the repository root:

```powershell
python -m venv .venv
.venv/Scripts/python -m pip install -r apps/api/requirements-lock.txt
npm ci
```

The Python lock file includes runtime and development tools. `requirements.txt` and `requirements-dev.txt` declare direct dependency ranges; the lock records the verified Windows environment. On Linux/macOS use `.venv/bin/python`; install from `requirements-dev.txt` if platform-specific lock entries are unavailable.

Start the API in one terminal:

```powershell
.venv/Scripts/python -m uvicorn app.main:app --app-dir apps/api --host 127.0.0.1 --port 8000
```

Start the web app in another:

```powershell
npm run dev
```

Open [the web app](http://127.0.0.1:5173). The Vite proxy sends `/api` HTTP and WebSocket traffic to the API on port 8000. `API_PROXY_TARGET` can override the development proxy target. The browser always uses its own origin, including `wss` when served over HTTPS. Run the API with **one worker**, without multiple replicas; the single robot lock and state are in memory.

The editor starts with [the pick-and-place example](protocol/examples/pick-and-place.json). Click **Validate**, then **Run**. The 9-command program grips at X=100, transfers to X=-100, releases, and returns home. Two one-second waits make live updates visible. **Stop** cancels an active wait/run and preserves the last pose, speed and grip. **Reset** also cancels an active run, then restores the mock defaults without changing the editor text.

## Verification

```powershell
.venv/Scripts/python -m pytest apps/api/tests/domain/test_commands.py -v
.venv/Scripts/python -m pytest -q
.venv/Scripts/python -m ruff check apps/api
.venv/Scripts/python -m ruff format --check apps/api
.venv/Scripts/python -m mypy
npm test
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright builds the production web app and starts its own API/preview servers on ports 8001/5174; leave these ports free. Tests execute serially against one mock robot and reset it before each test. Screenshots are saved under `apps/web/test-results`. The runner cleans up the servers when finished.

## Structure

- `apps/api/app/domain`: strict Pydantic commands, program and state.
- `apps/api/app/adapters`: `RobotAdapter` interface and mock implementation.
- `apps/api/app/services`: serialized run executor, cancellation and state subscribers.
- `apps/api/app/main.py`: FastAPI routes, lifespan and WebSocket state stream.
- `apps/web`: React/TypeScript/Vite interface, Vitest and Chromium acceptance tests.
- `protocol`: generated JSON schemas, protocol reference and sample JSON.
- `docs`: coordinates, API usage, architecture/limitations and acceptance evidence.

## Protocol changes

Pydantic models are the schema source. Regenerate both schemas and TypeScript after changing a model:

```powershell
.venv/Scripts/python apps/api/export_schemas.py
npm run generate:types
```

Commit generated files with their model changes. Backend tests detect stale schemas. `npm run typecheck` checks their frontend consumers. JSON Schema cannot express unique command IDs or distinguish JSON's `1.0` spelling from `1`; the API applies these additional checks.

See [coordinates](docs/coordinate-system.md), [API examples](docs/api.md), [protocol](protocol/README.md), [architecture and limitations](docs/phase-1.md), and [acceptance results](docs/acceptance-test.md).

Only Phase 1 is implemented. There is no RoboDK, Blockly, Monaco, kinematics, Raspberry Pi, physical robot support or user-code execution. The supplied multi-phase plan is retained unchanged.
