import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

const TIERS = Object.freeze({
  READ: "read",
  DIAGNOSTIC_ACTION: "diagnostic_action",
  IRREVERSIBLE_ACTION: "irreversible_action",
});

export class ScenarioStore {
  constructor(scenariosRoot) {
    this.scenariosRoot = scenariosRoot;
    this.vinMap = this.loadJson(join(scenariosRoot, "vins.json"), { vins: {} }).vins;
    this.actionLog = [];
    this.clearedVins = new Set();
  }

  loadJson(filePath, fallback) {
    if (!existsSync(filePath)) return fallback;
    return JSON.parse(readFileSync(filePath, "utf8"));
  }

  resolveScenario(vin) {
    const scenarioId = this.vinMap[vin];
    if (!scenarioId) {
      throw new Error(`Unknown VIN: ${vin}. Known VINs: ${Object.keys(this.vinMap).join(", ")}`);
    }
    const dir = join(this.scenariosRoot, scenarioId);
    if (!existsSync(dir)) {
      throw new Error(`Scenario data missing for ${vin}: ${scenarioId}`);
    }
    return dir;
  }

  listVins() {
    return Object.keys(this.vinMap);
  }

  getDtcs(vin) {
    const dir = this.resolveScenario(vin);
    if (this.clearedVins.has(vin)) {
      return [];
    }
    return this.loadJson(join(dir, "dtcs.json"), []);
  }

  getFreezeFrame(vin, code) {
    const dir = this.resolveScenario(vin);
    if (this.clearedVins.has(vin)) {
      throw new Error(`No freeze frame stored for ${code} on ${vin}: codes were cleared`);
    }
    const frames = this.loadJson(join(dir, "freeze_frames.json"), {});
    const frame = frames[code];
    if (!frame) {
      throw new Error(`No freeze frame stored for ${code} on ${vin}`);
    }
    return frame;
  }

  getSensorLog(vin, pid, windowStart, windowEnd) {
    const dir = this.resolveScenario(vin);
    const safePid = pid.replace(/[^a-z0-9_]/gi, "");
    const file = join(dir, "sensors", `${safePid}.json`);
    const log = this.loadJson(file, null);
    if (!log) {
      throw new Error(
        `Unknown PID '${pid}'. Available PIDs: ${this.listPids(vin).join(", ")}`
      );
    }
    const empty = { pid: log.pid, unit: log.unit, hz: log.hz, t: [], value: [] };
    let startIdx = 0;
    let endIdx = log.t.length - 1;
    if (Number.isFinite(windowStart)) {
      startIdx = log.t.findIndex((ts) => ts >= windowStart);
      if (startIdx === -1) return empty;
    }
    if (Number.isFinite(windowEnd)) {
      endIdx = log.t.findLastIndex((ts) => ts <= windowEnd);
      if (endIdx === -1) return empty;
    }
    if (startIdx > endIdx) return empty;
    return {
      pid: log.pid,
      unit: log.unit,
      hz: log.hz,
      t: log.t.slice(startIdx, endIdx + 1),
      value: log.value.slice(startIdx, endIdx + 1),
    };
  }

  getCompactTelemetry(vin, pids, samplePeriodSeconds = 1) {
    const requestedPids = pids?.length ? pids : this.listPids(vin);
    if (requestedPids.length > 10) {
      throw new Error("At most 10 PIDs may be requested in one compact telemetry bundle");
    }

    const series = {};
    for (const pid of requestedPids) {
      const log = this.getSensorLog(vin, pid);
      series[log.pid] = downsampleLog(log, samplePeriodSeconds);
    }

    return {
      vin,
      sample_period_seconds: samplePeriodSeconds,
      note:
        "Deterministic, bounded telemetry for sandbox analysis. Values are bucket means except cumulative misfire_count, which uses the bucket-end value.",
      series,
    };
  }

