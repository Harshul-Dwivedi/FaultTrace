'use client'

import type { SessionCard } from '../../lib/types'

export function Sidebar({
  sessions,
  active,
  onSelect,
  open,
  onClose,
  loading,
}: {
  sessions: SessionCard[]
  active: string
  onSelect: (id: string) => void
  open: boolean
  onClose: () => void
  loading: boolean
}) {
  return (
    <>
      <button className={`scrim ${open ? 'visible' : ''}`} onClick={onClose} aria-label="Close sessions" />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-head">
          <div>
            <div className="eyebrow">WORKSPACE</div>
            <h2>Investigations</h2>
          </div>
          <button className="mobile-close" onClick={onClose} aria-label="Close menu">×</button>
        </div>
        <div className="session-label">
          <span>SESSIONS</span>
          <span>{sessions.length}</span>
        </div>
        <nav aria-label="Investigation sessions">
          {loading && sessions.length === 0 && (
            <div style={{ padding: '20px 10px', color: '#718590', fontSize: 12 }}>Loading sessions...</div>
          )}
          {!loading && sessions.length === 0 && (
            <div style={{ padding: '20px 10px', color: '#718590', fontSize: 12 }}>
              No sessions yet. Start an agent run to see sessions here.
            </div>
          )}
          {sessions.map((session, i) => (
            <button
              key={session.id}
              className={`session anim-x ${active === session.id ? 'selected' : ''}`}
              style={{ animationDelay: `${Math.min(i * 35, 400)}ms` }}
              onClick={() => { onSelect(session.id); onClose() }}
            >
              <div className="session-top">
                <strong>{session.id.slice(0, 12)}</strong>
                <span className={session.status === 'ACTIVE' || session.status === 'RUNNING' ? 'live' : 'closed'}>
                  {session.status}
                </span>
              </div>
              <div className="session-car">{session.vehicle}</div>
              <div className="session-meta">
                <span>{session.issue}</span>
                <span>{session.timestamp}</span>
              </div>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="engine-status"><i /> Diagnostic engine online</div>
        </div>
      </aside>
    </>
  )
}
