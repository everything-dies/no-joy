import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { generateComponentWrapper, generatePrefix } from '../../src/plugin/codegen'

import type { ComponentEntry } from '../../src/plugin/scanner'

const FIXTURES = resolve(__dirname, 'fixtures/basic')
const PREFIX = '_t3stpr3f$'

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
  it('generates wrapper with prefixed framework imports', () => {
    const component: ComponentEntry = {
      name: 'button',
      dir: resolve(FIXTURES, 'components/button'),
      viewPath: resolve(FIXTURES, 'components/button/index.tsx'),
      concerns: {
        async: resolve(FIXTURES, 'components/button/async.ts'),
      },
    }

    const code = generateComponentWrapper(component, PREFIX)

    expect(code).toContain(
      `import { createElement as ${PREFIX}createElement } from "react"`
    )
    expect(code).toContain(
      `import { useNojoy as ${PREFIX}useNojoy } from "nojoy/runtime"`
    )
    expect(code).toContain(
      `import { useAsyncHandler as ${PREFIX}useAsyncHandler } from "nojoy/runtime"`
    )
    expect(code).toContain(`import ${PREFIX}View from "${component.viewPath}"`)
    // async factory imports stay unprefixed (user-authored)
    expect(code).toContain(
      `import { click } from "${component.concerns['async']}"`
    )
  })

  it('generates prefixed hook calls per export', () => {
    const component: ComponentEntry = {
      name: 'button',
      dir: resolve(FIXTURES, 'components/button'),
      viewPath: resolve(FIXTURES, 'components/button/index.tsx'),
      concerns: {
        async: resolve(FIXTURES, 'components/button/async.ts'),
      },
    }

    const code = generateComponentWrapper(component, PREFIX)

    expect(code).toContain(
      `const ${PREFIX}dataPlane = ${PREFIX}useNojoy()`
    )
    expect(code).toContain(
      `const ${PREFIX}click = ${PREFIX}useAsyncHandler(click, ${PREFIX}dataPlane)`
    )
    // prop key stays unprefixed, value is prefixed
    expect(code).toContain(`click: ${PREFIX}click`)
  })

  it('generates correct displayName', () => {
    const component: ComponentEntry = {
      name: 'widgets/card',
      dir: resolve(FIXTURES, 'components/widgets/card'),
      viewPath: resolve(FIXTURES, 'components/widgets/card/index.tsx'),
      concerns: {
        async: resolve(FIXTURES, 'components/widgets/card/async.ts'),
      },
    }

    const code = generateComponentWrapper(component, PREFIX)

    expect(code).toContain(`function NojoyWidgetsCard(${PREFIX}props)`)
    expect(code).toContain('NojoyWidgetsCard.displayName = "WidgetsCard"')
  })

  it('generates minimal wrapper without async concerns', () => {
    const component: ComponentEntry = {
      name: 'plain',
      dir: resolve(FIXTURES, 'components/plain'),
      viewPath: resolve(FIXTURES, 'components/plain/index.tsx'),
      concerns: {},
    }

    const code = generateComponentWrapper(component, PREFIX)

    expect(code).not.toContain('useAsyncHandler')
    expect(code).toContain(
      `return ${PREFIX}createElement(${PREFIX}View, ${PREFIX}props)`
    )
  })

  it('generates valid AST output with export default', () => {
    const component: ComponentEntry = {
      name: 'button',
      dir: resolve(FIXTURES, 'components/button'),
      viewPath: resolve(FIXTURES, 'components/button/index.tsx'),
      concerns: {
        async: resolve(FIXTURES, 'components/button/async.ts'),
      },
    }

    const code = generateComponentWrapper(component, PREFIX)

    expect(code).toContain('export default NojoyButton')
  })

  it('uses prefixed props parameter and spread', () => {
    const component: ComponentEntry = {
      name: 'button',
      dir: resolve(FIXTURES, 'components/button'),
      viewPath: resolve(FIXTURES, 'components/button/index.tsx'),
      concerns: {
        async: resolve(FIXTURES, 'components/button/async.ts'),
      },
    }

    const code = generateComponentWrapper(component, PREFIX)

    expect(code).toContain(`function NojoyButton(${PREFIX}props)`)
    expect(code).toContain(`...${PREFIX}props`)
  })
})
