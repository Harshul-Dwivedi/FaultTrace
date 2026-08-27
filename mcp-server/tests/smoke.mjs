import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ok, strictEqual, deepEqual } from "node:assert";
import { fileURLToPath } from "url";
import { registerTools } from "../src/tools.js";
import { ScenarioStore } from "../src/scenarioStore.js";

const VIN = "1HGCM82633A004352";
const VIN_B = "2T1BURHE0JC000001";
const VIN_C = "1FTZX17N9XKA00002";
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
ok(vins.vins.includes(VIN), "scenario A VIN must exist");
ok(vins.vins.includes(VIN_B), "scenario B VIN must exist");
ok(vins.vins.includes(VIN_C), "scenario C VIN must exist");

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

const kb = text(await client.callTool({ name: "lookup_dtc_knowledge", arguments: { code: CODE, vin: VIN } }));
const priorSum = kb.common_causes.reduce((s, c) => s + c.prior, 0);
ok(Math.abs(priorSum - 1) < 0.01, `priors must sum to ~1, got ${priorSum}`);
ok(kb.characteristic_signatures.vacuum_leak.length > 20);

// Scenario B: MAF fault
const dtcsB = text(await client.callTool({ name: "get_dtcs", arguments: { vin: VIN_B } }));
ok(dtcsB.length >= 2, `scenario B should have >= 2 DTCs, got ${dtcsB.length}`);
ok(dtcsB.some((d) => d.code === "P0171"), "scenario B must have P0171");
ok(dtcsB.some((d) => d.code === "P0102"), "scenario B must have P0102 (MAF)");
const frameB = text(await client.callTool({ name: "get_freeze_frame", arguments: { vin: VIN_B, code: "P0102" } }));
ok(frameB.maf < 15, "scenario B freeze-frame MAF should be low (contaminated)");
const kbP0102 = text(await client.callTool({ name: "lookup_dtc_knowledge", arguments: { code: "P0102", vin: VIN_B } }));
ok(kbP0102.common_causes.length >= 3, "P0102 knowledge must have causes");

// Scenario C: O2 sensor fault
const dtcsC = text(await client.callTool({ name: "get_dtcs", arguments: { vin: VIN_C } }));
ok(dtcsC.length >= 2, `scenario C should have >= 2 DTCs, got ${dtcsC.length}`);
ok(dtcsC.some((d) => d.code === "P0133"), "scenario C must have P0133 (O2 slow)");
const frameC = text(await client.callTool({ name: "get_freeze_frame", arguments: { vin: VIN_C, code: "P0133" } }));
ok(frameC.o2_voltage < 0.1, "scenario C O2 should be stuck lean");
const kbP0133 = text(await client.callTool({ name: "lookup_dtc_knowledge", arguments: { code: "P0133", vin: VIN_C } }));
ok(kbP0133.common_causes.length >= 3, "P0133 knowledge must have causes");

// run_analysis: sandbox Bayesian differential + recommended test per scenario.
const CANONICAL_A = { vacuum_leak: "smoke_test" };
const CANONICAL_B = { maf_fault: "known_good_maf_swap" };
const CANONICAL_C = { o2_sensor_fault: "known_good_o2_swap" };
const FAMILY = {
  maf_fault: ["maf_contamination", "maf_electrical_fault", "maf_ground_fault", "air_intake_restrict", "ecu_fault"],
  o2_sensor_fault: ["o2_sensor_contamination", "o2_sensor_aging", "o2_heater_fault"],
};
const FAMILY_CAUSES = new Set(["vacuum_leak", "maf_fault", "weak_fuel_delivery", "ignition_fault", "o2_sensor_fault"]);
function familyOf(cause) {
  if (FAMILY_CAUSES.has(cause)) return cause;
  for (const [fam, aliases] of Object.entries(FAMILY)) if (aliases.includes(cause)) return fam;
  return cause;
}
async function assertAnalysis(vin, expected) {
  const [expFamily, expTest] = expected;
  const res = text(await client.callTool({ name: "run_analysis", arguments: { vin } }));
  ok(res.ranked && res.ranked.length >= 2, `analysis must rank >= 2 hypotheses`);
  const topFamily = familyOf(res.ranked[0].cause);
  ok(topFamily === expFamily, `${vin}: expected top family ${expFamily}, got ${topFamily} (${res.ranked[0].cause})`);
  strictEqual(res.recommended_test?.test_id, expTest, `${vin}: expected recommended test ${expTest}`);
}
await assertAnalysis(VIN, ["vacuum_leak", "smoke_test"]);
await assertAnalysis(VIN_B, ["maf_fault", "known_good_maf_swap"]);
await assertAnalysis(VIN_C, ["o2_sensor_fault", "known_good_o2_swap"]);

// get_vehicle_info must not leak ground truth
const infoA = text(await client.callTool({ name: "get_vehicle_info", arguments: { vin: VIN } }));
ok(infoA.vehicle, "vehicle info must include vehicle description");
ok(infoA.vehicle.includes("2.4"), "vehicle info must contain displacement");
strictEqual(infoA.ground_truth_eval_only, undefined, "ground truth must not be exposed");
strictEqual(infoA.notes, undefined, "notes must not be exposed");

const infoB = text(await client.callTool({ name: "get_vehicle_info", arguments: { vin: VIN_B } }));
ok(infoB.vehicle, "scenario B vehicle info must include vehicle description");
strictEqual(infoB.ground_truth_eval_only, undefined, "scenario B ground truth must not be exposed");

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
