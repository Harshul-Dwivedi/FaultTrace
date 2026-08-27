import type { InvestigationData } from './types'

function esc(s: string | undefined | null): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function pct(n: number): string {
  if (n <= 1) return `${(n * 100).toFixed(1)}%`
  return `${n.toFixed(1)}%`
}

function fmtEvidenceOutput(toolName: string, output: unknown): string {
  if (typeof output === 'string') {
    try { output = JSON.parse(output) } catch { return esc(output).slice(0, 200) }
  }
  if (!output || typeof output !== 'object') return esc(String(output ?? '')).slice(0, 200)
  const o = output as Record<string, unknown>
  if (o.error) {
    const err = Array.isArray(o.error) ? o.error.map((e: any) => e.text || e).join(' ') : String(o.error)
    return `${esc('Error: ')}${esc(err).slice(0, 120)}`
  }
  try {
    const s = JSON.stringify(o)
    return esc(s.length > 200 ? s.slice(0, 200) + '…' : s)
  } catch {
    return esc(String(output)).slice(0, 200)
  }
}

export function generateReportHTML(data: InvestigationData, opts?: { title?: string }): string {
  const now = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const vehicle = data.vehicle
  const hypotheses = [...data.hypotheses].sort((a, b) => parseFloat(a.rank) - parseFloat(b.rank))
  const tests = [...data.tests].sort((a, b) => a.rank - b.rank)
  const best = hypotheses[0]

  const maxHyp = Math.max(1, ...hypotheses.map((h) => h.posterior))

  // ── Hypothesis ranking rows ──
  const hypRows = hypotheses.map((h) => {
    const width = Math.round((h.posterior / maxHyp) * 100)
    return `
    <tr>
      <td class="num">${esc(h.rank)}</td>
      <td>${esc(h.name)}</td>
      <td class="num">${pct(h.prior)}</td>
      <td class="num"><strong>${pct(h.posterior)}</strong></td>
      <td class="num">${h.bayesFactor ? `${h.bayesFactor.toFixed(1)}×` : '—'}</td>
      <td class="bar-cell">
        <div class="bar"><div class="bar-fill" style="width:${width}%"><span class="bar-label">${width}%</span></div></div>
      </td>
    </tr>`
  }).join('')

  // ── Supporting / contradictory evidence ──
  const evidRows = hypotheses.length
    ? hypotheses.map((h) => `
    <div class="evid-block">
      <h4>${esc(h.name)} (${pct(h.posterior)})</h4>
      ${h.supporting.length ? h.supporting.map((s) => `<div class="row"><span class="yes">✓</span><span>${esc(s)}</span></div>`).join('') : '<div class="row"><span class="yes">✓</span><span class="muted">None</span></div>'}
      ${h.contradictory.length ? h.contradictory.map((c) => `<div class="row"><span class="no">✗</span><span>${esc(c)}</span></div>`).join('') : ''}
    </div>`).join('')
    : '<div class="muted">No hypotheses computed.</div>'

  // ── Info-gain tests ──
  const testRows = tests.map((t) => `
  <tr>
    <td class="num">${t.rank}</td>
    <td>${esc(t.label)}</td>
    <td class="num">${t.gain.toFixed(2)}</td>
    <td>${esc(t.cost.charAt(0).toUpperCase() + t.cost.slice(1))}</td>
  </tr>`).join('')

  // ── Gate approvals ──
  const gateBlocks = data.gates.length
    ? data.gates.map((g, i) => `
    <div class="gate-block">
      <div class="gate-head">
        <span class="gate-icon ${g.status === 'approved' ? 'ok' : g.status === 'rejected' ? 'no' : 'pend'}">${g.status === 'approved' ? '✓' : g.status === 'rejected' ? '✗' : '…'}</span>
        <strong>Tier ${g.tier} — ${esc(g.toolName)}</strong>
        <span class="gate-status ${g.status}">${esc(g.status.toUpperCase())}</span>
      </div>
      ${g.justification ? `<div class="gate-just">Justification: ${esc(g.justification)}</div>` : ''}
      ${g.time ? `<div class="gate-meta">${esc(g.time)}</div>` : ''}
      ${g.result ? `<div class="gate-meta">Result: ${esc(g.result)}</div>` : ''}
    </div>`).join('')
    : '<div class="muted">No gated actions in this investigation.</div>'

  // ── Evidence summary table ──
  const evidenceRows = data.evidence.length
    ? data.evidence.map((e, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td><strong>${esc(e.toolName)}</strong>${e.tier === 2 ? ' <span class="tag">T2</span>' : e.tier === 3 ? ' <span class="tag t3">T3</span>' : ''}</td>
      <td>${esc(e.time)}</td>
      <td class="mono small">${fmtEvidenceOutput(e.toolName, e.output)}</td>
    </tr>`).join('')
    : '<tr><td colspan="4" class="muted">No evidence collected.</td></tr>'

  // ── Root cause conclusion ──
  const rootCause = best ? best.name : 'Not determined'
  const rootBlock = best ? `
  <div class="conclusion">
    <div class="verdict">ROOT CAUSE: ${esc(rootCause)}</div>
    <div class="verdict-row"><strong>CONFIRMED BY:</strong> ${data.evidence.filter((e) => e.toolName === 'request_measurement').map((e) => fmtEvidenceOutput('request_measurement', e.output)).join('; ') || 'Evidence chain'}</div>
    <div class="verdict-row"><strong>POSTERIOR:</strong> ${pct(best.posterior)}${best.bayesFactor ? ` (Bayes factor ${best.bayesFactor.toFixed(1)}× vs next best)` : ''}</div>
    ${data.gates.some((g) => g.toolName === 'order_part' && g.status === 'approved') ? '<div class="verdict-row"><strong>REMEDIATION:</strong> Part ordered (mock transaction)</div>' : ''}
  </div>` : '<div class="muted">Investigation complete but no hypothesis reached.</div>'

  const title = opts?.title ? esc(opts.title) : 'FaultTrace Investigation Report'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  :root{
    --bg:#0d1117; --panel:#161b22; --border:#2b3139; --text:#d6e2ea; --muted:#7d8b98;
    --accent:#3f9bff; --blue:#6ab0ff; --amber:#e8b04a; --red:#ff6b6b; --green:#4ade80;
    --mono:'JetBrains Mono',Consolas,'Courier New',monospace;
  }
  *{box-sizing:border-box;}
  body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.5;padding:32px 20px;}
  .sheet{max-width:920px;margin:0 auto;}
  h1{font-size:26px;margin:0 0 4px;letter-spacing:-0.5px;}
  .sub{color:var(--muted);font-size:13px;margin-bottom:24px;}
  h2{font-size:15px;letter-spacing:1.2px;text-transform:uppercase;color:var(--accent);border-bottom:1px solid var(--border);padding-bottom:8px;margin:36px 0 16px;}
  .meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:18px;}
  .meta-grid .kv{font-size:13px;}
  .kv .k{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:0.6px;}
  .kv .v{margin-top:2px;}
  table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--border);border-radius:8px;overflow:hidden;font-size:13px;}
  thead th{text-align:left;color:var(--muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;padding:10px 12px;border-bottom:1px solid var(--border);}
  td{padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:top;}
  tr:last-child td{border-bottom:none;}
  .num{text-align:right;font-family:var(--mono);}
  .mono{font-family:var(--mono);font-size:12px;color:#b8c8d0;}
  .small{font-size:12px;max-width:360px;word-break:break-word;}
  .bar-cell{min-width:160px;}
  .bar{background:#0a0e13;border-radius:4px;height:18px;overflow:hidden;position:relative;}
  .bar-fill{background:linear-gradient(90deg,#3f9bff,#6ab0ff);height:100%;border-radius:4px;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;}
  .bar-label{font-size:10px;font-weight:700;color:#06111f;}
  .evid-block{margin-bottom:14px;background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:14px 16px;}
  .evid-block h4{margin:0 0 8px;font-size:14px;}
  .evid-block .row{font-size:13px;padding:2px 0;}
  .yes{color:var(--green);font-weight:700;margin-right:8px;}
  .no{color:var(--red);font-weight:700;margin-right:8px;}
  .muted{color:var(--muted);}
  .gate-block{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:10px;}
  .gate-head{display:flex;align-items:center;gap:8px;font-size:14px;}
  .gate-icon.ok{color:var(--green);font-weight:700;}
  .gate-icon.no{color:var(--red);font-weight:700;}
  .gate-status{font-size:10px;font-weight:700;letter-spacing:0.8px;padding:2px 8px;border-radius:10px;}
  .gate-status.approved{background:rgba(74,222,128,0.15);color:var(--green);}
  .gate-status.rejected{background:rgba(255,107,107,0.15);color:var(--red);}
  .gate-status.pending{background:rgba(234,176,74,0.15);color:var(--amber);}
  .gate-just{margin-top:6px;font-size:12px;color:#b8c8d0;}
  .gate-meta{margin-top:2px;font-size:11px;color:var(--muted);}
  .conclusion{background:var(--panel);border:1px solid var(--accent);border-radius:8px;padding:18px;}
  .verdict{font-size:16px;font-weight:700;color:var(--accent);margin-bottom:10px;}
  .verdict-row{font-size:13px;padding:3px 0;}
  .tag{font-size:9px;font-weight:700;background:rgba(234,176,74,0.15);color:var(--amber);padding:1px 6px;border-radius:8px;margin-left:6px;vertical-align:middle;}
  .tag.t3{background:rgba(255,107,107,0.15);color:var(--red);}
  @media print{
    body{background:#fff;color:#111;padding:0;}
    :root{--bg:#fff;--panel:#fff;--border:#d0d0d0;--text:#111;--muted:#555;--accent:#1a6bdb;}
    .sheet{max-width:100%;}
  }
</style>
</head>
<body>
<div class="sheet">
  <h1>${title}</h1>
  <div class="sub">Generated by FaultTrace · TrueForge Agent Harness · ${esc(now)}</div>

  <div class="meta-grid">
    <div class="kv"><div class="k">Vehicle</div><div class="v">${esc(vehicle?.name || 'Unknown Vehicle')}</div></div>
    <div class="kv"><div class="k">VIN</div><div class="v mono">${esc(vehicle?.vin || '—')}</div></div>
    <div class="kv"><div class="k">DTCs</div><div class="v mono">${esc((vehicle?.dtcs || []).map((d) => d.code).join(', ') || '—')}</div></div>
    <div class="kv"><div class="k">Total cost</div><div class="v mono">${data.cost ? `$${data.cost.totalCost.toFixed(3)}` : '—'}</div></div>
    <div class="kv"><div class="k">Hypotheses</div><div class="v mono">${hypotheses.length}</div></div>
    <div class="kv"><div class="k">Evidence signals</div><div class="v mono">${data.evidence.length}</div></div>
  </div>

  <h2>1. Evidence Summary</h2>
  <table>
    <thead><tr><th>#</th><th>Tool Call</th><th>Time</th><th>Key Findings</th></tr></thead>
    <tbody>${evidenceRows}</tbody>
  </table>

  <h2>2. Hypothesis Ranking</h2>
  <table>
    <thead><tr><th>Rank</th><th>Hypothesis</th><th class="num">Prior</th><th class="num">Posterior</th><th class="num">Bayes</th><th>Confidence</th></tr></thead>
    <tbody>${hypRows}</tbody>
  </table>

  <h2>3. Supporting &amp; Contradictory Evidence</h2>
  ${evidRows}

  <h2>4. Info-Gain Recommendation</h2>
  <table>
    <thead><tr><th>Rank</th><th>Test</th><th class="num">Gain</th><th>Cost</th></tr></thead>
    <tbody>${testRows}</tbody>
  </table>

  <h2>5. Gate Approvals</h2>
  ${gateBlocks}

  <h2>6. Root Cause Conclusion</h2>
  ${rootBlock}

  <div class="sub" style="margin-top:32px;text-align:center;">Generated by FaultTrace · TrueForge Agent Harness · Aug 2026</div>
</div>
</body>
</html>`
}
