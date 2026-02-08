# Foundations RFC — Core Runtime + Vite Plugin

## Goal

Build the minimum machinery that makes one path work end-to-end:

```
component/index.tsx  →  component/async.ts  →  service  →  client
```

A developer creates files following the conventions, and the framework
discovers them, wires them, wraps them, and delivers typed props to the
view — with zero manual configuration.

Everything else (reactive graph, type generation, HMR, additional
concern types) layers on top of this foundation.

---

## Scope

### In (Phase 1)

- Vite plugin: filesystem scanning, virtual module generation
- Client registry: discover `clients/`, instantiate factories
- Service registry: discover `services/`, call outer functions, expose
  inner functions
- Component discovery: identify component folders and their concern files
- async.ts concern: wrap each export with `useLatency` observability
- Runtime context: provide `{ clients, services }` to concern layers
- Package entry points: `nojoy` (plugin), `nojoy/runtime` (React)

### Out (deferred)

- Control plane (`when`, `invalidate`, `poll`, `optimistic`, `cache`)
- Type generation (`.nojoy/core.d.ts`)
- HMR for services and concern files
- Additional concern types (`style.ts`, `i18n.ts`, `route.ts`)
- Cycle detection and dependency graph analysis
- Build-time static analysis of `when()` calls
- Namespace-level targeting

---

## Architecture overview

```
                 Build time                          Runtime
         ┌───────────────────────┐          ┌──────────────────────┐
         │     Vite Plugin       │          │    React Runtime      │
         │                       │          │                       │
         │  scan filesystem      │          │  NojoyProvider        │
         │  resolve component    │  emits   │    ├─ clients         │
         │    imports to virtual ├─────────▶│    └─ services        │
         │    modules            │  virtual │                       │
         │  generate wrapper     │  modules │  Generated wrappers   │
         │    code per component │          │    useLatency per     │
         │                       │          │    async export       │
         └───────────────────────┘          └──────────────────────┘
```

Two distinct layers:

1. **Vite plugin** — runs at build/dev time. Scans the filesystem,
   intercepts imports to component folders, emits virtual modules
   containing the generated wrapper code. No React dependency.

2. **React runtime** — a thin context provider (`NojoyProvider`) that
   holds instantiated clients and services. Generated wrappers import
   from this. Ships `useLatency` and the provider hook (`useNojoy`).

The plugin produces code. The runtime executes it.

---

## The Vite plugin

### Filesystem scanning

On startup (and on file change in dev), the plugin scans the configured
root for three top-level directories:

```
src/
  clients/      → one subfolder per client
  services/     → nested folders, one export per method
  components/   → nested folders, index.tsx = component
```

Each directory type has discovery rules:

| Directory    | Rule                                                        |
|-------------|-------------------------------------------------------------|
| `clients/`  | Each direct subfolder with `index.ts` is a client factory   |
| `services/` | Each `.ts` file (or `index.ts` in subfolder) exports methods|
| `components/`| Any folder containing `index.tsx` is a component           |

The plugin builds an in-memory registry of all discovered entities.
This registry is the foundation for everything else — resolution,
code generation, and (later) type generation.

### Module resolution

The plugin hooks into Vite's `resolveId`. When an import resolves to a
component folder (a directory containing `index.tsx` plus at least one
concern file), the plugin redirects it to a virtual module:

```
import Button from './components/widgets/button'
       │
       ▼  resolveId
'\0nojoy:component:/abs/path/to/components/widgets/button'
       │
       ▼  load
generates wrapper code
```

If a component folder has **no concern files** (only `index.tsx`), the
plugin does not intercept — the import resolves normally to the view.
The framework is invisible until you need it.

### Code generation

For each component with concern files, the plugin generates a wrapper
module. For a component with `async.ts`:

```
components/widgets/button/
  index.tsx    ← view
  async.ts     ← concern
```

The plugin generates (conceptually):

```tsx
import { createElement, useMemo } from 'react'
import { useNojoy, useAsyncHandler } from 'nojoy/runtime'
import View from '/abs/path/to/components/widgets/button/index.tsx'
import { click } from '/abs/path/to/components/widgets/button/async.ts'

export default function NojoyButton(props) {
  const { clients, services } = useNojoy()

  const clickHandler = useAsyncHandler(click, { clients, services })

  return createElement(View, {
    ...props,
    click: clickHandler,
  })
}
```

`useAsyncHandler` is a runtime helper that:
1. Calls the outer function (factory) with the data plane — memoized
2. Creates a `useLatency` instance for state tracking
3. Returns a callable with `.loading`, `.error`, `.data`, `.status`

This keeps the generated code thin. The wrapping logic lives in the
runtime, not in generated strings.

---

