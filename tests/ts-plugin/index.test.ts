import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

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

describe('nojoy ts-plugin reactivity', () => {
  const plugin = pluginFactory({ typescript: ts })
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'nojoy-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true })
  })

  it('injects types when concern file is added after plugin init', () => {
    const viewPath = join(tempDir, 'index.tsx')
    const viewContent =
      'export default ({ click }) => <button onClick={click}>Go</button>\n'
    writeFileSync(viewPath, viewContent)

    const info = createMockInfo()
    info.files.set(viewPath, viewContent)
    plugin.create(info as unknown as ts.server.PluginCreateInfo)

    // Before: no concern file — no injection
    const snapshotBefore = info.languageServiceHost.getScriptSnapshot!(viewPath)
    const textBefore = snapshotBefore!.getText(0, snapshotBefore!.getLength())
    expect(textBefore).toBe(viewContent)

    // Add async.ts concern file
    writeFileSync(
      join(tempDir, 'async.ts'),
      'export const click = () => () => Promise.resolve()\n'
    )

    // After: concern exists — injection happens
    const snapshotAfter = info.languageServiceHost.getScriptSnapshot!(viewPath)
    const textAfter = snapshotAfter!.getText(0, snapshotAfter!.getLength())
    expect(textAfter).toContain("import('nojoy/runtime').AsyncHandler<")
  })

  it('removes injected types when concern file is deleted', () => {
    const viewPath = join(tempDir, 'index.tsx')
    const asyncPath = join(tempDir, 'async.ts')
    const viewContent =
      'export default ({ click }) => <button onClick={click}>Go</button>\n'
    writeFileSync(viewPath, viewContent)
    writeFileSync(
      asyncPath,
      'export const click = () => () => Promise.resolve()\n'
    )

    const info = createMockInfo()
    info.files.set(viewPath, viewContent)
    plugin.create(info as unknown as ts.server.PluginCreateInfo)

    // Before: concern exists — injection happens
    const snapshotBefore = info.languageServiceHost.getScriptSnapshot!(viewPath)
    const textBefore = snapshotBefore!.getText(0, snapshotBefore!.getLength())
    expect(textBefore).toContain("import('nojoy/runtime').AsyncHandler<")

    // Remove concern file
    unlinkSync(asyncPath)

    // After: no concern — injection removed
    const snapshotAfter = info.languageServiceHost.getScriptSnapshot!(viewPath)
    const textAfter = snapshotAfter!.getText(0, snapshotAfter!.getLength())
    expect(textAfter).toBe(viewContent)
  })

  it('version changes when concern file is added', () => {
    const viewPath = join(tempDir, 'index.tsx')
    writeFileSync(
      viewPath,
      'export default ({ click }) => <button>Go</button>\n'
    )

    const info = createMockInfo()
    info.files.set(
      viewPath,
      'export default ({ click }) => <button>Go</button>\n'
    )
    plugin.create(info as unknown as ts.server.PluginCreateInfo)

    const versionBefore = info.languageServiceHost.getScriptVersion!(viewPath)

    // Add concern file
    writeFileSync(
      join(tempDir, 'async.ts'),
      'export const click = () => () => Promise.resolve()\n'
    )

    const versionAfter = info.languageServiceHost.getScriptVersion!(viewPath)

    expect(versionAfter).not.toBe(versionBefore)
  })

  it('version changes when concern file is removed', () => {
    const viewPath = join(tempDir, 'index.tsx')
    const asyncPath = join(tempDir, 'async.ts')
    writeFileSync(
      viewPath,
      'export default ({ click }) => <button>Go</button>\n'
    )
    writeFileSync(
      asyncPath,
      'export const click = () => () => Promise.resolve()\n'
    )

    const info = createMockInfo()
    info.files.set(
      viewPath,
      'export default ({ click }) => <button>Go</button>\n'
    )
    plugin.create(info as unknown as ts.server.PluginCreateInfo)

    const versionBefore = info.languageServiceHost.getScriptVersion!(viewPath)

    // Remove concern file
    unlinkSync(asyncPath)

    const versionAfter = info.languageServiceHost.getScriptVersion!(viewPath)

    expect(versionAfter).not.toBe(versionBefore)
  })
})
