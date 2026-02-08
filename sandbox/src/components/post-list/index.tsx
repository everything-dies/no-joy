import { useEffect } from 'react'

interface Post {
  id: number
  title: string
  body: string
}

interface Props {
  loadPosts: {
    (): void
    loading: boolean
    error: { reason: unknown; retry: () => void } | undefined
    data: Post[] | undefined
  }
}

export default function PostListView({ loadPosts }: Props) {
  useEffect(() => {
    loadPosts()
  }, [loadPosts])

  if (loadPosts.loading) {
    return <p>Loading posts...</p>
  }

  if (loadPosts.error) {
    return (
      <div>
        <p>Failed to load posts.</p>
        <button onClick={loadPosts.error.retry}>Retry</button>
      </div>
    )
  }

  if (!loadPosts.data) {
    return null
  }

  return (
    <div>
      <h2>Posts</h2>
      <ul>
        {loadPosts.data.slice(0, 10).map((post) => (
          <li key={post.id}>
            <strong>{post.title}</strong>
            <p>{post.body}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
