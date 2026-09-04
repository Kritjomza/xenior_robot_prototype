# Phase 1 acceptance — 2026-09-04

Verified on Windows, Python 3.10.11, Node.js 24.4.0, npm 11.4.2. The repository started with only the supplied plan. No Phase 2 features were introduced.

## Final verification

Commands run from the repository root. All final commands below exited **0**.

| Command | Exact final result |
| --- | --- |
| `.venv/Scripts/python -m pytest apps/api/tests/domain/test_commands.py -v` | **63 passed** |
| `.venv/Scripts/python -m pytest -q` | **94 passed, 2 warnings** |
| `.venv/Scripts/python -m ruff check apps/api` | **All checks passed!** |
| `.venv/Scripts/python -m ruff format --check apps/api` | **16 files already formatted** |
| `.venv/Scripts/python -m mypy` | **Success: no issues found in 12 source files** |
| `.venv/Scripts/python -m pip check` | **No broken requirements found.** |
| `npm test` | **3 test files passed; 16 tests passed** |
| `npm run typecheck` | `tsc --noEmit`, no diagnostics |
| `npm run lint` | `eslint .`, no diagnostics |
| `npm run build` | **20 modules transformed; production build succeeded** |
| `npm run test:e2e` | **7 passed**, Chromium against real FastAPI and production Vite preview |
| `npm audit --audit-level=high` | **found 0 vulnerabilities** |
| `git diff --check` | No whitespace errors |

Schemas were generated with `.venv/Scripts/python apps/api/export_schemas.py`, and TypeScript was generated with `npm run generate:types`; both exited 0. Dependencies were installed successfully with pip and npm, and Chromium was installed with `npx playwright install chromium`.

The two pytest warnings originate in the installed Starlette test client: deprecated `httpx` support and an AnyIO `BlockingPortal` alias. They do not indicate failed tests. The browser runner also reports the host environment's `NO_COLOR`/`FORCE_COLOR` conflict; all browser cases pass. Production build and lint emit no warnings. These warnings are recorded rather than hidden with filters.

## Acceptance mapping

| Criterion | Evidence | Result |
| --- | --- | --- |
| Sample pick-and-place completes in Mock mode | Backend command-order test and browser sample: grip at X=100, transfer, release, home; 9/9 complete | PASS |
| Invalid programs rejected before execution | 63 domain tests; 20 invalid raw HTTP cases across Validate/Run; browser later-invalid-command case leaves gripper released and status idle | PASS |
| Commands execute in order | Published active IDs exactly c0 through c6 in runtime test; intermediate pose/speed/gripper assertions | PASS |
| Stop cancels an active wait/run safely | Runtime 60-second wait cancels within a 0.5-second timeout; browser terminal stopped and subsequent release never runs | PASS |
| Reset restores mock state | Runtime and browser tests cancel active waits and restore pose, speed, grip, counts and metadata | PASS |
| UI receives live WebSocket state | Browser observes c5 wait, X=100 and gripped before final home; API WebSocket integration tests | PASS |
| WebSocket reconnect works | Transport closed in real browser; stale/disconnected state visible; run changes state while disconnected; reconnect receives X=123 and completed | PASS |
| Backend/frontend/type-check/lint/build pass | Final verification table above | PASS |

Additional checks cover concurrent starts (one winner), stop-command short circuit, unknown/idempotent stop, adapter fault publication/reset, bounded slow subscribers, invalid telemetry, silent socket detection, obsolete socket events, retry backoff, transport errors, HTTP timeout messaging, and mobile layout at 390px.

Independent read-only review found a delayed-Run-response cancellation issue. Two failing frontend regressions reproduced it before the fix. Stop/Reset now remain enabled once telemetry confirms the run, and late superseded responses cannot replace cancellation feedback. A seventh browser case proves Stop works while the real accepted Run response is held back. Review also prompted display of the program name. No blocking backend findings remained.

## Failures resolved during implementation

- Test-first domain/runtime/UI runs failed because implementation modules did not yet exist.
- Explicit null move speed was initially accepted; strict validation now rejects it while allowing omission.
- An initial schema-test path pointed one directory too high; corrected to the repository protocol directory.
- Ruff fixed import ordering/type syntax, and a stray empty CSS import was removed after build diagnostics.
- The Windows Playwright process launcher rejected an unquoted relative Python path; it now uses an absolute quoted path.
- Delayed Run responses disabled cancellation controls; reproduced and fixed as described above.
- The HTTP timeout regression exposed reliance on `DOMException instanceof Error`; timeout detection now uses the request controller's aborted signal.

Desktop and mobile screenshots were inspected. Playwright saves fresh captures to `apps/web/test-results/workspace-desktop.png` and `workspace-mobile.png` (ignored generated artifacts).

All Phase 1 acceptance criteria passed. Limitations are documented in `docs/phase-1.md`; no physical robot operation is enabled.
