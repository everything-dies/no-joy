# Framework Mental Model

> **Status: Living Document**
> **Last updated:** 2026-02-08
>
> This document describes the conceptual model of nojoy. It was written
> early in the project and remains accurate as a mental model. Inline
> `[STATUS]` tags note which concern types are implemented vs planned.

## The core idea

A React component is not a file. It's a **folder**. Each file in the
folder is a **concern layer** — a single, isolated responsibility that
the framework composes into a working component at compile time.

```
components/widgets/button/
  index.tsx           → view               [IMPLEMENTED]
  async.ts            → async handlers     [IMPLEMENTED]
  placeholder.tsx     → Suspense fallback  [IMPLEMENTED]
  error.tsx           → ErrorBoundary      [IMPLEMENTED]
  style.ts            → styles             [PLANNED]
  i18n.ts             → translations       [PLANNED]
  route.ts            → routing / ACL      [PLANNED]
  ...                 → any future concern
```

The view (`index.tsx`) is pure. It receives everything as props. It
doesn't know where the data comes from, how loading states are managed,
what language is active, or how styles are resolved. It just destructures
and renders.

Every other file in the folder is a **concern layer**. Each concern
layer follows the same fundamental pattern: the framework injects what
the layer needs, the layer does its job, and the result flows into the
view as props. The layer never touches the view directly. The framework
is the only bridge.

## Why this works

### Separation by file, not by abstraction

Traditional React patterns separate concerns through code abstractions:
custom hooks, HOCs, render props, context providers. These all live
inside the same file or import graph, tangled together.

nojoy separates concerns by **file boundary**. Each concern lives in
its own file with its own scope. There's no way for `async.ts` to
accidentally import something from `style.ts` or to leak implementation
details into the view. The isolation is structural, not conventional.

### Each layer is trivially testable in isolation

An `async.ts` file is a plain function: `({ services }) => () => ...`.
You test it by passing a mock services object and asserting the return
value. No DOM, no React, no rendering, no providers.

A `style.ts` file (future) would be pure data: given some props or
state, return styles. Test it with plain assertions.

An `i18n.ts` file (future) would be a mapping: given a locale, return
strings. Test it with a lookup.

The view (`index.tsx`) receives fully resolved props. Test it with
shallow rendering and prop assertions. No mocking of hooks, no
wrapping in providers, no simulating async flows.

In practice, most of these layers are so simple that testing them
individually is unnecessary. That's the point — when each concern is
isolated and tiny, correctness is obvious by inspection.

### Composition is structural

In traditional React, composing behaviors means nesting HOCs, chaining
hooks, or threading context. The composition order matters, edge cases
emerge from interactions, and debugging requires tracing through
multiple abstraction layers.

nojoy's composition is flat. The framework reads the folder, sees which
concern files exist, processes each one independently, and merges the
results into a single props object. There's no nesting, no ordering
ambiguity, no hidden interactions between layers.

Adding a concern is adding a file. Removing a concern is deleting a file.
The view never changes — it just stops receiving the props it no longer
needs (and TypeScript catches the dangling references).

## The framework's job

The framework has three responsibilities:

### 1. Scan and discover

At build time (via the Vite plugin), the framework scans the filesystem:

- `clients/` → discover client factories, infer their types
- `services/` → discover service methods, infer their types, build the
  dependency graph from `when()` declarations
- `components/` → discover component folders, identify which concern
  files exist, determine what injection each component needs

The filesystem is the single source of truth. No configuration files,
no registration, no manual wiring.

### 2. Inject and wrap

For each concern layer, the framework knows:

- **What to inject** — the data plane (`clients`, `services`), the
  control plane (`when`, `invalidate`, etc.), or concern-specific
  context (locale for i18n, theme for styles, route params for routing)
- **How to wrap** — async handlers get observability (loading, error,
  success, retry). Styles get scoping or extraction. i18n gets locale
  resolution. Each concern type has its own wrapping logic.

The wrapping is where the framework's opinions live. The consumer writes
the simplest possible code for each concern; the framework adds the
production behavior.

### 3. Compose and deliver

The framework takes the output of every concern layer for a component
and merges it into a single props object, then renders the view with
those props.

```
async.ts   →  { click: WrappedAsyncHandler }    ─┐
style.ts   →  { className: string }              ├─ merge ─→ props ─→ index.tsx
i18n.ts    →  { label: string, hint: string }    │
route.ts   →  { canAccess: boolean }             ─┘
```

The merge is flat. If two layers produce the same prop name, that's a
build-time error — not a silent override.

## The data flow

```
                     ┌─────────────────────────────────────────┐
                     │              Filesystem                  │
                     │  clients/  services/  components/        │
                     └──────────────┬──────────────────────────┘
                                    │
                              Vite plugin scans
                                    │
                                    ▼
          ┌──────────────────────────────────────────────┐
          │            Compile-time graph                  │
          │  client types, service types, when() edges,   │
          │  component concern maps, generated types       │
          └──────────────┬───────────────────────────────┘
                         │
                   code generation
                         │
                         ▼
    ┌─────────────────────────────────────────────────────┐
    │                  Runtime                             │
    │                                                     │
    │  ┌─────────┐   ┌──────────┐   ┌────────────────┐   │
    │  │ Clients │──▶│ Services │──▶│ Concern Layers │   │
    │  └─────────┘   └──────────┘   └───────┬────────┘   │
    │                                       │             │
    │                                 merge props         │
    │                                       │             │
    │                                       ▼             │
    │                                ┌────────────┐       │
    │                                │    View    │       │
    │                                │ index.tsx  │       │
    │                                └────────────┘       │
    └─────────────────────────────────────────────────────┘
```

