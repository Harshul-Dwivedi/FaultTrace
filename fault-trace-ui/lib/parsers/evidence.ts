import type { TFSessionEventItem, EvidenceItem } from '../types'

const TIER_2_TOOLS = new Set(['request_measurement'])
const TIER_3_TOOLS = new Set(['clear_codes', 'order_part'])

function getTier(name: string): 1 | 2 | 3 {
  if (TIER_3_TOOLS.has(name)) return 3
  if (TIER_2_TOOLS.has(name)) return 2
  return 1
}

function safeJsonParse(s: string): unknown {
  try { return JSON.parse(s) } catch { return s }
}

function extractToolInfo(tc: { function: { name: string; arguments: string } }): {
  toolName: string
  input: Record<string, unknown>
  isMcp: boolean
} {
  const { name, arguments: argsStr } = tc.function
  const args = safeJsonParse(argsStr) as Record<string, unknown>

  if (name === 'call_tool') {
    // TrueForge wraps MCP calls: { tool_name, mcp_server, input }
    return {
      toolName: String(args.tool_name || args.name || 'unknown'),
      input: (args.input as Record<string, unknown>) || {},
      isMcp: args.mcp_server != null,
    }
  }

  if (name === 'exec') {
    return { toolName: 'sandbox', input: { command: String(args.command || '').slice(0, 120) }, isMcp: false }
  }

  return { toolName: name, input: args, isMcp: false }
}

function summarizeOutput(toolName: string, output: unknown): string {
  if (typeof output === 'string') {
    try { output = JSON.parse(output) } catch { return output.slice(0, 150) }
  }
  if (!output || typeof output !== 'object') return String(output ?? '')

  const o = output as Record<string, unknown>

  // Handle error responses
  if (o.error) {
    const errText = Array.isArray(o.error) ? o.error.map((e: any) => e.text || e).join(' ') : String(o.error)
    return `Error: ${errText.slice(0, 120)}`
  }

  switch (toolName) {
    case 'get_dtcs': {
      const arr = Array.isArray(o) ? o : []
      return arr.length ? arr.map((d: any) => `${d.code}${d.status ? ` (${d.status})` : ''}`).join(', ') : 'No DTCs'
    }
    case 'get_freeze_frame': {
      const parts: string[] = []
      if (o.long_fuel_trim != null) parts.push(`LTFT: ${Number(o.long_fuel_trim).toFixed(1)}%`)
      if (o.short_fuel_trim != null) parts.push(`STFT: ${Number(o.short_fuel_trim).toFixed(1)}%`)
      if (o.maf != null) parts.push(`MAF: ${Number(o.maf).toFixed(1)} g/s`)
      if (o.o2_voltage != null) parts.push(`O2: ${Number(o.o2_voltage).toFixed(2)}V`)
      if (o.engine_load != null) parts.push(`Load: ${Number(o.engine_load).toFixed(0)}%`)
      if (o.rpm != null) parts.push(`RPM: ${Number(o.rpm).toFixed(0)}`)
      return parts.join(', ') || JSON.stringify(o).slice(0, 100)
    }
    case 'get_compact_telemetry': {
      const s = o as any
      const pids = s.series ? Object.keys(s.series) : []
      return `${pids.length} PIDs, ${s.sample_period_seconds ?? '?'}s period`
    }
    case 'lookup_dtc_knowledge': {
      const kb = o as any
      const causes = kb.common_causes ? kb.common_causes.map((c: any) => `${c.cause} (${(c.prior * 100).toFixed(0)}%)`).join(', ') : ''
      const tests = kb.available_tests ? kb.available_tests.length : 0
      return `${kb.common_causes?.length || 0} hypotheses: ${causes}. ${tests} tests available.`
    }
    case 'get_vehicle_info':
      return (o as any).vehicle || 'Vehicle info'
    case 'get_service_history': {
      const arr = Array.isArray(o) ? o : []
      return `${arr.length} service records`
    }
    case 'get_pid_list': {
      const pids = (o as any).pids
      return pids ? `${pids.length} PIDs: ${pids.join(', ')}` : 'PID list'
    }
    case 'get_sensor_log': {
      const arr = o as any
      if (arr.t && arr.value) {
        const min = Math.min(...arr.value).toFixed(1)
        const max = Math.max(...arr.value).toFixed(1)
        return `${arr.t.length} samples, range [${min}, ${max}]`
      }
      return 'Sensor data'
    }
    case 'request_measurement': {
      const testId = (o as any).test_id || (o as any).measurement || 'unknown'
      const result = (o as any).result
      return result ? `${testId} → ${result}` : `Test: ${testId}`
    }
    case 'clear_codes':
      return 'DTCs cleared'
    case 'order_part': {
      const part = (o as any).part_id || 'unknown'
      const status = (o as any).status || ''
      return `${part} ${status ? `(${status})` : ''}`
    }
    default:
      return JSON.stringify(o).slice(0, 100)
  }
}

export function parseEvidenceTimeline(events: TFSessionEventItem[]): EvidenceItem[] {
  const toolCalls = new Map<string, { name: string; input: Record<string, unknown>; timestamp: string; isMcp: boolean }>()
  const items: EvidenceItem[] = []

  for (const { event } of events) {
    if (event.type === 'model.message' && event.tool_calls) {
      for (const tc of event.tool_calls) {
        const info = extractToolInfo(tc)
        toolCalls.set(tc.id, {
          name: info.toolName,
          input: info.input,
          timestamp: event.created_at || '',
          isMcp: info.isMcp,
        })
      }
    }

    if (event.type === 'tool.response') {
      const call = toolCalls.get(event.tool_call_id)
      if (!call) continue

      // Skip non-MCP tool responses (sandbox exec results)
      // But include them if they have useful info
      const output = safeJsonParse(event.content)
      const isGated = TIER_2_TOOLS.has(call.name) || TIER_3_TOOLS.has(call.name)

      let status: EvidenceItem['status'] = 'success'
      if (isGated) {
        const outObj = typeof output === 'object' && output !== null ? output as Record<string, unknown> : null
        if (outObj?.error || outObj?.isError) {
          status = 'rejected'
        } else {
          status = 'approved'
        }
      }

      items.push({
        time: new Date(call.timestamp).toLocaleTimeString('en-US', { hour12: false }),
        toolName: call.name,
        tier: getTier(call.name),
        input: call.input,
        output,
        status,
      })
    }
  }

  return items
}
