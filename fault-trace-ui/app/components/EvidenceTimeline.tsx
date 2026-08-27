'use client'

import { useState } from 'react'
import type { EvidenceItem } from '../../lib/types'

const TIER_COLORS: Record<number, string> = { 1: 'blue', 2: 'amber', 3: 'red' }
const TIER_LABELS: Record<number, string> = { 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3' }

function summarizeInput(name: string, input: Record<string, unknown>): string {
  const parts: string[] = []
  if (input.vin) parts.push(`VIN: ${input.vin}`)
  if (input.code) parts.push(`Code: ${input.code}`)
  if (input.pid) parts.push(`PID: ${input.pid}`)
  if (input.pids) parts.push(`PIDs: ${(input.pids as string[]).join(', ')}`)
  if (input.sample_period_seconds) parts.push(`@ ${input.sample_period_seconds}s`)
  if (input.test_id) parts.push(`Test: ${input.test_id}`)
  if (input.part_id) parts.push(`Part: ${input.part_id}`)
  if (input.justification) parts.push(`"${input.justification}"`)
  return parts.join(' · ') || name
}

function summarizeOutput(name: string, output: unknown): string {
  if (typeof output === 'string') {
    try { output = JSON.parse(output) } catch { return output.slice(0, 150) }
  }
  if (!output || typeof output !== 'object') return String(output ?? '')

  const o = output as Record<string, unknown>

  switch (name) {
    case 'get_dtcs': {
      const arr = Array.isArray(o) ? o : []
      return arr.length ? arr.map((d: any) => `${d.code}${d.status ? ` (${d.status})` : ''}`).join(', ') : 'No DTCs'
    }
    case 'get_freeze_frame': {
      const parts: string[] = []
      if (o.long_fuel_trim != null) parts.push(`LTFT: ${Number(o.long_fuel_trim).toFixed(1)}%`)
      if (o.maf != null) parts.push(`MAF: ${Number(o.maf).toFixed(1)} g/s`)
      if (o.o2_voltage != null) parts.push(`O2: ${Number(o.o2_voltage).toFixed(2)}V`)
      return parts.join(', ') || JSON.stringify(o).slice(0, 100)
    }
    case 'get_compact_telemetry': {
      const s = o as any
      const pids = s.series ? Object.keys(s.series) : []
      return `${pids.length} PIDs, ${s.sample_period_seconds ?? '?'}s period`
    }
    case 'lookup_dtc_knowledge': {
      const kb = o as any
      return kb.common_causes ? `${kb.common_causes.length} hypotheses` : 'Knowledge retrieved'
    }
    case 'get_vehicle_info':
      return (o as any).vehicle || 'Vehicle info'
    case 'request_measurement': {
      const result = (o as any).result || (o as any).test_id
      return result ? String(result) : 'Measurement requested'
    }
    default:
      return JSON.stringify(o).slice(0, 100)
  }
}

export function EvidenceTimeline({ items }: { items: EvidenceItem[] }) {
  const [expanded, setExpanded] = useState<string | null>(items.length > 0 ? items[0].time + items[0].toolName : null)

  const toggle = (key: string) => setExpanded(expanded === key ? null : key)

  if (items.length === 0) {
    return (
      <section className="panel evidence-panel">
        <div className="panel-header">
          <div>
            <div className="section-kicker"><span className="dot blue" /> EVIDENCE TIMELINE</div>
            <h3>Collected signals <span className="count">00</span></h3>
          </div>
        </div>
        <div className="timeline">
          <div style={{ padding: '20px', color: '#718590', fontSize: 12 }}>No evidence collected yet.</div>
        </div>
      </section>
    )
  }

  return (
    <section className="panel evidence-panel">
      <div className="panel-header">
        <div>
          <div className="section-kicker"><span className="dot blue" /> EVIDENCE TIMELINE</div>
          <h3>Collected signals <span className="count">{String(items.length).padStart(2, '0')}</span></h3>
        </div>
      </div>
      <div className="timeline">
        {items.map((item, i) => {
          const key = item.time + item.toolName + i
          const isExpanded = expanded === key
          return (
            <button className="evidence-row anim" style={{ animationDelay: `${Math.min(i * 60, 600)}ms` }} key={key} onClick={() => toggle(key)}>
              <div className="time">{item.time}</div>
              <div className={`timeline-node ${TIER_COLORS[item.tier] || 'blue'}`} />
              <div className="evidence-content">
                <div className="evidence-source">
                  {item.toolName}
                  <span className="tier-badge" style={{ marginLeft: 8, fontSize: 9, opacity: 0.6 }}>
                    {TIER_LABELS[item.tier]}
                  </span>
                  <span className="chevron">{isExpanded ? '⌃' : '⌄'}</span>
                </div>
                <strong>{summarizeInput(item.toolName, item.input)}</strong>
                {isExpanded && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>Output:</div>
                    <p style={{ margin: 0, fontSize: 12, color: '#B8C8D0', fontFamily: 'var(--font-mono)' }}>
                      {summarizeOutput(item.toolName, item.output)}
                    </p>
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
