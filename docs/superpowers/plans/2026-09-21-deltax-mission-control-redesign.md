# DeltaX Mission Control Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current DeltaX presentation with a responsive Mission Control interface for authoring and executing ordered Delta robot commands while preserving every existing workflow.

**Architecture:** Keep the current React state and service boundaries intact. Split only presentational concerns: semantic shell markup stays in `App.tsx`, focused surfaces stay in their existing components, and a rewritten token-driven stylesheet owns composition and responsive behavior. Tests pin accessibility semantics, state visibility, and viewport geometry before visual implementation.

**Tech Stack:** React 19, TypeScript, Vite, CSS custom properties, Monaco Editor, Blockly, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-21-deltax-mission-control-redesign-design.md`

## Global Constraints

- Preserve existing APIs, authentication, persistence, validation, WebSocket telemetry, Monaco, Blockly, simulator adapters, test IDs, local-storage keys, and safety semantics.
- Retain navy `#172554`, engineering blue `#4E64B2`, sky blue `#7EAFE8`, orange `#F36A2C`, gold `#FFCB19`, graphite `#424242`, white, and cool blue-gray.
- Use navy text on orange actions so small labels meet WCAG AA.
- Do not hide robot selection, connection, safety lock, speed, Stop, or profile access at any supported viewport.
- Support 1440px desktop, 1024px tablet, and 390px mobile without page-level horizontal overflow.
- Do not introduce a UI framework, icon dependency, fabricated claims, physical-robot imagery, or CPE logo reproduction.
- Do not create Git commits. Leave the specification, plan, implementation, tests, and design documentation uncommitted.

## Review Focus

- A 100-character display name and long email must remain inside the profile menu at 1024px and 390px.
- Robot selector, speed, lock, connection, Stop, and profile must remain visible and usable at 390px.
- Tablet navigation buttons must retain accessible names after their visible labels collapse.
- Long server errors and run identifiers must wrap without increasing document width.
- Control-route jog failures must render a visible alert on the same route.

---

### Task 1: Build the semantic Mission Control shell

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/e2e/workspace.spec.ts`

**Interfaces:**
- Consumes: Existing `WorkspaceApp` props, `perform`, `toggleLock`, `changeSpeed`, `saveProject`, `saveProfile`, tab state, connection state, and robot state.
- Produces: The unchanged `WorkspaceApp` public interface with semantic command-bar groups, accessible route navigation, anchored profile disclosure, and shared route feedback.

- [ ] **Step 1: Add failing shell semantics tests**

Add focused assertions to `App.test.tsx`:

```tsx
it("exposes named navigation and profile disclosure state", async () => {
  render(<App />);
  const navigation = screen.getByRole("navigation", {
    name: "Primary navigation",
  });
  expect(within(navigation).getByRole("button", { name: "Code Editor" }))
    .toHaveAttribute("aria-current", "page");
  const profile = screen.getByRole("button", { name: "Profile menu" });
  expect(profile).toHaveAttribute("aria-expanded", "false");
  await userEvent.click(profile);
  expect(profile).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("dialog", { name: "Profile" })).toBeVisible();
});
```

Add a Control-route failure test that clicks Control, enables the jog surface with test state, rejects `/api/v1/jog`, clicks `X+`, and expects `screen.getByRole("alert")` to contain `Jog failed`.

- [ ] **Step 2: Run the shell tests and confirm RED**

Run: `npm test -- --run src/App.test.tsx`

Expected: FAIL because the profile trigger has no `aria-expanded`, the profile menu has no dialog role/name, and shared Control-route feedback is incomplete.

- [ ] **Step 3: Refactor markup without changing data flow**

In `App.tsx`:

- Keep the existing header but group identity, simulator status, safety controls, and account controls into named wrappers.
- Add `aria-expanded={profileOpen}` and `aria-controls="profile-menu"` to the profile trigger.
- Render the profile menu as `<div id="profile-menu" role="dialog" aria-label="Profile">` inside an anchored wrapper.
- Give every route button `aria-label={item}` and preserve `aria-current`.
- Replace mixed Unicode route glyphs with a consistent CSS-driven `<span className="nav-icon nav-icon--..." />` system; keep icons `aria-hidden`.
- Render `notice` and `error` in a shared feedback region after the route content so every route exposes request results.
- Remove the duplicate editor-inspector error rendering after shared feedback exists.

- [ ] **Step 4: Run shell tests and confirm GREEN**

Run: `npm test -- --run src/App.test.tsx`

Expected: all `App.test.tsx` tests pass with no duplicate alerts.

- [ ] **Step 5: Add responsive shell geometry coverage**

Add Playwright cases that measure `document.documentElement.scrollWidth` at 1024px and 390px, verify all six global controls are visible at 390px, and verify the open profile dialog remains within the viewport:

```ts
const viewport = page.viewportSize()!;
const menu = await page.getByRole('dialog', { name: 'Profile' }).boundingBox();
expect(menu!.x).toBeGreaterThanOrEqual(0);
expect(menu!.x + menu!.width).toBeLessThanOrEqual(viewport.width);
expect(menu!.y + menu!.height).toBeLessThanOrEqual(viewport.height);
```

- [ ] **Step 6: Record an uncommitted checkpoint**

Run: `git diff --check -- apps/web/src/App.tsx apps/web/src/App.test.tsx apps/web/e2e/workspace.spec.ts`

Expected: no whitespace errors. Do not stage or commit files.

### Task 2: Redesign authentication as a two-panel command-workspace entry

**Files:**
- Modify: `apps/web/src/auth/AuthGate.tsx`
- Create: `apps/web/src/auth/AuthGate.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `useAuth()` status, user, error, `signInWithPassword`, `signUp`, `resetPassword`, `signInWithGoogle`, and `signOut`.
- Produces: The unchanged `AuthGate` behavior with `.auth-context` and `.auth-panel` regions, accessible mode navigation, and form feedback.

