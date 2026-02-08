import { createClients, createServices } from 'nojoy/runtime'

import createRestClient from './clients/rest'
import * as posts from './services/posts'
import * as users from './services/users'

export const clients = createClients({
  rest: createRestClient,
})

export const services = createServices(
  {
    users,
    posts,
  },
  clients
)
