// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useAsyncHandler } from '../../../src/hooks/async-handler'
import type { DataPlane } from '../../../src/hooks/async-handler'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const mockDataPlane: DataPlane = {
  clients: { rest: {} },
  services: {},
}

describe('useAsyncHandler', () => {
  it('returns a callable with initial idle state', () => {
    const factory = () => () => Promise.resolve('ok')
    const { result } = renderHook(() => useAsyncHandler(factory, mockDataPlane))

    expect(typeof result.current).toBe('function')
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBeUndefined()
    expect(result.current.error).toBeUndefined()
    expect(result.current.status).toBe('idle')
  })

  it('passes data plane to the factory', () => {
    const factory = vi.fn(() => () => Promise.resolve('ok'))
    renderHook(() => useAsyncHandler(factory, mockDataPlane))

    expect(factory).toHaveBeenCalledWith(mockDataPlane)
  })

  it('calls the inner function with provided args', () => {
    const { promise } = deferred<string>()
    const inner = vi.fn(() => promise)
    const factory = () => inner
    const { result } = renderHook(() =>
      useAsyncHandler<[string, number], string>(factory, mockDataPlane)
    )

    act(() => {
      result.current('hello', 42)
    })

    expect(inner).toHaveBeenCalledWith('hello', 42)
  })

  it('transitions to loading when called', () => {
    const { promise } = deferred<string>()
    const factory = () => () => promise
    const { result } = renderHook(() =>
      useAsyncHandler<[], string>(factory, mockDataPlane)
    )

    act(() => {
      result.current()
    })

    expect(result.current.loading).toBe(true)
    expect(result.current.status).toBe('loading')
  })

  it('sets data on success', async () => {
    const { promise, resolve } = deferred<string>()
    const factory = () => () => promise
    const { result } = renderHook(() =>
      useAsyncHandler<[], string>(factory, mockDataPlane)
    )

    act(() => {
      result.current()
    })

    await act(async () => {
      resolve('hello')
    })

    await waitFor(() => {
      expect(result.current.data).toBe('hello')
      expect(result.current.loading).toBe(false)
      expect(result.current.status).toBe('success')
    })
  })

  it('sets error with reason and retry on failure', async () => {
    const err = new Error('boom')
    const { promise, reject } = deferred<string>()
    const factory = () => () => promise
    const { result } = renderHook(() =>
      useAsyncHandler<[], string>(factory, mockDataPlane)
    )

    act(() => {
      result.current()
    })

    await act(async () => {
      reject(err)
    })

    await waitFor(() => {
      expect(result.current.error).toBeDefined()
      expect(result.current.error?.reason).toBe(err)
      expect(typeof result.current.error?.retry).toBe('function')
      expect(result.current.status).toBe('error')
    })
  })

  it('retry re-invokes with last args', async () => {
    let callCount = 0
    const inner = vi.fn((_msg: string) => {
      callCount++
      if (callCount === 1) return Promise.reject(new Error('fail'))
      return Promise.resolve('ok')
    })
    const factory = () => inner
    const { result } = renderHook(() =>
      useAsyncHandler<[string], string>(factory, mockDataPlane)
    )

    act(() => {
      result.current('hello')
    })

    await waitFor(() => {
      expect(result.current.error).toBeDefined()
    })

    act(() => {
      result.current.error?.retry()
    })

    await waitFor(() => {
      expect(result.current.data).toBe('ok')
      expect(result.current.status).toBe('success')
    })

    expect(inner).toHaveBeenCalledTimes(2)
    expect(inner).toHaveBeenLastCalledWith('hello')
  })

  it('abort cancels pending state', () => {
    const { promise } = deferred<string>()
    const factory = () => () => promise
    const { result } = renderHook(() =>
      useAsyncHandler<[], string>(factory, mockDataPlane)
    )

    act(() => {
      result.current()
    })

    expect(result.current.loading).toBe(true)

    act(() => {
      result.current.abort()
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.status).toBe('idle')
  })

  it('superseding call invalidates previous', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    let callCount = 0
    const factory = () => () => {
      callCount++
      return callCount === 1 ? first.promise : second.promise
    }
    const { result } = renderHook(() =>
      useAsyncHandler<[], string>(factory, mockDataPlane)
    )

    act(() => {
      result.current()
    })

    act(() => {
      result.current()
    })

    // Resolve first (stale) — should be ignored
    await act(async () => {
      first.resolve('stale')
    })

    expect(result.current.loading).toBe(true)

    await act(async () => {
      second.resolve('fresh')
    })

    await waitFor(() => {
      expect(result.current.data).toBe('fresh')
      expect(result.current.loading).toBe(false)
    })
  })

  it('memoizes the factory call', () => {
    const inner = () => Promise.resolve('ok')
    const factory = vi.fn(() => inner)
    const { rerender } = renderHook(() =>
      useAsyncHandler(factory, mockDataPlane)
    )

    rerender()
    rerender()

    // Factory should only be called once (memoized)
    expect(factory).toHaveBeenCalledTimes(1)
  })
})
