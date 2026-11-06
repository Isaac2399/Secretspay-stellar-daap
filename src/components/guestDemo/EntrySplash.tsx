export function EntrySplash() {
  return (
    <main
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Preparando la entrada"
      className="entry-splash"
    >
      <div className="entry-splash-card">
        <div className="entry-orbit" aria-hidden="true">
          <span className="entry-ring" />
          <span className="entry-ring entry-ring-b" />
          <span className="entry-core">
            <span className="entry-core-shine" />
          </span>
        </div>
        <p className="entry-kicker">Stellar Pay</p>
        <p className="entry-caption">Preparando la entrada…</p>
      </div>
    </main>
  )
}
