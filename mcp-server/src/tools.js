import { z } from "zod";

const VinSchema = z.string().min(5).describe("Vehicle Identification Number");

export function registerTools(server, store) {
  server.registerTool(
    "list_vehicles",
    {
      title: "List vehicles",
      description:
        "List all vehicle VINs known to the service. Call this first if no VIN was provided.",
      inputSchema: {},
    },
    async () => jsonResult({ vins: store.listVins() })
  );

  server.registerTool(
    "get_dtcs",
    {
      title: "Get diagnostic trouble codes",
      description:
        "Read active and pending diagnostic trouble codes (DTCs) for a VIN. Read-only, safe.",
      inputSchema: { vin: VinSchema },
    },
    async ({ vin }) => jsonResult(store.getDtcs(vin))
  );

  server.registerTool(
    "get_freeze_frame",
    {
      title: "Get freeze frame",
      description:
        "Read the freeze-frame sensor snapshot captured at the moment a given DTC was set. Read-only, safe.",
      inputSchema: { vin: VinSchema, code: z.string().describe("DTC code, e.g. P0171") },
    },
    async ({ vin, code }) => jsonResult(store.getFreezeFrame(vin, code.toUpperCase()))
  );

  server.registerTool(
    "get_sensor_log",
    {
      title: "Get sensor time-series log",
      description:
        "Read a time-series log for one PID (sensor). Use get_pid_list to see available PIDs. Optional windowStart/windowEnd trim by seconds. Read-only, safe.",
      inputSchema: {
        vin: VinSchema,
        pid: z.string().describe("PID name, e.g. stft, rpm, maf"),
        windowStart: z.number().optional().describe("window start in seconds"),
        windowEnd: z.number().optional().describe("window end in seconds"),
      },
    },
    async ({ vin, pid, windowStart, windowEnd }) =>
      jsonResult(store.getSensorLog(vin, pid, windowStart, windowEnd))
  );

  server.registerTool(
    "get_pid_list",
    {
      title: "List available PIDs",
      description: "List sensor PIDs with logged time-series data for a VIN. Read-only, safe.",
      inputSchema: { vin: VinSchema },
    },
    async ({ vin }) => jsonResult({ pids: store.listPids(vin) })
  );

  server.registerTool(
    "get_service_history",
    {
      title: "Get service history",
      description:
        "Read the maintenance and repair history for a VIN. Read-only, safe.",
      inputSchema: { vin: VinSchema },
    },
    async ({ vin }) => jsonResult(store.getServiceHistory(vin))
  );

  server.registerTool(
    "lookup_dtc_knowledge",
    {
      title: "Look up DTC knowledge",
      description:
        "Knowledge base entry for a DTC code: common root causes with base-rate priors (sum to 1) and each cause's characteristic signature in sensor data. Use priors as the Bayesian prior for hypothesis ranking. Read-only, safe.",
      inputSchema: { code: z.string().describe("DTC code, e.g. P0171") },
    },
    async ({ code }) => jsonResult(store.lookupKnowledge(code.toUpperCase()))
  );

  server.registerTool(
    "request_measurement",
    {
      title: "Request physical measurement",
      description:
        "TIER 2 - REQUIRES HUMAN APPROVAL. Sends a technician to perform a physical diagnostic measurement on the vehicle (e.g. smoke_test, vac_gauge_idle, trim_recheck_idle_purge_clamped) and returns the result. Only call after the human approves.",
      inputSchema: {
        vin: VinSchema,
        test_id: z.string().describe("Identifier of the requested measurement"),
        justification: z.string().describe("Why this measurement is needed and what it will discriminate"),
      },
    },
    async ({ vin, test_id, justification }) =>
      jsonResult(store.requestMeasurement(vin, { test_id, justification }))
  );

  server.registerTool(
    "clear_codes",
    {
      title: "Clear DTCs",
      description:
        "TIER 3 - IRREVERSIBLE, REQUIRES EXPLICIT HUMAN APPROVAL. Erases all DTCs and freeze frames, destroying the diagnostic trail. Never call without explicit approval.",
      inputSchema: { vin: VinSchema, justification: z.string() },
    },
    async ({ vin }) => jsonResult(store.clearCodes(vin))
  );

  server.registerTool(
    "order_part",
    {
      title: "Order replacement part",
      description:
        "TIER 3 - IRREVERSIBLE, REQUIRES EXPLICIT HUMAN APPROVAL. Places an order for a replacement part (spends money). Never call without explicit approval.",
      inputSchema: {
        vin: VinSchema,
        part_id: z.string(),
        justification: z.string(),
      },
    },
    async ({ vin, part_id }) => jsonResult(store.orderPart(vin, part_id))
  );
}

function jsonResult(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}
