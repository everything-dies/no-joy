export const loadPosts =
  ({ services }: { services: { posts: { getAll: () => Promise<unknown> } } }) =>
  () =>
    services.posts.getAll()