## The runtime

### NojoyProvider

Top-level context provider. Instantiates clients and services once,
provides them to all components via React context.

```tsx
// App.tsx — the only manual wiring point
import { NojoyProvider } from 'nojoy/runtime'

// These are generated by the plugin or hand-written for now
import { createClients } from './clients'
import { createServices } from './services'

const clients = createClients()
const services = createServices({ clients })

export default function App({ children }) {
  return (
    <NojoyProvider clients={clients} services={services}>
      {children}
    </NojoyProvider>
  )
}
```

**Open question:** should the plugin auto-generate the provider setup?
For Phase 1, manual wiring is simpler and more debuggable. The plugin
can generate `createClients` and `createServices` factory functions
that do the scanning/instantiation, but the developer explicitly uses
them in their app root.

### useNojoy

Hook that reads the context. Used by generated wrappers.

```ts
const { clients, services } = useNojoy()
```

Throws if used outside `NojoyProvider`.

### useAsyncHandler

The core wrapping primitive. Takes an async.ts export (two-layer
function) and the data plane, returns a wrapped callable:

```ts
function useAsyncHandler<TArgs extends unknown[], TData>(
  factory: (dataPlane: DataPlane) => (...args: TArgs) => Promise<TData>,
  dataPlane: DataPlane
): AsyncHandler<TArgs, TData>
```

Where `AsyncHandler` is:

```ts
interface AsyncHandler<TArgs, TData> {
  (...args: TArgs): void          // call the handler
  loading: boolean                // promise is pending
  error: AsyncError | undefined   // last call failed
  data: TData | undefined         // last resolved value
  status: 'idle' | 'loading' | 'success' | 'error'
  abort: () => void               // cancel pending
}
```

And `AsyncError` is:

```ts
interface AsyncError {
  reason: unknown                 // the raw error
  retry: () => void               // re-invoke with last args
}
```

Internally, `useAsyncHandler` uses `useLatency` for state management.
It memoizes the factory call, captures args for retry, and composes
the return object.

This is the only new runtime primitive needed. Everything else
(`useLatency`, stale guard, machine) is already built.

---

## Service instantiation

Services are two-layer functions. The outer function runs once at init
and receives the data plane. The inner function runs on every call.

```ts
// services/a/index.ts
export const getSomething = ({ clients }) =>
  (params: { foo?: string }) =>
    clients.rest.get('/some-url', { params })
```

The `createServices` factory:

1. Imports all service modules
2. Creates a `services` object matching the filesystem hierarchy
3. For each export, calls the outer function with `{ clients, services }`
4. Stores the returned inner function on the `services` object

**Lazy resolution for `services` references:**

Since service A's inner function might call `services.b.get()`, and
service B's inner function might call `services.a.get()`, the
`services` object uses lazy property access. Each property is a getter
that resolves to the inner function at call time, not at init time.

In Phase 1 (no control plane), the declaration scope is trivial — it
just returns the inner function. No ordering issues. But lazy resolution
future-proofs against declaration-scope `services` access when the
control plane arrives.

```ts
function createServices({ clients }) {
  const registry = {}
  const services = new Proxy(registry, { /* lazy nested access */ })

  // Phase 1: register all service methods
  for (const [path, factory] of serviceEntries) {
    const inner = factory({ clients, services })
    setNestedProperty(registry, path, inner)
  }

  return services
}
```

---

## Entry points

```json
{
  "exports": {
    ".":           "./dist/plugin.js",      // Vite plugin
    "./runtime":   "./dist/runtime.js",     // React runtime
    "./package.json": "./package.json"
  }
}
```

- `nojoy` — the Vite plugin, used in `vite.config.ts`
- `nojoy/runtime` — React hooks and context, used by generated code
  and potentially by advanced consumers

