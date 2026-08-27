import type { TFSessionEventItem, VehicleInfo } from '../types'

function safeJsonParse(s: string): Record<string, unknown> {
  try { const p = JSON.parse(s); return typeof p === 'object' && p !== null ? p : {} } catch { return {} }
}

function extractToolInfo(tc: { function: { name: string; arguments: string } }): Record<string, unknown> {
  const args = safeJsonParse(tc.function.arguments)
  if (tc.function.name === 'call_tool') {
    return (args.input as Record<string, unknown>) || {}
  }
  return args
}

export function parseVehicleInfo(events: TFSessionEventItem[]): VehicleInfo | null {
  let vin = ''
  let vehicleName = ''
  const dtcs: VehicleInfo['dtcs'] = []

  for (const { event } of events) {
    // Extract VIN from tool call arguments
    if (event.type === 'model.message' && event.tool_calls) {
      for (const tc of event.tool_calls) {
        const input = extractToolInfo(tc)
        if (input.vin && !vin) vin = String(input.vin)
      }
    }

    // Extract vehicle name from get_vehicle_info response
    if (event.type === 'tool.response') {
      const content = safeJsonParse(event.content)
      if (content.vehicle && !vehicleName) {
        vehicleName = String(content.vehicle)
      }
      if (content.vin && !vin) {
        vin = String(content.vin)
      }

      // Extract DTCs from get_dtcs response
      try {
        const parsed = typeof event.content === 'string' ? JSON.parse(event.content) : event.content
        if (Array.isArray(parsed)) {
          for (const d of parsed) {
            if (d.code) {
              dtcs.push({
                code: d.code,
                status: d.status || 'active',
              })
            }
          }
        }
      } catch { /* not JSON array */ }
    }
  }

  if (!vin && !vehicleName && dtcs.length === 0) return null

  // Deduplicate DTCs
  const seen = new Set<string>()
  const uniqueDtcs = dtcs.filter((d) => {
    if (seen.has(d.code)) return false
    seen.add(d.code)
    return true
  })

  return {
    name: vehicleName || 'Unknown Vehicle',
    vin,
    dtcs: uniqueDtcs,
  }
}
