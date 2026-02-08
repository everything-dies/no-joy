import { describe, expect, it, vi } from 'vitest'

import { createServices } from '../../src/runtime/create-services'

describe('createServices', () => {
  it('calls each factory with data plane and stores inner function', () => {
    const inner = vi.fn()
    const factory = vi.fn(() => inner)
    const clients = { rest: { get: vi.fn() } }

    const services = createServices(
      { users: { getById: factory } },
      clients
    )

    expect(factory).toHaveBeenCalledTimes(1)
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({ clients, services })
    )
    expect((services as Record<string, Record<string, unknown>>)['users']?.['getById']).toBe(inner)
  })

  it('supports multiple namespaces with multiple methods', () => {
    const usersGetById = vi.fn()
    const usersCreate = vi.fn()
    const postsGetAll = vi.fn()

    const services = createServices(
      {
        users: {
          getById: () => usersGetById,
          create: () => usersCreate,
        },
        posts: {
          getAll: () => postsGetAll,
        },
      },
      {}
    )

    const s = services as Record<string, Record<string, unknown>>
    expect(s['users']?.['getById']).toBe(usersGetById)
    expect(s['users']?.['create']).toBe(usersCreate)
    expect(s['posts']?.['getAll']).toBe(postsGetAll)
  })

  it('allows cross-service references in execution scope', () => {
    const services = createServices(
      {
        users: {
          getById: () => (id: string) => ({ id, name: 'Alice' }),
        },
        posts: {
          getByUser: ({ services: svc }) => (userId: string) => {
            const s = svc as Record<string, Record<string, (id: string) => unknown>>
            const user = s['users']?.['getById']?.(userId)
            return { user, posts: [] }
          },
        },
      },
      {}
    )

    const s = services as Record<string, Record<string, (...args: unknown[]) => unknown>>
    const result = s['posts']?.['getByUser']?.('123')
    expect(result).toEqual({
      user: { id: '123', name: 'Alice' },
      posts: [],
    })
  })

  it('returns empty object for empty modules', () => {
    const services = createServices({}, {})
    expect(Object.keys(services)).toHaveLength(0)
  })
})
