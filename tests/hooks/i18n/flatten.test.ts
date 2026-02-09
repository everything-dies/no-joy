import { describe, expect, it } from 'vitest'

import { flatten, unflatten } from '../../../src/hooks/i18n/flatten'

describe('flatten', () => {
  it('flattens a nested object with / separator', () => {
    const result = flatten({
      error: {
        title: 'Something went wrong',
        actions: {
          retry: 'Retry',
        },
      },
    })

    expect(result).toEqual({
      'error/title': 'Something went wrong',
      'error/actions/retry': 'Retry',
    })
  })

  it('keeps top-level string values as-is', () => {
    const result = flatten({ content: 'Hello', label: 'Click' })

    expect(result).toEqual({ content: 'Hello', label: 'Click' })
  })

  it('handles deeply nested objects', () => {
    const result = flatten({ a: { b: { c: { d: 'deep' } } } })

    expect(result).toEqual({ 'a/b/c/d': 'deep' })
  })

  it('returns empty object for empty input', () => {
    expect(flatten({})).toEqual({})
  })

  it('handles mixed nesting levels', () => {
    const result = flatten({
      title: 'Hello',
      error: {
        message: 'Failed',
      },
    })

    expect(result).toEqual({
      title: 'Hello',
      'error/message': 'Failed',
    })
  })
})

describe('unflatten', () => {
  it('unflattens path-based keys to nested object', () => {
    const result = unflatten({
      'error/title': 'Something went wrong',
      'error/actions/retry': 'Retry',
    })

    expect(result).toEqual({
      error: {
        title: 'Something went wrong',
        actions: {
          retry: 'Retry',
        },
      },
    })
  })

  it('keeps top-level keys as-is', () => {
    const result = unflatten({ content: 'Hello', label: 'Click' })

    expect(result).toEqual({ content: 'Hello', label: 'Click' })
  })

  it('returns empty object for empty input', () => {
    expect(unflatten({})).toEqual({})
  })

  it('is the inverse of flatten', () => {
    const original = {
      title: 'Hello',
      error: {
        message: 'Failed',
        actions: {
          retry: 'Try again',
        },
      },
    }

    expect(unflatten(flatten(original))).toEqual(original)
  })
})
