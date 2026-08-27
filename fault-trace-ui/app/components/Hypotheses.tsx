'use client'

import type { Hypothesis } from '../../lib/types'

export function Hypotheses({ items }: { items: Hypothesis[] }) {
  if (items.length === 0) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <div className="section-kicker"><span className="dot purple" /> BAYESIAN RANKING</div>
            <h3>Active hypotheses <span className="count">00</span></h3>
          </div>
        </div>
        <div className="hypotheses">
          <div style={{ padding: '20px', color: '#718590', fontSize: 12 }}>No hypotheses computed yet.</div>
        </div>
      </section>
    )
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <div className="section-kicker"><span className="dot purple" /> BAYESIAN RANKING</div>
          <h3>Active hypotheses <span className="count">{String(items.length).padStart(2, '0')}</span></h3>
        </div>
        <span className="updated">Updated just now</span>
      </div>
      <div className="hypotheses">
        {items.map((h) => (
          <div className="hypothesis anim" key={h.rank} style={{ animationDelay: `${Math.min(parseInt(h.rank, 10) * 70, 500)}ms` }}>
            <div className="rank">{h.rank}</div>
            <div className="hypothesis-main">
              <div className="hypothesis-title">
                <strong>{h.name}</strong>
                <span className={`confidence ${h.confidence.toLowerCase()}`}>{h.confidence}</span>
              </div>
              <div className="bar">
                <span style={{ width: `${h.posterior}%` }} />
              </div>
              <div className="hypothesis-foot">
                <span>
                  Prior: {(h.prior * 100).toFixed(0)}% → Posterior: {h.posterior.toFixed(1)}%
                  {h.bayesFactor > 0 && ` · Bayes: ${h.bayesFactor.toFixed(1)}x`}
                </span>
                <b>{h.posterior.toFixed(1)}% posterior</b>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
