export default ({ services }: { services: Record<string, any> }) =>
  () =>
    services.users.getAll()
