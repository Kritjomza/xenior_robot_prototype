# DeltaX UI/UX Redesign

## Intent

Replace the current utilitarian workspace styling with a coherent, premium
"precision control room" interface for engineering students and instructors.
The system must make safe simulation work feel deliberate and understandable
without changing any application, API, authentication, editor, or robot-control
behavior.

## Product constraints

- DeltaX remains simulation-first. It must never imply that an action controls
  physical hardware.
- Existing React components, navigation state, backend calls, Supabase flows,
  Monaco, Blockly, and WebSocket state remain the source of behavior.
- Safety state, connection state, run state, errors, and disabled actions must
  stay explicit and accessible.
- The supplied CPE logo is a palette reference only; the redesign must not
  reproduce or imply endorsement by the logo itself.

## Visual direction: Precision Control Room

The product should feel like a calm, modern engineering instrument: a dark
ink-blue structural frame surrounds bright, quietly layered work surfaces.
Typography creates the hierarchy, while color is reserved for status and
meaningful action. The interface is precise rather than ornamental: fine rules,
generous whitespace, rounded surfaces with restrained elevation, and dense data
that remains easy to scan.

### CPE-derived palette

| Role | Token | Use |
| --- | --- | --- |
| Structural ink | `#172554` | App shell, strong headers, dark data panels |
| Engineering blue | `#4E64B2` | Navigation, focus, links, selected controls |
| Sky blue | `#7EAFE8` | Informational states and subtle secondary accents |
| CPE orange | `#F36A2C` | Primary actions and active program/run affordances |
| CPE gold | `#FFCB19` | Warnings, simulation-attention cues, safety acknowledgment |
| Graphite | `#424242` | Primary text |
| Canvas / surface | warm white and blue-gray neutrals | Backgrounds, cards, separators |

Orange and gold are never interchangeable: orange means an intentional action;
gold means attention or a caution state. Destructive or fault states retain a
high-contrast semantic red distinct from the brand palette. Success uses a
deep, accessible green.

### Type and spacing

- Use a modern system sans stack for interface text and a monospace stack only
  for code, numeric telemetry, and identifiers.
- Establish a five-level type scale: overline, label, body, section heading,
  and page title. Avoid tiny critical text; labels and status text remain
  readable at 12px or above.
- Base spacing on a 4px rhythm, with 8, 12, 16, 24, 32, and 48px as the primary
  steps. Cards use consistent internal padding and a single radius family.

## Information architecture and page composition

### Shared shell

- A compact top command bar contains the product/project identity, simulator
  selector, connection state, safety lock, speed, simulation stop, and profile.
  It wraps into two logical rows rather than overlapping when space narrows.
- A left rail uses clear icon-plus-label navigation on desktop. At tablet it
  collapses intentionally; on phones it becomes a horizontal, scrollable
  bottom/top navigation pattern so labels remain discoverable.
- Every route uses the same page header: small context label, page title,
  contextual status, and only actions relevant to that page.

### Programming workspace

- The editor is the primary work area. Its tabs, editor metadata, code canvas,
  keyboard hints, and command strip read as one bounded work surface.
- Validation, Run, Reset, Save, and Save Version are ordered by frequency and
  risk. The main Run action is orange; Save is secondary; versioning is a quiet
  tertiary action. Disabled controls explain their unavailable state through
  nearby safety/connection copy rather than color alone.
- Live state becomes a concise inspector with a durable status header,
  cardinal pose display, run progress, and a clearly separated safety note.
  Numeric content uses tabular figures and cannot escape its cells.

### Control and digital-twin views

- Jog controls become a grouped, directional control surface with explicit
  units and state-aware availability. Coordinate readings align in a telemetry
  table rather than a loose definition list.
- The digital twin preserves its view and resizer behavior. Its visual frame
  becomes a dedicated simulation viewport with a compact state summary that
  stacks below it at narrow widths instead of competing horizontally.

### Authentication

- The sign-in page shares the DeltaX identity, color system, buttons, inputs,
  focus treatments, and safety-minded clarity of the workspace.
- It uses a balanced split or centered composition with a quiet technical
  backdrop built from CSS only—no unlicensed imagery or fabricated claims.

## Interaction, state, and accessibility

- Buttons, fields, ranges, selects, tabs, and menu items use one consistent
  height, corner language, hover, pressed, disabled, and visible keyboard-focus
  treatment.
- Connection, lock, run, fault, success, and stale-data states use text and
  an icon/shape in addition to color. Motion stays subtle, serves state change,
  and respects reduced-motion settings.
- Menus and overlays are positioned against their trigger, constrained to the
  viewport, and use appropriate stacking so they neither clip nor overlap
  unrelated controls.
- Contrast meets WCAG AA. Layouts preserve semantic reading order and support
  keyboard interaction.

## Responsive contract

| Range | Behavior |
| --- | --- |
| Desktop (>= 1200px) | Persistent rail; editor and inspector use a stable two-column grid. |
| Tablet (768–1199px) | Collapsed rail; inspector moves below editor; top controls wrap by priority. |
| Mobile (< 768px) | Navigation becomes horizontal; page actions wrap; editor/inspector/control surfaces stack; wide data uses scroll-safe containers or two-column telemetry. |

No critical control is hidden solely because of size. Long project names,
emails, statuses, error messages, and run IDs use truncation, wrapping, or
overflow handling appropriate to their context.

## Implementation boundaries

- Consolidate the reusable visual system in `apps/web/src/styles.css` with
  CSS custom properties and shared component rules.
- Make minimal markup changes in `App.tsx`, `ControlPanel.tsx`, and
  `DigitalTwin.tsx` only where necessary to support clearer grouping,
  responsive order, and accessible labels. Do not change data flow or API
  contracts.
- Keep Monaco and Blockly integrations intact; style their hosts rather than
  replacing them.
- Extend existing tests only for any structural behavior needed to retain
  accessible navigation and controls. Validate via typecheck, unit tests,
  build, and desktop/mobile browser captures.

## Acceptance criteria

1. All existing user flows remain functional, including sign-in, project save,
   validation, run/stop/reset, lock/unlock, speed, Blockly, control, and twin.
2. The CPE-derived palette is applied consistently and semantically.
3. Desktop, tablet, and mobile layouts have no visible overlap, clipped text,
   unusable controls, or accidental horizontal overflow.
4. Interaction states, focus visibility, status semantics, and contrast remain
   accessible.
5. A rendered desktop and mobile review is completed, issues found in the
   bounded review pass are fixed, and the existing test suite remains green.