`useLatency` re-exports from `nojoy/runtime` (it's a React hook).

---

## Developer experience

### Setup

```ts
// vite.config.ts
import nojoy from 'nojoy'

export default defineConfig({
  plugins: [react(), nojoy()],
})
```

### Create a client

```ts
// src/clients/rest/index.ts
import axios from 'axios'

export default () =>
  axios.create({ baseURL: '/api', timeout: 5000 })
```

### Create a service

```ts
// src/services/users/index.ts
export const getById = ({ clients }) =>
  (id: string) =>
    clients.rest.get(`/users/${id}`)

export const create = ({ clients }) =>
  (data: { name: string }) =>
    clients.rest.post('/users', data)
```

### Create a component

```tsx
// src/components/user-form/index.tsx
export default ({ submit }) => (
  <form onSubmit={(e) => {
    e.preventDefault()
    submit({ name: e.target.name.value })
  }}>
    <input name="name" />
    <button disabled={submit.loading}>
      {submit.loading ? 'Saving...' : 'Save'}
    </button>
    {submit.error && <p>{String(submit.error.reason)}</p>}
  </form>
)
```

```ts
// src/components/user-form/async.ts
export const submit = ({ services }) =>
  (data: { name: string }) =>
    services.users.create(data)
```

**That's it.** No imports, no hooks, no providers (except the root),
no boilerplate. The framework connects everything.

---

## Implementation plan

### Step 1 — Extend useLatency with `data`

The current hook returns `{ abort, error, pending, watch }`. The async
wrapper needs `data` and `status` as well. Add `data` to the machine
context readout and derive `status` from machine state.

### Step 2 — useAsyncHandler

New runtime hook. Composes factory memoization + useLatency + property
attachment into the `AsyncHandler` shape described above. Unit and
integration tests.

### Step 3 — NojoyProvider + useNojoy

React context for `{ clients, services }`. Minimal — just a context,
a provider component, and a consumer hook. Unit tests.

### Step 4 — createClients / createServices

Runtime factory functions. `createClients` takes a map of factory
functions and calls each one. `createServices` takes `{ clients }` and
a map of two-layer service functions, calls the outer layer, returns
the inner functions organized by path. Unit tests.

### Step 5 — Vite plugin: scanning

Filesystem scanner. Given a root, discovers `clients/`, `services/`,
`components/` and builds the in-memory registry. Uses `fast-glob`
(already a dependency). Pure function, easily testable. Unit tests
with fixture directories.

### Step 6 — Vite plugin: resolution + code generation

`resolveId` hook to intercept component folder imports. `load` hook to
generate wrapper code. The generated code imports from `nojoy/runtime`
and the user's source files. Integration tests using Vite's test
utilities or direct plugin hook invocation.

### Step 7 — End-to-end integration

Wire everything together. Use the sandbox app to validate the full
path: `vite.config.ts` → plugin → scan → component import → virtual
module → runtime context → async handler → service → client.

### Step 8 — Cleanup and docs

Ensure all tests pass, typecheck clean, build clean. Update sandbox to
demonstrate the working framework.

---

## Open questions

### 1. Provider auto-generation

Should the plugin generate the `NojoyProvider` setup automatically
(inject it into the app entry), or should the developer wire it
manually? Auto-generation is more magical but reduces boilerplate.
Manual wiring is explicit and debuggable.

**Recommendation:** Manual for Phase 1. Auto-generate `createClients`
and `createServices` factories, but let the developer place the
provider. Revisit when the framework matures.

### 2. Component identification

How does the plugin distinguish a component folder from a regular
folder that happens to have an `index.tsx`? Options:

- **Any folder under `components/`** with `index.tsx` → component
- **Any folder anywhere** with `index.tsx` + a known concern file → component
- **Explicit configuration** in plugin options

**Recommendation:** Option 1 for Phase 1. The `components/` directory
is the convention boundary. Files outside it are not framework-managed.

### 3. View prop merging conflicts

When two concern layers produce the same prop name, the framework model
says that's a build-time error. Should Phase 1 implement this check?

**Recommendation:** Yes, it's cheap and prevents hard-to-debug issues.
The plugin knows all concern exports at scan time — checking for
duplicate prop names across layers is a set intersection.

### 4. Async handler return values

The current design wraps async handlers as fire-and-forget (`void`
return). Should `handler()` return the promise for consumers who want
to `await` it (e.g., redirect after submit)?

```tsx
const handleSubmit = async () => {
  await submit({ name: 'Alice' })  // wait for the result
  navigate('/success')
}
```

**Recommendation:** Yes. The handler should return the promise. The
observability wrapper tracks state regardless. The consumer can ignore
the return value (fire-and-forget) or await it (sequential flows).

### 5. Multiple entry points vs monorepo

The framework currently ships as one package (`nojoy`) with subpath
exports. Should `nojoy/runtime` and the plugin be separate packages?

**Recommendation:** Single package with subpath exports for Phase 1.
Split only if the dependency graphs diverge significantly (e.g.,
runtime needs React, plugin needs Vite — but both are already peer
deps).

### 6. How deep does the service tree go?

Services are organized by filesystem:

```
services/users/index.ts     → services.users.getById
services/market/live.ts     → services.market.live.getPrices  ???
```

Is a service file always `index.ts` in a folder, or can it be a named
file? Does `services/market/live.ts` create `services.market.live.*`
or `services.market.*` with the file being an organizational choice?

**Recommendation:** Both conventions work. A folder with `index.ts`
creates a namespace. A named file creates a namespace matching the
filename. `services/market/live.ts` → `services.market.live.*`.
This matches how the existing RFC describes nested services.
