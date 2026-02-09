import { resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// Load the plugin factory
import pluginFactory from '../../src/ts-plugin/index'

const FIXTURES = resolve(__dirname, '../plugin/fixtures/basic')

// Minimal mock of PluginCreateInfo for testing
function createMockInfo() {
  const files = new Map<string, string>()

  const languageServiceHost: Partial<ts.LanguageServiceHost> = {
    getScriptSnapshot(fileName: string) {
      const content = files.get(fileName) ?? ts.sys.readFile(fileName)
      if (!content) return undefined
      return ts.ScriptSnapshot.fromString(content)
    },
    getScriptVersion() {
      return '1'
    },
  }

  return {
    languageServiceHost: languageServiceHost as ts.LanguageServiceHost,
    languageService: {} as ts.LanguageService,
    project: {
      projectService: {
        logger: { info: () => {} },
      },
    } as unknown as ts.server.Project,
    config: {},
    files,
  }
}

describe('nojoy ts-plugin', () => {
  const plugin = pluginFactory({ typescript: ts })

  it('injects type annotation into arrow function default export', () => {
    const info = createMockInfo()
    const viewPath = resolve(FIXTURES, 'components/with-i18n/index.tsx')
    info.files.set(
      viewPath,
      'export default ({ i18n }) => <h1>{i18n.title}</h1>\n'
    )

    plugin.create(info as unknown as ts.server.PluginCreateInfo)

    const snapshot = info.languageServiceHost.getScriptSnapshot!(viewPath)
    const text = snapshot!.getText(0, snapshot!.getLength())

    expect(text).toContain('{ i18n }:')
    expect(text).toContain("i18n: ReturnType<typeof import('./i18n').default>")
  })

  it('injects async handler types for async concern', () => {
    const info = createMockInfo()
    const viewPath = resolve(FIXTURES, 'components/button/index.tsx')
    info.files.set(
      viewPath,
      'export default ({ click }) => <button onClick={click}>Go</button>\n'
    )

    plugin.create(info as unknown as ts.server.PluginCreateInfo)

    const snapshot = info.languageServiceHost.getScriptSnapshot!(viewPath)
    const text = snapshot!.getText(0, snapshot!.getLength())

    expect(text).toContain("import('nojoy/runtime').AsyncHandler<")
    expect(text).toContain("typeof import('./async').click")
  })

  it('does not modify files without concerns', () => {
    const info = createMockInfo()
    const viewPath = resolve(FIXTURES, 'components/plain/index.tsx')
    const original = 'export default () => <div>plain</div>\n'
    info.files.set(viewPath, original)

    plugin.create(info as unknown as ts.server.PluginCreateInfo)

    const snapshot = info.languageServiceHost.getScriptSnapshot!(viewPath)
    const text = snapshot!.getText(0, snapshot!.getLength())

    expect(text).toBe(original)
  })

  it('does not inject if parameter already has type annotation', () => {
    const info = createMockInfo()
    const viewPath = resolve(FIXTURES, 'components/with-i18n/index.tsx')
    const original =
      'export default ({ i18n }: { i18n: any }) => <h1>{i18n.title}</h1>\n'
    info.files.set(viewPath, original)

    plugin.create(info as unknown as ts.server.PluginCreateInfo)

    const snapshot = info.languageServiceHost.getScriptSnapshot!(viewPath)
    const text = snapshot!.getText(0, snapshot!.getLength())

    // Should not double-inject
    expect(text).toBe(original)
  })

  it('injects both async and i18n types for combined concerns', () => {
    const info = createMockInfo()
    // button has both async.ts and i18n.ts in fixtures
    const viewPath = resolve(FIXTURES, 'components/button/index.tsx')
    info.files.set(
      viewPath,
      'export default ({ click, i18n }) => <div>{i18n.label}</div>\n'
    )

    plugin.create(info as unknown as ts.server.PluginCreateInfo)

    const snapshot = info.languageServiceHost.getScriptSnapshot!(viewPath)
    const text = snapshot!.getText(0, snapshot!.getLength())

    expect(text).toContain("import('nojoy/runtime').AsyncHandler<")
    expect(text).toContain("i18n: ReturnType<typeof import('./i18n').default>")
  })
})
