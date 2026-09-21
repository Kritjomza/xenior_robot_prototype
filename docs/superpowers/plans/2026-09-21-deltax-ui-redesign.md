# DeltaX UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a responsive, accessible DeltaX visual system using the approved CPE-derived palette while retaining all authentication, editor, simulation, and robot-control behavior.

**Architecture:** The redesign is CSS-token-led. `styles.css` becomes the single source of the visual language; small semantic wrappers/classes in the existing view components enable consistent layout without changing their state or API interfaces. Existing unit and end-to-end tests continue to prove functional behavior, with targeted assertions for navigation and responsive geometry.

**Tech Stack:** React 19, TypeScript, Vite, CSS custom properties, Vitest/Testing Library, Playwright, Monaco Editor, Blockly.

**Spec:** `docs/superpowers/specs/2026-09-21-deltax-ui-redesign-design.md`

## Global Constraints

- Preserve all existing React state, API calls, Supabase flows, WebSocket behavior, Monaco, Blockly, and simulation-control semantics.
- Use the CPE-derived colors exactly by role: `#172554` structural ink, `#4E64B2` engineering blue, `#7EAFE8` sky blue, `#F36A2C` intentional action, and `#FFCB19` warning/attention.
- Do not reproduce the CPE logo or imply endorsement; it is a palette reference only.
- Keep software Stop explicitly identified as simulation cancellation, not a physical emergency stop.
- Maintain WCAG AA contrast, visible keyboard focus, semantic labels, and reduced-motion-safe interaction.
- Support desktop at 1366px+, tablet from 768–1199px, and a 390px mobile viewport with no critical overlap, clipping, or accidental horizontal overflow.
- Do not install dependencies or replace Monaco/Blockly integrations.

## Review Focus

- A long project name or email must not push the command bar outside the viewport; test this at 390px in the authenticated workspace.
- A disconnected or locked simulator must keep Run unavailable while Stop/Reset retain their established live-run behavior; preserve the existing unit and e2e state tests.
- The collapsed navigation must retain accessible names and a usable route selection on tablet/mobile widths; add a unit assertion and a mobile e2e visibility assertion.
- Numeric telemetry and long server error text must wrap or constrain within their panels rather than widening `main`; add a mobile Playwright width check after injecting a long error response.
- The profile menu must appear above the command bar without clipping at narrow desktop widths; test its visible dialog/menu bounds at 1024px.

---

### Task 1: Define the CPE-derived visual foundation and shared control system

**Files:**
- Modify: `apps/web/src/styles.css:1-820`
- Test: `apps/web/e2e/workspace.spec.ts`

**Interfaces:**
- Consumes: Existing class names emitted by `App.tsx`, `AuthGate.tsx`, `ControlPanel.tsx`, `DigitalTwin.tsx`, `MonacoPanel.tsx`, and `BlocklyPanel.tsx`.
- Produces: CSS custom properties under `:root` and shared selectors for buttons, inputs, selects, ranges, focus, statuses, cards, notices, and responsive layout.

- [ ] **Step 1: Write the failing responsive geometry test**

Add this test after the existing mobile test in `apps/web/e2e/workspace.spec.ts`:

```ts
test('the responsive workspace never exceeds a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByText('Live connection')).toBeVisible()
  const geometry = await page.locator('body').evaluate((body) => ({
    scrollWidth: body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth)
})
```

- [ ] **Step 2: Run the new test to verify the incumbent layout is not guaranteed to meet the contract**

Run: `npm run test:e2e -- --grep "responsive workspace never exceeds"`

Expected: The test may fail on the current fixed-width workspace/command-bar layout; record the baseline result before changing CSS.

- [ ] **Step 3: Replace the stylesheet foundation with semantic tokens and shared control rules**

At the top of `apps/web/src/styles.css`, define tokens and baseline rules; migrate existing color literals to these tokens rather than adding a second palette:

