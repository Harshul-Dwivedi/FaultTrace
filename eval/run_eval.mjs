/**
 * run_eval.mjs — FaultTrace sandbox analysis evaluation harness.
 *
 * Drives sandbox/analysis/analyze.py against the three synthetic scenarios
 * (A: vacuum leak, B: MAF fault, C: O2 sensor railed) and asserts the ranked
 * root-cause posterior matches each scenario's ground truth (meta.json, which
 * is eval-only and never exposed via MCP).
 *
 * Deterministic: no randomness in either the scenario data or the analysis.
 *
 * Usage:  node eval/run_eval.mjs
 * Exit code 0 if every scenario passes, 1 otherwise.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCEN_DIR = join(ROOT, "mcp-server", "scenarios");
const ANALYZE = join(ROOT, "sandbox", "analysis", "analyze.py");

const EXPECTED_CAUSE = {
  scenario_A: "vacuum_leak",
  scenario_B: "maf_fault",
  scenario_C: "o2_sensor_fault",
};

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf-8"));
}

function listScenarios() {
  return readdirSync(SCEN_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("scenario_"))
    .map((e) => e.name)
    .sort();
}

function buildTelemetry(scenario) {
  const sensorsDir = join(SCEN_DIR, scenario, "sensors");
  const series = {};
  for (const f of readdirSync(sensorsDir)) {
    if (!f.endsWith(".json")) continue;
    const pid = f.slice(0, -5);
    const d = readJson(join(sensorsDir, f));
    series[pid] = {
      pid,
      unit: d.unit ?? null,
      value: Array.isArray(d.value) ? d.value : [],
    };
  }
  return { vin: null, sample_period_seconds: null, series };
}

function buildPriors(scenario) {
  const kdir = join(SCEN_DIR, scenario, "knowledge");
  const prior = {};
  for (const f of readdirSync(kdir)) {
    if (!f.endsWith(".json")) continue;
    const k = readJson(join(kdir, f));
    for (const c of k.common_causes ?? []) {
      if (c && c.cause) prior[c.cause] = Math.max(prior[c.cause] ?? 0, c.prior ?? 0);
    }
  }
  const tot = Object.values(prior).reduce((a, b) => a + b, 0);
  if (tot <= 0) return prior;
  const norm = {};
  for (const [k, v] of Object.entries(prior)) norm[k] = v / tot;
  return norm;
}

function buildTests(scenario) {
  const kdir = join(SCEN_DIR, scenario, "knowledge");
  const tests = [];
  for (const f of readdirSync(kdir)) {
    if (!f.endsWith(".json")) continue;
    const k = readJson(join(kdir, f));
    for (const t of k.available_tests ?? []) tests.push(t);
  }
  return tests;
}

function runAnalyze(telemetry, priors, tests) {
  const tmp = mkdtempSync(join(tmpdir(), "faulttrace-eval-"));
  const tPath = join(tmp, "telemetry.json");
  const pPath = join(tmp, "priors.json");
  const tPath3 = join(tmp, "tests.json");
  writeFileSync(tPath, JSON.stringify(telemetry));
  writeFileSync(pPath, JSON.stringify(priors));
  writeFileSync(tPath3, JSON.stringify(tests));
  const proc = spawnSync("python", [ANALYZE, tPath, pPath, tPath3], { encoding: "utf-8" });
  rmSync(tmp, { recursive: true, force: true });
  if (proc.status !== 0) {
    throw new Error(`analyze.py failed (${proc.status}): ${proc.stderr || proc.stdout}`);
  }
  return JSON.parse(proc.stdout);
}

function expectedCause(scenario) {
  return EXPECTED_CAUSE[scenario];
}

function assertScenario(scenario) {
  const meta = readJson(join(SCEN_DIR, scenario, "meta.json"));
  const ground = meta.ground_truth_eval_only?.root_cause ?? "(none)";
  const expected = expectedCause(scenario);
  const telemetry = buildTelemetry(scenario);
  const priors = buildPriors(scenario);
  const tests = buildTests(scenario);

  const result = runAnalyze(telemetry, priors, tests);
  const ranked = result.ranked ?? [];
  const top = ranked[0]?.cause ?? null;
  const topPost = ranked[0]?.posterior ?? 0;

  const pass = top === expected && topPost > 0;
  const recTest = result.recommended_test?.test_id ? ` | recommended test: ${result.recommended_test.test_id}` : "";

  console.log(`\n=== ${scenario} ===`);
  console.log(`  ground truth : ${ground}`);
  console.log(`  expected     : ${expected}`);
  console.log(`  top posterior: ${top} (${(topPost * 100).toFixed(1)}%)${recTest}`);
  console.log(`  posterior    :`);
  for (const r of ranked.slice(0, 6)) {
    console.log(`     ${r.cause.padEnd(20)} ${(r.posterior * 100).toFixed(1).padStart(6)}%`);
  }
  console.log(`  verdict      : ${pass ? "PASS" : "FAIL"}`);
  return { scenario, pass, top, expected };
}

function frames() {
  let failures = 0;
  const results = [];
  for (const s of listScenarios()) {
    const r = assertScenario(s);
    results.push(r);
    if (!r.pass) failures++;
  }
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Eval summary: ${results.length - failures}/${results.length} scenarios passed`);
  for (const r of results) {
    console.log(`  ${r.scenario}: ${r.pass ? "PASS" : "FAIL"} (expected ${r.expected}, top ${r.top})`);
  }
  return failures;
}

process.exit(frames() === 0 ? 0 : 1);
