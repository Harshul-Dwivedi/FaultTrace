'use client'

import type { TestRecommendation } from '../../lib/types'

export function TestMatrix({ tests }: { tests: TestRecommendation[] }) {
  if (tests.length === 0) {
    return (
      <section className="panel test-panel">
        <div className="panel-header">
          <div>
            <div className="section-kicker"><span className="dot green" /> NEXT BEST ACTION</div>
            <h3>Information-gain matrix</h3>
          </div>
        </div>
        <div style={{ padding: '20px', color: '#718590', fontSize: 12 }}>No test recommendations available.</div>
      </section>
    )
  }

  return (
    <section className="panel test-panel">
      <div className="panel-header">
        <div>
          <div className="section-kicker"><span className="dot green" /> NEXT BEST ACTION</div>
          <h3>Information-gain matrix</h3>
        </div>
      </div>
      <div className="test-table">
        <div className="test-head">
          <span>TEST / ACTION</span>
          <span>EXPECTED GAIN</span>
          <span>COST</span>
          <span>RANK</span>
        </div>
        {tests.map((test) => (
          <div key={test.testId} className={`test-row anim ${test.rank === 1 ? 'recommended' : ''}`} style={{ animationDelay: `${Math.min((test.rank - 1) * 60, 400)}ms` }}>
            <div>
              <strong>{test.label}</strong>
              {test.description && <small>{test.description}</small>}
            </div>
            <b>+{test.gain.toFixed(2)}</b>
            <span style={{ textTransform: 'capitalize' }}>{test.costClass}</span>
            <span className="test-rank">{test.rank}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
