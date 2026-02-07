# Services RFC — Reactive Service Graph

## The shape

Every service method is a two-layer function:

```ts
export const getSomething = (
  { clients, services },       // 1st: data plane — what you talk to
  { when, invalidate, ... }    // 2nd: control plane — how you behave
) => {
  // ┌─ declaration scope (runs once at init)
  // │  declare relationships, configure caching, etc.
  // │  purely declarative — the framework owns the lifecycle
  // └─

  return (params: { foo?: string }) => {
    // ┌─ execution scope (runs every call)
    // │  the actual work
    // └─
    return clients.rest.get('/some-url', { params })
  }
}
```

**First parameter — data plane:**

| Key        | What it is                                                  |
|------------|-------------------------------------------------------------|
| `clients`  | All registered clients (rest, graphql, websocket, ...)      |
| `services` | All other service methods, already unwrapped (inner only)   |

**Second parameter — control plane:**

Everything in the control plane is a **declaration**, not a subscription.
The consumer never manages lifecycle. The framework owns setup, teardown,
batching, HMR re-wiring — all of it. The consumer states facts about
relationships; the framework acts on them.

| Key          | Purpose                                                       |
|--------------|---------------------------------------------------------------|
| `when`       | Declare a relationship to another service's lifecycle         |
| `invalidate` | Mark this method's cache as stale and notify dependents       |
| `emit`       | Push data to dependents (for streaming/push-based services)   |
| `optimistic` | Declare how to optimistically patch a related cache           |
| `poll`       | Declare a polling interval (active while any consumer exists) |
| `cache`      | Cache behavior configuration                                  |
| `meta`       | Metadata about this method (populated by the plugin)          |

---

## Reactive wiring

### Basic invalidation

```ts
export const getUserPosts = (
  { clients, services },
  { when, invalidate }
) => {
  // "when a new post is created, my data is stale"
  when(services.posts.create, invalidate)

  // "when the user itself changes, my data is stale"
  when(services.users.update, invalidate)

  return (userId: string) =>
    clients.rest.get(`/users/${userId}/posts`)
}
```

`when` reads as a declaration: "when X happens, Y is the consequence."
There is no cleanup, no return value, no unsubscribe. The framework
handles the full lifecycle — including teardown during HMR, batching
multiple invalidations in the same tick, and cycle detection.

### Reacting to specific results

```ts
export const getUserPosts = (
  { clients, services },
  { when, invalidate }
) => {
  // only invalidate matching cache entries
  when(services.posts.create, ({ result }) => {
    invalidate({ where: (cachedArgs) => cachedArgs[0] === result.userId })
  })

  return (userId: string) =>
    clients.rest.get(`/users/${userId}/posts`)
}
```

The callback form gives full flexibility without changing the mental model.
It's still a declaration: "when posts.create succeeds, here's how I decide
whether my cache is affected." The framework still owns execution.

### Streaming / real-time

```ts
export const livePrices = (
  { clients },
  { emit }
) => {
  // pipe websocket events into the service graph
  clients.websocket.on('price:update', (data) => {
    emit(data)
  })

  // push-only service — no inner function needed
  return () => {}
}
```

```ts
export const getPortfolio = (
  { clients, services },
  { when, invalidate }
) => {
  // re-compute when prices stream in
  when(services.market.livePrices, invalidate)

  return (userId: string) =>
    clients.rest.get(`/portfolio/${userId}`)
}
```

### Optimistic updates

```ts
export const updateUser = (
  { clients, services },
  { optimistic }
) => {
  // declare how to patch getById's cache before the server responds
  optimistic(services.users.getById, {
    apply: (args, currentCache) => ({ ...currentCache, ...args[0] }),
    // on failure, the framework rolls back automatically
  })

  return (data: Partial<User>) =>
    clients.rest.patch(`/users/${data.id}`, data)
}
```

### Polling

```ts
export const getSystemStatus = (
  { clients },
  { poll }
) => {
  poll(30_000) // re-execute every 30s while any consumer exists

  return () =>
    clients.rest.get('/system/status')
}
```

### Cache configuration

