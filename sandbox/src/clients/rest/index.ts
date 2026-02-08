export interface RestClient {
  get<T>(path: string): Promise<T>
}

export default (): RestClient => {
  const baseURL = 'https://jsonplaceholder.typicode.com'

  return {
    async get<T>(path: string): Promise<T> {
      const response = await fetch(`${baseURL}${path}`)
      if (!response.ok) {
        throw new Error(`GET ${path} failed: ${response.status}`)
      }
      return response.json() as Promise<T>
    },
  }
}
