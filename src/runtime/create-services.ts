import { type DataPlane } from '../hooks/async-handler'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ServiceEntry = (dataPlane: any) => (...args: never[]) => unknown

export type ServiceModuleMap = Record<string, Record<string, ServiceEntry>>

export function createServices(
  modules: ServiceModuleMap,
  clients: DataPlane['clients']
): DataPlane['services'] {
  const registry: Record<string, Record<string, unknown>> = {}

  // Build services proxy — lazy resolution for cross-references
  const services: DataPlane['services'] = new Proxy(registry, {
    get(target, prop) {
      if (typeof prop === 'string') {
        return target[prop]
      }
      return undefined
    },
  })

  const dataPlane: DataPlane = { clients, services }

  // Initialize all service modules
  for (const [namespace, methods] of Object.entries(modules)) {
    const namespaceObj: Record<string, unknown> = {}
    for (const [methodName, factory] of Object.entries(methods)) {
      namespaceObj[methodName] = factory(dataPlane)
    }
    registry[namespace] = namespaceObj
  }

  return services
}
