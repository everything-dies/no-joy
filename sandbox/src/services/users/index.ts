export interface User {
  id: number
  name: string
  email: string
  username: string
}

export const getAll =
  ({ clients }: { clients: { rest: { get<T>(path: string): Promise<T> } } }) =>
  (): Promise<User[]> =>
    clients.rest.get<User[]>('/users')

export const getById =
  ({ clients }: { clients: { rest: { get<T>(path: string): Promise<T> } } }) =>
  (id: number): Promise<User> =>
    clients.rest.get<User>(`/users/${id}`)
