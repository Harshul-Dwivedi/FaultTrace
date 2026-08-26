import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const SCENARIO_DIR = fileURLToPath(new URL("../scenarios/scenario_C", import.meta.url));
const SEED = 5891;
mkdirSync(join(SCENARIO_DIR, "sensors"), { recursive: true });
mkdirSync(join(SCENARIO_DIR, "followup"), { recursive: true });
const HZ = 10;
const DURATION_S = 60;
const N = HZ * DURATION_S;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
const gaussian = () => {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const lerp = (a, b, f) => a + (b - a) * clamp(f, 0, 1);

function phaseAt(t) {
  if (t < 20) return { name: "idle", f: 0 };
  if (t < 28) return { name: "accel", f: (t - 20) / 8 };
  if (t < 46) return { name: "cruise", f: 0 };
  if (t < 52) return { name: "decel", f: (t - 46) / 6 };
  return { name: "idle2", f: 1 };
}

function profile(t) {
  const p = phaseAt(t);
  const rpmBase =
    p.name === "idle" ? 650 : p.name === "accel" ? lerp(650, 2500, p.f)
      : p.name === "cruise" ? 2500 : p.name === "decel" ? lerp(2500, 650, p.f) : 650;
  const loadBase =
    p.name === "idle" ? 20 : p.name === "accel" ? lerp(20, 70, p.f)
      : p.name === "cruise" ? 70 : p.name === "decel" ? lerp(70, 20, p.f) : 20;
  return { rpm: rpmBase, load: loadBase, phase: p.name };
}

function expectedMaf(rpm, load) {
  const ve = 0.3 + 0.5 * (load / 100);
  const rhoEff = 0.62;
  return (rpm * 5.4 * ve * rhoEff) / 120; // 5.4L V8
}

// O2 sensor is failing: stuck near 0V (railing lean) with no switching
// The actual engine runs fine — the mixture is correct — but the sensor lies
function o2Faulty(t) {
  // Stuck near 0V with tiny noise, NO switching behavior
  return clamp(0.04 + gaussian() * 0.015, 0.0, 0.12);
}

// The ECU sees the "lean" reading and adds fuel via closed-loop trim correction
// This makes the engine actually run rich, but the sensor still reads lean
function trimFromO2Fault(t) {
  // ECU slowly adds fuel to try to get O2 to switch — trims climb gradually
  // The climb is slow because the ECU integrates over time
  const progress = clamp(t / 45, 0, 1); // takes about 45s to reach full compensation
  return 2 + progress * 14; // starts at +2%, climbs to +16%
}

const t = [];
const rpm = [];
const engine_load = [];
const stft = [];
const ltft = [];
const maf = [];
const o2_voltage = [];
const coolant_temp = [];
const vehicle_speed = [];
const misfire_count = [];

let misfiresTotal = 0;
let ltftSmoothed = 2;

for (let i = 0; i < N; i++) {
  const ts = +(i / HZ).toFixed(2);
  const prof = phaseAt(ts);

  const r = clamp(prof.rpm + gaussian() * 25, 400, 3200);
  const load = clamp(prof.load + gaussian() * 1.5, 8, 95);

  // MAF reads correctly — the sensor is fine
  const mafTrue = expectedMaf(r, load);
  const mafMeas = Math.max(0.5, mafTrue * (1 + gaussian() * 0.02));

  // Fuel trims: ECU adds fuel based on the lying O2 sensor
  const trimTrend = trimFromO2Fault(ts);
  const st = clamp(trimTrend + gaussian() * 2, -5, 25);
  ltftSmoothed += 0.03 * (trimTrend - ltftSmoothed);
  const lt = clamp(ltftSmoothed + gaussian() * 0.6, -3, 22);

  // O2 is stuck — no switching at all
  const o2 = o2Faulty(ts);

  // Very few misfires — the engine actually runs okay, the sensor just lies
  // Occasional misfire when trims get very high and the engine is slightly rich
  const misfireRate = trimTrend > 12 ? 0.02 : 0.003;
  misfiresTotal += rand() < misfireRate ? 1 : 0;

  t.push(ts);
  rpm.push(+r.toFixed(1));
  engine_load.push(+load.toFixed(1));
  stft.push(+st.toFixed(1));
  ltft.push(+lt.toFixed(1));
  maf.push(+mafMeas.toFixed(2));
  o2_voltage.push(+o2.toFixed(3));
  coolant_temp.push(+(86 + (i / N) * 6 + gaussian() * 0.15).toFixed(1));
  vehicle_speed.push(prof.phase === "cruise" || prof.phase === "accel" ? 60 : 0);
  misfire_count.push(misfiresTotal);
}

const series = (pid, unit, val) => ({ pid, unit, hz: HZ, t, value: val });

writeFileSync(join(SCENARIO_DIR, "sensors", "rpm.json"), JSON.stringify(series("rpm", "rpm", rpm)));
writeFileSync(join(SCENARIO_DIR, "sensors", "engine_load.json"), JSON.stringify(series("engine_load", "%", engine_load)));
writeFileSync(join(SCENARIO_DIR, "sensors", "stft.json"), JSON.stringify(series("stft", "%", stft)));
writeFileSync(join(SCENARIO_DIR, "sensors", "ltft.json"), JSON.stringify(series("ltft", "%", ltft)));
writeFileSync(join(SCENARIO_DIR, "sensors", "maf.json"), JSON.stringify(series("maf", "g/s", maf)));
writeFileSync(join(SCENARIO_DIR, "sensors", "o2_voltage.json"), JSON.stringify(series("o2_voltage", "V", o2_voltage)));
writeFileSync(join(SCENARIO_DIR, "sensors", "coolant_temp.json"), JSON.stringify(series("coolant_temp", "C", coolant_temp)));
writeFileSync(join(SCENARIO_DIR, "sensors", "vehicle_speed.json"), JSON.stringify(series("vehicle_speed", "km/h", vehicle_speed)));
writeFileSync(join(SCENARIO_DIR, "sensors", "misfire_count.json"), JSON.stringify(series("misfire_count", "count", misfire_count)));

console.log(`scenario_C sensors generated: ${N} samples @ ${HZ} Hz, seed ${SEED}, dir ${SCENARIO_DIR}`);