- [ ] **Step 1: Add failing authentication structure tests**

Create `AuthGate.test.tsx` using the existing `AuthProvider.test.tsx` mocking pattern and assert:

```tsx
expect(screen.getByRole("heading", { name: "Sign in" })).toBeVisible();
expect(screen.getByText("Program")).toBeVisible();
expect(screen.getByText("Validate")).toBeVisible();
expect(screen.getByText("Simulate")).toBeVisible();
expect(screen.getByText("Observe")).toBeVisible();
expect(screen.getByRole("navigation", {
  name: "Authentication options",
})).toBeVisible();
```

Add a mode-switch assertion: clicking Create account changes the heading and changes password autocomplete to `new-password` without changing the email value.

- [ ] **Step 2: Run the authentication test and confirm RED**

Run: `npm test -- --run src/auth/AuthGate.test.tsx`

Expected: FAIL because the workflow context panel does not exist.

- [ ] **Step 3: Implement the two-panel authentication layout**

In `AuthGate.tsx`, retain every handler and form field. Add:

```tsx
<section className="auth-context" aria-label="DeltaX workflow">
  <div className="auth-context__brand">...</div>
  <h2>Program with confidence. Simulate with control.</h2>
  <ol className="auth-steps">
    <li><strong>Program</strong><span>Build an ordered command sequence.</span></li>
    <li><strong>Validate</strong><span>Check every command before execution.</span></li>
    <li><strong>Simulate</strong><span>Run only after deliberate safety unlock.</span></li>
    <li><strong>Observe</strong><span>Follow pose, progress, and robot state.</span></li>
  </ol>
</section>
```

Wrap the existing form card in `.auth-panel`, integrate the show/hide action into `.password-field`, and keep all factual copy simulation-only.

- [ ] **Step 4: Run authentication tests and confirm GREEN**

Run: `npm test -- --run src/auth/AuthGate.test.tsx src/auth/AuthProvider.test.tsx`

Expected: both test files pass.

- [ ] **Step 5: Record an uncommitted checkpoint**

Run: `git diff --check -- apps/web/src/auth/AuthGate.tsx apps/web/src/auth/AuthGate.test.tsx apps/web/src/styles.css`

