export default ({ click }) => {
  return (
    <div>
      <button onClick={click}>This is my button</button>
      {click.pending && <p>Waiting the click to resolve...</p>}
      {click.error && (
        <dl>
          <dt>Something didn' work</dt>
          <dd>
            <pre>{JSON.stringify(click.error.reason, null, 2)}</pre>
          </dd>
        </dl>
      )}
    </div>
  )
}
