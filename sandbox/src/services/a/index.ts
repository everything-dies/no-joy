export const getSomething =
  ({ clients }) =>
  (params: { foo?: string }) => {
    return clients.rest.get('/some-url', { params })
  }
