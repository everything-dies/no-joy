import { describe, expect, it } from 'vitest'

import { createStaleGuard } from '../../../src/hooks/latency/stale-guard'

async function settlesWithin(
  promise: Promise<unknown>,
  ms: number
): Promise<boolean> {
  const timeout = Symbol('timeout')
  const result = await Promise.race([
    promise.then(
      () => true,
      () => true
    ),
    new Promise<symbol>((resolve) => setTimeout(() => resolve(timeout), ms)),
  ])
  return result !== timeout
}

describe('createStaleGuard', () => {
  it('passes through resolved value when valid', async () => {
    const guard = createStaleGuard()
    const result = await guard.wrap(Promise.resolve(42))
    expect(result).toBe(42)
  })

  it('passes through rejection when valid', async () => {
    const guard = createStaleGuard()
    const error = new Error('boom')
    await expect(guard.wrap(Promise.reject(error))).rejects.toThrow('boom')
  })

  it('never settles resolved promise when invalidated', async () => {
    const guard = createStaleGuard()
    guard.invalidate()
    const settled = await settlesWithin(guard.wrap(Promise.resolve(42)), 50)
    expect(settled).toBe(false)
  })

  it('never settles rejected promise when invalidated', async () => {
    const guard = createStaleGuard()
    guard.invalidate()
    const settled = await settlesWithin(
      guard.wrap(Promise.reject(new Error('boom'))),
      50
    )
    expect(settled).toBe(false)
  })

  it('handles multiple wraps on the same guard independently', async () => {
    const guard = createStaleGuard()
    const [a, b] = await Promise.all([
      guard.wrap(Promise.resolve('a')),
      guard.wrap(Promise.resolve('b')),
    ])
    expect(a).toBe('a')
    expect(b).toBe('b')
  })

  it('invalidation only affects the specific guard instance', async () => {
    const guard1 = createStaleGuard()
    const guard2 = createStaleGuard()

    guard1.invalidate()

    const settled1 = await settlesWithin(guard1.wrap(Promise.resolve(1)), 50)
    const result2 = await guard2.wrap(Promise.resolve(2))

    expect(settled1).toBe(false)
    expect(result2).toBe(2)
  })
})
