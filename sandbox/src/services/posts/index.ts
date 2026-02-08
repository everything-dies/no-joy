export interface Post {
  id: number
  userId: number
  title: string
  body: string
}

export const getAll =
  ({ clients }: { clients: { rest: { get<T>(path: string): Promise<T> } } }) =>
  (): Promise<Post[]> =>
    clients.rest.get<Post[]>('/posts')

export const getByUserId =
  ({ clients }: { clients: { rest: { get<T>(path: string): Promise<T> } } }) =>
  (userId: number): Promise<Post[]> =>
    clients.rest.get<Post[]>(`/posts?userId=${userId}`)
