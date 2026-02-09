import { createElement, useMemo, type ReactNode } from 'react'
import { IntlProvider } from 'react-intl'

import { type DataPlane } from '@/hooks/async-handler'

import { NojoyContext } from './context'

export interface NojoyProviderProps {
  clients: DataPlane['clients']
  services: DataPlane['services']
  locale?: string
  children: ReactNode
}

const DEFAULT_LOCALE =
  typeof navigator !== 'undefined' ? navigator.language : 'en'

export function NojoyProvider({
  clients,
  services,
  locale = DEFAULT_LOCALE,
  children,
}: NojoyProviderProps) {
  const value = useMemo<DataPlane>(
    () => ({ clients, services }),
    [clients, services]
  )
  return createElement(
    IntlProvider,
    { locale, messages: {} },
    createElement(NojoyContext.Provider, { value }, children)
  )
}
