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

  lookupKnowledge(code) {
    const safeCode = code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
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
