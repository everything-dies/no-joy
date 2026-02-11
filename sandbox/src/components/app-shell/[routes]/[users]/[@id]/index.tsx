import { useParams } from 'react-router-dom'

export default function UserDetail() {
  const { id } = useParams()
  return <h3>User #{id}</h3>
}
