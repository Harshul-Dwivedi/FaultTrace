import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ANALYZE = join(ROOT, "sandbox", "analysis", "analyze.py");

function resolvePython() {
  const candidates = [
    process.env.FAULTTRACE_PYTHON,
    "python3",
    "python",
  ].filter(Boolean);
  for (const cand of candidates) {
    const probe = spawnSync(cand, ["-c", "import sys; print(sys.version_info[0])"], {
      encoding: "utf-8",
      timeout: 10000,
    });
    if (probe.status === 0) return cand;
  }
  throw new Error(
    "No Python interpreter found for sandbox analysis. Set FAULTTRACE_PYTHON " +
      "to a Python 3 executable, or ensure python3/python is on PATH."
  );
}

const PYTHON = resolvePython();

/**
 * Run sandbox/analysis/analyze.py `diagnose(telemetry, priors, tests)` and return
 * the parsed JSON result. Pure-stdlib Python, deterministic. See analyze.py CLI.
 *
 * @param {object} telemetry compact telemetry bundle with a `series` map
 * @param {object} priors    merged cause -> prior likelihood map
 * @param {Array}  tests     merged available-tests array
 * @returns {{likelihoods, posterior, ranked, test_gains, recommended_test}}
 */
export function runAnalysis(telemetry, priors, tests) {
  const tmp = mkdtempSync(join(tmpdir(), "faulttrace-analyze-"));
  const tPath = join(tmp, "telemetry.json");
  const pPath = join(tmp, "priors.json");
  const testsPath = join(tmp, "tests.json");
  try {
    writeFileSync(tPath, JSON.stringify(telemetry));
    writeFileSync(pPath, JSON.stringify(priors));
    writeFileSync(testsPath, JSON.stringify(tests || []));
    const proc = spawnSync(PYTHON, [ANALYZE, tPath, pPath, testsPath], {
      encoding: "utf-8",
      timeout: 30000,
    });
    if (proc.status !== 0) {
      throw new Error(`sandbox analysis failed (${proc.status}): ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(proc.stdout);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
