import type { TestRecommendation, EvidenceItem, Hypothesis } from '../types'

const COST_MAP: Record<string, string> = {
  low: 'low',
  medium: 'med',
  med: 'med',
  high: 'high',
}

function posteriorOf(h: Hypothesis): number {
  // parseHypotheses always stores Hypothesis.posterior on a 0-100 scale,
  // so normalize to a 0-1 probability for entropy math.
  return h.posterior / 100
}

const KB_KEY_PATTERNS: Record<string, RegExp> = {
  vacuum_leak: /vacuum|intake|leak|hose|booster/,
  maf_fault: /maf|mass\s*air\s*flow/,
  weak_fuel_delivery: /fuel\s*delivery|fuel|injector|pump|filter/,
  ignition_fault: /ignition|coil|plug|spark|misfire/,
  o2_sensor_fault: /o2|oxygen|\blambda\b/,
}

function entropy(p: number[]): number {
  let h = 0
  for (const x of p) {
    if (x > 0) h -= x * Math.log2(x)
  }
  return h
}

// Build a 0-1 posterior distribution aligned with the KB hypothesis keys.
function buildPosterior(hypotheses: Hypothesis[]): Record<string, number> {
  const posteriors: Record<string, number> = {}
  let matched = 0
  for (const h of hypotheses) {
    for (const [key, pattern] of Object.entries(KB_KEY_PATTERNS)) {
      if (pattern.test(h.name.toLowerCase())) {
        posteriors[key] = posteriorOf(h)
        matched++
        break
      }
    }
  }
  if (matched === 0) return {}
  return posteriors
}

// Given posteriors over hypotheses and a test's per-hypothesis likelihoods,
// compute the expected information gain = H(P) - E[ H(P | outcome) ].
function expectedEntropyReduction(
  posteriors: Record<string, number>,
  likelihoods: Record<string, number>
): number | null {
  const keys = Object.keys(posteriors)
  if (keys.length < 2) return null

  const p = keys.map((k) => posteriors[k])
  const totalP = p.reduce((s, v) => s + v, 0)
  if (totalP <= 0) return null
  const P = p.map((v) => v / totalP)

  // Renormalize likelihoods so each hypothesis's signal is a proper probability.
  const l = keys.map((k) => {
    const raw = likelihoods[k]
    if (raw == null || isNaN(raw)) return null
    return Math.max(0, Math.min(1, raw))
  })
  if (l.some((v) => v === null)) return null

  // P(positive) and P(negative) under the current posterior.
  const pPos = keys.reduce((s, k, i) => s + P[i] * (l[i] as number), 0)
  if (pPos <= 0 || pPos >= 1) return null

  // Posterior if the test comes back positive.
  const PP = keys.map((k, i) => (P[i] * (l[i] as number)) / pPos)
  // Posterior if the test comes back negative.
  const PN = keys.map((k, i) => (P[i] * (1 - (l[i] as number))) / (1 - pPos))

  const hPrior = entropy(P)
  const hPos = entropy(PP)
  const hNeg = entropy(PN)
  const expected = pPos * hPos + (1 - pPos) * hNeg

  return Math.max(0, hPrior - expected)
}

