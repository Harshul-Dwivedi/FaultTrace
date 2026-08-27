// ── TrueForge API response shapes ──

export interface TFSession {
  id: string
  title: string | null
  agent: { type: 'reference'; id: string; name?: string } | { type: 'inline'; spec: unknown }
  created_by: string
  created_at: string
  updated_at: string
}

export interface TFTurnMetrics {
  total_input_tokens?: number
  total_output_tokens?: number
  total_tokens?: number
  total_cache_read_tokens?: number
  total_cache_write_tokens?: number
  total_reasoning_tokens?: number
  total_cost_in_usd?: number
}

export interface TFTurn {
  id: string
  session_id: string
  previous_turn_id: string | null
  input?: unknown[]
  state:
    | { status: 'running' }
    | { status: 'done'; output: TFModelMessage | null; required_actions?: unknown[]; completed_at?: string; metrics?: TFTurnMetrics }
    | { status: 'cancelled'; reason?: string; completed_at?: string; metrics?: TFTurnMetrics }
    | { status: 'error'; message?: string; completed_at?: string; metrics?: TFTurnMetrics }
  created_at: string
}

export interface TFModelMessage {
  type: 'model.message'
  id: string
  thread_id?: string
  content?: string
  tool_calls?: TFToolCall[]
  finish_reason?: string
  usage?: Record<string, number>
}

export interface TFToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
  tool_info?: { type: string; server_id?: string; server_name?: string; name: string }
}

export interface TFToolResponse {
  type: 'tool.response'
  id: string
  tool_call_id: string
  content: string
  thread_id?: string
  created_at: string
}

export interface TFTurnCreated {
  type: 'turn.created'
  id: string
  turn_id: string
  input?: unknown[]
  state: { status: 'running' }
  created_at: string
}

export interface TFTurnDone {
  type: 'turn.done'
  id: string
  turn_id: string
  state: TFTurn['state']
  created_at: string
}

export type TFSessionEvent = TFModelMessage | TFToolResponse | TFTurnCreated | TFTurnDone

export interface TFSessionEventItem {
  turn_id: string
  event: TFSessionEvent
}

export interface TFPagination {
  next_page_token?: string
}

export interface TFListResponse<T> {
  data: T[]
  pagination: TFPagination
}

export interface TFSingleResponse<T> {
  data: T
}

// ── Parsed UI data shapes ──

export interface SessionCard {
  id: string
  vehicle: string
  issue: string
  timestamp: string
  status: 'ACTIVE' | 'CLOSED' | 'RUNNING' | 'ERROR'
  cost: number
  duration: string
  scenario?: string
}

export interface EvidenceItem {
  time: string
  toolName: string
  tier: 1 | 2 | 3
  input: Record<string, unknown>
  output: unknown
  duration?: string
  status?: 'success' | 'error' | 'pending' | 'approved' | 'rejected'
}

export interface Hypothesis {
  rank: string
  name: string
  prior: number
  posterior: number
  bayesFactor: number
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  supporting: string[]
  contradictory: string[]
}

export interface TestRecommendation {
  testId: string
  label: string
  description: string
  gain: number
  cost: string
  costClass: 'low' | 'med' | 'high'
  rank: number
}

export interface GateEntry {
  time: string
  tier: 2 | 3
  toolName: string
  toolArgs: Record<string, unknown>
  justification: string
  status: 'pending' | 'approved' | 'rejected'
  result?: string
  decisionTime?: string
}

export interface VehicleInfo {
  name: string
  vin: string
  dtcs: Array<{ code: string; status: 'active' | 'pending' | 'history' }>
  description?: string
}

export interface CostBreakdown {
  turns: Array<{
    turnId: string
    inputTokens: number
    outputTokens: number
    cost: number
  }>
  totalCost: number
  model: string
}

export interface InvestigationData {
  vehicle: VehicleInfo | null
  evidence: EvidenceItem[]
  hypotheses: Hypothesis[]
  tests: TestRecommendation[]
  gates: GateEntry[]
  cost: CostBreakdown | null
  status: 'idle' | 'loading' | 'running' | 'done' | 'error'
  error?: string
}
