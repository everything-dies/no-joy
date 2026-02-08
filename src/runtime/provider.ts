import { createElement, useMemo } from 'react'

import { type DataPlane } from '../hooks/async-handler'

import { NojoyContext } from './context'

import { type ReactNode } from 'react'

export interface NojoyProviderProps {
  clients: DataPlane['clients']
  services: DataPlane['services']
  children: ReactNode
}

export function NojoyProvider({
  clients,
  services,
  children,
}: NojoyProviderProps) {
  const value = useMemo<DataPlane>(
    () => ({ clients, services }),
    [clients, services]
  )
  return createElement(NojoyContext.Provider, { value }, children)
}
