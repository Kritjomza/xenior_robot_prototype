# DeltaX Mission Control Design System

DeltaX is an operator-first engineering workspace. The interface should feel calm, exact, and safety-conscious: dense enough for lab work, but organized around one obvious sequence—author, validate, unlock, run, observe.

## Visual direction

- Navy is the structural color for the command bar, telemetry, and authentication context.
- Orange marks decisive actions and the DeltaX identity; gold is reserved for cautions and safety context.
- Engineering blue and sky blue support navigation, focus, and secondary state.
- White working surfaces sit on a cool blue-gray canvas. Use either a soft shadow or a divider, not both by default.
- Bahnschrift/Aptos Display provides a compact technical display voice; Aptos/Segoe UI handles interface text; Consolas is reserved for code and machine state.

## Tokens

- Navy `#172554`; dark blue `#21366F`; blue `#4E64B2`; sky `#7EAFE8`
- Orange `#F36A2C`; gold `#FFCB19`
- Graphite `#424242`; canvas `#F3F6FB`; line `#D9E1EE`
- Success `#087844`; danger `#B42318`
- Controls are at least 40px high, with 8px control corners and 14px surface corners.

## Composition

- Desktop uses a persistent top command bar, left navigation rail with dedicated workspace tools and viewport controls, central-left editor surface (Code Editor / Blockly), and right-side Digital Twin simulator & live-state inspector.
- The Digital Twin viewport is togglable from the left navigation rail and the header action chip, allowing instant expansion of the code editor to full-width when focused on authoring.
- Tablet collapses the rail labels and stacks the twin/inspector beneath the editor.
- Mobile keeps all global safety controls visible in a compact top bar and turns the rail into a scrollable route strip.
- Authentication is a two-panel entry: product workflow context at left, focused form at right; mobile stacks the context above the form.

## Interaction rules

- Keep Robot, connection state, lock, global speed, Stop, and profile available at every viewport.
- Orange primary controls use navy text for accessible contrast.
- Feedback is route-independent and wraps long errors without expanding the document.
- Profile is an anchored disclosure with explicit expanded state and a viewport-contained dialog.
- Motion is limited to short state transitions and disabled under reduced-motion preferences.

## Safety language

Always describe the product as simulation-only. “Stop” is software cancellation, never a physical emergency stop. Hardware options remain visibly unavailable until supported.
