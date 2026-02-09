import { type LatencyStatus } from '@/hooks/latency'

export interface AsyncError {
  reason: unknown
  retry: () => void
}

export interface AsyncHandler<
  TArgs extends unknown[] = unknown[],
  TData = unknown,
> {
  (...args: TArgs): void
  loading: boolean
  error: AsyncError | undefined
  data: TData | undefined
  status: LatencyStatus
  abort: () => void
}

export interface DataPlane {
  clients: Record<string, unknown>
  services: Record<string, unknown>
}

export type AsyncFactory<
  TArgs extends unknown[] = unknown[],
  TData = unknown,
> = (dataPlane: DataPlane) => (...args: TArgs) => Promise<TData>
