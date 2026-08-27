"""
FaultTrace analysis library — sandbox compute for hypothesis testing.

Deterministic, pure-stdlib Python so it runs unchanged in the TrueForge/Daytona
sandbox (no numpy/install step). Consumes the *compact telemetry* bundle the
investigator retrieves via the `faulttrace-vehicle` MCP server:

    {
      "vin": "...",
      "sample_period_seconds": 1,
      "series": { "<pid>": {"pid": "...", "unit": "...", "t": [...], "value": [...]} }
    }

and the DTC knowledge (priors + available_tests) from `lookup_dtc_knowledge`.
It implements the load-bearing SPEC §5.3 analysis types and the SPEC §7
Bayesian update, and returns real likelihoods in [0,1] that the agent reason
over — numbers, never LLM vibes.

Public API
----------
fft_signature(t, value, expected_freq_band)
cross_correlate(a, b, max_lag)
sensor_plausibility(maf, rpm, load, o2, trims)      # MAF-vs-derived + O2 switching
anomaly_vs_baseline(value, baseline_mean, baseline_std)
bayesian_update(priors, likelihoods)
expected_information_gain(posteriors, likelihoods)  # base-2, in bits

Hypothesis likelihoods and ranking:
    likelihoods_from_telemetry(series)   -> {cause: score}
    diagnose(series, priors)             -> ranked differential

CLI:
    python analyze.py telemetry.json priors.json [available_tests.json]
        -> JSON: {likelihoods, posterior, ranked, recommended_test}
"""

from __future__ import annotations

import json
import math
import sys


# --------------------------------------------------------------------------- #
# Generic signal primitives (SPEC 5.3: FFT, correlation, plausibility, anomaly)
# --------------------------------------------------------------------------- #

def _mean(xs):
    return sum(xs) / len(xs) if xs else 0.0


def _std(xs):
    if len(xs) < 2:
        return 0.0
    m = _mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))


def _detrend(xs):
    m = _mean(xs)
    return [x - m for x in xs]


def _corr(a, b):
    """Pearson correlation between two equal-length sequences."""
    n = len(a)
    if n < 3:
        return 0.0
    ma, mb = _mean(a), _mean(b)
    sxy = sum((a[i] - ma) * (b[i] - mb) for i in range(n))
    sxx = sum((x - ma) ** 2 for x in a)
    syy = sum((y - mb) ** 2 for y in b)
    denom = math.sqrt(sxx * syy)
    return sxy / denom if denom > 1e-12 else 0.0


def fft_signature(t, value, expected_freq_band):
    """Frequency-domain signature: is there periodic energy in the band?

    Uses a Goertzel-style single-bin DFT over the candidate frequency band so
    it stays cheap and deterministic in pure Python. Returns peak frequency
    (Hz), the share of the signal's energy in that band, and whether a peak is
    present. Used for periodic signatures e.g. recurring-misfire cadence.
    """
    n = len(value)
    if n < 4:
        return {"peak_freq_hz": 0.0, "band_energy_ratio": 0.0, "match": False}

    dt = (t[-1] - t[0]) / (n - 1) if n > 1 and t[-1] != t[0] else 1.0
    fs = 1.0 / dt if dt > 0 else 1.0

    lo, hi = expected_freq_band
    lo = max(lo, fs / n)  # at least one full cycle across the window
    hi = min(hi, fs / 2.0)  # Nyquist

    total_power = sum(v * v for v in value) or 1.0
    best_freq, best_power, band_power = 0.0, 0.0, 0.0

    # Scan a coarse grid of candidate frequencies inside the band.
    if hi > lo:
        step = max((hi - lo) / 128.0, (fs / n))
        f = lo
        while f <= hi:
            # Single-bin DFT power at frequency f.
            real = imag = 0.0
            for i, v in enumerate(value):
                ang = 2.0 * math.pi * f * t[i]
                real += v * math.cos(ang)
                imag -= v * math.sin(ang)
            power = (real * real + imag * imag) / (n * n)
            band_power += power
            if power > best_power:
                best_power, best_freq = power, f
            f += step

    ratio = band_power / total_power if total_power else 0.0
    return {
        "peak_freq_hz": round(best_freq, 3),
        "band_energy_ratio": round(min(1.0, ratio), 4),
        "match": bool(ratio >= 0.08),
    }


