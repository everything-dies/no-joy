import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'

import { nojoyPlugin } from '../../src/plugin/vite-plugin'

import type { Plugin, ResolvedConfig } from 'vite'

function createTmpSrcDir(): string {
  const dir = join(tmpdir(), `nojoy-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(join(dir, 'src', 'components'), { recursive: true })
  mkdirSync(join(dir, 'src', 'services'), { recursive: true })
  mkdirSync(join(dir, 'src', 'clients'), { recursive: true })
  return dir
}

function addComponent(root: string, name: string, concerns: string[] = []) {
  const dir = join(root, 'src', 'components', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.tsx'), 'export default () => null\n')
  for (const concern of concerns) {
    writeFileSync(
      join(dir, `${concern}.ts`),
      'export const handler = () => () => Promise.resolve()\n'
    )
  }
}

function initPlugin(plugin: Plugin, root: string) {
  const fakeConfig = { root } as ResolvedConfig
  ;(plugin.configResolved as (config: ResolvedConfig) => void)(fakeConfig)
}

describe('nojoyPlugin', () => {
  let root: string

  beforeEach(() => {
    root = createTmpSrcDir()
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  describe('configResolved', () => {
    it('scans components on startup', () => {
      addComponent(root, 'button', ['async'])
      addComponent(root, 'plain')

      const plugin = nojoyPlugin()
      initPlugin(plugin, root)

      // button has async concern → resolves to virtual module
      const buttonDir = join(root, 'src', 'components', 'button')
      const resolveId = plugin.resolveId as (source: string, importer: string) => string | undefined
      const result = resolveId(
        './components/button',
        join(root, 'src', 'App.tsx')
      )
      expect(result).toBe(`\0nojoy:component:${buttonDir}`)

      // plain has no concerns → not resolved
      const plainResult = resolveId(
        './components/plain',
        join(root, 'src', 'App.tsx')
      )
      expect(plainResult).toBeUndefined()
    })
  })

  describe('resolveId', () => {
    it('resolves component directory imports to virtual modules', () => {
      addComponent(root, 'card', ['async'])

      const plugin = nojoyPlugin()
      initPlugin(plugin, root)

      const resolveId = plugin.resolveId as (source: string, importer: string) => string | undefined
      const result = resolveId(
        './components/card',
        join(root, 'src', 'App.tsx')
      )

      expect(result).toContain('\0nojoy:component:')
      expect(result).toContain('components/card')
    })

    it('ignores non-relative imports', () => {
      addComponent(root, 'card', ['async'])

      const plugin = nojoyPlugin()
      initPlugin(plugin, root)

      const resolveId = plugin.resolveId as (source: string, importer: string) => string | undefined
      const result = resolveId('react', join(root, 'src', 'App.tsx'))

      expect(result).toBeUndefined()
    })

    it('returns undefined when no importer', () => {
      const plugin = nojoyPlugin()
      initPlugin(plugin, root)

      const resolveId = plugin.resolveId as (source: string, importer: string | undefined) => string | undefined
      const result = resolveId('./components/button', undefined)

      expect(result).toBeUndefined()
    })
  })

  describe('load', () => {
    it('generates wrapper code for virtual modules', () => {
      addComponent(root, 'button', ['async'])

      const plugin = nojoyPlugin()
      initPlugin(plugin, root)

      const buttonDir = join(root, 'src', 'components', 'button')
      const load = plugin.load as (id: string) => string | undefined
      const code = load(`\0nojoy:component:${buttonDir}`)

      expect(code).toBeDefined()
      expect(code).toContain('NojoyButton')
      expect(code).toContain('lazy')
    })

    it('returns undefined for non-virtual modules', () => {
      const plugin = nojoyPlugin()
      initPlugin(plugin, root)

      const load = plugin.load as (id: string) => string | undefined
      expect(load('some-other-module')).toBeUndefined()
    })
  })

  describe('rescan on file changes', () => {
    it('picks up new component after rescan by re-initializing plugin', () => {
      addComponent(root, 'button', ['async'])

      const plugin = nojoyPlugin()
      initPlugin(plugin, root)

      // Initially only button resolves
      const resolveId = plugin.resolveId as (source: string, importer: string) => string | undefined
      const importer = join(root, 'src', 'App.tsx')

      expect(resolveId('./components/button', importer)).toBeDefined()
      expect(resolveId('./components/form', importer)).toBeUndefined()

      // Add a new component
      addComponent(root, 'form', ['async'])

      // Re-init simulates rescan (configResolved runs scan again)
      initPlugin(plugin, root)

      expect(resolveId('./components/form', importer)).toBeDefined()
    })

    it('removes component when concern files are deleted', () => {
      addComponent(root, 'button', ['async'])

      const plugin = nojoyPlugin()
      initPlugin(plugin, root)

      const resolveId = plugin.resolveId as (source: string, importer: string) => string | undefined
      const importer = join(root, 'src', 'App.tsx')

      expect(resolveId('./components/button', importer)).toBeDefined()

      // Remove the concern file — component becomes plain
      rmSync(join(root, 'src', 'components', 'button', 'async.ts'))

      // Re-init simulates rescan
      initPlugin(plugin, root)

      expect(resolveId('./components/button', importer)).toBeUndefined()
    })

    it('detects new concern files on existing component', () => {
      addComponent(root, 'card', ['async'])

      const plugin = nojoyPlugin()
      initPlugin(plugin, root)

      const cardDir = join(root, 'src', 'components', 'card')
      const load = plugin.load as (id: string) => string | undefined

      // Initially no placeholder
      let code = load(`\0nojoy:component:${cardDir}`)
      expect(code).not.toContain('Suspense')

      // Add placeholder concern
      writeFileSync(
        join(cardDir, 'placeholder.tsx'),
        'export default () => null\n'
      )

      // Re-init simulates rescan
      initPlugin(plugin, root)

      code = load(`\0nojoy:component:${cardDir}`)
      expect(code).toContain('Suspense')
      expect(code).toContain('Placeholder')
    })

    it('promotes plain component to framework component when concern added', () => {
      addComponent(root, 'widget') // no concerns

      const plugin = nojoyPlugin()
      initPlugin(plugin, root)

      const resolveId = plugin.resolveId as (source: string, importer: string) => string | undefined
      const importer = join(root, 'src', 'App.tsx')

      // Initially not recognized
      expect(resolveId('./components/widget', importer)).toBeUndefined()

      // Add a placeholder concern
      writeFileSync(
        join(root, 'src', 'components', 'widget', 'placeholder.tsx'),
        'export default () => null\n'
      )

      // Re-init simulates rescan
      initPlugin(plugin, root)

      // Now recognized as framework component
      expect(resolveId('./components/widget', importer)).toBeDefined()
    })
  })
})
