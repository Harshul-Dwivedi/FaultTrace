'use client'

import type { GateEntry } from '../../lib/types'

export function GateLog({ entries }: { entries: GateEntry[] }) {
  if (entries.length === 0) {
    return (
      <section className="panel compact">
        <div className="section-kicker"><span className="dot amber" /> APPROVAL GATE LOG</div>
        <div style={{ padding: '12px', color: '#718590', fontSize: 12 }}>No gated actions in this investigation.</div>
      </section>
    )
  }

  return (
    <section className="panel compact">
      <div className="section-kicker"><span className="dot amber" /> APPROVAL GATE LOG</div>
      {entries.map((entry, i) => (
        <div className="log-item anim" style={{ animationDelay: `${Math.min(i * 70, 600)}ms` }} key={i}>
          <span className="log-time">{entry.time}</span>
          <span className={`log-icon ${entry.status === 'approved' ? '' : entry.status === 'rejected' ? 'red-text' : 'amber-text'}`}>
            {entry.status === 'approved' ? '✓' : entry.status === 'rejected' ? '✗' : '…'}
          </span>
          <div>
            <strong>
              Tier {entry.tier} — {entry.toolName}
            </strong>
            <small>
              {entry.justification && `"${entry.justification}"`}
              {entry.status === 'approved' && ' — Approved'}
              {entry.status === 'rejected' && ' — Rejected'}
              {entry.result && ` · ${entry.result}`}
            </small>
          </div>
        </div>
      ))}
    </section>
  )
}
