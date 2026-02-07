import axios from 'axios'

export default () => {
  const client = axios.create({
    baseURL: 'https://some-domain.com/api/',
    headers: { 'X-Custom-Header': 'foobar' },
    timeout: 1000,
  })

  return client
}
