interface FallbackProps {
  error: Error
  resetErrorBoundary: () => void
}

export default function BrokenError({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div style={{ border: '2px solid crimson', borderRadius: 8, padding: 16, margin: '16px 0', background: '#fff0f0' }}>
      <h3 style={{ color: 'crimson', margin: '0 0 8px' }}>ErrorBoundary caught this</h3>
      <pre style={{ background: '#ffe0e0', padding: 8, borderRadius: 4, overflow: 'auto' }}>
        {error.message}
      </pre>
      <button onClick={resetErrorBoundary} style={{ marginTop: 8 }}>
        Reset
      </button>
    </div>
  )
}
