import { Link, Outlet } from 'react-router-dom'

export default function Users({
  load,
}: {
  load: { loading: boolean; data?: Array<{ id: number; name: string }> }
}) {
  if (load.loading) return <p>Loading users...</p>

  return (
    <div>
      <h2>Users</h2>
      <ul>
        {load.data?.map((user) => (
          <li key={user.id}>
            <Link to={`/users/${user.id}`}>{user.name}</Link>
          </li>
        ))}
      </ul>
      <Outlet />
    </div>
  )
}