export function parseInfoGain(
  modelOutput: string,
  evidenceItems: EvidenceItem[] = [],
  hypotheses: Hypothesis[] = []
): TestRecommendation[] {
  const tests: TestRecommendation[] = []
  const posteriors = buildPosterior(hypotheses)

  // Strategy 1: Extract from lookup_dtc_knowledge responses (if available_tests exists)
  for (const item of evidenceItems) {
    if (item.toolName === 'lookup_dtc_knowledge' && item.output) {
      const output = typeof item.output === 'string'
        ? (() => { try { return JSON.parse(item.output) } catch { return null } })()
        : item.output

      if (output && typeof output === 'object') {
        const kb = output as Record<string, unknown>
        const availableTests = kb.available_tests as Array<{
          test_id: string
          label: string
          cost: string
          expected_likelihood?: Record<string, number>
        }>

        if (Array.isArray(availableTests)) {
          for (const t of availableTests) {
            const likelihoods = t.expected_likelihood || {}
            // Only surface a real gain when the posterior and per-hypothesis
            // likelihoods are both available; otherwise show no numeric gain.
            const gain = expectedEntropyReduction(posteriors, likelihoods)

            tests.push({
              testId: t.test_id,
              label: t.label || t.test_id.replace(/_/g, ' '),
              description: gain == null
                ? 'Expected information gain unavailable (need posterior + likelihoods)'
                : 'Expected entropy reduction given current belief',
              gain: gain == null ? 0 : Math.round(gain * 100) / 100,
              cost: COST_MAP[t.cost] || t.cost || 'low',
              costClass: COST_MAP[t.cost] || 'low',
              rank: 0,
            })
          }
        }
      }
    }
  }

  // Strategy 2: Extract from model text output (fallback when no KB response)
  if (tests.length === 0) {
    const lines = modelOutput.split('\n')

    // Known test patterns to search for in agent text
    const testPatterns = [
      { id: 'smoke_test', patterns: [/smoke\s+test/i, /intake.*smoke/i, /smoke.*intake/i, /vacuum.*smoke/i] },
      { id: 'vac_gauge_idle', patterns: [/vacuum\s+gauge/i, /manifold.*vacuum/i, /vac.*gauge.*idle/i] },
      { id: 'fuel_pressure', patterns: [/fuel\s+pressure/i, /fuel.*delivery/i] },
      { id: 'fuel_trim_recheck', patterns: [/trim\s+recheck/i, /fuel\s+trim.*recheck/i, /trim.*hose.*clamp/i] },
      { id: 'maf_sensor_test', patterns: [/maf\s+(?:sensor\s+)?(?:swap|test|clean)/i, /mass\s+air\s+flow/i] },
      { id: 'compression_test', patterns: [/compression\s+test/i] },
      { id: 'injector_balance', patterns: [/injector\s+balance/i, /injector.*test/i] },
    ]

    // Scan the entire text for mentions of each test
    const allText = lines.join(' ')
    const found = new Map<string, { gain: number; context: string }>()

    for (const tp of testPatterns) {
      for (const pattern of tp.patterns) {
        if (pattern.test(allText)) {
          // Extract gain if mentioned nearby
          const match = allText.match(new RegExp(
            `(?:${pattern.source}).{0,150}?(?:gain|IG|info[.-]?gain)[:\\s]*([\\d.]+)`,
            'i'
          ))
          const gain = match ? parseFloat(match[1]) : 0.5

          // Determine cost from context
          const costMatch = allText.match(new RegExp(
            `(?:${pattern.source}).{0,100}?(?:cost|expense)[:\\s]*(low|med|medium|high)`,
            'i'
          ))
          const cost = costMatch ? COST_MAP[costMatch[1].toLowerCase()] || 'low' : 'low'

          // Check if this test was actually recommended (not just mentioned)
          const isRecommended = allText.match(new RegExp(
            `(?:highest|best|most|recommended|next|propose|suggest).{0,100}?(?:${pattern.source})`,
            'i'
          ))

          if (!found.has(tp.id) || gain > (found.get(tp.id)?.gain || 0)) {
            found.set(tp.id, {
              gain: isRecommended ? Math.max(gain, 0.7) : gain,
              context: isRecommended ? 'Recommended by agent' : 'Mentioned in analysis',
            })
          }
          break
        }
      }
    }

    // If nothing found by patterns, try generic extraction
    if (found.size === 0) {
      // Look for bullet-pointed test recommendations
      for (const line of lines) {
        const m = line.match(/[•\-*]\s*(?:\*\*)?([\w\s/]+?)(?:\*\*)?\s*[—:\-]\s*(?:gain\s+)?([\d.]+)\s*,?\s*cost\s*(low|med|high)/i)
        if (m) {
          const id = m[1].trim().toLowerCase().replace(/\s+/g, '_')
          found.set(id, { gain: parseFloat(m[2]), context: 'Bullet point' })
        }
      }
    }

    for (const [id, { gain, context }] of found) {
      tests.push({
        testId: id,
        label: id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        description: context,
        gain: Math.round(Math.min(1, gain) * 100) / 100,
        cost: 'low',
        costClass: 'low',
        rank: 0,
      })
    }
  }

  return tests
    .sort((a, b) => b.gain - a.gain)
    .map((t, i) => ({ ...t, rank: i + 1 }))
}
