import { useCallback, useMemo, useRef } from 'react'

import { useLatency } from '../latency'

import { type AsyncFactory, type AsyncHandler, type DataPlane } from './types'

export function useAsyncHandler<
  TArgs extends unknown[] = unknown[],
  TData = unknown,
>(
  factory: AsyncFactory<TArgs, TData>,
  dataPlane: DataPlane
): AsyncHandler<TArgs, TData> {
  const { abort, data, error, pending, status, watch } = useLatency<TData>()
  const lastArgsRef = useRef<TArgs | undefined>(undefined)

  const handler = useMemo(() => factory(dataPlane), [factory, dataPlane])

  const invoke = useCallback(
    (...args: TArgs) => {
      lastArgsRef.current = args
      watch(handler(...args))
    },
    [handler, watch]
  )

  const retry = useCallback(() => {
    if (lastArgsRef.current !== undefined) {
      invoke(...lastArgsRef.current)
    }
  }, [invoke])

  return Object.assign(invoke, {
    loading: pending,
    error: error != null ? { reason: error, retry } : undefined,
    data,
    status,
    abort,
  })
}
