import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { generateComponentWrapper } from '../../src/plugin/codegen'

import type { ComponentEntry } from '../../src/plugin/scanner'

const FIXTURES = resolve(__dirname, 'fixtures/basic')

describe('generateComponentWrapper', () => {
  it('generates wrapper with async handler imports', () => {
    const component: ComponentEntry = {
      name: 'button',
      dir: resolve(FIXTURES, 'components/button'),
      viewPath: resolve(FIXTURES, 'components/button/index.tsx'),
      concerns: {
        async: resolve(FIXTURES, 'components/button/async.ts'),
      },
    }

    const code = generateComponentWrapper(component)

    expect(code).toContain('import { createElement } from "react"')
    expect(code).toContain('import { useNojoy } from "nojoy/runtime"')
    expect(code).toContain('import { useAsyncHandler } from "nojoy/runtime"')
    expect(code).toContain(`import View from "${component.viewPath}"`)
    expect(code).toContain(`import { click } from "${component.concerns['async']}"`)
  })

  it('generates static hook calls per export', () => {
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
      'const clickHandler = useAsyncHandler(click, dataPlane)'
    )
    expect(code).toContain('click: clickHandler')
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

    expect(code).toContain('function NojoyWidgetsCard(props)')
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
    expect(code).toContain('return createElement(View, props)')
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
})
