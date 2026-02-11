import { Link } from 'react-router-dom'

export default function AppShell({
  routes,
}: {
  routes: React.ReactElement
}) {
  return (
    <div>
      <nav style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <Link to="/">Home</Link>
        <Link to="/users">Users</Link>
      </nav>
      {routes}
    </div>
  )
}