  listPids(vin) {
    const dir = this.resolveScenario(vin);
    const sensorsDir = join(dir, "sensors");
    if (!existsSync(sensorsDir)) return [];
    return readdirSafe(sensorsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
  }

  getServiceHistory(vin) {
    const dir = this.resolveScenario(vin);
    return this.loadJson(join(dir, "service_history.json"), []);
  }

  lookupKnowledge(code, vin) {
    const safeCode = code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (vin) {
      const dir = this.resolveScenario(vin);
      const file = join(dir, "knowledge", `${safeCode}.json`);
      const entry = this.loadJson(file, null);
      if (entry) return entry;
    }
    for (const scenarioId of new Set(Object.values(this.vinMap))) {
      const file = join(this.scenariosRoot, scenarioId, "knowledge", `${safeCode}.json`);
      const entry = this.loadJson(file, null);
      if (entry) return entry;
    }
    throw new Error(`No knowledge base entry for ${safeCode}`);
  }

  requestMeasurement(vin, measurementSpec, approvedByHuman) {
    requireApproval(approvedByHuman, "request_measurement", TIERS.DIAGNOSTIC_ACTION);
    const dir = this.resolveScenario(vin);
    const followups = this.loadJson(join(dir, "followup", "measurements.json"), {});
    const key = String(measurementSpec.test_id || measurementSpec.measurement_id || "").trim();
    const result = followups[key];
    this.actionLog.push({
      tier: TIERS.DIAGNOSTIC_ACTION,
      vin,
      action: "request_measurement",
      spec: measurementSpec,
      approved_by_human: approvedByHuman === true,
    });
    if (!result) {
      throw new Error(
        `Measurement '${key}' is not available for ${vin}. Available: ${Object.keys(followups).join(", ") || "none"}`
      );
    }
    return result;
  }

  clearCodes(vin, approvedByHuman) {
    requireApproval(approvedByHuman, "clear_codes", TIERS.IRREVERSIBLE_ACTION);
    this.resolveScenario(vin);
    this.clearedVins.add(vin);
    this.actionLog.push({
      tier: TIERS.IRREVERSIBLE_ACTION,
      vin,
      action: "clear_codes",
      approved_by_human: approvedByHuman === true,
    });
    return {
      status: "cleared",
      vin,
      note: "All DTCs and freeze frames erased. Diagnostic trail destroyed.",
    };
  }

  orderPart(vin, partId, approvedByHuman) {
    requireApproval(approvedByHuman, "order_part", TIERS.IRREVERSIBLE_ACTION);
    this.resolveScenario(vin);
    this.actionLog.push({
      tier: TIERS.IRREVERSIBLE_ACTION,
      vin,
      action: "order_part",
      partId,
      approved_by_human: approvedByHuman === true,
    });
    return {
      status: "ordered",
      vin,
      part_id: partId,
      eta_days: 3,
      note: "Mock order placed. No real money moved.",
    };
  }

  getActionLog() {
    return this.actionLog;
  }

  getVehicleInfo(vin) {
    const dir = this.resolveScenario(vin);
    return this.loadJson(join(dir, "meta.json"), null);
  }
}

function requireApproval(approvedByHuman, action, tier) {
  if (approvedByHuman !== true) {
    throw new Error(
      `${action} is a ${tier.replace("_", " ")} that requires explicit human approval. ` +
        "Do not call until the human has approved; then pass approved_by_human=true."
    );
  }
}

function readdirSafe(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function downsampleLog(log, samplePeriodSeconds) {
  const buckets = new Map();
  for (let index = 0; index < log.t.length; index += 1) {
    const bucket = Math.floor(log.t[index] / samplePeriodSeconds);
    const values = buckets.get(bucket) || [];
    values.push(log.value[index]);
    buckets.set(bucket, values);
  }

  const t = [];
  const value = [];
  for (const [bucket, values] of buckets) {
    t.push(Number((bucket * samplePeriodSeconds).toFixed(3)));
    value.push(
      log.pid === "misfire_count"
        ? values.at(-1)
        : log.pid === "o2_voltage"
          ? values[Math.floor(values.length/2)] // Middle sample preserves switching
          : Number((values.reduce((sum, item) => sum + item, 0) / values.length).toFixed(4))
    );
  }
  return { pid: log.pid, unit: log.unit, hz: 1 / samplePeriodSeconds, t, value };
}
