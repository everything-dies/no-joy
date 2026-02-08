interface FallbackProps {
  error: Error
  resetErrorBoundary: () => void
}

export default function UserListError({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div>
      <p>Failed to load users: {error.message}</p>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  )
}
