export default ({ click }: { click: { (): void; loading: boolean; error: { reason: unknown; retry: () => void } | undefined } }) => {
  return (
    <div>
      <button onClick={click}>This is my button</button>
      {click.loading && <p>Waiting the click to resolve...</p>}
      {click.error && (
        <dl>
          <dt>Something didn't work</dt>
          <dd>
            <pre>{JSON.stringify(click.error.reason, null, 2)}</pre>
          </dd>
          <dd>
            <button onClick={click.error.retry}>Retry</button>
          </dd>
        </dl>
      )}
    </div>
  )
}
