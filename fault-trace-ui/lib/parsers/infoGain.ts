import type { TestRecommendation, EvidenceItem } from '../types'

const COST_MAP: Record<string, string> = {
  low: 'low',
  medium: 'med',
  med: 'med',
  high: 'high',
}

export function parseInfoGain(
  modelOutput: string,
  evidenceItems: EvidenceItem[] = []
): TestRecommendation[] {
  const tests: TestRecommendation[] = []

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
            const likelihoods = t.expected_likelihood ? Object.values(t.expected_likelihood) : []
            const variance = likelihoods.length > 1
              ? likelihoods.reduce((s, v) => {
                  const avg = likelihoods.reduce((a, b) => a + b, 0) / likelihoods.length
                  return s + Math.pow(v - avg, 2)
                }, 0) / likelihoods.length
              : 0
            const gain = Math.min(1, variance * 3 + (likelihoods[0] || 0) * 0.3)

            tests.push({
              testId: t.test_id,
              label: t.label || t.test_id.replace(/_/g, ' '),
              description: '',
              gain: Math.round(gain * 100) / 100,
              cost: COST_MAP[t.cost] || t.cost || 'low',
              costClass: COST_MAP[t.cost] || 'low',
              rank: 0,
            })
          }
        }
      }
    }
  }

  // Strategy 2: Extract from model text output
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
