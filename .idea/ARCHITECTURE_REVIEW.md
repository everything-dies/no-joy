# Architecture Review — Initial Conclusions

Date: 2026-02-08
Author: Codex

## Scope
This document captures my initial review of the current architecture and the immediate, concrete next step to pursue. It also records any instructions I provide from now onwards.

## Initial Conclusions (Condensed)

Strengths
- Clear build-time vs runtime separation. The plugin generates wrapper code, the runtime executes it.
- Minimal runtime surface area (`NojoyProvider`, `useNojoy`, `useAsyncHandler`, `useLatency`) and good testability.
- Filesystem conventions as the primary API are consistent with the RFCs.

Key Risks / Gaps
- Dev-mode staleness: the plugin scans once at startup; no rescan on file changes, which weakens HMR and dev workflow.
- Nondeterministic codegen: `generatePrefix()` uses `Math.random`, producing unstable output across runs.
- No prop-name conflict detection across concern files, leading to silent overrides.
- Export discovery is limited to direct named exports; re-exports and `export *` are ignored.
- Runtime typing is too loose for serious adoption; a typed escape hatch would help before full codegen types.

Immediate Next Step (Concrete)
- Implement dev-time rescan and invalidation for `components/`, `services/`, and `clients/`.
- Add tests to ensure new/removed component folders are recognized without restarting dev.

## Instructions (From Now Onwards)
1. When implementing plugin changes, prioritize deterministic output and stable virtual module IDs.
2. If adding new concerns, include prop-name conflict detection at build time.
3. Any new API should preserve a forward-compatible path to the RFC control plane model.

## Planned Follow-ups (Not Yet Executed)
- Deterministic prefix hashing per component path.
- Expand export discovery or document strict limitations with warnings.
- Introduce a generic typed runtime surface as a bridge to generated types.
