import type { TFTurn, CostBreakdown } from '../types'

export function parseCost(turns: TFTurn[]): CostBreakdown {
  const turnData = turns.map((t) => {
    const m = t.state.status === 'done' || t.state.status === 'error' || t.state.status === 'cancelled'
      ? t.state.metrics
      : undefined
    return {
      turnId: t.id,
      inputTokens: m?.total_input_tokens || 0,
      outputTokens: m?.total_output_tokens || 0,
      cost: m?.total_cost_in_usd || 0,
    }
  })

  const totalCost = turnData.reduce((sum, t) => sum + t.cost, 0)

  return {
    turns: turnData,
    totalCost,
    model: 'openrouter/stealth/ox-alpha',
  }
}
