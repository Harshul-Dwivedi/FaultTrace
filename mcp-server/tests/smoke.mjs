import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ok, strictEqual, deepEqual } from "node:assert";
import { fileURLToPath } from "url";
import { registerTools } from "../src/tools.js";
import { ScenarioStore } from "../src/scenarioStore.js";

const VIN = "1HGCM82633A004352";
const CODE = "P0171";
const TEST_ID = "trim_recheck_booster_hose_clamped";

async function makeClient() {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  const store = new ScenarioStore(fileURLToPath(new URL("../scenarios/", import.meta.url)));
  registerTools(server, store);
  const client = new Client({ name: "smoke", version: "0.0.0" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

function text(result) {
  return JSON.parse(result.content[0].text);
}

const client = await makeClient();

const tools = await client.listTools();
ok(tools.tools.length >= 10, `expected >= 10 tools, got ${tools.tools.length}`);

const vins = text(await client.callTool({ name: "list_vehicles", arguments: {} }));
deepEqual(vins.vins, [VIN]);

const dtcs = text(await client.callTool({ name: "get_dtcs", arguments: { vin: VIN } }));
strictEqual(dtcs.length, 3);
strictEqual(dtcs[0].code, "P0171");

const frame = text(
  await client.callTool({ name: "get_freeze_frame", arguments: { vin: VIN, code: CODE } })
);
ok(frame.engine_load > 50, `freeze-frame load should be high, got ${frame.engine_load}`);
ok(frame.long_fuel_trim > 10, `freeze-frame LTFT should be lean, got ${frame.long_fuel_trim}`);

const pids = text(await client.callTool({ name: "get_pid_list", arguments: { vin: VIN } }));
ok(pids.pids.includes("stft") && pids.pids.includes("maf"), "stft and maf PIDs must exist");

const stft = text(
  await client.callTool({
    name: "get_sensor_log",
    arguments: { vin: VIN, pid: "stft", windowStart: 30, windowEnd: 40 },
  })
);
strictEqual(stft.t.length, Math.round(10 * 10) + 1, "10 Hz x 10 s window");
ok(Math.max(...stft.value) > 12, "trims must climb into lean territory under load");

const compact = text(
  await client.callTool({
    name: "get_compact_telemetry",
    arguments: {
      vin: VIN,
      pids: ["stft", "ltft", "engine_load", "rpm", "maf", "o2_voltage", "misfire_count"],
      sample_period_seconds: 1,
    },
  })
);
strictEqual(compact.sample_period_seconds, 1, "compact bundle reports requested period");
strictEqual(compact.series.stft.t.length, 60, "60-second source becomes 60 one-second buckets");
strictEqual(compact.series.misfire_count.value.at(-1), 89, "cumulative counter preserves final count");
ok(compact.series.stft.value.every(Number.isFinite), "compact values remain numeric");

const emptyBeforeStart = text(
  await client.callTool({
    name: "get_sensor_log",
    arguments: { vin: VIN, pid: "stft", windowStart: -5, windowEnd: -1 },
  })
);
strictEqual(emptyBeforeStart.t.length, 0, "window entirely before data returns empty");

const emptyAfterEnd = text(
  await client.callTool({
    name: "get_sensor_log",
    arguments: { vin: VIN, pid: "stft", windowStart: 100, windowEnd: 200 },
  })
);
strictEqual(emptyAfterEnd.t.length, 0, "window entirely after data returns empty");

const emptyInverted = text(
  await client.callTool({
    name: "get_sensor_log",
    arguments: { vin: VIN, pid: "stft", windowStart: 40, windowEnd: 30 },
  })
);
strictEqual(emptyInverted.t.length, 0, "inverted window returns empty");

const history = text(await client.callTool({ name: "get_service_history", arguments: { vin: VIN } }));
ok(history.length >= 3);

const kb = text(await client.callTool({ name: "lookup_dtc_knowledge", arguments: { code: CODE } }));
const priorSum = kb.common_causes.reduce((s, c) => s + c.prior, 0);
ok(Math.abs(priorSum - 1) < 0.01, `priors must sum to ~1, got ${priorSum}`);
ok(kb.characteristic_signatures.vacuum_leak.length > 20);

const refused = await client.callTool({
  name: "request_measurement",
  arguments: { vin: VIN, test_id: TEST_ID, justification: "discriminate leak vs MAF" },
});
strictEqual(refused.isError, true, "Tier-2 action without approval flag must be refused");

const measurement = text(
  await client.callTool({
    name: "request_measurement",
    arguments: {
      vin: VIN,
      test_id: TEST_ID,
      justification: "discriminate leak vs MAF",
      approved_by_human: true,
    },
  })
);
strictEqual(measurement.test_id, TEST_ID);
ok(measurement.stft.slice(-3).every((v) => v < 2), "post-clamp STFT must normalize");

const clearRefused = await client.callTool({
  name: "clear_codes",
  arguments: { vin: VIN, justification: "test", approved_by_human: false },
});
strictEqual(clearRefused.isError, true, "Tier-3 action with approved=false must be refused");

const stillThere = text(await client.callTool({ name: "get_dtcs", arguments: { vin: VIN } }));
strictEqual(stillThere.length, 3, "refused clear must not mutate DTC state");

await client.callTool({
  name: "clear_codes",
  arguments: { vin: VIN, justification: "repair verified", approved_by_human: true },
});

const afterClear = text(await client.callTool({ name: "get_dtcs", arguments: { vin: VIN } }));
strictEqual(afterClear.length, 0, "cleared VIN must report no DTCs");

const frameAfterClear = await client.callTool({
  name: "get_freeze_frame",
  arguments: { vin: VIN, code: CODE },
});
strictEqual(frameAfterClear.isError, true, "freeze frames must be gone after clearing");

const unknownVinOrder = await client.callTool({
  name: "order_part",
  arguments: { vin: "UNKNOWN123", part_id: "x", justification: "test", approved_by_human: true },
});
strictEqual(unknownVinOrder.isError, true, "order for unknown VIN must error");

console.log(`smoke test passed: ${tools.tools.length} tools registered, all checks green`);
