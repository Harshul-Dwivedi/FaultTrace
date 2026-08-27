import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const SCENARIO_DIR = fileURLToPath(new URL("../scenarios/scenario_B", import.meta.url));
const SEED = 2749;
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
    p.name === "idle" ? 750 : p.name === "accel" ? lerp(750, 2400, p.f)
      : p.name === "cruise" ? 2400 : p.name === "decel" ? lerp(2400, 750, p.f) : 750;
  const loadBase =
    p.name === "idle" ? 16 : p.name === "accel" ? lerp(16, 65, p.f)
      : p.name === "cruise" ? 65 : p.name === "decel" ? lerp(65, 16, p.f) : 16;
  return { rpm: rpmBase, load: loadBase, phase: p.name };
}

function expectedMaf(rpm, load) {
  const ve = 0.3 + 0.5 * (load / 100);
  const rhoEff = 0.62;
  return (rpm * 2.4 * ve * rhoEff) / 120;
}

// MAF sensor is failing: reads low with erratic noise spikes
// The fault is that the MAF hot-wire is contaminated, causing it to under-report
// AND occasionally produce wild spikes (dirt on the wire causes momentary cooling)
function mafFaulty(trueMaf, t) {
  // Base: reads about 25-35% low (contaminated wire under-reports)
  const baseFactor = 0.68 + 0.05 * Math.sin(t / 12); // slow drift in under-read
  // Erratic spikes: occasionally the dirt causes a sudden jump or drop
  const spike = rand() < 0.03 ? (rand() > 0.5 ? 1.8 : 0.3) : 1.0;
  // High-frequency noise (much noisier than a healthy MAF)
  const noise = 1 + gaussian() * 0.08;
  return Math.max(0.5, trueMaf * baseFactor * spike * noise);
}

function trimForMafFault(load, mafError) {
  // Fuel trims compensate for the MAF under-reading
  // The compensation is roughly proportional to the MAF error
  // At higher load, the absolute error is larger, so trims climb
  const baseTrim = 4 + 0.25 * (load - 16);
  const mafCompensation = mafError * 30; // roughly: 30% under-read -> +9% trim
  return baseTrim + mafCompensation;
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
let ltftSmoothed = 3;

for (let i = 0; i < N; i++) {
  const ts = +(i / HZ).toFixed(2);
  const prof = profile(ts);

  const r = clamp(prof.rpm + gaussian() * 25, 400, 3200);
  const load = clamp(prof.load + gaussian() * 1.5, 8, 95);

  const mafTrue = expectedMaf(r, load);
  const mafMeas = mafFaulty(mafTrue, ts);
  const mafError = 1 - mafMeas / mafTrue; // positive when MAF reads low

  const trimTrend = trimForMafFault(load, mafError);
  const st = clamp(trimTrend + gaussian() * 3.5, -8, 38); // noisier due to MAF instability
  ltftSmoothed += 0.025 * (trimTrend - ltftSmoothed);
  const lt = clamp(ltftSmoothed + gaussian() * 1.2, -8, 32);

  // O2: lean bias because ECU adds fuel based on low MAF, but actual mixture
  // oscillates because the MAF spikes cause momentary rich/lean swings
  let o2;
  if (trimTrend > 12) {
    o2 = clamp(0.2 + gaussian() * 0.08, 0.05, 0.45);
  } else {
    o2 = 0.45 + 0.38 * Math.sin((ts / 0.7) * Math.PI * 2) + gaussian() * 0.06;
    o2 = clamp(o2, 0.05, 0.9);
  }

  // Misfires happen when trim is very high AND MAF just spiked (momentary very lean)
  const misfireRate = trimTrend > 14 ? 0.15 : 0.005;
  misfiresTotal += rand() < misfireRate ? 1 : 0;

  t.push(ts);
  rpm.push(+r.toFixed(1));
  engine_load.push(+load.toFixed(1));
  stft.push(+st.toFixed(1));
  ltft.push(+lt.toFixed(1));
  maf.push(+mafMeas.toFixed(2));
  o2_voltage.push(+o2.toFixed(3));
  coolant_temp.push(+(87 + (i / N) * 5 + gaussian() * 0.15).toFixed(1));
  vehicle_speed.push(prof.phase === "cruise" || prof.phase === "accel" ? 55 : 0);
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

console.log(`scenario_B sensors generated: ${N} samples @ ${HZ} Hz, seed ${SEED}, dir ${SCENARIO_DIR}`);