```css
:root {
  --dx-ink: #172554;
  --dx-blue: #4e64b2;
  --dx-sky: #7eafe8;
  --dx-orange: #f36a2c;
  --dx-gold: #ffcb19;
  --dx-text: #424242;
  --dx-canvas: #f6f8fc;
  --dx-surface: #ffffff;
  --dx-line: #dbe2ef;
  --dx-muted: #667085;
  --dx-danger: #b42318;
  --dx-success: #087844;
  --dx-radius-sm: 8px;
  --dx-radius-md: 14px;
  --dx-shadow: 0 16px 42px rgb(23 37 84 / 10%);
}

* { box-sizing: border-box; }
button, input, select { font: inherit; }
button:focus-visible, input:focus-visible, select:focus-visible {
  outline: 3px solid rgb(126 175 232 / 65%);
  outline-offset: 2px;
}
```

Then update all current component selectors to use the same control height, radius, focus treatment, disabled opacity, semantic status colors, tabular numeric figures, and whitespace scale. Keep orange exclusively for `Run`/intentional action and gold exclusively for warning/attention.

- [ ] **Step 4: Add the responsive layout rules that enforce the viewport contract**

Add fluid width constraints and three breakpoints to `styles.css`:

```css
.dx-app, .dx-body, .dx-main, .dx-grid, .work-surface, .inspector { min-width: 0; }
.dx-top-controls, .action-strip, .surface-tabs { flex-wrap: wrap; }
@media (max-width: 1199px) { /* compact rail, stacked inspector */ }
@media (max-width: 767px) { /* horizontal navigation and stacked panels */ }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto; transition-duration: 0.01ms; } }
```

At 390px, ensure command-bar content wraps by priority, action buttons wrap without a clipped last button, and all telemetry grids use no more than two columns. Do not hide Stop, lock state, connection state, or profile access.

- [ ] **Step 5: Run focused lint, type, and viewport verification**

Run: `npm run lint && npm run typecheck && npm run test:e2e -- --grep "responsive workspace never exceeds|mobile layout keeps every panel"`

Expected: PASS with `body.scrollWidth <= document.documentElement.clientWidth` at 390px.

- [ ] **Step 6: Commit the visual foundation**

```bash
git add apps/web/src/styles.css apps/web/e2e/workspace.spec.ts
git commit -m "feat: establish DeltaX responsive visual system"
```

### Task 2: Restructure the workspace shell for clear hierarchy and accessible responsive navigation

**Files:**
- Modify: `apps/web/src/App.tsx:149-536`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/App.test.tsx`
- Test: `apps/web/e2e/workspace.spec.ts`

**Interfaces:**
- Consumes: `WorkspaceApp` props (`userId`, `email`, `onLogout`, `e2eAutoUnlock`) and existing action functions (`perform`, `toggleLock`, `changeSpeed`, `saveProject`, `saveProfile`).
- Produces: The same public `WorkspaceApp` component with semantic shell regions, data attributes/classes for status styling, and an accessible active navigation item.

- [ ] **Step 1: Write failing navigation and status tests**

Add to `apps/web/src/App.test.tsx`:

```tsx
it('keeps labelled navigation and explicit simulator safety state available', () => {
  render(<App />)
  expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Code Editor' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('button', { name: 'LOCKED' })).toBeInTheDocument()
  expect(screen.getByText(/Disconnected.*retrying/)).toBeInTheDocument()
})
```

Extend the mobile e2e test to assert the primary navigation and both `Validate` and `Run` are visible at 390px.

- [ ] **Step 2: Run the tests to verify the new semantic contract fails**

Run: `npm test -- --run src/App.test.tsx`

Expected: FAIL because the selected rail button does not yet expose `aria-current="page"`.

- [ ] **Step 3: Make minimal semantic markup changes without changing behavior**

In `App.tsx`:

```tsx
<button
  key={item}
  className={tab === item ? 'is-active' : ''}
  aria-current={tab === item ? 'page' : undefined}
  onClick={() => /* retain the existing tab-selection logic */}
