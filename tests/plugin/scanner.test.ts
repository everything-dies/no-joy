import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { scan } from '../../src/plugin/scanner'

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

    it('returns empty array when components dir missing', () => {
      const result = scan(EMPTY)
      expect(result.components).toEqual([])
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
