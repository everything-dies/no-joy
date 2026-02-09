export default ({ click, i18n }) => {
  return (
    <div>
      <button onClick={click}>{i18n.content}</button>
      {click.loading && <p>{i18n.fallback}</p>}
      {click.error && (
        <dl>
          <dt>{i18n.error.title}</dt>
          <dd>
            <pre>{JSON.stringify(click.error.reason, null, 2)}</pre>
          </dd>
          <dd>
            <button onClick={click.error.retry}>
              {i18n.error.actions.retry}
            </button>
          </dd>
        </dl>
      )}
    </div>
  )
}
