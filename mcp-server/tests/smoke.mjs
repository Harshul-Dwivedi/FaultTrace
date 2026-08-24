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

const history = text(await client.callTool({ name: "get_service_history", arguments: { vin: VIN } }));
ok(history.length >= 3);

const kb = text(await client.callTool({ name: "lookup_dtc_knowledge", arguments: { code: CODE } }));
const priorSum = kb.common_causes.reduce((s, c) => s + c.prior, 0);
ok(Math.abs(priorSum - 1) < 0.01, `priors must sum to ~1, got ${priorSum}`);
ok(kb.characteristic_signatures.vacuum_leak.length > 20);

const measurement = text(
  await client.callTool({
    name: "request_measurement",
    arguments: { vin: VIN, test_id: TEST_ID, justification: "discriminate vacuum leak vs MAF" },
  })
);
strictEqual(measurement.test_id, TEST_ID);
ok(measurement.stft.slice(-3).every((v) => v < 2), "post-clamp STFT must normalize");

const unknownVin = await client.callTool({ name: "get_dtcs", arguments: { vin: "UNKNOWN123" } });
ok(unknownVin.isError === true, "unknown VIN must return a tool error");

console.log(`smoke test passed: ${tools.tools.length} tools registered, all checks green`);
process.exit(0);
