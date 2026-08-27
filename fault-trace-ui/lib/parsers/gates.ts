import type { TFSessionEventItem, GateEntry } from '../types'

const GATED_TOOLS = new Set(['request_measurement', 'clear_codes', 'order_part'])

function safeJsonParse(s: string): Record<string, unknown> {
  try { const p = JSON.parse(s); return typeof p === 'object' && p !== null ? p : {} } catch { return {} }
}

function extractToolInfo(tc: { function: { name: string; arguments: string } }): {
  toolName: string
  input: Record<string, unknown>
} {
  const args = safeJsonParse(tc.function.arguments)
  if (tc.function.name === 'call_tool') {
    return {
      toolName: String(args.tool_name || 'unknown'),
      input: (args.input as Record<string, unknown>) || {},
    }
  }
  return { toolName: tc.function.name, input: args }
}

export function parseGateLog(events: TFSessionEventItem[]): GateEntry[] {
  const calls = new Map<string, { name: string; args: Record<string, unknown>; timestamp: string }>()
  const entries: GateEntry[] = []

  for (const { event } of events) {
    if (event.type === 'model.message' && event.tool_calls) {
      for (const tc of event.tool_calls) {
        const info = extractToolInfo(tc)
        if (GATED_TOOLS.has(info.toolName)) {
          calls.set(tc.id, {
            name: info.toolName,
            args: info.input,
            timestamp: event.created_at || '',
          })
        }
      }
    }

    if (event.type === 'tool.response') {
      const call = calls.get(event.tool_call_id)
      if (!call) continue

      const output = safeJsonParse(event.content)
      const isError = output.isError === true || output.error != null
      const args = call.args

      let status: GateEntry['status'] = 'pending'
      if (isError) {
        status = 'rejected'
      } else if (args.approved_by_human === true) {
        status = 'approved'
      }

      const tier = call.name === 'clear_codes' || call.name === 'order_part' ? 3 as const : 2 as const

      let result: string | undefined
      if (call.name === 'request_measurement') {
        const r = output.result || output.test_id || args.test_id || args.measurement
        if (r) result = String(r)
      } else if (call.name === 'clear_codes') {
        result = 'DTCs cleared'
      } else if (call.name === 'order_part') {
        result = output.part_id ? `${output.part_id} (${output.status || 'ordered'})` : 'Mock order placed'
      }

      entries.push({
        time: new Date(call.timestamp).toLocaleTimeString('en-US', { hour12: false }),
        tier,
        toolName: call.name,
        toolArgs: args,
        justification: String(args.justification || ''),
        status,
        result,
      })
    }
  }

  return entries
}
