import { createContext, useContext } from 'react'

import { type DataPlane } from '../hooks/async-handler'

const NojoyContext = createContext<DataPlane | undefined>(undefined)

export function useNojoy(): DataPlane {
  const context = useContext(NojoyContext)
  if (context === undefined) {
    throw new Error('useNojoy must be used within a NojoyProvider')
  }
  return context
}

export { NojoyContext }
