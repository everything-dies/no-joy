import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  generateComponentWrapper,
  generatePrefix,
} from '../../src/plugin/codegen'

import type { ComponentEntry } from '../../src/plugin/scanner'

const FIXTURES = resolve(__dirname, 'fixtures/basic')
const P = '_t3stpr3f$'

describe('generatePrefix', () => {
  it('returns a string matching _<8 alphanumeric chars>$', () => {
    const prefix = generatePrefix()
    expect(prefix).toMatch(/^_[a-z0-9]{8}\$$/)
  })

  it('generates unique values across calls', () => {
    const a = generatePrefix()
    const b = generatePrefix()
    expect(a).not.toBe(b)
  })
})

describe('generateComponentWrapper', () => {
  describe('lazy loading (all components)', () => {
    it('uses React.lazy for view import', () => {
      const component: ComponentEntry = {
        name: 'button',
        dir: resolve(FIXTURES, 'components/button'),
        viewPath: resolve(FIXTURES, 'components/button/index.tsx'),
        concerns: { async: resolve(FIXTURES, 'components/button/async.ts') },
      }

      const code = generateComponentWrapper(component, P)

      expect(code).toContain(
        `import { createElement as ${P}createElement, lazy as ${P}lazy } from "react"`
      )
      expect(code).toContain(
        `const ${P}View = ${P}lazy(() => import("${component.viewPath}"))`
      )
      // Should NOT have a static import for the view
      expect(code).not.toContain(`import ${P}View from`)
    })
  })

  describe('async concerns', () => {
    it('imports async handler hooks and factory exports', () => {
      const component: ComponentEntry = {
        name: 'button',
        dir: resolve(FIXTURES, 'components/button'),
        viewPath: resolve(FIXTURES, 'components/button/index.tsx'),
        concerns: { async: resolve(FIXTURES, 'components/button/async.ts') },
      }

      const code = generateComponentWrapper(component, P)

      expect(code).toContain(
        `import { useNojoy as ${P}useNojoy } from "nojoy/runtime"`
      )
      expect(code).toContain(
        `import { useAsyncHandler as ${P}useAsyncHandler } from "nojoy/runtime"`
      )
      expect(code).toContain(
        `import { click } from "${component.concerns['async']}"`
      )
    })

    it('generates prefixed hook calls per export', () => {
      const component: ComponentEntry = {
        name: 'button',
        dir: resolve(FIXTURES, 'components/button'),
        viewPath: resolve(FIXTURES, 'components/button/index.tsx'),
        concerns: { async: resolve(FIXTURES, 'components/button/async.ts') },
      }

      const code = generateComponentWrapper(component, P)

      expect(code).toContain(`const ${P}dataPlane = ${P}useNojoy()`)
      expect(code).toContain(
        `const ${P}click = ${P}useAsyncHandler(click, ${P}dataPlane)`
      )
      expect(code).toContain(`click: ${P}click`)
    })
  })

  describe('placeholder concern (Suspense)', () => {
    it('imports Suspense and placeholder component', () => {
      const component: ComponentEntry = {
        name: 'with-placeholder',
        dir: resolve(FIXTURES, 'components/with-placeholder'),
        viewPath: resolve(FIXTURES, 'components/with-placeholder/index.tsx'),
        concerns: {
          placeholder: resolve(
            FIXTURES,
            'components/with-placeholder/placeholder.tsx'
          ),
        },
      }

      const code = generateComponentWrapper(component, P)

      expect(code).toContain(`Suspense as ${P}Suspense`)
      expect(code).toContain(
        `import ${P}Placeholder from "${component.concerns['placeholder']}"`
      )
    })

    it('wraps view with Suspense and placeholder fallback', () => {
      const component: ComponentEntry = {
        name: 'with-placeholder',
        dir: resolve(FIXTURES, 'components/with-placeholder'),
        viewPath: resolve(FIXTURES, 'components/with-placeholder/index.tsx'),
        concerns: {
          placeholder: resolve(
            FIXTURES,
            'components/with-placeholder/placeholder.tsx'
          ),
        },
      }

      const code = generateComponentWrapper(component, P)

      expect(code).toContain(`${P}createElement(${P}Suspense`)
      expect(code).toContain(
        `fallback: ${P}createElement(${P}Placeholder, null)`
      )
    })

    it('does not import nojoy/runtime hooks without async', () => {
      const component: ComponentEntry = {
        name: 'with-placeholder',
        dir: resolve(FIXTURES, 'components/with-placeholder'),
        viewPath: resolve(FIXTURES, 'components/with-placeholder/index.tsx'),
        concerns: {
          placeholder: resolve(
            FIXTURES,
            'components/with-placeholder/placeholder.tsx'
          ),
        },
      }

      const code = generateComponentWrapper(component, P)

      expect(code).not.toContain('useNojoy')
      expect(code).not.toContain('useAsyncHandler')
    })
  })

  describe('error concern (ErrorBoundary)', () => {
    it('imports ErrorBoundary and error fallback component', () => {
      const component: ComponentEntry = {
        name: 'with-error',
        dir: resolve(FIXTURES, 'components/with-error'),
        viewPath: resolve(FIXTURES, 'components/with-error/index.tsx'),
        concerns: {
          error: resolve(FIXTURES, 'components/with-error/error.tsx'),
        },
      }

      const code = generateComponentWrapper(component, P)

      expect(code).toContain(
        `import { ErrorBoundary as ${P}ErrorBoundary } from "react-error-boundary"`
      )
      expect(code).toContain(
        `import ${P}ErrorFallback from "${component.concerns['error']}"`
      )
    })

    it('wraps view with ErrorBoundary', () => {
      const component: ComponentEntry = {
        name: 'with-error',
        dir: resolve(FIXTURES, 'components/with-error'),
        viewPath: resolve(FIXTURES, 'components/with-error/index.tsx'),
        concerns: {
          error: resolve(FIXTURES, 'components/with-error/error.tsx'),
        },
      }

      const code = generateComponentWrapper(component, P)

      expect(code).toContain(`${P}createElement(${P}ErrorBoundary`)
      expect(code).toContain(`FallbackComponent: ${P}ErrorFallback`)
    })
  })

  describe('full component (async + placeholder + error)', () => {
    it('wraps with ErrorBoundary > Suspense > View', () => {
      const component: ComponentEntry = {
        name: 'full',
        dir: resolve(FIXTURES, 'components/full'),
        viewPath: resolve(FIXTURES, 'components/full/index.tsx'),
        concerns: {
          async: resolve(FIXTURES, 'components/full/async.ts'),
          placeholder: resolve(FIXTURES, 'components/full/placeholder.tsx'),
          error: resolve(FIXTURES, 'components/full/error.tsx'),
        },
      }

      const code = generateComponentWrapper(component, P)

      // ErrorBoundary is outermost
      expect(code).toContain(`${P}createElement(${P}ErrorBoundary`)
      // Suspense is middle
      expect(code).toContain(`${P}createElement(${P}Suspense`)
      // View is innermost
      expect(code).toContain(`${P}createElement(${P}View`)

      // Verify nesting order: ErrorBoundary appears before Suspense in return
      const ebIndex = code.indexOf(`${P}ErrorBoundary`)
      const suspenseIndex = code.indexOf(`${P}Suspense`, ebIndex)
      const viewIndex = code.indexOf(`${P}View`, suspenseIndex)
      expect(ebIndex).toBeLessThan(suspenseIndex)
      expect(suspenseIndex).toBeLessThan(viewIndex)
    })

    it('includes all imports', () => {
      const component: ComponentEntry = {
        name: 'full',
        dir: resolve(FIXTURES, 'components/full'),
        viewPath: resolve(FIXTURES, 'components/full/index.tsx'),
        concerns: {
          async: resolve(FIXTURES, 'components/full/async.ts'),
          placeholder: resolve(FIXTURES, 'components/full/placeholder.tsx'),
          error: resolve(FIXTURES, 'components/full/error.tsx'),
        },
      }

      const code = generateComponentWrapper(component, P)

      expect(code).toContain('from "react"')
      expect(code).toContain('from "nojoy/runtime"')
      expect(code).toContain('from "react-error-boundary"')
      expect(code).toContain(`import { load }`)
    })
  })

  describe('displayName and export', () => {
    it('generates correct displayName for kebab-case', () => {
      const component: ComponentEntry = {
        name: 'widgets/card',
        dir: resolve(FIXTURES, 'components/widgets/card'),
        viewPath: resolve(FIXTURES, 'components/widgets/card/index.tsx'),
        concerns: {
          async: resolve(FIXTURES, 'components/widgets/card/async.ts'),
        },
      }

      const code = generateComponentWrapper(component, P)

      expect(code).toContain(`function NojoyWidgetsCard(${P}props)`)
      expect(code).toContain('NojoyWidgetsCard.displayName = "WidgetsCard"')
    })

    it('generates export default', () => {
      const component: ComponentEntry = {
        name: 'button',
        dir: resolve(FIXTURES, 'components/button'),
        viewPath: resolve(FIXTURES, 'components/button/index.tsx'),
        concerns: { async: resolve(FIXTURES, 'components/button/async.ts') },
      }

      const code = generateComponentWrapper(component, P)

      expect(code).toContain('export default NojoyButton')
    })
  })

  describe('minimal wrapper', () => {
    it('generates wrapper without async, placeholder, or error', () => {
      const component: ComponentEntry = {
        name: 'plain',
        dir: resolve(FIXTURES, 'components/plain'),
        viewPath: resolve(FIXTURES, 'components/plain/index.tsx'),
        concerns: {},
      }

      const code = generateComponentWrapper(component, P)

      expect(code).not.toContain('useAsyncHandler')
      expect(code).not.toContain('Suspense')
      expect(code).not.toContain('ErrorBoundary')
      expect(code).toContain(`return ${P}createElement(${P}View, ${P}props)`)
    })
  })
})
