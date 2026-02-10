import { Provider as SkinProvider } from '@everything-dies/flesh-cage'
import { createElement, useMemo, type ReactNode } from 'react'
import { IntlProvider } from 'react-intl'

import { type DataPlane } from '@/hooks/async-handler'

import { NojoyContext } from './context'

export interface NojoyProviderProps {
  clients: DataPlane['clients']
  services: DataPlane['services']
  locale?: string
  skin?: string
  children: ReactNode
}

const DEFAULT_LOCALE =
  typeof navigator !== 'undefined' ? navigator.language : 'en'

export function NojoyProvider({
  clients,
  services,
  locale = DEFAULT_LOCALE,
  skin,
  children,
}: NojoyProviderProps) {
  const value = useMemo<DataPlane>(
    () => ({ clients, services }),
    [clients, services]
  )
  let content: ReactNode = createElement(
    NojoyContext.Provider,
    { value },
    children
  )
  if (skin) {
    content = createElement(SkinProvider, { skin, children: content })
  }
  return createElement(IntlProvider, { locale, messages: {} }, content)
}
