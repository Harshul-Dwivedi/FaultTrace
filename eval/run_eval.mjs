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

function resolvePython() {
  const candidates = [
    process.env.FAULTTRACE_PYTHON,
    "python3",
    "python",
  ].filter(Boolean);
  for (const cand of candidates) {
    const probe = spawnSync(cand, ["--version"], { encoding: "utf-8" });
    if (probe.status === 0) return cand;
  }
  return null;
}

const PYTHON = resolvePython();
if (!PYTHON) {
  console.error(
    "Cannot find a Python 3 interpreter. Set FAULTTRACE_PYTHON, or ensure `python3`/`python` is on PATH, then re-run."
  );
  process.exit(1);
}

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
  const proc = spawnSync(PYTHON, [ANALYZE, tPath, pPath, tPath3], { encoding: "utf-8" });
  rmSync(tmp, { recursive: true, force: true });
  if (proc.status !== 0) {
    throw new Error(`analyze.py failed (${proc.status}): ${proc.stderr || proc.stdout}`);
  }
  return JSON.parse(proc.stdout);
}

// ---------------------------------------------------------------- #
// FFT signature self-test: normalization must be independent of n.
// A pure in-band sinusoid must report a stable high ratio and match=TRUE at
// every window length; a pure out-of-band tone must report match=FALSE.
// ---------------------------------------------------------------- #
function runFftSelfTest() {
  const src = `
import sys, math
sys.path.insert(0, ${JSON.stringify(join(ROOT, "sandbox", "analysis"))})
import analyze as an
fail = 0
for n in (64, 128, 256):
    fs = 10.0
    t = [i / fs for i in range(n)]
    vin = [4.0 * math.sin(2 * math.pi * 2.0 * ti) for ti in t]
    rin = an.fft_signature(t, vin, (1.5, 3.5))
    vout = [4.0 * math.sin(2 * math.pi * 0.4 * ti) for ti in t]
    rout = an.fft_signature(t, vout, (1.5, 3.5))
    if not (rin["match"] and rin["band_energy_ratio"] > 0.4):
        print(f"FAIL n={n} in-band ratio={rin['band_energy_ratio']:.3f} match={rin['match']}")
        fail += 1
    if rout["match"]:
        print(f"FAIL n={n} out-of-band reported match")
        fail += 1
print("0" if fail == 0 else str(fail))
sys.exit(1 if fail else 0)
  `;
  const proc = spawnSync(PYTHON, ["-c", src], { encoding: "utf-8" });
  const line = (proc.stdout || "").split("\n").map((s) => s.trim()).filter(Boolean).pop();
  const ok = proc.status === 0 && line === "0";
  if (!ok) {
    console.error("FFT signature self-test FAILED:\n" + (proc.stdout || proc.stderr));
  }
  return ok;
}

function assertScenario(scenario) {
  const meta = readJson(join(SCEN_DIR, scenario, "meta.json"));
  const ground = meta.ground_truth_eval_only?.root_cause ?? "(none)";
  const expected = meta.ground_truth_eval_only?.canonical_cause ?? null;
  const expectedTest = meta.ground_truth_eval_only?.expected_test_id ?? null;
  const telemetry = buildTelemetry(scenario);
  const priors = buildPriors(scenario);
  const tests = buildTests(scenario);

  const result = runAnalyze(telemetry, priors, tests);
  const ranked = result.ranked ?? [];
  const top = ranked[0]?.cause ?? null;
  const topPost = ranked[0]?.posterior ?? 0;
  const recTest = result.recommended_test?.test_id ?? null;

  const pass = top === expected && topPost > 0 && recTest === expectedTest;
  const recTestStr = recTest ? ` | recommended test: ${recTest}` : "";

  console.log(`\n=== ${scenario} ===`);
  console.log(`  ground truth : ${ground}`);
  console.log(`  expected     : ${expected} (canonical cause)`);
  console.log(`  expected test: ${expectedTest}`);
  console.log(`  top posterior: ${top} (${(topPost * 100).toFixed(1)}%)${recTestStr}`);
  console.log(`  posterior    :`);
  for (const r of ranked.slice(0, 6)) {
    console.log(`     ${r.cause.padEnd(20)} ${(r.posterior * 100).toFixed(1).padStart(6)}%`);
  }
  console.log(
    `  verdict      : ${pass ? "PASS" : "FAIL"}` +
      (pass
        ? ""
        : ` (top=${top}, want=${expected}; test=${recTest}, want=${expectedTest})`)
  );
  return { scenario, pass, top, expected };
}

function frames() {
  const fftOk = runFftSelfTest();
  let failures = 0;
  const results = [];
  for (const s of listScenarios()) {
    const r = assertScenario(s);
    results.push(r);
    if (!r.pass) failures++;
  }
  console.log(`\n${"=".repeat(50)}`);
  console.log(`FFT self-test        : ${fftOk ? "PASS" : "FAIL"}`);
  console.log(`Eval summary         : ${results.length - failures}/${results.length} scenarios passed`);
  for (const r of results) {
    console.log(`  ${r.scenario}: ${r.pass ? "PASS" : "FAIL"} (expected ${r.expected}, top ${r.top})`);
  }
  return failures + (fftOk ? 0 : 1);
}

process.exit(frames() === 0 ? 0 : 1);
