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

export interface UseLatencyReturn<TData, TError> {
  abort: () => void
  error: TError | undefined
  pending: boolean
  watch: (promise: Promise<TData>) => void
}
