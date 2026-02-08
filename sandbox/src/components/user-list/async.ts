export const loadUsers =
  ({ services }: { services: { users: { getAll: () => Promise<unknown> } } }) =>
  () =>
    services.users.getAll()