```ts
export const searchProducts = (
  { clients },
  { cache }
) => {
  cache.ttl(60_000)
  cache.key((query, page) => `${query}:${page}`)
  cache.merge((existing, incoming, { args }) => {
    if (args.page > 1 && existing) {
      return { ...incoming, items: [...existing.items, ...incoming.items] }
    }
    return incoming
  })

  return (query: string, page: number) =>
    clients.rest.get('/products', { params: { query, page } })
}
```

---

## Dead ends and hazards

### 1. Circular invalidation

The most obvious trap:

```
getUserPosts ──when──▶ posts.create ──when──▶ users.update ──when──▶ getUserPosts
                                                                         ↻
```

Invalidation A triggers B triggers C triggers A → infinite loop.

**Detection:** The plugin builds the full `when()` graph at compile time
(all calls are in the declaration scope, statically analyzable). Cycles
can be detected and reported as build errors.

**Runtime safety net:** Invalidation carries a generation ID. If a node
sees the same generation twice, it stops. Like a TTL on a network packet.

**Design question:** Are cycles always an error? Or are there legitimate
cases where A and B should co-invalidate? If so, the framework debounces
by default — multiple invalidations in the same tick collapse into one.

### 2. Initialization ordering

Services reference each other via `services.x.y`. If service A's
declaration scope calls `when(services.b.create, ...)`, service B must
exist first.

**Solution:** The plugin topologically sorts the dependency graph. Cycles
in the `when()` graph are caught at compile time (see above). Declaration
scope runs in dependency order.

**Edge case:** `services` references inside the *execution* scope don't
need ordering — by the time any method is called, all services are
initialized. Only `when()` calls (declaration scope) create init-time
dependencies.

### 3. Cache identity — same method, different args

`getUser("alice")` and `getUser("bob")` are the same method but
different cache entries.

When `when(services.users.update, invalidate)` fires, which entries
invalidate?

**Options:**
- **All of them** (default, simple, correct). Every cached variant is stale.
- **Selective** via predicate: `invalidate({ where: (cachedArgs) => cachedArgs[0] === updatedUserId })`

Default is "all". Selective is an opt-in optimization.

### 4. Self-referential declarations

```ts
// same domain, different method — OK
export const getAll = ({ services }, { when, invalidate }) => {
  when(services.users.create, invalidate)
  return () => clients.rest.get('/users')
}

// same method pointing to itself — error
export const getAll = (_, { when, invalidate }) => {
  when(services.users.getAll, invalidate) // ← build error
  return () => {}
}
```

The plugin detects self-references and errors at compile time.

### 5. Async declaration scope

```ts
export const getUser = async ({ clients }, { when }) => {
  const schema = await clients.rest.get('/schema/users') // ← async in declaration??
  return (id: string) => { ... }
}
```

If the declaration scope is async, initialization becomes async, ordering
becomes harder, and startup is slower.

**Recommendation:** Declaration scope is synchronous. If you need async
initialization, that's a client concern (the client factory can handle
it), not a service concern. Services declare; they don't fetch.

### 6. Conditional declarations

```ts
export const getAnalytics = ({ services }, { when, invalidate }) => {
  if (process.env.ENABLE_ANALYTICS === 'true') {
    when(services.events.track, invalidate)
  }
  return () => { ... }
}
```

Static analysis sees the `when()` call but can't evaluate the condition.
The compile-time graph includes the edge regardless.

**Impact:** Cycle detector might flag a false positive. Acceptable — the
graph is a superset of reality. Better to over-warn than miss a real cycle.

### 7. Dynamic service references

```ts
const target = someCondition ? services.a.get : services.b.get
when(target, invalidate) // ← which one?
```

AST analysis can't resolve this.

**Constraint:** `when()` only accepts direct `services.x.y` member
expressions as the first argument. Dynamic references produce a build
warning. This is the same constraint that makes ESM tree-shaking work.

### 8. Declaration teardown during HMR

When a service file is edited in dev:

1. Framework tracks all `when()` declarations per module
2. On HMR, tears down old declarations
3. Re-runs declaration scope with fresh control plane
4. Notifies dependent services to re-evaluate

The consumer never knows this happened. It's a framework concern.

### 9. Error propagation

If `services.users.getById` errors, and `getUserPosts` depends on it
via `when()`, what happens?

Default: `when` only fires on success. This is the safest behavior.

But the callback form gives full access:

