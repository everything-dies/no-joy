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
        skins: {},
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

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
        skins: {},
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

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
        skins: {},
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

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
        skins: {},
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

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
        skins: {},
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

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
        skins: {},
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

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
        skins: {},
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

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
        skins: {},
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

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
        skins: {},
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

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
        skins: {},
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

      expect(code).toContain('from "react"')
      expect(code).toContain('from "nojoy/runtime"')
      expect(code).toContain('from "react-error-boundary"')
      expect(code).toContain(`import { load }`)
    })
  })

  describe('i18n concern', () => {
    it('imports useI18n and i18n defaults', () => {
      const component: ComponentEntry = {
        name: 'with-i18n',
        dir: resolve(FIXTURES, 'components/with-i18n'),
        viewPath: resolve(FIXTURES, 'components/with-i18n/index.tsx'),
        concerns: {
          i18n: resolve(FIXTURES, 'components/with-i18n/i18n.ts'),
        },
        skins: {},
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

      expect(code).toContain(
        `import { useI18n as ${P}useI18n } from "nojoy/runtime"`
      )
      expect(code).toContain(
        `import ${P}i18nDefaults from "${component.concerns['i18n']}"`
      )
    })

    it('generates namespace and import.meta.glob declarations', () => {
      const component: ComponentEntry = {
        name: 'with-i18n',
        dir: resolve(FIXTURES, 'components/with-i18n'),
        viewPath: resolve(FIXTURES, 'components/with-i18n/index.tsx'),
        concerns: {
          i18n: resolve(FIXTURES, 'components/with-i18n/i18n.ts'),
        },
        skins: {},
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

      expect(code).toContain(`const ${P}i18nNamespace = "components/with-i18n"`)
      expect(code).toContain(`import.meta.glob(`)
      expect(code).toContain(`/i18n/*.json`)
    })

    it('generates useI18n hook call and passes i18n prop', () => {
      const component: ComponentEntry = {
        name: 'with-i18n',
        dir: resolve(FIXTURES, 'components/with-i18n'),
        viewPath: resolve(FIXTURES, 'components/with-i18n/index.tsx'),
        concerns: {
          i18n: resolve(FIXTURES, 'components/with-i18n/i18n.ts'),
        },
        skins: {},
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

      expect(code).toContain(
        `const ${P}i18n = ${P}useI18n(${P}i18nDefaults, ${P}i18nNamespace, ${P}i18nTranslations)`
      )
      expect(code).toContain(`i18n: ${P}i18n`)
    })

    it('does not include async hooks without async concern', () => {
      const component: ComponentEntry = {
        name: 'with-i18n',
        dir: resolve(FIXTURES, 'components/with-i18n'),
        viewPath: resolve(FIXTURES, 'components/with-i18n/index.tsx'),
        concerns: {
          i18n: resolve(FIXTURES, 'components/with-i18n/i18n.ts'),
        },
        skins: {},
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

      expect(code).not.toContain('useNojoy')
      expect(code).not.toContain('useAsyncHandler')
    })

    it('combines i18n with async concerns', () => {
      const component: ComponentEntry = {
        name: 'button',
        dir: resolve(FIXTURES, 'components/button'),
        viewPath: resolve(FIXTURES, 'components/button/index.tsx'),
        concerns: {
          async: resolve(FIXTURES, 'components/button/async.ts'),
          i18n: resolve(FIXTURES, 'components/button/i18n.ts'),
        },
        skins: {},
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

      // Should have both async and i18n
      expect(code).toContain('useAsyncHandler')
      expect(code).toContain('useI18n')
      expect(code).toContain(`click: ${P}click`)
      expect(code).toContain(`i18n: ${P}i18n`)
    })

    it('splits into inner + outer functions for Suspense boundary', () => {
      const component: ComponentEntry = {
        name: 'with-i18n',
        dir: resolve(FIXTURES, 'components/with-i18n'),
        viewPath: resolve(FIXTURES, 'components/with-i18n/index.tsx'),
        concerns: {
          i18n: resolve(FIXTURES, 'components/with-i18n/i18n.ts'),
        },
        skins: {},
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

      // Inner function has hooks and renders View
      expect(code).toContain(`function ${P}Inner(${P}props)`)
      expect(code).toContain(`${P}createElement(${P}View`)

      // Outer function wraps Inner with Suspense
      expect(code).toContain(`function NojoyWithI18n(${P}props)`)
      expect(code).toContain(`${P}createElement(${P}Suspense`)
      expect(code).toContain(`${P}createElement(${P}Inner, ${P}props)`)
    })

    it('imports Suspense even without placeholder concern', () => {
      const component: ComponentEntry = {
        name: 'with-i18n',
        dir: resolve(FIXTURES, 'components/with-i18n'),
        viewPath: resolve(FIXTURES, 'components/with-i18n/index.tsx'),
        concerns: {
          i18n: resolve(FIXTURES, 'components/with-i18n/i18n.ts'),
        },
        skins: {},
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

      expect(code).toContain(`Suspense as ${P}Suspense`)
      // Without placeholder, fallback is null
      expect(code).toContain('fallback: null')
    })

    it('uses Placeholder as Suspense fallback when both i18n and placeholder exist', () => {
      const component: ComponentEntry = {
        name: 'with-i18n',
        dir: resolve(FIXTURES, 'components/with-i18n'),
        viewPath: resolve(FIXTURES, 'components/with-i18n/index.tsx'),
        concerns: {
          i18n: resolve(FIXTURES, 'components/with-i18n/i18n.ts'),
          placeholder: resolve(
            FIXTURES,
            'components/with-i18n/placeholder.tsx'
          ),
        },
        skins: {},
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

      // Inner function has hooks
      expect(code).toContain(`function ${P}Inner(${P}props)`)
      // Outer wraps with Suspense using Placeholder fallback
      expect(code).toContain(
        `fallback: ${P}createElement(${P}Placeholder, null)`
      )
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
        skins: {},
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

      expect(code).toContain(`function NojoyWidgetsCard(${P}props)`)
      expect(code).toContain('NojoyWidgetsCard.displayName = "WidgetsCard"')
    })

    it('generates export default', () => {
      const component: ComponentEntry = {
        name: 'button',
        dir: resolve(FIXTURES, 'components/button'),
        viewPath: resolve(FIXTURES, 'components/button/index.tsx'),
        concerns: { async: resolve(FIXTURES, 'components/button/async.ts') },
        skins: {},
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

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
        skins: {},
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

      expect(code).not.toContain('useAsyncHandler')
      expect(code).not.toContain('Suspense')
      expect(code).not.toContain('ErrorBoundary')
      expect(code).toContain(`return ${P}createElement(${P}View, ${P}props)`)
    })
  })

  describe('skins concern', () => {
    const SKINS_DIR = resolve(FIXTURES, 'components/with-skins')
    const SKINS = {
      material: resolve(SKINS_DIR, 'skins/material.ts'),
      brutalist: resolve(SKINS_DIR, 'skins/brutalist.ts'),
    }

    it('imports styled from nojoy/runtime', () => {
      const component: ComponentEntry = {
        name: 'with-skins',
        dir: SKINS_DIR,
        viewPath: resolve(SKINS_DIR, 'index.tsx'),
        concerns: {},
        skins: SKINS,
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

      expect(code).toContain(
        `import { styled as ${P}styled } from "nojoy/runtime"`
      )
    })

    it('imports Suspense for suspendable skin loading', () => {
      const component: ComponentEntry = {
        name: 'with-skins',
        dir: SKINS_DIR,
        viewPath: resolve(SKINS_DIR, 'index.tsx'),
        concerns: {},
        skins: SKINS,
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

      expect(code).toContain(`Suspense as ${P}Suspense`)
    })

    it('generates styled() wrapping View directly when no hooks', () => {
      const component: ComponentEntry = {
        name: 'with-skins',
        dir: SKINS_DIR,
        viewPath: resolve(SKINS_DIR, 'index.tsx'),
        concerns: {},
        skins: SKINS,
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

      expect(code).toContain(`const ${P}Styled = ${P}styled(${P}View`)
      expect(code).toContain(`name: "nojoy-with-skins"`)
      expect(code).toContain(`suspendable: true`)
    })

    it('generates skins map with dynamic imports', () => {
      const component: ComponentEntry = {
        name: 'with-skins',
        dir: SKINS_DIR,
        viewPath: resolve(SKINS_DIR, 'index.tsx'),
        concerns: {},
        skins: SKINS,
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

      expect(code).toContain(`material: () => import("${SKINS.material}")`)
      expect(code).toContain(`brutalist: () => import("${SKINS.brutalist}")`)
    })

    it('wraps styled with Suspense in outer function', () => {
      const component: ComponentEntry = {
        name: 'with-skins',
        dir: SKINS_DIR,
        viewPath: resolve(SKINS_DIR, 'index.tsx'),
        concerns: {},
        skins: SKINS,
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

      expect(code).toContain(`function NojoyWithSkins(${P}props)`)
      expect(code).toContain(`${P}createElement(${P}Suspense`)
      expect(code).toContain(`${P}createElement(${P}Styled, ${P}props)`)
      expect(code).toContain('fallback: null')
    })

    it('generates Core function when hooks exist (skins + async)', () => {
      const component: ComponentEntry = {
        name: 'button',
        dir: resolve(FIXTURES, 'components/button'),
        viewPath: resolve(FIXTURES, 'components/button/index.tsx'),
        concerns: { async: resolve(FIXTURES, 'components/button/async.ts') },
        skins: SKINS,
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

      // Core function has hooks and renders View
      expect(code).toContain(`function ${P}Core(${P}props)`)
      expect(code).toContain(`${P}useAsyncHandler`)
      expect(code).toContain(`${P}createElement(${P}View`)

      // styled wraps Core, not View
      expect(code).toContain(`${P}styled(${P}Core`)

      // Outer renders styled
      expect(code).toContain(`function NojoyButton(${P}props)`)
      expect(code).toContain(`${P}createElement(${P}Styled, ${P}props)`)
    })

    it('generates correct element name from nested component path', () => {
      const component: ComponentEntry = {
        name: 'widgets/card',
        dir: resolve(FIXTURES, 'components/widgets/card'),
        viewPath: resolve(FIXTURES, 'components/widgets/card/index.tsx'),
        concerns: {},
        skins: SKINS,
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

      expect(code).toContain(`name: "nojoy-widgets-card"`)
    })

    it('combines skins with i18n (Core has hooks, styled wraps Core)', () => {
      const component: ComponentEntry = {
        name: 'with-i18n',
        dir: resolve(FIXTURES, 'components/with-i18n'),
        viewPath: resolve(FIXTURES, 'components/with-i18n/index.tsx'),
        concerns: {
          i18n: resolve(FIXTURES, 'components/with-i18n/i18n.ts'),
        },
        skins: SKINS,
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

      // Core has useI18n hook
      expect(code).toContain(`function ${P}Core(${P}props)`)
      expect(code).toContain(`${P}useI18n`)
      expect(code).toContain(`i18n: ${P}i18n`)

      // styled wraps Core
      expect(code).toContain(`${P}styled(${P}Core`)

      // Outer wraps styled with Suspense
      expect(code).toContain(`${P}createElement(${P}Suspense`)
      expect(code).toContain(`${P}createElement(${P}Styled, ${P}props)`)
    })

    it('does not generate styled when skins is empty', () => {
      const component: ComponentEntry = {
        name: 'button',
        dir: resolve(FIXTURES, 'components/button'),
        viewPath: resolve(FIXTURES, 'components/button/index.tsx'),
        concerns: { async: resolve(FIXTURES, 'components/button/async.ts') },
        skins: {},
      }

      const code = generateComponentWrapper(component, P, FIXTURES)

      expect(code).not.toContain('styled')
      expect(code).not.toContain('Styled')
    })
  })
})
