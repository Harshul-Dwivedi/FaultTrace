import type { Hypothesis, EvidenceItem } from '../types'

function confidenceFromPosterior(p: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (p >= 60) return 'HIGH'
  if (p >= 20) return 'MEDIUM'
  return 'LOW'
}

// Cause keys from run_analysis / lookup_dtc_knowledge whose labels we can
// prettify. Anything unknown falls back to the raw key with underscores split.
const CAUSE_LABELS: Record<string, string> = {
  vacuum_leak: 'Vacuum leak',
  maf_fault: 'MAF sensor fault',
  weak_fuel_delivery: 'Weak fuel delivery',
  ignition_fault: 'Ignition fault',
  o2_sensor_fault: 'O2 sensor fault',
  maf_contamination: 'MAF contamination',
  maf_electrical_fault: 'MAF electrical fault',
  maf_ground_fault: 'MAF ground fault',
  air_intake_restrict: 'Air intake restriction',
  ecu_fault: 'ECU fault',
  o2_sensor_contamination: 'O2 contamination',
  o2_sensor_aging: 'O2 sensor aging',
  o2_heater_fault: 'O2 heater fault',
  exhaust_leak: 'Exhaust leak',
  wiring_fault: 'Wiring fault',
}

function causeLabel(key: string): string {
  return CAUSE_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function parseHypotheses(modelOutput: string, evidenceItems: EvidenceItem[] = []): Hypothesis[] {
  const hypotheses: Hypothesis[] = []
  const lines = modelOutput.split('\n')

  // Pattern 1: Markdown table rows like "| **Vacuum leak** | 0.624 | 0.97 | **0.970** |"
  for (const line of lines) {
    const tableMatch = line.match(/\|\s*\*?\*?(.+?)\*?\*?\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*\*?\*?([\d.]+)\*?\*?\s*\|/)
    if (tableMatch) {
      const name = tableMatch[1].trim()
      const prior = parseFloat(tableMatch[2])
      const likelihood = parseFloat(tableMatch[3])
      const posterior = parseFloat(tableMatch[4])

      // Skip header/separator rows
      if (name.toLowerCase().includes('hypothesis') || name.toLowerCase().includes('---') || name.toLowerCase().includes('prior')) continue

      // Only add if posterior is a valid number and > 0
      if (!isNaN(posterior) && posterior > 0) {
        hypotheses.push({
          rank: String(hypotheses.length + 1).padStart(2, '0'),
          name,
          prior: prior > 1 ? prior / 100 : prior,
          posterior: posterior > 1 ? posterior : posterior * 100,
          bayesFactor: 0,
          confidence: confidenceFromPosterior(posterior > 1 ? posterior : posterior * 100),
          supporting: [],
          contradictory: [],
        })
      }
    }
  }

  // Pattern 2: "H1: Name — prior 0.45, posterior 0.970" or "1. Name — 97.0%"
  if (hypotheses.length === 0) {
    for (const line of lines) {
      const rankMatch = line.match(/(\d+)\.\s+\*?\*?(.+?)\*?\*?\s*[—–\-]\s*(\d+(?:\.\d+)?)\s*%/)
      if (rankMatch) {
        const posterior = parseFloat(rankMatch[3])
        hypotheses.push({
          rank: rankMatch[1].padStart(2, '0'),
          name: rankMatch[2].replace(/\*\*/g, '').trim(),
          prior: 0,
          posterior,
          bayesFactor: 0,
          confidence: confidenceFromPosterior(posterior),
          supporting: [],
          contradictory: [],
        })
        continue
      }

      const hMatch = line.match(/H(\d+):\s*(.+?)[—–\-]\s*prior\s+([\d.]+),?\s*posterior\s+([\d.]+)/i)
      if (hMatch) {
        const prior = parseFloat(hMatch[3])
        const posterior = parseFloat(hMatch[4])
        hypotheses.push({
          rank: hMatch[1].padStart(2, '0'),
          name: hMatch[2].replace(/\*\*/g, '').trim(),
          prior,
          posterior: posterior * 100,
          bayesFactor: 0,
          confidence: confidenceFromPosterior(posterior * 100),
          supporting: [],
          contradictory: [],
        })
      }
    }
  }

  // Pattern 3 (guaranteed fallback): if the LLM's prose didn't match the
  // table/list formats above, use the structured `run_analysis` output. That
  // tool always returns the real ranked Bayesian posterior, so the panel is
  // never empty even when the model writes its reasoning as free-form prose.
  if (hypotheses.length === 0) {
    // `run_analysis` returns both the ranked posterior AND the authoritative
    // merged, normalized priors it actually used (same response). Events are
    // ordered oldest → newest, so each later run_analysis overwrites the
    // previous one and the LAST call wins — no stale posteriors.
    let ranked: Array<{ cause?: string; posterior?: number }> = []
    let mergedPriors: Record<string, number> = {}

    for (const item of evidenceItems) {
      if (item.toolName !== 'run_analysis') continue
      let out = item.output
      if (typeof out === 'string') {
        try { out = JSON.parse(out) } catch { continue }
      }
      const o = out as Record<string, unknown> | null
      const arr = o?.ranked
      if (!Array.isArray(arr)) continue
      ranked = arr as Array<{ cause?: string; posterior?: number }>
      const priors = o?.priors
      if (priors && typeof priors === 'object') {
        mergedPriors = priors as Record<string, number>
      }
    }

    for (const r of ranked) {
      if (r?.posterior == null || isNaN(r.posterior) || r.posterior <= 0) continue
      const name = causeLabel(r.cause ?? 'unknown')
      const post = Math.round(r.posterior * 1000) / 10
      hypotheses.push({
        rank: '00',
        name,
        prior: typeof mergedPriors[r.cause ?? ''] === 'number' ? mergedPriors[r.cause ?? ''] : 0,
        posterior: post,
        bayesFactor: 0,
        confidence: confidenceFromPosterior(post),
        supporting: [],
        contradictory: [],
      })
    }
  }

  // Extract supporting/contradictory evidence per hypothesis
  let currentIdx = -1
  for (const line of lines) {
    const cleanLine = line.replace(/^[✅❌✔✗•]\s*/, '').replace(/\*\*/g, '').trim()

    for (let i = 0; i < hypotheses.length; i++) {
      if (line.includes(hypotheses[i].name) || line.toLowerCase().includes(hypotheses[i].name.toLowerCase())) {
        currentIdx = i
        break
      }
    }

    if (currentIdx >= 0 && currentIdx < hypotheses.length) {
      if (line.includes('✅') || line.includes('✔') || line.match(/^\s*•\s/)) {
        if (cleanLine.length > 5 && !cleanLine.toLowerCase().includes('hypothesis')) {
          hypotheses[currentIdx].supporting.push(cleanLine)
        }
      } else if (line.includes('❌') || line.includes('✗')) {
        if (cleanLine.length > 5) {
          hypotheses[currentIdx].contradictory.push(cleanLine)
        }
      }
    }
  }

  // Calculate Bayes factors relative to second-best
  const sorted = [...hypotheses].sort((a, b) => b.posterior - a.posterior)
  if (sorted.length >= 2) {
    const secondBest = sorted[1].posterior
    for (const h of hypotheses) {
      h.bayesFactor = secondBest > 0 ? h.posterior / secondBest : 0
    }
  }

  // Renumber ranks
  return sorted.map((h, i) => ({ ...h, rank: String(i + 1).padStart(2, '0') }))
}