Expected: no whitespace errors. Do not stage or commit files.

### Task 3: Recompose programming, control, and digital-twin surfaces

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/workspace/ControlPanel.tsx`
- Modify: `apps/web/src/workspace/DigitalTwin.tsx`
- Modify: `apps/web/src/editors/MonacoPanel.tsx`
- Modify: `apps/web/src/editors/BlocklyPanel.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: Current component props and test IDs; robot state fields `x_mm`, `y_mm`, `z_mm`, `rz_deg`, `joints_deg`, `gripper`, `speed_mm_s`, `status`, and command progress.
- Produces: Unchanged component APIs with new semantic groups for editor tools, ordered actions, axis controls, viewport tools, and telemetry.

- [ ] **Step 1: Add failing action and control semantics tests**

In `App.test.tsx`, assert that the programming route exposes groups named `Program actions` and `Project actions`. Click Control and assert a `Jog controls` group contains eight named buttons (`X−`, `X+`, `Y−`, `Y+`, `Z−`, `Z+`, `RZ−`, `RZ+`). Click Digital Twin and assert a `Digital twin tools` group contains Reset View, Fit View, and Open External RoboDK View.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -- --run src/App.test.tsx`

Expected: FAIL because action groups and digital-twin toolbar labels do not exist.

- [ ] **Step 3: Add semantic groups while preserving handlers**

- Split the programming toolbar into `.program-actions` and `.project-actions` wrappers with `role="group"` labels.
- In `ControlPanel.tsx`, render four `.jog-axis` groups with a visible axis label, unit, minus button, current value, and plus button. Continue calling the existing `jog(axis, direction)` function.
- In `DigitalTwin.tsx`, wrap viewport actions in `role="group" aria-label="Digital twin tools"`; retain width persistence and RoboDK URI behavior.
- In Monaco and Blockly hosts, add descriptive header wrappers only; do not alter editor initialization.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `npm test -- --run src/App.test.tsx`

Expected: all workspace component tests pass.

- [ ] **Step 5: Record an uncommitted checkpoint**

Run: `git diff --check -- apps/web/src/App.tsx apps/web/src/workspace apps/web/src/editors apps/web/src/styles.css`

Expected: no whitespace errors. Do not stage or commit files.

### Task 4: Replace the stylesheet with the Mission Control design system

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/e2e/workspace.spec.ts`

**Interfaces:**
- Consumes: Semantic classes and ARIA groups produced by Tasks 1–3.
- Produces: CSS tokens, component states, desktop/tablet/mobile composition, accessible contrast, and reduced-motion behavior.

- [ ] **Step 1: Add failing responsive and long-content tests**

Add Playwright tests that:

- set a 100-character display name and assert the profile dialog width remains within the viewport;
- return a 250-character error and assert document width does not exceed 390px;
- check global controls at 390px;
- check navigation labels are visually present at 1440px and accessible by name at 1024px;
- assert the mobile navigation bar precedes the page heading and does not overlap its bounding box.

- [ ] **Step 2: Run the new Playwright tests and confirm RED**

Run: `npm run test:e2e -- --grep "profile bounds|long error|global controls|tablet navigation|mobile navigation"`

Expected: at least the long-name, global-controls, and mobile composition cases fail against the current stylesheet.

- [ ] **Step 3: Implement the complete token and layout system**

Rewrite `styles.css` in readable sections:

1. tokens and reset;
2. shared controls, focus, selection, scrollbar, and states;
3. authentication;
4. command bar and navigation;
5. page header and programming workspace;
6. telemetry inspector;
7. control and digital-twin surfaces;
8. feedback and profile overlays;
9. tablet, mobile, reduced-motion, and print-safe rules.

Use the exact palette roles from the spec. Establish a 4px spacing scale, 12–16px surface radii, one soft offset shadow, tabular numeric telemetry, 65–75ch body measure, 44px primary controls, and at least 38px dense controls. Use navy labels on orange. Remove the current conflicting duplicate declarations and minified one-line formatting.

