# RFC — Dev-Time Rescan + Invalidation for nojoy Vite Plugin

Date: 2026-02-08
Author: Codex
Status: Draft

## Summary
Introduce dev-time filesystem rescan and module invalidation so adding, removing, or renaming files under `src/components`, `src/services`, or `src/clients` is picked up without restarting Vite. This removes the most visible workflow friction and aligns with the RFC expectation of a filesystem-driven framework.

## Goals
- Detect new/removed/renamed component folders and concern files during dev.
- Update the in-memory registry and virtual module resolution accordingly.
- Invalidate virtual modules so Vite recompiles wrappers immediately.
- Keep the change minimally invasive to the existing plugin structure.

## Non-Goals
- Full HMR for services/clients and control plane (future work).
- Type generation or graph analysis changes.
- Production build changes beyond minor stability improvements.

## Current State
- `scan()` runs only in `configResolved` and never re-runs.
- `componentMap` and `registry` become stale when files change.
- Users must restart dev server to see new component concerns.

## Proposed Design

### 1) Add dev-time watcher
Use `handleHotUpdate` or a `chokidar` watcher to rescan when any file inside:
- `src/components/**`
- `src/services/**`
- `src/clients/**`
changes.

### 2) Rescan and rebuild registry
On change, call `scan(resolvedSrcDir)` and rebuild:
- `registry`
- `componentMap`

### 3) Invalidate affected virtual modules
When rescan detects component registry changes, invalidate all `\0nojoy:component:` virtual modules. This is acceptable at this stage and simplest to implement. Later iterations can make this more granular.

### 4) Determinism (recommended but optional in this RFC)
Switch `generatePrefix()` from random to deterministic hashing by component path to improve cache stability and reduce dev churn.

## Behavior Examples

### Example A: Add new component
- Create `src/components/user-form/index.tsx` and `async.ts`.
- Vite dev detects change, triggers rescan.
- Plugin recognizes new component folder and resolves imports to virtual module.
- Wrapper code becomes available without server restart.

### Example B: Remove concern file
- Delete `async.ts` from a component folder.
- Rescan removes `async` concern.
- Virtual module updates to minimal wrapper or original view (depending on logic).

## Implementation Sketch

### Plugin changes
- Add `configureServer` or `handleHotUpdate` to trigger rescan on file changes.
- Add a helper `refreshRegistry()` to rebuild maps and track if components changed.
- Invalidate modules when changes are detected using `server.moduleGraph.invalidateModule`.

### Code locations
- `src/plugin/vite-plugin.ts`
- `src/plugin/scanner.ts` (no change expected)

## Testing Plan
- Add a dev-mode plugin test using a temp filesystem fixture or `sandbox/`.
- Simulate file creation/removal and confirm registry updates or code generation output changes.

## Risks
- Over-invalidating modules can cause extra rebuilds in dev.
- Watcher configuration must avoid infinite loops on generated artifacts (not applicable yet).
- File events are platform-dependent; use debouncing to avoid double rescans.

## Decision
If approved, implement dev-time rescan + invalidation first. Then evaluate deterministic prefix change as a follow-up.
