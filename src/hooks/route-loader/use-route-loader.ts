import { useEffect } from 'react'
import { useParams } from 'react-router'

import { useAsyncHandler } from '@/hooks/async-handler'
import {
  type AsyncFactory,
  type AsyncHandler,
  type DataPlane,
} from '@/hooks/async-handler/types'

type RouteParams = Record<string, string | undefined>

export function useRouteLoader<TData = unknown>(
  factory: AsyncFactory<[RouteParams], TData>,
  dataPlane: DataPlane
): AsyncHandler<[RouteParams], TData> {
  const params = useParams()
  const handler = useAsyncHandler(factory, dataPlane)
  const serialized = JSON.stringify(params)

  useEffect(() => {
    handler(params)
  }, [serialized])

  return handler
}
