export type ClientFactory<T = unknown> = () => T

export type ClientFactoryMap = Record<string, ClientFactory>

export type ClientRegistry<T extends ClientFactoryMap> = {
  [K in keyof T]: ReturnType<T[K]>
}

export function createClients<T extends ClientFactoryMap>(
  factories: T
): ClientRegistry<T> {
  const clients = {} as ClientRegistry<T>

  for (const key of Object.keys(factories)) {
    const k = key as keyof T
    clients[k] = factories[k]!() as ClientRegistry<T>[typeof k]
  }

  return clients
}