>
```

Group the top bar’s simulator, connection, lock, speed, stop, and profile controls into named wrappers that CSS can wrap/reorder. Add `data-state` attributes only where they derive from existing `live`, `locked`, `running`, or `state?.status` values. Preserve labels, button names, test IDs, and all current event handlers exactly.

- [ ] **Step 4: Style the command bar, rail, page header, editor surface, inspector, and profile menu**

Use the shared tokens from Task 1 to give the shell a stable hierarchy: ink command bar, blue selected navigation, white layered work surfaces, orange Run, gold safety attention, and resilient profile-menu positioning. Use `overflow-wrap: anywhere` for run IDs/errors and `font-variant-numeric: tabular-nums` for state values. Keep the UI’s current information and controls; only change grouping, hierarchy, and presentation.

- [ ] **Step 5: Run the workspace test suite**

Run: `npm test -- --run src/App.test.tsx && npm run test:e2e -- --grep "mobile layout keeps every panel and control usable|responsive workspace never exceeds"`

Expected: PASS; Run remains disabled until live telemetry is present and mobile navigation/actions are visible.

- [ ] **Step 6: Commit the workspace shell**

```bash
git add apps/web/src/App.tsx apps/web/src/styles.css apps/web/src/App.test.tsx apps/web/e2e/workspace.spec.ts
git commit -m "feat: refine DeltaX workspace hierarchy"
```

### Task 3: Upgrade authentication, control, and digital-twin surfaces within the shared system

**Files:**
- Modify: `apps/web/src/auth/AuthGate.tsx:45-130`
- Modify: `apps/web/src/workspace/ControlPanel.tsx:30-64`
- Modify: `apps/web/src/workspace/DigitalTwin.tsx:15-51`
- Modify: `apps/web/src/styles.css`
- Create: `apps/web/src/auth/AuthGate.test.tsx`
- Test: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: `AuthGate` auth-provider methods, `ControlPanel` props (`state`, `disabled`, `onError`), and `DigitalTwin` prop (`state`).
- Produces: The same components and callbacks, with labelled content regions that support visual grouping; no changed network method, navigation destination, or local-storage key.

- [ ] **Step 1: Write a failing authentication visual-structure test**

Create `apps/web/src/auth/AuthGate.test.tsx` using the existing auth-provider test mocking pattern. Render unauthenticated `AuthGate` and assert:

```tsx
expect(screen.getByRole('main')).toHaveClass('auth-page')
expect(screen.getByRole('heading', { name: 'Sign in' })).toBeVisible()
expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
expect(screen.getByRole('navigation')).toHaveClass('auth-links')
```

Also add a `ControlPanel` test that renders `disabled={true}` and asserts every jog button is disabled.

- [ ] **Step 2: Run the targeted tests to verify their missing structure**

Run: `npm test -- --run src/auth/AuthGate.test.tsx src/App.test.tsx`

Expected: FAIL until the auth navigation receives an accessible label and the new component-test setup is added.

- [ ] **Step 3: Add only semantic grouping required for the new surfaces**

In `AuthGate.tsx`, add `aria-label="Authentication options"` to the existing auth navigation and wrapper classes for the auth introduction/form footer; retain all submit handlers and button copy. In `ControlPanel.tsx`, label the jog group with `aria-label="Jog controls"` and add per-axis visual grouping classes without changing the `jog` payload. In `DigitalTwin.tsx`, add classes for the viewport toolbar, resizer, and telemetry summary without changing `width`, `change`, localStorage key, or external RoboDK action.

- [ ] **Step 4: Apply responsive, state-aware surface styles**

Build the auth page from the shared foundation with a quiet CSS-only technical background, a readable single-column card on phones, and accessible field/button states. Make jog controls a clearly grouped grid with unit labels; at narrow widths, stack the twin viewport above the state summary and retain an accessible resize range. Style fault/error text with the semantic danger token, not CPE orange or gold.

- [ ] **Step 5: Run all component and functional tests**

Run: `npm test -- --run src/auth/AuthGate.test.tsx src/App.test.tsx && npm run typecheck`

Expected: PASS; sign-in modes and every existing jog/twin behavior retain their original callbacks and text.

- [ ] **Step 6: Commit the secondary surfaces**

```bash
git add apps/web/src/auth/AuthGate.tsx apps/web/src/auth/AuthGate.test.tsx apps/web/src/workspace/ControlPanel.tsx apps/web/src/workspace/DigitalTwin.tsx apps/web/src/styles.css apps/web/src/App.test.tsx
git commit -m "feat: unify DeltaX auth and simulation surfaces"
```

### Task 4: Verify the finished experience and record the durable design system

**Files:**
- Modify: `apps/web/e2e/workspace.spec.ts`
- Create: `apps/web/DESIGN.md`
- Create: `apps/web/.impeccable/design.json`
- Create: `apps/web/.impeccable/review/desktop.png`
- Create: `apps/web/.impeccable/review/mobile.png`

**Interfaces:**
- Consumes: The completed UI, existing Playwright configuration, the approved spec, and CPE-derived tokens from Task 1.
- Produces: Screenshot evidence, the checked responsive test suite, and documented reusable visual decisions.

- [ ] **Step 1: Extend the e2e suite with the long-text and profile-menu bounds checks**

Add a Playwright case at `1024x768` that opens the profile button, measures the menu and viewport, and asserts:

```ts
expect(menuBox!.x).toBeGreaterThanOrEqual(0)
expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(viewport.width)
expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(viewport.height)
```

Add a mobile test that causes a long request error, then checks `main` and `body` do not exceed viewport width.

- [ ] **Step 2: Run the new e2e cases to verify the review contract**

Run: `npm run test:e2e -- --grep "profile menu|long request error"`

Expected: PASS after the responsive CSS is complete.

- [ ] **Step 3: Capture one desktop and one mobile rendering round**

Start the existing frontend/backend test environment, capture full-page screenshots at 1440px and 390px into `apps/web/.impeccable/review/desktop.png` and `apps/web/.impeccable/review/mobile.png`, and inspect each image for overlap, clipped text, broken wrapping, and unreadable states. Batch any findings into one correction pass.

- [ ] **Step 4: Run the mandated mechanical detector once**

Run from `apps/web`:

```powershell
& 'C:\Users\Admin\.agents\skills\impeccable\scripts\impeccable.cmd' detect --json src/App.tsx src/styles.css src/auth/AuthGate.tsx src/workspace/ControlPanel.tsx src/workspace/DigitalTwin.tsx
```

Expected: Review the JSON findings, correct mechanical UI issues within the one bounded correction pass, and retain any non-actionable finding for the finish review.

- [ ] **Step 5: Confirm with a final desktop/mobile capture and full validation**

Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`

