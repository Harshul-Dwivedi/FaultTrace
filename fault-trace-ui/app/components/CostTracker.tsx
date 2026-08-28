'use client'

import type { CostBreakdown } from '../../lib/types'

export function CostTracker({ cost }: { cost: CostBreakdown | null }) {
  if (!cost || cost.turns.length === 0) {
    return (
      <section className="panel compact">
        <div className="section-kicker"><span className="dot blue" /> COST</div>
        <div style={{ padding: '12px', color: '#718590', fontSize: 12 }}>No cost data available.</div>
      </section>
    )
  }

  return (
    <section className="panel compact">
      <div className="section-kicker"><span className="dot blue" /> COST BREAKDOWN</div>
      <div style={{ padding: '12px 16px' }}>
        <table style={{ width: '100%', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          <thead>
            <tr style={{ color: '#718590' }}>
              <th style={{ textAlign: 'left', fontWeight: 500 }}>Turn</th>
              <th style={{ textAlign: 'right', fontWeight: 500 }}>Input</th>
              <th style={{ textAlign: 'right', fontWeight: 500 }}>Output</th>
              <th style={{ textAlign: 'right', fontWeight: 500 }}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {cost.turns.map((t, i) => (
              <tr key={t.turnId} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 0' }}>Turn {i + 1}</td>
                <td style={{ textAlign: 'right' }}>{(t.inputTokens / 1000).toFixed(1)}K</td>
                <td style={{ textAlign: 'right' }}>{(t.outputTokens / 1000).toFixed(1)}K</td>
                <td style={{ textAlign: 'right' }}>${t.cost.toFixed(3)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
              <td style={{ padding: '6px 0' }}>Total</td>
              <td style={{ textAlign: 'right' }}>
                {(cost.turns.reduce((s, t) => s + t.inputTokens, 0) / 1000).toFixed(1)}K
              </td>
              <td style={{ textAlign: 'right' }}>
                {(cost.turns.reduce((s, t) => s + t.outputTokens, 0) / 1000).toFixed(1)}K
              </td>
              <td style={{ textAlign: 'right' }}>${cost.totalCost.toFixed(3)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}
