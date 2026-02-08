import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { generateComponentWrapper } from '../../src/plugin/codegen'

import type { ComponentEntry } from '../../src/plugin/scanner'

const FIXTURES = resolve(__dirname, 'fixtures/basic')

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

    const code = generateComponentWrapper(component)

    expect(code).toContain(
      'import { createElement as __nojoy$createElement } from "react"'
    )
    expect(code).toContain(
      'import { useNojoy as __nojoy$useNojoy } from "nojoy/runtime"'
    )
    expect(code).toContain(
      'import { useAsyncHandler as __nojoy$useAsyncHandler } from "nojoy/runtime"'
    )
    expect(code).toContain(`import __nojoy$View from "${component.viewPath}"`)
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

    const code = generateComponentWrapper(component)

    expect(code).toContain(
      'const __nojoy$dataPlane = __nojoy$useNojoy()'
    )
    expect(code).toContain(
      'const __nojoy$click = __nojoy$useAsyncHandler(click, __nojoy$dataPlane)'
    )
    // prop key stays unprefixed, value is prefixed
    expect(code).toContain('click: __nojoy$click')
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

    const code = generateComponentWrapper(component)

    expect(code).toContain('function NojoyWidgetsCard(__nojoy$props)')
    expect(code).toContain('NojoyWidgetsCard.displayName = "WidgetsCard"')
  })

  it('generates minimal wrapper without async concerns', () => {
    const component: ComponentEntry = {
      name: 'plain',
      dir: resolve(FIXTURES, 'components/plain'),
      viewPath: resolve(FIXTURES, 'components/plain/index.tsx'),
      concerns: {},
    }

    const code = generateComponentWrapper(component)

    expect(code).not.toContain('useAsyncHandler')
    expect(code).toContain(
      'return __nojoy$createElement(__nojoy$View, __nojoy$props)'
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

    const code = generateComponentWrapper(component)

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

    const code = generateComponentWrapper(component)

    expect(code).toContain('function NojoyButton(__nojoy$props)')
    expect(code).toContain('...__nojoy$props')
  })
})