## Concern layers — the extension model

Each concern type is defined by:

1. **File convention** — the filename that triggers it (`async.ts`,
   `style.ts`, `i18n.ts`, etc.)
2. **Input shape** — what the framework injects into the layer
3. **Wrapping behavior** — how the framework transforms the layer's
   output before passing it to the view
4. **Output shape** — what props the layer contributes to the view

This is the framework's extension point. Adding a new concern type
means defining a new file convention and its associated injection +
wrapping behavior. The view and other layers don't change.

### async.ts [IMPLEMENTED]

**Convention:** Each named export is an async handler.

**Input:** `({ clients, services }) => () => ...`
The same data plane as services. The inner function is what gets called.

**Wrapping:** The framework wraps each handler with observability:
- `handler()` — calls the inner function
- `handler.loading` — boolean, true while the promise is pending
- `handler.error` — the error object if the last call failed, with
  `.reason`, `.retry()`, etc.
- `handler.data` — the resolved value if the last call succeeded
- `handler.status` — 'idle' | 'loading' | 'success' | 'error'
- `handler.abort` — cancel pending operation

**Output:** Each export name becomes a prop on the view.

### placeholder.tsx [IMPLEMENTED]

**Convention:** Default export is a React component with no props.

**Input:** None — the component receives no props from the framework.

**Wrapping:** When present, the framework wraps the view with
`<Suspense fallback={<Placeholder />}>`. Combined with `React.lazy()`
(applied to ALL framework components), this enables loading states
during code splitting.

**Output:** No props contributed to the view. The placeholder is used
as the Suspense fallback, not passed as a prop.

### error.tsx (or error/index.tsx) [IMPLEMENTED]

**Convention:** Default export is a React component receiving
`{ error: Error, resetErrorBoundary: () => void }` props (the
`react-error-boundary` `FallbackProps` contract).

**Input:** Error object and reset callback from `react-error-boundary`.

**Wrapping:** When present, the framework wraps the view (and Suspense
if present) with `<ErrorBoundary FallbackComponent={ErrorFallback}>`.
This catches both lazy-load failures and render errors.

**Output:** No props contributed to the view. The error component is
used as the ErrorBoundary fallback.

**Subdirectory pattern:** The scanner also checks for `error/index.tsx`
(or `.ts`, `.jsx`, `.js`) to support more complex error fallback
components that need multiple files.

### style.ts [PLANNED]

**Convention:** Default export or named exports for style resolution.

**Input:** Theme context, component state/props.

**Wrapping:** CSS extraction, scoping, class name generation.

**Output:** `className`, `style`, or named style props.

### i18n.ts [PLANNED]

**Convention:** Named exports map to translation keys or functions.

**Input:** Current locale, translation catalog.

**Wrapping:** Key resolution, pluralization, interpolation.

**Output:** Each export name becomes a string prop on the view.

### route.ts [PLANNED]

**Convention:** Exports define routing constraints and access control.

**Input:** Current route, user context, permissions.

**Wrapping:** Access checks, redirect logic, param extraction.

**Output:** Route params, access flags, navigation helpers.

## Design principles

### 1. The view is sacred

The view (`index.tsx`) never imports anything except React itself (and
even that's implicit with JSX transform). Everything arrives as props.
This makes the view portable, testable, and readable — you can understand
what it renders by reading one file.

### 2. Concern layers are pure functions

Every concern layer is a function that receives input and returns output.
No side effects, no global state, no framework coupling inside the layer
itself. The framework provides the coupling at the boundary.

### 3. The filesystem is the API

Adding a feature = adding a file. Removing a feature = deleting a file.
Renaming a concern = renaming a file. The filesystem is navigable,
diffable, and universally understood. No framework-specific DSLs,
no configuration files, no decorator syntax.

### 4. Types are generated, not maintained

The plugin scans the filesystem and generates types. Adding an export
to `async.ts` automatically makes it available as a typed prop in
`index.tsx`. Renaming a service method updates the type everywhere.
The developer never writes interface boilerplate.

### 5. Convention is the default, configuration is the escape hatch

Most components just follow the file convention and everything works.
For edge cases, meta files within the folder can override behavior —
custom prop names, non-standard file mappings, explicit type overrides.
But the 90% case requires zero configuration.

### 6. Progressive disclosure

A component can start as a single `index.tsx` file with no concern
layers. It works like a normal React component. When you need async
handlers, add `async.ts`. When you need i18n, add `i18n.ts`. Each
concern is opt-in, and adding one never requires changing existing files.

## What this is not

**Not a component library.** nojoy doesn't provide UI primitives. It
provides the architecture for how components are structured and wired.

**Not a state manager.** There's no global store, no atoms, no signals.
State flows through the service graph and concern layers. If you need
local component state, use React's built-in `useState` in the view.

**Not a build-your-own-framework kit.** nojoy is opinionated. The file
conventions are fixed. The concern types are predefined (with an
extension model for custom ones). The tradeoff is: less flexibility,
more consistency.

**Not a runtime framework.** Most of nojoy's work happens at compile
time. The runtime footprint is the observability wrappers, the service
graph, and the prop merging. There's no virtual DOM abstraction, no
custom reconciler, no runtime router.
