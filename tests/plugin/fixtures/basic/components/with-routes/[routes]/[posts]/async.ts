export default ({ services }) =>
  (_params) =>
    services.posts.getAll()