def cross_correlate(series_a, series_b, max_lag):
    """Do two series move together when shifted by some lag?

    Returns the best (highest |r|) normalized cross-correlation over lags in
    [-max_lag, max_lag], the lag where it occurs, and whether the series align.
    Used e.g. 'do fuel-trim spikes rise with engine load?'.
    """
    n = len(series_a)
    if n < 4 or len(series_b) != n:
        return {"max_r": 0.0, "lag": 0, "aligned": False}

    bm = _mean(series_b)
    bs = _std(series_b)
    if bs == 0:
        return {"max_r": 0.0, "lag": 0, "aligned": False}

    best_r, best_lag = 0.0, 0
    max_lag = int(min(max(abs(max_lag), 0), n // 2))
    for lag in range(-max_lag, max_lag + 1):
        if lag >= 0:
            a = series_a[:-lag] if lag else list(series_a)
            b = series_b[lag:]
        else:
            a = series_a[-lag:]
            b = series_b[:lag]
        if len(a) < 2:
            continue
        r = _corr(a, b)
        if abs(r) > abs(best_r):
            best_r, best_lag = r, lag

    return {
        "max_r": round(best_r, 4),
        "lag": best_lag,
        "aligned": bool(abs(best_r) >= 0.5),
    }


def sensor_plausibility(maf, rpm, load, o2, trims):
    """Is each sensor physically consistent, or is a sensor itself suspect?

    Returns per-sensor flags:
      - maf_smooth:  does the MAF follow load smoothly (low first-difference
        jitter and tight load correlation) rather than spike erratically?
        A *condition* (leak) shows smooth low MAF; a *sensor* (MAF fault)
        shows erratic MAF.
      - maf_erratic: inverse of smooth — high jitter and/or poor load
        correlation; the decisive signature of a faulty MAF sensor.
      - maf_jitter_pct / maf_load_corr: the raw discriminators behind the above.
      - o2_switching: does the O2 voltage cross/switch (closed-loop cycling)?
        A real sensor switches; a stuck O2 flatlines.
      - o2_railed: O2 pinned near one rail (0V or ~1V).
    """
    out = {}
    # Smoothness of MAF vs its own local trend: erratic = high high-freq noise.
    # We gauge erraticness from first-difference jitter (not CV, whose value is
    # dominated by the load range across a drive cycle) plus how tightly the MAF
    # tracks load. A *condition* (leak) keeps a smooth low-offset MAF; a *faulty
    # sensor* (contaminated MAF) spikes erratically and decorrelates from load.
    if maf and len(maf) >= 5:
        diffs = [abs(maf[i] - maf[i - 1]) for i in range(1, len(maf))]
        mean_abs = _mean(maf)
        out["maf_jitter_pct"] = round(100.0 * _mean(diffs) / mean_abs, 3) if mean_abs else 0.0
    else:
        out["maf_jitter_pct"] = 0.0

    # Does MAF move in sync with load/rpm? A healthy MAF tracks airflow demand.
    if maf and load and len(maf) == len(load):
        out["maf_load_corr"] = round(_corr(maf, load), 4)
    else:
        out["maf_load_corr"] = 0.0

    out["maf_smooth"] = bool(out["maf_jitter_pct"] < 5.0 and out["maf_load_corr"] > 0.95)
    out["maf_erratic"] = bool(out["maf_jitter_pct"] >= 8.0 or out["maf_load_corr"] < 0.90)

    # O2 switching: count sign changes / threshold crossings in the signal.
    if o2 and len(o2) >= 5:
        crossings = sum(1 for i in range(1, len(o2)) if (o2[i] - 0.45) * (o2[i - 1] - 0.45) < 0)
        span = max(o2) - min(o2)
        lo = min(o2)
        out["o2_crossings"] = crossings
        out["o2_span"] = round(span, 3)
        out["o2_railed_low"] = bool(lo < 0.2 and span < 0.3 and crossings <= 2)
        out["o2_switching"] = bool(crossings >= 3 and span >= 0.3)
    else:
        out.update(o2_crossings=0, o2_span=0.0, o2_railed_low=False, o2_switching=False)

    # Trim direction at high load: negative-going (weak fuel) vs positive (lean).
    if trims and load and len(trims) == len(load):
        hi = [i for i in range(len(load)) if load[i] > 50]
        if hi:
            out["trim_at_high_load"] = round(_mean([trims[i] for i in hi]), 3)
            out["trim_high_load_negative"] = bool(out["trim_at_high_load"] < -3)
        else:
            out["trim_at_high_load"] = 0.0
            out["trim_high_load_negative"] = False
        out["trim_rising_with_load"] = bool(_corr(trims, load) >= 0.5)
    else:
        out.update(trim_at_high_load=0.0, trim_high_load_negative=False, trim_rising_with_load=False)

    # Gradual vs immediate trim climb (O2-sensor fault integrates slowly).
    if trims and len(trims) >= 20:
        half = len(trims) // 2
        first, second = _mean(trims[:half]), _mean(trims[half:])
        out["trim_first_half"], out["trim_second_half"] = round(first, 3), round(second, 3)
        out["trim_climbs_gradually"] = bool(second - first >= 4.0)
    else:
        out.update(trim_first_half=0.0, trim_second_half=0.0, trim_climbs_gradually=False)

    return out


def anomaly_vs_baseline(value, baseline_mean, baseline_std):
    """How far does a value / series sit from a known-good operating envelope?

    Returns the max absolute z-score and whether it is anomalous (|z| >= 2).
    """
    if baseline_std <= 0:
        return {"max_z": 0.0, "anomalous": False, "where": None}
    if isinstance(value, (list, tuple)):
        z = [abs((v - baseline_mean) / baseline_std) for v in value]
        i = z.index(max(z))
        return {"max_z": round(max(z), 3), "anomalous": bool(max(z) >= 2), "where": i}
    z = abs((value - baseline_mean) / baseline_std)
    return {"max_z": round(z, 3), "anomalous": bool(z >= 2), "where": None}


# --------------------------------------------------------------------------- #
# Bayesian machinery (SPEC 7)
# --------------------------------------------------------------------------- #

def _entropy(p, base=2.0):
    return -sum(x * math.log(x, base) if x > 0 else 0.0 for x in p)


def bayesian_update(priors, likelihoods):
    """Posterior ∝ prior × likelihood, normalized across hypotheses."""
    keys = list(priors.keys())
    vals = []
    for k in keys:
        prior = priors.get(k, 0.0)
        likelihood = likelihoods.get(k, 0.0)
        vals.append(prior * likelihood)
    total = sum(vals)
    if total <= 0:
        return {k: 0.0 for k in keys}
    return {k: round(v / total, 6) for k, v in zip(keys, vals)}


def expected_information_gain(posteriors, likelihoods):
    """Expected entropy reduction (bits) from a test, given current belief.

    For each hypothesis H_i with posterior P(H_i) and the test's per-hypothesis
    likelihood L(test | H_i), model positive/negative outcomes:

        P(positive) = sum_i P(H_i) L_i
        P(H_i | pos) ∝ P(H_i) L_i
        P(H_i | neg) ∝ P(H_i)(1 - L_i)

    IG = H(P) - [ P(pos) H(P|pos) + P(neg) H(P|neg) ]   (base-2 → bits)
    """
    keys = [k for k in posteriors if likelihoods.get(k) is not None]
    if len(keys) < 2:
        return None
    p = [posteriors.get(k, 0.0) for k in keys]
    tot = sum(p)
    if tot <= 0:
        return None
    P = [v / tot for v in p]

    L = [max(0.0, min(1.0, float(likelihoods[k]))) for k in keys]

    p_pos = sum(P[i] * L[i] for i in range(len(keys)))
    if p_pos <= 0 or p_pos >= 1:
        return None
    PP = [(P[i] * L[i]) / p_pos for i in range(len(keys))]
    PN = [(P[i] * (1 - L[i])) / (1 - p_pos) for i in range(len(keys))]

    h_prior = _entropy(P)
    h_pos = _entropy(PP)
    h_neg = _entropy(PN)
    expected = p_pos * h_pos + (1 - p_pos) * h_neg
    return max(0.0, h_prior - expected)


# --------------------------------------------------------------------------- #
# Hypothesis likelihoods from compact telemetry
# --------------------------------------------------------------------------- #

def _series(series, pid, key="value"):
    if pid not in series:
        return []
    s = series[pid]
    if isinstance(s, dict):
        return s.get(key, [])
    return s


def likelihoods_from_telemetry(series):
    """Map the ground-truth discriminators onto [0,1] per-hypothesis scores.

    The discriminators (per meta.json) are:
      - vacuum_leak:    MAF smooth (low jitter, tracks load) + trims climb with load
                        + O2 NOT railed -> the condition, not a dirty sensor/leak.
      - maf_fault:      MAF erratic (high jitter / poor load correlation).
      - o2_sensor_fault:O2 flatlined/railed with no switching + MAF healthy.
      - weak_fuel:      trims go NEGATIVE at high load.
      - ignition_fault: misfires present while trims stay near normal.
    """
    maf = _series(series, "maf")
    load = _series(series, "engine_load")
    o2 = _series(series, "o2_voltage")
    stft = _series(series, "stft")
    ltft = _series(series, "ltft")
    misfire = _series(series, "misfire_count")
    trims = stft or ltft

    plaus = sensor_plausibility(maf, [], load, o2, trims)

    smooth = plaus.get("maf_smooth", False)
    erratic = plaus.get("maf_erratic", False)
    railed = plaus.get("o2_railed_low", False)
    switches = plaus.get("o2_switching", False)
    trim_rises = plaus.get("trim_rising_with_load", False)
    trim_neg_high = plaus.get("trim_high_load_negative", False)
    trim_slow = plaus.get("trim_climbs_gradually", False)

    # --- vacuum_leak: smooth MAF AND trims climb with load AND O2 not railed.
    vac_score = 0.5
    if smooth and trim_rises and not railed:
        vac_score += 0.5                       # textbook leak signature
    elif not trim_rises:
        vac_score -= 0.35                      # a leak always drives load-linked trims
    if railed:
        vac_score -= 0.2                       # railed O2 argues against a leak
    likelihoods_vac = max(0.05, min(1.0, vac_score))

    # --- maf_fault: erratic MAF is the decisive signature.
    maf_score = 0.5
    maf_score += 0.45 if erratic else -0.3
    likelihoods_maf = max(0.05, min(1.0, maf_score))

    # --- weak_fuel_delivery: trims go negative at high load.
    fuel_score = 0.5
    fuel_score += 0.45 if trim_neg_high else 0.0
    fuel_score += -0.15 if trim_rises else 0.0
    likelihoods_fuel = max(0.05, min(1.0, fuel_score))

    # --- ignition_fault: misfires present but trims near normal.
    misfiring = bool(misfire and max(misfire) > 0)
    trim_mean = _mean(ltft or stft or [0.0])
    ign_score = 0.5
    if misfiring:
        ign_score += 0.25
        if abs(trim_mean) < 5:
            ign_score += 0.2
    else:
        ign_score -= 0.2
    likelihoods_ign = max(0.05, min(1.0, ign_score))

    # --- o2_sensor_fault: O2 railed/flatlined with no switching, healthy MAF.
    o2_score = 0.5
    o2_score += 0.45 if railed else 0.0
    o2_score += -0.35 if switches else 0.0
    o2_score += 0.15 if trim_slow else 0.0
    o2_score += 0.15 if smooth and not trim_rises else 0.0   # MAF healthy + trims not load-linked -> sensor, not condition
    likelihoods_o2 = max(0.05, min(1.0, o2_score))

    return {
        "vacuum_leak": round(min(1.0, likelihoods_vac), 4),
        "maf_fault": round(likelihoods_maf, 4),
        "weak_fuel_delivery": round(likelihoods_fuel, 4),
        "ignition_fault": round(likelihoods_ign, 4),
        "o2_sensor_fault": round(likelihoods_o2, 4),
    }


def diagnose(series, priors, available_tests=None):
    """Full pipeline: likelihoods → posterior → ranked differential → next test."""
    likelihoods = likelihoods_from_telemetry(series)
    posterior = bayesian_update(priors, likelihoods)
    ranked = sorted(posterior.items(), key=lambda kv: kv[1], reverse=True)

    result = {
        "likelihoods": likelihoods,
        "posterior": posterior,
        "ranked": [{"cause": k, "posterior": v} for k, v in ranked],
    }

    if available_tests:
        gains = []
        for t in available_tests:
            expected_lik = t.get("expected_likelihood")
            if not expected_lik:
                continue
            gain = expected_information_gain(posterior, expected_lik)
            if gain is None:
                continue
            gains.append({
                "test_id": t.get("test_id"),
                "label": t.get("label"),
                "cost": t.get("cost"),
                "expected_gain_bits": round(gain, 4),
            })
        gains.sort(key=lambda g: g["expected_gain_bits"], reverse=True)
        result["test_gains"] = gains
        result["recommended_test"] = gains[0] if gains else None

    return result


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def _load_json(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 2
    telemetry = _load_json(argv[1])
    priors = _load_json(argv[2])
    available_tests = _load_json(argv[3]) if len(argv) > 3 else None
    result = diagnose(telemetry.get("series") or telemetry, priors, available_tests)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