Expected: PASS. Recapture the exact 1440px and 390px views after the correction batch and confirm both files display the intended routes without blank or stale content.

- [ ] **Step 6: Document and commit the finished system**

Create `apps/web/DESIGN.md` and `apps/web/.impeccable/design.json` containing the approved precision-control-room direction, palette token roles, typography scale, spacing/radius rules, interaction state rules, and desktop/tablet/mobile layout contract. Then commit only the files created/changed by this implementation:

```bash
git add apps/web/DESIGN.md apps/web/.impeccable/design.json apps/web/.impeccable/review apps/web/e2e/workspace.spec.ts apps/web/src
git commit -m "docs: record DeltaX design system"
```

## Plan self-review

- **Spec coverage:** Tasks 1–3 cover the palette, type/spacing, shared shell, editor/inspector hierarchy, authentication, control, digital twin, state semantics, and responsive contract. Task 4 covers desktop/mobile rendered inspection, mechanical checks, documentation, and final verification.
- **Placeholder scan:** No task contains placeholder wording or unspecified test work; each test and code action includes an exact target and command.
- **Type consistency:** All component props and handler contracts remain unchanged; the plan adds only classes, ARIA labels, and attributes derived from existing state.
- **Review focus coverage:** Long text and profile menu checks belong to Task 4; simulator safety/state behavior is maintained by Task 2’s existing-suite run; mobile navigation belongs to Task 2; all viewport overflow checks begin in Task 1 and are repeated in Task 4.
