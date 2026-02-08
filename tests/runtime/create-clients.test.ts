import { describe, expect, it, vi } from 'vitest'

import { createClients } from '../../src/runtime/create-clients'

describe('createClients', () => {
  it('calls each factory and returns the results', () => {
    const restInstance = { get: vi.fn() }
    const wsInstance = { on: vi.fn() }

    const clients = createClients({
      rest: () => restInstance,
      websocket: () => wsInstance,
    })

    expect(clients.rest).toBe(restInstance)
    expect(clients.websocket).toBe(wsInstance)
  })

  it('calls each factory exactly once', () => {
    const restFactory = vi.fn(() => ({ get: vi.fn() }))
    const wsFactory = vi.fn(() => ({ on: vi.fn() }))

    createClients({
      rest: restFactory,
      websocket: wsFactory,
    })

    expect(restFactory).toHaveBeenCalledTimes(1)
    expect(wsFactory).toHaveBeenCalledTimes(1)
  })

  it('returns empty object for empty factories', () => {
    const clients = createClients({})
    expect(clients).toEqual({})
  })
})
