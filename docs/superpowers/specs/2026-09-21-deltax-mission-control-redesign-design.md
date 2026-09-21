# DeltaX Mission Control UI/UX Redesign

## Intent

Redesign DeltaX as a polished operating and programming interface for issuing ordered commands to a Delta robot simulator. Users must be able to authenticate, author command sequences, validate them, deliberately unlock simulation control, run or stop a sequence, and understand live state without ambiguity.

This is a visual and interaction redesign. Existing APIs, authentication, persistence, validation, WebSocket telemetry, Monaco, Blockly, simulator adapters, and safety semantics remain unchanged.

## Visual direction

The interface adopts a **Mission Control Workspace**: calm, precise, operational, and optimized for long engineering sessions. It uses strong spatial hierarchy rather than decorative effects.

The first desktop viewport presents three stable operational zones:

1. A compact global command bar for robot connection, safety lock, speed, Stop, and profile.
2. A persistent navigation rail for programming, block editing, digital twin, control, projects, and settings.
3. A focused work canvas where the ordered command sequence is primary and live telemetry is secondary but continuously visible.

The signature interaction is the ordered-command execution flow: Validate → unlock simulation → Run → follow the active command and progress → Stop or Reset. The UI must make each transition visible and reversible.

## Original color system

Retain the established CPE-derived palette and correct it for accessible use:

- Navy `#172554`: structural chrome, telemetry surfaces, primary text on bright accents.
- Engineering blue `#4E64B2`: navigation, selection, focus, and links.
- Sky blue `#7EAFE8`: information, secondary emphasis, and focus rings.
- Orange `#F36A2C`: primary execution actions. Use navy text on orange for WCAG AA contrast.
- Gold `#FFCB19`: warnings, attention, and safety acknowledgment.
- Graphite `#424242`: body text.
- White and cool blue-gray: work surfaces and canvas.
- Semantic green and red remain distinct for success and failure.

Orange and gold are never used as interchangeable decoration. Color always communicates role or state.

## Login and account flows

The login screen uses a responsive two-panel composition on wide screens:

- The left panel establishes DeltaX as a simulation-first command workspace and shows a concise ordered workflow: Program, Validate, Simulate, Observe.
- The right panel contains the active sign-in, registration, or reset form.
- On mobile, the two panels collapse into one focused authentication card with the workflow summary reduced to a short introduction.

Inputs have persistent labels, clear focus, autofill-safe contrast, inline error/status placement, and a password visibility control integrated into the field. Google authentication remains secondary. No unverified product claims, physical-robot imagery, or CPE logo reproduction is introduced.

## Application shell and navigation

### Global command bar

The command bar contains only cross-route operational controls:

- DeltaX identity and current project
- Simulator selector and connection state
- Safety lock state
- Global simulation speed
- Software Stop
- Profile menu

On smaller screens, controls wrap into organized rows. Robot selection, speed, connection, lock, Stop, and profile access remain available; no critical control is hidden because of viewport size.

### Navigation

- Desktop: a 224px labelled rail with a visually strong selected route.
- Tablet: a compact icon rail whose buttons retain unconditional accessible names and tooltips.
- Mobile: a horizontally scrollable route bar placed before page content, never sticky over the editor.
- Disabled or unavailable destinations are visibly distinct from active destinations and do not imply broken functionality.

Navigation uses one consistent icon system or restrained CSS geometry; mixed Unicode symbols are removed.

## Programming workspace

The ordered command sequence is the dominant artifact.

- A clear page title identifies the current project and editing mode.
- Code Editor and Blockly are presented as alternate views of the same `RobotProgramV1` program.
- The editor surface includes mode tabs, validation metadata, the editing canvas, keyboard hints, and one action toolbar.
- Actions are grouped by intent: Validate and Run first; Reset separate; Save and Save Version grouped as persistence actions.
- Run is visually primary only when available. Disabled actions are understandable from visible connection, lock, validation, or run state.

The live-state inspector contains:

- connection/run status
- Cartesian pose and joints
- gripper state
- active command and progress
- safety state
- visible request feedback

Long identifiers, errors, values, and localized text wrap or truncate safely without expanding the layout.

## Control and digital twin

- Jog controls are grouped by axis, clearly labelled with direction and unit, and remain disabled when safety conditions are unmet.
- Control errors render on the Control route rather than only in the programming inspector.
- The digital-twin viewport and telemetry summary use a resizable split on desktop and stack on narrow screens.
- Reset View, Fit View, and external RoboDK actions remain functionally unchanged and are grouped as viewport tools.

## Responsive behavior

- `>=1200px`: global command bar, labelled rail, editor plus inspector grid.
- `768–1199px`: compact accessible rail, wrapped command bar, inspector below editor when necessary.
- `<768px`: multi-row command bar, horizontal navigation, stacked page surfaces, two-column telemetry, wrapped action toolbars.
- Minimum supported viewport is 390px without horizontal page overflow.
- Profile menus and other overlays remain within the viewport and anchor near their trigger.

## Interaction and accessibility

- Minimum interactive target: 44px where space permits, never below 38px for dense desktop controls.
- Visible keyboard focus on every interactive element.
- WCAG AA text contrast, including orange actions and muted text.
- State is never communicated by color alone.
- Loading, disconnected, locked, running, stopping, completed, faulted, stale, success, and error states are all legible.
- Motion is limited to state transitions and respects `prefers-reduced-motion`.
- Semantic landmarks, headings, labels, `aria-current`, `aria-expanded`, and status/alert roles remain correct.

## Implementation boundaries

- Refactor the large workspace markup only enough to create clear semantic groups and reusable UI primitives.
- Centralize tokens and component styling in `apps/web/src/styles.css` or focused imported stylesheets if splitting improves maintainability.
- Preserve existing component props, API payloads, state transitions, storage keys, and test IDs.
- Do not introduce a new UI framework or dependency.
- Do not commit any specification or implementation changes.

## Verification

- Unit tests cover navigation semantics, unavailable actions, shared feedback, and authentication structure.
- End-to-end tests cover the existing command execution workflow.
- Responsive checks cover 1440px desktop, 1024px tablet, and 390px mobile.
- Browser captures verify login and authenticated workspace layouts with no overlap, clipping, or horizontal overflow.
- Run lint, typecheck, unit tests, production build, end-to-end tests, and the Impeccable detector.