- [ ] **Step 4: Run responsive tests and confirm GREEN**

Run: `npm run test:e2e -- --grep "profile bounds|long error|global controls|tablet navigation|mobile navigation|mobile layout keeps every panel|responsive workspace never exceeds"`

Expected: all responsive and geometry tests pass.

- [ ] **Step 5: Run the component suite after the CSS rewrite**

Run: `npm test -- --run`

Expected: all unit tests pass with no duplicate role warnings.

- [ ] **Step 6: Record an uncommitted checkpoint**

Run: `git diff --check -- apps/web/src apps/web/e2e/workspace.spec.ts`

Expected: no whitespace errors. Do not stage or commit files.

### Task 5: Render, inspect, correct, and document the finished interface

**Files:**
- Create: `apps/web/DESIGN.md`
- Create: `apps/web/.impeccable/design.json`
- Create: `apps/web/.impeccable/review/login-desktop.png`
- Create: `apps/web/.impeccable/review/workspace-desktop.png`
- Create: `apps/web/.impeccable/review/workspace-tablet.png`
- Create: `apps/web/.impeccable/review/workspace-mobile.png`
- Modify only if review finds defects: files changed in Tasks 1–4

**Interfaces:**
- Consumes: Finished Mission Control UI and the approved spec.
- Produces: Validated screenshots, mechanical detector output, durable design tokens, and an uncommitted implementation ready for user review.

- [ ] **Step 1: Run the complete automated verification suite**

Run from `apps/web`:

```powershell
npm run lint
npm run typecheck
npm test -- --run
npm run build
npm run test:e2e
```

Expected: every command exits 0. The existing bundle-size warning is reported but does not fail the build.

- [ ] **Step 2: Capture the first bounded visual-review round**

Capture login at 1440px and the authenticated workspace at 1440px, 1024px, and 390px from the document top. Save them under `apps/web/.impeccable/review/` with the filenames listed above. Open each file once and reject any capture with stale loading content, wrong scroll position, blank regions, or overlapping sticky elements.

- [ ] **Step 3: Run the Impeccable detector once**

```powershell
& 'C:\Users\Admin\.agents\skills\impeccable\scripts\impeccable.cmd' detect --json src/App.tsx src/styles.css src/auth/AuthGate.tsx src/workspace/ControlPanel.tsx src/workspace/DigitalTwin.tsx src/editors/MonacoPanel.tsx src/editors/BlocklyPanel.tsx
```

Expected: fix mechanical findings in one batch. Do not run the detector a second time.

- [ ] **Step 4: Apply one batched correction pass and recapture**

Fix all visible overlap, wrapping, contrast, state, and alignment problems found across the four images. Rebuild once, overwrite the same screenshot files, and confirm each recapture shows the intended viewport and route.

- [ ] **Step 5: Document the durable design system**

Create `DESIGN.md` with the Mission Control direction, palette roles, typography, spacing, radii, control states, semantic state colors, and responsive contract. Create `.impeccable/design.json` with matching token values and component rules so later surfaces inherit the same system.

- [ ] **Step 6: Run final verification and leave everything uncommitted**

Run: `npm run lint && npm run typecheck && npm test -- --run && npm run build && npm run test:e2e`

Expected: all commands exit 0. Run `git status --short` and confirm the redesign files remain unstaged and uncommitted.

## Plan self-review

- **Spec coverage:** Tasks 1–4 cover authentication, shell, navigation, programming, telemetry, control, digital twin, accessibility, state semantics, and responsive behavior. Task 5 covers rendered inspection, detector review, documentation, and full verification.
- **Placeholder scan:** Every test and implementation step names exact files, behavior, commands, and expected outcomes.
- **Type consistency:** Existing props and handlers remain unchanged; new UI grouping is expressed only through markup, classes, and ARIA attributes.
- **Review focus coverage:** Task 1 covers profile bounds, mobile global controls, tablet navigation, and shared Control errors. Task 4 covers long content and mobile composition. Task 5 verifies all shipped viewport classes.
