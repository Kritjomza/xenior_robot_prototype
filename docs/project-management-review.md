# Project management and UI review

Reviewed 1 November 2026. The existing React/Vite, Monaco, Blockly and Supabase stack is retained; no runtime dependencies were added.

## Findings and implementation

The old Projects screen described a hardcoded sample and offered history rather than a project library. Local snapshots shared one global array. Cloud deletion existed in the service but had no UI, versions had no names, and snapshot creation used two separate writes for its counter. Cloud saves depended on the simulation API accepting a complete program.

The library now supports create, search, open, rename and confirmed project deletion. Each project has a working copy and separate named snapshots. Snapshots support rename, restore and confirmed deletion; version numbers are never recycled. Source is preserved when loading a snapshot and deleting an active project. Unsaved replacements require acknowledgement, dialog failures retain input, and dialogs restore keyboard focus when cancelled.

Local projects and versions commit together in `deltax:projects`. Existing local drafts and history remain available and their original keys are kept as recovery copies. Cloud snapshots use an ownership-checked, security-invoker PostgreSQL function with a project row lock; the source passed by the caller is preserved even if another tab updates the working copy. Draft source can be incomplete; the execution API still validates every run. The migration must precede deployment of this frontend.

## Direction

Design Taste dealt **Framed sheet**, seed **2079209081**, with no redraws. This direction suits a robot programming tool used for long sessions: quiet chrome, white work surfaces, flat controls and clear feedback. IBM Plex Sans is loaded for the UI; the editor retains a code face. Teal marks actions, while safety colours retain their operational meanings. UI/UX Pro Max's explicit confirmation/recovery and React form guidance was used; its unrelated marketing-storytelling suggestion was discarded.

Inventory: DeltaX Studio; Python source; Blockly workspace; saved projects; named source snapshots; revision counters; browser or account storage; mock/RoboDK modes; safety lock and software Stop; live pose in mm/degrees; gripper state; the orbitable delta robot.

The library answers “Which saved robot program or milestone should I return to?” The workspace answers “What program am I editing and what is the simulator doing?” The robot view and the source-to-version relationship supply the identity; no invented metrics, external imagery or sample customer data were added. Screenshot projects are test fixtures only.

## Verification

- 43 Vitest unit/component tests passed, including legacy migration, corrupt storage, quota failure, separate projects, naming, version numbering, source snapshot integrity and the library lifecycle.
- All 10 Chromium acceptance tests passed against the production build in the repository's e2e mode. They cover the real simulator, execution/Stop/reset, Blockly, responsive layouts, reload, version restore, project deletion, dialog cancellation and focus restoration.
- TypeScript, ESLint and the normal production build passed. Existing Monaco/Blockly/Three.js chunk-size warnings remain.
- Both migrations and the SQL regression assertions passed in local PGlite PostgreSQL with a minimal Supabase auth/role fixture. The pgTAP plan/output wrapper was omitted by the local harness. Assertions cover source preservation, counter rollback, monotonic numbers, cross-user reads/writes and cascading deletion. This is not verification against the configured hosted database.
- Final workspace inspector: **0 failures, 2 warnings** at 1440, 768 and 390 px. Warnings are the editor's code-font fallback detection and compact 11–12 px secondary labels. Code uses its conventional monospace face; primary controls and library content are 13–14 px.
- Final normal-production sign-in inspector: **0 failures, 0 warnings** at all three widths. The original sign-in baseline had 5 failures and 6 warnings; that baseline was a development build, so the development-server warning is not an apples-to-apples styling comparison.
- Source style lint: 0 failures. Remaining warnings refer to literal safety “unlock” terminology, floating dialog/menu shadows and an existing unused SVG illustration filter.
- All final workspace, project-library, dialog and sign-in screenshots were opened. Project-library screenshots also passed explicit no-horizontal-overflow checks at 1440, 768 and 390 px. Reduced motion and native dialog keyboard behavior were exercised in Chromium.

Screenshots and raw reports are local review artifacts under `.taste-skill/` (ignored by Git).

## Visual critique

ROUND 2

Seen in one second: a robot programming workbench with distinct run/save actions; a library with named milestones.

Idea (one sentence): DeltaX's working program and source snapshots become a simple project list beside its saved history, inside the same quiet frame as the live robot.

Live thing: the existing robot simulation and the functional named-version library.

Layout words by section: shell=quiet frame / workspace=editor and robot / projects=list and detail / versions=aligned rows / dialogs=focused form.

Scores: design 7.5 · usability 8 · creativity 6.5 · content 8 → overall 7.5. This is an internal visual assessment, not an independent jury score.

Caps applied: app-screen rules; marketing image and motion floors do not apply.

Top three problems and fixes:

1. The speed percentage disappeared into the pale header. Fixed the foreground and unified the header's typography (`after/desktop-fold.jpg`).
2. At 768 px the hidden sidebar labels left an unnecessarily wide empty rail. Reduced it to a compact icon rail (`review/projects-768.png`).
3. Closing a native dialog removed its trigger focus. Captured and restored the triggering element; verified cancellation and focus in the browser acceptance test (`review/version-dialog.png`). The final sign-in review also revealed a full-height introduction ahead of the form on phones; the phone now shows the form directly (`auth-after/mobile-fold.jpg`).

Remaining limitations: phone programming remains a long vertical workspace; dense telemetry uses smaller secondary labels. Neither changes the project data model or robot safety behavior. No import/export, sharing, folders or automatic browser-to-account migration were added.

## Cloud rollout

The configured Supabase project is not available through the connected account, so the hosted migration has not been applied and hosted saves have not been exercised. Apply `supabase/migrations/20261101101026_project_management.sql` after the existing phase-2 migration, then run `supabase/tests/project_management.sql` against the intended test database before rollout. Existing grants and row-level ownership policies remain in force.
