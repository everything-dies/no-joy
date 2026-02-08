import { useMachine } from '@xstate/react'
import { useCallback, useEffect, useRef } from 'react'

import { latencyMachine } from './machine'
import { createStaleGuard, type StaleGuard } from './stale-guard'
import { type LatencyStatus, type UseLatencyReturn } from './types'

export function useLatency<
  TData = unknown,
  TError = unknown,
>(): UseLatencyReturn<TData, TError> {
  const [snapshot, send] = useMachine(latencyMachine)
  const guardRef = useRef<StaleGuard | undefined>(undefined)

  // Cleanup on unmount: invalidate any in-flight guard
  useEffect(() => {
    return () => {
      guardRef.current?.invalidate()
    }
  }, [])

  const watch = useCallback(
    (promise: Promise<TData>) => {
      // Invalidate any previous in-flight promise
      guardRef.current?.invalidate()

      // Create a new stale guard for this invocation
      const guard = createStaleGuard()
      guardRef.current = guard

      // Transition to pending
      send({ type: 'WATCH' })

      // Track the promise
      guard
        .wrap(promise)
        .then((data) => {
          send({ type: 'RESOLVE', data })
        })
        .catch((error: unknown) => {
          send({ type: 'REJECT', error })
        })
    },
    [send]
  )

  const abort = useCallback(() => {
    guardRef.current?.invalidate()
    send({ type: 'ABORT' })
  }, [send])

  const status: LatencyStatus = snapshot.matches('pending')
    ? 'loading'
    : snapshot.matches('fulfilled')
      ? 'success'
      : snapshot.matches('rejected')
        ? 'error'
        : 'idle'

  return {
    abort,
    data: snapshot.context.data as TData | undefined,
    error: snapshot.context.error as TError | undefined,
    pending: status === 'loading',
    status,
    watch,
  }
}
