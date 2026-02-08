import { useEffect } from 'react'

interface User {
  id: number
  name: string
  email: string
}

interface Props {
  loadUsers: {
    (): void
    loading: boolean
    error: { reason: unknown; retry: () => void } | undefined
    data: User[] | undefined
  }
}

export default function UserListView({ loadUsers }: Props) {
  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  if (loadUsers.loading) {
    return <p>Loading users...</p>
  }

  if (loadUsers.error) {
    return (
      <div>
        <p>Failed to load users.</p>
        <button onClick={loadUsers.error.retry}>Retry</button>
      </div>
    )
  }

  if (!loadUsers.data) {
    return null
  }

  return (
    <div>
      <h2>Users</h2>
      <ul>
        {loadUsers.data.map((user) => (
          <li key={user.id}>
            {user.name} &mdash; {user.email}
          </li>
        ))}
      </ul>
    </div>
  )
}
