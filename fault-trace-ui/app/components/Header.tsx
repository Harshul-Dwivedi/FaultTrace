'use client'

export function Header({
  onMenu,
  onRefresh,
  refreshing,
  onExport,
  canExport,
}: {
  onMenu: () => void
  onRefresh: () => void
  refreshing: boolean
  onExport?: () => void
  canExport?: boolean
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <button className="menu-button" onClick={onMenu} aria-label="Open sessions">☰</button>
        <div className="brand-mark">FT</div>
        <span>Fault<span>Trace</span></span>
        <em>DIAGNOSTICS</em>
      </div>
      <div className="top-actions">
        <span className="connection"><i /> Connected to vehicle</span>
        <button
          className="export-button"
          onClick={onExport}
          disabled={!canExport}
          aria-label="Export report"
          title="Export investigation report"
          style={{
            background: 'transparent',
            padding: '9px 18px',
            borderRadius: 2,
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '.03em',
            cursor: canExport ? 'pointer' : 'not-allowed',
            ...(canExport
              ? { border: '1px solid #3f9bff', color: '#6ab0ff' }
              : { border: '1px solid #2b3139', color: '#55606a' }),
          }}
        >
          ⬇ Report
        </button>
        <button
          className="icon-button"
          onClick={onRefresh}
          aria-label="Refresh data"
          style={{ transform: refreshing ? 'rotate(360deg)' : undefined, transition: 'transform 0.4s' }}
        >
          ↻
        </button>
      </div>
    </header>
  )
}
