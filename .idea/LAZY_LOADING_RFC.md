# RFC: Lazy Loading, Suspense & ErrorBoundary

## Context

Every framework-managed component should be lazy-loaded via `React.lazy()` to enable automatic code splitting. Components can optionally provide a `placeholder.tsx` for a Suspense fallback and/or an `error.tsx` (or `error/index.tsx`) for an ErrorBoundary wrapper. These new concern files also qualify a component for framework registration — a component with only `placeholder.tsx` and no `async.ts` is still a valid framework component.

## File conventions

```
components/button/
  ├── index.tsx           → view (required, pure component)
  ├── async.ts            → async handlers (optional)
  ├── placeholder.tsx     → Suspense fallback component (optional)
  └── error.tsx           → ErrorBoundary fallback component (optional)
      OR
  └── error/
      └── index.tsx       → ErrorBoundary fallback component (optional)
```

A component is registered as a framework component if it has **at least one** of: `async.ts`, `placeholder.tsx`, or `error.tsx`/`error/index.tsx`.

## Generated wrapper shape

### All framework components (always lazy)

```jsx
import { lazy } from "react";
const _x$View = lazy(() => import("/path/to/button/index.tsx"));
```

The static `import View from "..."` becomes a lazy import for all framework components.

### With placeholder.tsx only

```jsx
import { lazy, Suspense } from "react";
import _x$Placeholder from "/path/to/button/placeholder.tsx";
const _x$View = lazy(() => import("/path/to/button/index.tsx"));

function NojoyButton(_x$props) {
  return _x$createElement(Suspense, { fallback: _x$createElement(_x$Placeholder, null) },
    _x$createElement(_x$View, _x$props)
  );
}
```

### With error.tsx only

```jsx
import { lazy } from "react";
import { ErrorBoundary as _x$ErrorBoundary } from "react-error-boundary";
import _x$ErrorFallback from "/path/to/button/error.tsx";
const _x$View = lazy(() => import("/path/to/button/index.tsx"));

function NojoyButton(_x$props) {
  return _x$createElement(_x$ErrorBoundary, { FallbackComponent: _x$ErrorFallback },
    _x$createElement(_x$View, _x$props)
  );
}
```

### With both placeholder.tsx and error.tsx

```jsx
import { createElement as _x$createElement, lazy, Suspense } from "react";
import { ErrorBoundary as _x$ErrorBoundary } from "react-error-boundary";
import _x$ErrorFallback from "/path/to/button/error.tsx";
import _x$Placeholder from "/path/to/button/placeholder.tsx";
const _x$View = lazy(() => import("/path/to/button/index.tsx"));

function NojoyButton(_x$props) {
  return _x$createElement(_x$ErrorBoundary, { FallbackComponent: _x$ErrorFallback },
    _x$createElement(Suspense, { fallback: _x$createElement(_x$Placeholder, null) },
      _x$createElement(_x$View, _x$props)
    )
  );
}
```

**Wrapping order:** ErrorBoundary (outer) > Suspense (middle) > View (inner). This ensures the ErrorBoundary catches both lazy-load failures and render errors inside the Suspense boundary.

### With async concerns + placeholder + error (full example)

```jsx
import { createElement as _x$createElement, lazy, Suspense } from "react";
import { useNojoy as _x$useNojoy } from "nojoy/runtime";
import { useAsyncHandler as _x$useAsyncHandler } from "nojoy/runtime";
import { ErrorBoundary as _x$ErrorBoundary } from "react-error-boundary";
import _x$ErrorFallback from "/path/to/button/error.tsx";
import _x$Placeholder from "/path/to/button/placeholder.tsx";
import { click } from "/path/to/button/async.ts";
const _x$View = lazy(() => import("/path/to/button/index.tsx"));

function NojoyButton(_x$props) {
  const _x$dataPlane = _x$useNojoy();
  const _x$click = _x$useAsyncHandler(click, _x$dataPlane);
  return _x$createElement(_x$ErrorBoundary, { FallbackComponent: _x$ErrorFallback },
    _x$createElement(Suspense, { fallback: _x$createElement(_x$Placeholder, null) },
      _x$createElement(_x$View, { ..._x$props, click: _x$click })
    )
  );
}
```

## Changes required

### 1. Scanner (`src/plugin/scanner.ts`)

- Add `placeholder` and `error` to the concern detection logic
- `placeholder`: look for `placeholder.tsx`, `placeholder.ts`, `placeholder.jsx`, `placeholder.js`
- `error`: look for `error.tsx`, `error.ts`, `error.jsx`, `error.js` **OR** `error/index.tsx`, `error/index.ts`, etc.
- Update registration condition: a component qualifies if it has **any** concern (async, placeholder, or error)

### 2. Codegen (`src/plugin/codegen.ts`)

- **View import**: Change from static `import` to `const View = lazy(() => import("..."))` for all framework components
- **React imports**: Always import `lazy`; conditionally import `Suspense` when placeholder exists
- **ErrorBoundary import**: When error concern exists, add `import { ErrorBoundary } from "react-error-boundary"` (aliased with prefix)
- **Placeholder import**: When placeholder exists, add static import for the placeholder component
- **Error fallback import**: When error exists, add static import for the error component
- **Return statement**: Build nested `createElement` calls based on which wrappers are active

### 3. Dependencies

- Install `react-error-boundary` as a runtime dependency
- Add `react-error-boundary` to `tsup.config.ts` externals

### 4. Test fixtures

Add to `tests/plugin/fixtures/basic/components/`:
- `with-placeholder/index.tsx` + `with-placeholder/placeholder.tsx`
- `with-error/index.tsx` + `with-error/error.tsx`
- `with-error-dir/index.tsx` + `with-error-dir/error/index.tsx`
- `full/index.tsx` + `full/async.ts` + `full/placeholder.tsx` + `full/error.tsx`

### 5. Sandbox

Add `placeholder.tsx` and `error.tsx` to existing sandbox components to demonstrate the feature.

## Error component contract

The error fallback component receives props from `react-error-boundary`:

```tsx
interface FallbackProps {
  error: Error
  resetErrorBoundary: () => void
}

export default function ErrorView({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div>
      <p>Something went wrong: {error.message}</p>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  )
}
```

## Placeholder component contract

The placeholder component is a simple React component with no props:

```tsx
export default function Placeholder() {
  return <p>Loading...</p>
}
```

## Verification

1. `pnpm test:run` — all tests pass (existing + new)
2. `pnpm typecheck` — clean
3. `pnpm build` — clean
4. Sandbox demonstrates lazy loading with placeholder + error boundary
