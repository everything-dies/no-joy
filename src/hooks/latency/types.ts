export interface LatencyContext {
  data: unknown
  error: unknown
}

export type LatencyEvent =
  | { type: 'WATCH' }
  | { type: 'RESOLVE'; data: unknown }
  | { type: 'REJECT'; error: unknown }
  | { type: 'ABORT' }
  | { type: 'RESET' }

export type LatencyStateValue =
  | 'idle'
  | 'pending'
  | 'fulfilled'
  | 'rejected'

export type LatencyStatus = 'idle' | 'loading' | 'success' | 'error'

export interface UseLatencyReturn<TData, TError> {
  abort: () => void
  data: TData | undefined
  error: TError | undefined
  pending: boolean
  status: LatencyStatus
  watch: (promise: Promise<TData>) => void
}
