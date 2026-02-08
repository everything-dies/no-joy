// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import { NojoyProvider, useNojoy } from '../../src/runtime'

import type { ReactNode } from 'react'

describe('useNojoy', () => {
  it('throws when used outside NojoyProvider', () => {
    expect(() => {
      renderHook(() => useNojoy())
    }).toThrow('useNojoy must be used within a NojoyProvider')
  })

  it('returns clients and services from provider', () => {
    const clients = { rest: { get: () => {} } }
    const services = { users: { getById: () => {} } }

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(NojoyProvider, { clients, services }, children)

    const { result } = renderHook(() => useNojoy(), { wrapper })

    expect(result.current.clients).toBe(clients)
    expect(result.current.services).toBe(services)
  })

  it('memoizes the context value for same inputs', () => {
    const clients = { rest: {} }
    const services = {}

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(NojoyProvider, { clients, services }, children)

    const { result, rerender } = renderHook(() => useNojoy(), { wrapper })

    const first = result.current

    rerender()

    expect(result.current).toBe(first)
  })
})
