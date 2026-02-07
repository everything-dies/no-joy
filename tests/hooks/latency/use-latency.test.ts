// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useLatency } from '../../../src/hooks/latency'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useLatency', () => {
  it('returns initial state with pending false and error undefined', () => {
    const { result } = renderHook(() => useLatency())

    expect(result.current.pending).toBe(false)
    expect(result.current.error).toBeUndefined()
  })

  it('sets pending to true when watch is called', () => {
    const { result } = renderHook(() => useLatency<string>())
    const { promise } = deferred<string>()

    act(() => {
      result.current.watch(promise)
    })

    expect(result.current.pending).toBe(true)
  })

  it('sets pending to false when promise resolves', async () => {
    const { result } = renderHook(() => useLatency<string>())
    const { promise, resolve } = deferred<string>()

    act(() => {
      result.current.watch(promise)
    })

    expect(result.current.pending).toBe(true)

    await act(async () => {
      resolve('done')
    })

    await waitFor(() => {
      expect(result.current.pending).toBe(false)
    })
  })

  it('sets error when promise rejects', async () => {
    const { result } = renderHook(() => useLatency<string, Error>())
    const { promise, reject } = deferred<string>()

    act(() => {
      result.current.watch(promise)
    })

    await act(async () => {
      reject(new Error('fail'))
    })

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error)
      expect(result.current.error?.message).toBe('fail')
      expect(result.current.pending).toBe(false)
    })
  })

  it('superseding watch invalidates previous promise', async () => {
    const { result } = renderHook(() => useLatency<string>())
    const first = deferred<string>()
    const second = deferred<string>()

    act(() => {
      result.current.watch(first.promise)
    })

    act(() => {
      result.current.watch(second.promise)
    })

    // Resolve the first (stale) promise — should be ignored
    await act(async () => {
      first.resolve('stale')
    })

    // Still pending because second hasn't resolved
    expect(result.current.pending).toBe(true)

    await act(async () => {
      second.resolve('fresh')
    })

    await waitFor(() => {
      expect(result.current.pending).toBe(false)
    })
  })

  it('abort cancels pending state', () => {
    const { result } = renderHook(() => useLatency<string>())
    const { promise } = deferred<string>()

    act(() => {
      result.current.watch(promise)
    })

    expect(result.current.pending).toBe(true)

    act(() => {
      result.current.abort()
    })

    expect(result.current.pending).toBe(false)
  })

  it('abort prevents stale promise from updating state', async () => {
    const { result } = renderHook(() => useLatency<string, Error>())
    const { promise, reject } = deferred<string>()

    act(() => {
      result.current.watch(promise)
    })

    act(() => {
      result.current.abort()
    })

    // Reject after abort — should not update state
    await act(async () => {
      reject(new Error('too late'))
    })

    // Wait a tick to ensure the rejection would have propagated
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(result.current.error).toBeUndefined()
    expect(result.current.pending).toBe(false)
  })

  it('cleans up on unmount preventing stale updates', async () => {
    const { result, unmount } = renderHook(() => useLatency<string>())
    const { promise, resolve } = deferred<string>()

    act(() => {
      result.current.watch(promise)
    })

    unmount()

    // Resolve after unmount — should not throw
    await act(async () => {
      resolve('too late')
    })
  })

  it('can re-watch after fulfilled', async () => {
    const { result } = renderHook(() => useLatency<string>())
    const first = deferred<string>()

    act(() => {
      result.current.watch(first.promise)
    })

    await act(async () => {
      first.resolve('first')
    })

    await waitFor(() => {
      expect(result.current.pending).toBe(false)
    })

    const second = deferred<string>()

    act(() => {
      result.current.watch(second.promise)
    })

    expect(result.current.pending).toBe(true)

    await act(async () => {
      second.resolve('second')
    })

    await waitFor(() => {
      expect(result.current.pending).toBe(false)
    })
  })

  it('can re-watch after rejected', async () => {
    const { result } = renderHook(() => useLatency<string, Error>())
    const first = deferred<string>()

    act(() => {
      result.current.watch(first.promise)
    })

    await act(async () => {
      first.reject(new Error('fail'))
    })

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error)
    })

    const second = deferred<string>()

    act(() => {
      result.current.watch(second.promise)
    })

    expect(result.current.pending).toBe(true)
    // Error should be cleared when going to pending (machine clears on WATCH entry? No, it doesn't.
    // But pending is true, which is the key assertion.

    await act(async () => {
      second.resolve('recovered')
    })

    await waitFor(() => {
      expect(result.current.pending).toBe(false)
      expect(result.current.error).toBeUndefined()
    })
  })

  it('watch and abort are referentially stable', () => {
    const { result, rerender } = renderHook(() => useLatency())

    const { watch: watch1, abort: abort1 } = result.current

    rerender()

    expect(result.current.watch).toBe(watch1)
    expect(result.current.abort).toBe(abort1)
  })
})