```ts
when(services.users.getById, ({ status, result, error }) => {
  if (status === 'success') invalidate()
  if (status === 'error') {
    // consumer decides: ignore? invalidate anyway? log?
  }
})
```

### 10. Invalidation vs re-execution

`invalidate` means "mark as stale." It does **not** mean "re-fetch now."
Re-execution only happens when a consumer reads the stale data.

This is the same lazy invalidation model as React Query / SWR. It avoids
wasted work: if nobody is looking at the data, there's no point refetching.

The alternative (eager re-execution on invalidation) is a foot-gun for
cascading updates and wasted network calls.

---

## Type generation sketch

The plugin generates types by scanning the filesystem:

```ts
// .nojoy/core.d.ts — auto-generated, never edited

type NojoyClients = {
  rest: import('axios').AxiosInstance
  graphql: import('@apollo/client').ApolloClient<NormalizedCacheObject>
  websocket: import('socket.io-client').Socket
}

type NojoyServices = {
  users: {
    getById: (id: string) => Promise<User>          // inner fn only
    getAll: () => Promise<User[]>
    create: (data: CreateUserDTO) => Promise<User>
    update: (data: Partial<User>) => Promise<User>
  }
  posts: {
    getByUser: (userId: string) => Promise<Post[]>
    create: (data: CreatePostDTO) => Promise<Post>
  }
  market: {
    livePrices: () => void                           // push-only, no return
  }
}

// The full shape injected into each service method
type DataPlane = {
  clients: NojoyClients
  services: NojoyServices
}

type ServiceRef<T> = /* opaque reference to a service method with return type T */

type InvalidateOptions = {
  where?: (cachedArgs: unknown[]) => boolean
}

type WhenPayload<T> = {
  args: unknown[]
  result: T
  status: 'success' | 'error'
  error?: Error
}

type WhenHandler<T> =
  | ((payload: WhenPayload<T>) => void)
  | typeof invalidate

type ControlPlane = {
  when: <T>(source: ServiceRef<T>, handler: WhenHandler<T>) => void
  invalidate: (options?: InvalidateOptions) => void
  emit: <T>(data: T) => void
  optimistic: <T>(
    target: ServiceRef<T>,
    config: {
      apply: (args: unknown[], current: T) => T
    }
  ) => void
  poll: (intervalMs: number) => void
  cache: {
    ttl: (ms: number) => void
    key: (...args: unknown[]) => string
    merge: (existing: unknown, incoming: unknown, ctx: { args: unknown[] }) => unknown
  }
  meta: {
    name: string
    domain: string
    path: string
  }
}
```

**Nested services map to nested types:**

```
services/a/index.ts           → NojoyServices.a
services/c/d/e/index.ts       → NojoyServices.c.d.e
```

**Type inference flow:**

1. Plugin scans `clients/` → infers return types → generates `NojoyClients`
2. Plugin scans `services/` → for each export, unwraps outer fn → infers inner fn signature → generates `NojoyServices`
3. Service authors get full autocomplete on `clients.rest.get(...)`, `services.users.getById(...)`, `when(services.x.y, ...)`
4. All generated. Zero manual type maintenance.

---

## Open questions

1. **Mutations vs queries** — how are they distinguished? By convention (name: `get*` vs `create*`/`update*`/`delete*`)? By HTTP method? By explicit annotation? This matters for optimistic updates and for default invalidation behavior.

2. **Middleware** — is there a layer between services? Something like `beforeAll`, `afterAll`, for logging, auth token injection, error normalization? Or is that a client concern?

3. **Composition** — can a service method call another service method directly (not via `when`) in its execution scope?
   ```ts
   return async (userId: string) => {
     const user = await services.users.getById(userId) // direct call
     return clients.rest.get(`/posts?author=${user.name}`)
   }
   ```
   This is synchronous data flow, not reactive. Direct calls don't create
   invalidation edges. Both should work, different semantics.

4. **Namespacing** — flat exports per file, or can a single file export multiple related methods that share a declaration scope?
   ```ts
   // Does each export get its own control plane, or do they share?
   export const getById = (data, control) => { ... }
   export const getAll = (data, control) => { ... }
   ```
   Current design: each export gets its own declaration + control plane.

5. **Control plane extensibility** — can the consumer add custom keys to the control plane via the plugin config? For example, a logging or telemetry concern that every service gets access to without importing anything.
