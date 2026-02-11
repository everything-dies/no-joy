import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { resolveRoutePath, scan } from '../../src/plugin/scanner'

const FIXTURES = resolve(__dirname, 'fixtures')
const BASIC = resolve(FIXTURES, 'basic')
const EMPTY = resolve(FIXTURES, 'empty')

describe('scan', () => {
  describe('clients', () => {
    it('discovers client directories with index files', () => {
      const result = scan(BASIC)

      expect(result.clients).toHaveLength(2)

      const names = result.clients.map((c) => c.name).sort()
      expect(names).toEqual(['graphql', 'rest'])
    })

    it('includes entry paths', () => {
      const result = scan(BASIC)
      const rest = result.clients.find((c) => c.name === 'rest')

      expect(rest?.entryPath).toContain('clients/rest/index.ts')
    })

    it('returns empty array when clients dir missing', () => {
      const result = scan(EMPTY)
      expect(result.clients).toEqual([])
    })
  })

  describe('services', () => {
    it('discovers service namespaces', () => {
      const result = scan(BASIC)

      expect(result.services).toHaveLength(2)

      const namespaces = result.services.map((s) => s.namespace).sort()
      expect(namespaces).toEqual(['posts', 'users'])
    })

    it('includes entry paths', () => {
      const result = scan(BASIC)
      const users = result.services.find((s) => s.namespace === 'users')

      expect(users?.entryPath).toContain('services/users/index.ts')
    })

    it('returns empty array when services dir missing', () => {
      const result = scan(EMPTY)
      expect(result.services).toEqual([])
    })
  })

  describe('components', () => {
    it('discovers components with concern files', () => {
      const result = scan(BASIC)

      const names = result.components.map((c) => c.name).sort()
      // 'plain' has no concern files, should be excluded
      expect(names).toEqual([
        'button',
        'form',
        'full',
        'widgets/card',
        'with-error',
        'with-error-dir',
        'with-i18n',
        'with-placeholder',
        'with-routes',
        'with-skins',
      ])
    })

    it('excludes components without concern files', () => {
      const result = scan(BASIC)
      const plain = result.components.find((c) => c.name === 'plain')
      expect(plain).toBeUndefined()
    })

    it('includes view path and concern paths', () => {
      const result = scan(BASIC)
      const button = result.components.find((c) => c.name === 'button')

      expect(button?.viewPath).toContain('components/button/index.tsx')
      expect(button?.concerns['async']).toContain('components/button/async.ts')
    })

    it('discovers nested components', () => {
      const result = scan(BASIC)
      const card = result.components.find((c) => c.name === 'widgets/card')

      expect(card).toBeDefined()
      expect(card?.viewPath).toContain('components/widgets/card/index.tsx')
      expect(card?.concerns['async']).toContain(
        'components/widgets/card/async.ts'
      )
    })

    it('discovers placeholder concern', () => {
      const result = scan(BASIC)
      const comp = result.components.find((c) => c.name === 'with-placeholder')

      expect(comp).toBeDefined()
      expect(comp?.concerns['placeholder']).toContain(
        'components/with-placeholder/placeholder.tsx'
      )
    })

    it('discovers error concern as file', () => {
      const result = scan(BASIC)
      const comp = result.components.find((c) => c.name === 'with-error')

      expect(comp).toBeDefined()
      expect(comp?.concerns['error']).toContain(
        'components/with-error/error.tsx'
      )
    })

    it('discovers error concern as directory with index', () => {
      const result = scan(BASIC)
      const comp = result.components.find((c) => c.name === 'with-error-dir')

      expect(comp).toBeDefined()
      expect(comp?.concerns['error']).toContain(
        'components/with-error-dir/error/index.tsx'
      )
    })

    it('discovers skins directory', () => {
      const result = scan(BASIC)
      const comp = result.components.find((c) => c.name === 'with-skins')

      expect(comp).toBeDefined()
      expect(comp?.skins).toBeDefined()
      expect(Object.keys(comp!.skins).sort()).toEqual(['brutalist', 'material'])
      expect(comp!.skins['material']).toContain(
        'components/with-skins/skins/material.ts'
      )
      expect(comp!.skins['brutalist']).toContain(
        'components/with-skins/skins/brutalist.ts'
      )
    })

    it('registers component with only skins as framework-managed', () => {
      const result = scan(BASIC)
      const comp = result.components.find((c) => c.name === 'with-skins')

      expect(comp).toBeDefined()
      expect(Object.keys(comp!.concerns)).toHaveLength(0)
      expect(Object.keys(comp!.skins)).toHaveLength(2)
    })

    it('discovers i18n concern', () => {
      const result = scan(BASIC)
      const comp = result.components.find((c) => c.name === 'with-i18n')

      expect(comp).toBeDefined()
      expect(comp?.concerns['i18n']).toContain('components/with-i18n/i18n.ts')
    })

    it('discovers all concerns on full component', () => {
      const result = scan(BASIC)
      const comp = result.components.find((c) => c.name === 'full')

      expect(comp).toBeDefined()
      expect(comp?.concerns['async']).toContain('components/full/async.ts')
      expect(comp?.concerns['placeholder']).toContain(
        'components/full/placeholder.tsx'
      )
      expect(comp?.concerns['error']).toContain('components/full/error.tsx')
    })

    it('discovers routes directory and builds route tree', () => {
      const result = scan(BASIC)
      const comp = result.components.find((c) => c.name === 'with-routes')

      expect(comp).toBeDefined()
      expect(comp!.routes).toHaveLength(3)

      const segments = comp!.routes.map((r) => r.segment).sort()
      expect(segments).toEqual(['...', 'about', 'posts'])
    })

    it('resolves nested route structure', () => {
      const result = scan(BASIC)
      const comp = result.components.find((c) => c.name === 'with-routes')!
      const posts = comp.routes.find((r) => r.segment === 'posts')

      expect(posts).toBeDefined()
      expect(posts!.children).toHaveLength(1)
      expect(posts!.children[0]!.segment).toBe('@id')
      expect(posts!.children[0]!.path).toBe(':id')
    })

    it('detects route async and meta files', () => {
      const result = scan(BASIC)
      const comp = result.components.find((c) => c.name === 'with-routes')!
      const posts = comp.routes.find((r) => r.segment === 'posts')

      expect(posts!.asyncPath).toContain('async.ts')
      expect(posts!.metaPath).toContain('meta.ts')
    })

    it('detects route view files', () => {
      const result = scan(BASIC)
      const comp = result.components.find((c) => c.name === 'with-routes')!
      const about = comp.routes.find((r) => r.segment === 'about')

      expect(about!.viewPath).toContain('index.tsx')
      expect(about!.asyncPath).toBeUndefined()
      expect(about!.metaPath).toBeUndefined()
    })

    it('resolves catch-all route', () => {
      const result = scan(BASIC)
      const comp = result.components.find((c) => c.name === 'with-routes')!
      const splat = comp.routes.find((r) => r.segment === '...')

      expect(splat).toBeDefined()
      expect(splat!.path).toBe('*')
    })

    it('registers component with only routes as framework-managed', () => {
      const result = scan(BASIC)
      const comp = result.components.find((c) => c.name === 'with-routes')

      expect(comp).toBeDefined()
      expect(Object.keys(comp!.concerns)).toHaveLength(0)
      expect(Object.keys(comp!.skins)).toHaveLength(0)
      expect(comp!.routes.length).toBeGreaterThan(0)
    })

    it('returns empty array when components dir missing', () => {
      const result = scan(EMPTY)
      expect(result.components).toEqual([])
    })
  })

  describe('resolveRoutePath', () => {
    it('resolves static segments', () => {
      expect(resolveRoutePath('about-us')).toBe('about-us')
    })

    it('resolves dynamic params', () => {
      expect(resolveRoutePath('@id')).toBe(':id')
    })

    it('resolves optional dynamic params', () => {
      expect(resolveRoutePath('@id?')).toBe(':id?')
    })

    it('resolves catch-all', () => {
      expect(resolveRoutePath('...')).toBe('*')
    })
  })

  describe('empty fixture', () => {
    it('returns empty arrays for all categories', () => {
      const result = scan(EMPTY)

      expect(result.clients).toEqual([])
      expect(result.services).toEqual([])
      expect(result.components).toEqual([])
    })
  })
})
