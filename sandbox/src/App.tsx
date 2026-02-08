import { NojoyProvider } from 'nojoy/runtime'

import { clients, services } from './setup'
import UserList from './components/user-list'
import PostList from './components/post-list'
import Broken from './components/broken'

export function App() {
  return (
    <NojoyProvider clients={clients} services={services}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 20 }}>
        <h1>nojoy sandbox</h1>
        <Broken />
        <hr />
        <UserList />
        <hr />
        <PostList />
      </div>
    </NojoyProvider>
  )
}
