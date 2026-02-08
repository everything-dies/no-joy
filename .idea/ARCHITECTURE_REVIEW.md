# Architecture Review — Initial Conclusions

Date: 2026-02-08
Author: Codex
Last updated: 2026-02-08

> **Note:** This review was written against the early implementation.
> Several items have since been addressed. Status annotations `[FIXED]`,
> `[OPEN]`, and `[DEFERRED]` track the current state of each item.

## Scope
This document captures my initial review of the current architecture and the immediate, concrete next step to pursue. It also records any instructions I provide from now onwards.

## Initial Conclusions (Condensed)

Strengths
- Clear build-time vs runtime separation. The plugin generates wrapper code, the runtime executes it.
- Minimal runtime surface area (`NojoyProvider`, `useNojoy`, `useAsyncHandler`, `useLatency`) and good testability.
- Filesystem conventions as the primary API are consistent with the RFCs.

Key Risks / Gaps
- [FIXED] ~~Dev-mode staleness: the plugin scans once at startup; no rescan on file changes, which weakens HMR and dev workflow.~~ → Implemented chokidar watcher in `configureServer` hook (commit 9e95951). Rescans on file add/remove with 100ms debounce, invalidates virtual modules, triggers full-reload when registry changes. See [DEV_RESCAN_RFC.md](./DEV_RESCAN_RFC.md).
- [ACCEPTED] Nondeterministic codegen: `generatePrefix()` uses `Math.random`, producing unstable output across runs. → This is intentional. Random prefix per build ensures zero naming collisions. The nondeterminism is acceptable because the prefix is regenerated on each build/dev-start, not per-file. Deterministic hashing was considered and deliberately not adopted.
- [DEFERRED] No prop-name conflict detection across concern files, leading to silent overrides. → Currently only `async.ts` contributes props. When additional concern types are added, build-time conflict detection should be implemented.
- [OPEN] Export discovery is limited to direct named exports; re-exports and `export *` are ignored. → Still a limitation. The export scanner (`src/plugin/exports.ts`) uses AST parsing of `ExportNamedDeclaration` nodes.
- [OPEN] Runtime typing is too loose for serious adoption; a typed escape hatch would help before full codegen types. → `useNojoy()` returns `DataPlane` which is `{ clients: any, services: any }`. Type generation is planned but not yet implemented.

Immediate Next Step (Concrete)
- [DONE] ~~Implement dev-time rescan and invalidation for `components/`, `services/`, and `clients/`.~~
- [DONE] ~~Add tests to ensure new/removed component folders are recognized without restarting dev.~~

## Instructions (From Now Onwards)
1. When implementing plugin changes, prioritize deterministic output and stable virtual module IDs.
2. If adding new concerns, include prop-name conflict detection at build time.
3. Any new API should preserve a forward-compatible path to the RFC control plane model.

## Planned Follow-ups (Not Yet Executed)
- [DECIDED AGAINST] ~~Deterministic prefix hashing per component path.~~ → Random prefix per build is the chosen approach. Stable output across builds is not a goal — each build regenerates the prefix.
- [OPEN] Expand export discovery or document strict limitations with warnings.
- [OPEN] Introduce a generic typed runtime surface as a bridge to generated types.

## Capabilities Added Since Initial Review

The following capabilities were built after this review was written:

- **Lazy loading** — All framework components use `React.lazy()` for automatic code splitting (commit 9545b76)
- **Suspense support** — `placeholder.tsx` concern file enables Suspense wrapping with custom fallback
- **ErrorBoundary support** — `error.tsx` or `error/index.tsx` enables ErrorBoundary wrapping via `react-error-boundary`
- **Concern file subdirectory pattern** — Scanner checks both `error.tsx` (file) and `error/index.tsx` (directory)
- **Dev-time rescan** — Chokidar watcher with debounced rescan and virtual module invalidation (commit 9e95951)
- **Sandbox** — Working demo app using JSONPlaceholder API, demonstrates all features including a deliberately broken component for ErrorBoundary showcase
