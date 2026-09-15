# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Engineering students learning, authoring, and validating delta-robot programs, both independently and under instructor supervision. Instructors use the same workspace to demonstrate safe simulation workflows and inspect student projects and revisions.

## Product Purpose

DeltaX is a simulation-first workspace for creating, validating, saving, and running four-axis delta-robot programs. Success means a user can move between text and block programming, understand robot state, and control a mock or RoboDK digital twin without exposing a physical-hardware path.

## Positioning

One shared, strictly validated `RobotProgramV1` connects Blockly, the safe Robot DSL, project history, safety controls, Mock simulation, and RoboDK simulation.

## Operating Context

Desktop-first use in engineering labs and personal development environments. Users authenticate, open or create a project, edit with DSL or Blockly, validate, unlock simulation control deliberately, run or jog the selected simulator, observe live state, and save revisions. Software Stop is always identified as simulation cancellation, never a physical emergency stop.

## Capabilities and Constraints

- React, TypeScript, Vite frontend; FastAPI and Pydantic backend.
- Supabase Auth and PostgreSQL persistence with row-level ownership enforcement.
- Mock adapter remains default; RoboDK is optional and simulation-only.
- Raspberry Pi and physical robot execution remain disabled.
- Existing Phase 1 APIs, protocol, executor semantics, WebSocket behavior, and tests remain compatible.
- Actual robot geometry, Supabase credentials, Google OAuth, RoboDK Desktop, and an `.rdk` station may require external configuration.

## Brand Commitments

Product name is DeltaX. Visual language uses the supplied navy, blue, light blue, orange, amber, white, surface, border, text, muted, danger, and success tokens as starting values, adjusted only for WCAG AA. Interface must be original and must not copy Dobot or RoboDK branding, icons, screenshots, or proprietary assets.

## Evidence on Hand

Phase 1 implementation and tests are authoritative repository evidence. No confirmed permission for the CPE logo, real robot dimensions, RoboDK station, or physical-accuracy claims exists; those must not be fabricated.

## Product Principles

- Safety state is persistent, explicit, and enforced server-side.
- One IR and validator govern every editor and simulator path.
- Simulation capability fails closed; explicit adapter choices never silently change.
- Dense controls remain readable, keyboard accessible, and state-aware.
- External setup gaps are documented precisely instead of being disguised by fake integrations.

## Accessibility & Inclusion

WCAG AA contrast, visible keyboard focus, semantic labels, ARIA state, and usable desktop layouts from 1366×768 with a reasonable tablet fallback.
