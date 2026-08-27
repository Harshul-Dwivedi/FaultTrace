import { spawnSync, execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ANALYZE = join(ROOT, "sandbox", "analysis", "analyze.py");

const PROBE_TIMEOUT_MS = 10000;
const RUN_TIMEOUT_MS = 30000;
const MAX_STDOUT = 10 * 1024 * 1024;

let cachedPython = null;

/**
 * Lazily resolve a Python 3 interpreter. Kept lazy so module import (and thus
 * MCP server startup) never fails when Python is absent — only run_analysis
 * fails, and only when it is actually invoked.
 */
function resolvePython() {
  if (cachedPython) return cachedPython;
  const candidates = [
    process.env.FAULTTRACE_PYTHON,
    "python3",
    "python",
  ].filter(Boolean);
  const errors = [];
  for (const cand of candidates) {
    let probe;
    try {
      probe = spawnSync(cand, ["-c", "import sys; print(sys.version_info[0])"], {
        encoding: "utf-8",
        timeout: PROBE_TIMEOUT_MS,
      });
    } catch (e) {
      errors.push(`${cand}: ${e.message}`);
      continue;
    }
    if (probe.status !== 0) {
      errors.push(`${cand}: ${String(probe.stderr || probe.error || `exit ${probe.status}`).trim()}`);
      continue;
    }
    const major = String(probe.stdout || "").trim();
    if (major === "3") {
      cachedPython = cand;
      return cand;
    }
    errors.push(`${cand}: reported Python ${major || "unknown"}, need 3`);
  }
  throw new Error(
    "No Python 3 interpreter found for sandbox analysis. Set FAULTTRACE_PYTHON to a " +
      "Python 3 executable, or ensure python3/python is on PATH. " +
      `(probe: ${errors.join("; ") || "no candidates"})`
  );
}

function runAsync(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { encoding: "utf-8", timeout: timeoutMs, maxBuffer: MAX_STDOUT },
      (err, stdout, stderr) => {
        if (err) {
          const detail = String(stderr || err.message).trim();
          reject(new Error(`sandbox analysis failed: ${detail || err.code || "unknown error"}`));
          return;
        }
        resolve(stdout);
      }
    );
  });
}

/**
 * Run sandbox/analysis/analyze.py `diagnose(telemetry, priors, tests)` and return
 * the parsed JSON result. Pure-stdlib Python, deterministic. Asynchronous so the
 * MCP server's event loop is not blocked while the (bounded, timeout-killed)
 * child process runs. See analyze.py CLI.
 *
 * @param {object} telemetry full-resolution telemetry bundle with a `series` map
 * @param {object} priors    merged cause -> prior likelihood map
 * @param {Array}  tests     merged available-tests array
 * @returns {Promise<{likelihoods, posterior, ranked, test_gains, recommended_test}>}
 */
export async function runAnalysis(telemetry, priors, tests) {
  const python = resolvePython();
  const tmp = mkdtempSync(join(tmpdir(), "faulttrace-analyze-"));
  const tPath = join(tmp, "telemetry.json");
  const pPath = join(tmp, "priors.json");
  const testsPath = join(tmp, "tests.json");
  try {
    writeFileSync(tPath, JSON.stringify(telemetry));
    writeFileSync(pPath, JSON.stringify(priors));
    writeFileSync(testsPath, JSON.stringify(tests || []));
    const stdout = await runAsync(python, [ANALYZE, tPath, pPath, testsPath], RUN_TIMEOUT_MS);
    return JSON.parse(stdout);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
