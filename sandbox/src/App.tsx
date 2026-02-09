import { NojoyProvider } from 'nojoy/runtime'

import { clients, services } from './setup'
import UserList from './components/user-list'
import PostList from './components/post-list'
import Broken from './components/broken'
import Button from './components/widgets/button'

export function App() {
  return (
    <NojoyProvider clients={clients} services={services}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 20 }}>
        <h1>nojoy sandbox</h1>
        {/* @ts-expect-error nojoy injects props via virtual module at build-time */}
        <Button />
        <hr />
        <Broken />
        <hr />
        {/* @ts-expect-error nojoy injects props via virtual module at build-time */}
        <UserList />
        <hr />
        {/* @ts-expect-error nojoy injects props via virtual module at build-time */}
        <PostList />
      </div>
    </NojoyProvider>
  )
}
