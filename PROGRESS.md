# FaultTrace — Progress Log

**Updated:** Aug 27, 2026 (Day 5 of hackathon week)
**Latest validation session:** `01m0wxh4wq4waprd2dxfs5vkzj` — FULL END-TO-END SCENARIO A RUN COMPLETE (see §7). All acceptance criteria SPEC §9.1–§9.8 demonstrated in one persistent session.
**Latest delivery:** PR #6/#7/#8 merged; dashboard UI + Qodo remediation (Day 5); sandbox analysis library + eval harness (Day 5).

---

## 0. MILESTONE — Scenario A end-to-end complete (Aug 26)

Session `01m0wxh4wq4waprd2dxfs5vkzj` completed the full investigation loop:

| Acceptance criterion | Status |
| --- | --- |
| 1. MCP pulls codes + freeze-frame + sensor log | ✅ visible tool calls |
| 2. ≥3 hypotheses w/ predicted signatures | ✅ five enumerated from KB priors |
| 3. Sandbox runs analysis | ✅ Daytona; compact telemetry written to /opt/tf/work/tel.json |
| 4. Bayesian confidence | ✅ round-1 posterior H1=0.624 → smoke-test likelihood → **0.970** (Bayes factor ≈68 vs rival) |
| 5. Ranked differential w/ supporting+contradictory evidence | ✅ |
| 6. Info-gain recommendation + pause | ✅ Tier-2 gate: `request_measurement` smoke test |
| 7. Approve → new evidence → re-rank → root cause | ✅ result=`confirmed_leak` (booster hose cracking); posterior jump |
| 8. Tier-3 pause on irreversible action | ✅ `order_part` gated, approved, mock executed ("No real money moved") |

**Root cause found & proven:** cracked brake booster vacuum supply hose at intake-manifold junction → unmetered air post-MAF → +10..36% lean trims → random 4-cylinder misfires (P0171+P0300).

Incidents fixed along the way:
- Agent model had been left on `mistral/mistral-large-latest` (unknown-model error on resume). PUT the registry agent back to the version-controlled definition: model `openrouter/stealth-ox-alpha`, sandbox enabled. **All requests now route via OpenRouter only.**
- Two gate rejections were self-healed by the agent (`test_id=smoke_test`, then missing `part_id`) — approval-gate schema validation works as designed.
- Lesson recorded: an errored turn may still have executed its approved tool call — always check events before resubmitting approvals (a stale tool_call_id gives 422).

---

## 1. What is done and verified

### Environment
- [x] Node v24.19.0, git, repo public: https://github.com/Harshul-Dwivedi/FaultTrace
- [x] TrueForge v0.1.4 installed LOCALLY (`npm install` in repo root) — NOT via npx
- [x] **Windows crash fixed**: kysely `FileMigrationProvider` passes raw `C:\` paths to ESM import.
      Fix = `patches/kysely+0.29.5.patch`, applied automatically via `postinstall` (patch-package)
- [x] TrueForge server running at http://localhost:8790 (start: `npm start`; logs in tf.log / tf.err.log)
- [x] Qodo GitHub App installed on repo; review trail active on PRs

### Model providers (Settings → Models in UI)
| Provider | Status | Notes |
| --- | --- | --- |
| openrouter (`stealth/ox-alpha`) | ✅ PRIMARY — $5 top-up done, `is_free_tier:false`, ~1000 req/day free models | 1M context, $0 tokens |
| google-gemini | ✅ connected, free tier quota-limited today (pro=0, flash=5/day). RETEST flash after ~12:30 PM IST reset | |
| mistral | ✅ works, free tier = 4 req/min (slow mode only) | |
| groq | ⚠️ connected but UNUSABLE — free tier 8K tokens/min < our ~20-35K prompt | do not use |

### Mock vehicle MCP server
- [x] Built in `mcp-server/` — 12 tools (10 Tier-1 reads + request_measurement T2 + clear_codes/order_part T3)
- [x] Tier-2/3 tools REQUIRE `approved_by_human=true` arg; refuse otherwise (defense-in-depth)
- [x] Serves **HTTP transport** on http://localhost:9090/mcp (TrueForge has NO stdio support).
      Start: `cd mcp-server && npm run start:http`
- [x] Registered in TrueForge as remote MCP server named `faulttrace-vehicle`
- [x] 3 scenarios with deterministic seeded telemetry (seed 1337/2749/5891):
      - Scenario A: 2003 Honda Accord — vacuum leak (booster hose), P0171+P0300
      - Scenario B: 2005 Toyota Camry — MAF contamination, P0171+P0102+P0300
      - Scenario C: 2004 Ford F-150 5.4L — O2 stuck lean, P0171+P0133
- [x] VIN registry maps 3 VINs to scenario directories (vins.json)
- [x] `get_vehicle_info` tool returns safe vehicle specs (ground_truth_eval_only filtered out)
- [x] `lookup_dtc_knowledge` is VIN-aware — each scenario gets scenario-specific priors
- [x] Tests green: `npm test` (smoke.mjs validates 12 tools, 3 scenarios, ground-truth filtering)
- [x] Compact telemetry: `get_compact_telemetry` returns deterministic synchronized 1 Hz data

### Sandbox
- [x] Daytona provider configured in TrueForge Settings → Sandbox (status: ready, key stored server-side)
- [x] Live agent sandbox ENABLED. Auto-stops after 5 min idle.

### Agent
- [x] `faulttrace-investigator` created in TrueForge (id `01m0wf4c58wkgbkmw9dyjm9shw`),
      model = openrouter/stealth-ox-alpha
- [x] Definition version-controlled at `agent/faulttrace-investigator.agent.json`
- [x] Instructions include active diagnosis with Bayesian information gain formula for test selection
- [x] Instructions include dynamic subagent delegation (per-hypothesis fan-out)
- [x] Instructions support multiple vehicles via VIN-driven identification (not Honda-specific)
- [x] Approval flow: propose gated calls with approved_by_human=true;
      harness pauses BEFORE execution; approved args execute verbatim
- [x] Harness-level gates: require_approval_for_tools = [request_measurement, clear_codes, order_part]
- [x] Agent instructions synced with exact MCP argument names, compact-telemetry usage,
      and sandbox-computed Bayesian normalization.

### Git / review trail
- [x] PR #1 (docs skeleton) — merged
- [x] PR #2 (MCP server) — Qodo found 6 bugs → all fixed → merged
- [x] PR #3 (agent definition) — Qodo found 3 bugs → all fixed → merged
- [x] PR #4 (compact telemetry) — merged
- [x] PR #5 (`feat/subagent-refactor`) — removed dead JS scaffolding, fixed smoke, dynamic subagent delegation → merged
- [x] PR #6 (`feat/day4-scenarios-active-diagnosis`) — Scenarios B & C, active diagnosis info-gain, multi-VIN, `get_vehicle_info` → merged (`cf47d49`)
- [x] PR #7 (`feat/day5-...`) — Day-5 scenarios/active-diagnosis follow-up → merged (`919d443`)
- [x] PR #8 (`ui/dashboard-report`) — dashboard investigation UI → merged (`ba98bdb`); Qodo remediation
      (infoGain bug, failed-load state, refresh staleness, empty-session status, sidebar import) all resolved

### Proven working end-to-end (Mistral run, Aug 25 afternoon)
Evidence gathering via MCP → hypothesis enumeration w/ signatures → Bayesian-style ranking →
ask_user_question pause → human answer resumed correctly. (That run had an LLM head-math slip —
wrong displacement assumption — which is exactly why sandbox compute is now enabled.)

---

## 2. IN FLIGHT RIGHT NOW

**Day 4 COMPLETE (Aug 27).** Scenarios B & C authored, active diagnosis info-gain implemented,
`get_vehicle_info` tool added with ground-truth filtering. PR #6 merged.

**Day 5 COMPLETE (Aug 27).** PR #7 (Day 4 scenarios/active-diagnosis) and PR #8 (dashboard UI)
both merged into `origin/main` (`cf47d49`, `919d443`, `ba98bdb`). Qodo review on PR #8 remediated
(see §9): fabricated infoGain, failed-load state handling, refresh staleness, empty-session status,
sidebar import path — all fixed; the `@faulttrace/trueforge` dependency finding was a false positive
(real package is `@truefoundry/trueforge`; UI uses pure REST).

Sandbox analysis library + eval harness built and verified (see §10):
- `sandbox/analysis/analyze.py` — deterministic pure-stdlib Python: SPEC §5.3 analysis types,
  `bayesian_update`, `expected_information_gain` (base-2 bits), `likelihoods_from_telemetry`,
  and a `diagnose()` + CLI pipeline.
- `eval/run_eval.mjs` — drives analyze.py against scenarios A/B/C and asserts the top posterior
  matches each scenario's ground truth (meta.json, eval-only). **3/3 PASS** and each scenario
  recommends the correct test (smoke_test / known_good_maf_swap / known_good_o2_swap).

<details><summary>Historical notes from Aug 25 (superseded)</summary>

The original Scenario A turn (`01m0wvpegh8aweafb1689dccb4`) was cancelled after the
10-minute server execution limit while repeatedly discovering MCP schemas. A replacement,
schema-directed run is now active on ox-alpha with sandbox enabled:
session `01m0wwsdg4vy5cjp5vqk5qd2sb`.

The replacement recovered from an initial `vehicle_id`/`vin` argument mismatch and has
successfully gathered the DTCs, service history, and PID list. It is awaiting its next model
step; the selected Stealth upstream has intermittently returned 429s, so allow 60–90 seconds
before sending a same-session `continue` message if it errors.
</details>

Check with:
```powershell
$sid = "01m0wxh4wq4waprd2dxfs5vkzj"
(Invoke-RestMethod "http://localhost:8790/api/v1/sessions/$sid/turns").data[0].state.status
```

Expected flow: evidence → hypotheses → SANDBOX-COMPUTED analysis → Bayesian differential →
info-gain recommendation → Tier-2 gate pauses → approve → followup measurement (trim_recheck_booster_hose_clamped)
→ posterior jump → root cause = vacuum leak (brake booster hose).

If it pauses with `tool.response_required`: find pending tool_call_id from
`GET /api/v1/sessions/$sid/events` and resume via POST turns with input item:
`{"type":"user.tool_response","thread_id":"main","tool_call_id":"<ID>","content":"Approved ..."}`

If it asks ask_user_question: same shape, content = your answer text.

---

## 3. Next steps (priority order)

1. ~~Watch/complete the in-flight investigation~~ **DONE Aug 26** — full loop incl. both gates
   captured in session `01m0wxh4wq4waprd2dxfs5vkzj`. Remaining: screen-record a fresh clean run
   (or replay this session) for the Day-6 vertical-slice demo footage.
2. ~~Merge PR #3~~ — **DONE**, merged.
3. ~~Day 3 (subagent fan-out, Bayesian math, differential output)~~ — **DONE**, PR #5 merged.
4. ~~Day 4 (Scenarios B & C, active diagnosis, multi-VIN)~~ — **DONE**, PR #6 & PR #7 merged.
5. ~~Day 5 (dashboard investigation UI, Qodo remediation)~~ — **DONE**, PR #8 merged.
6. **Day 5 add-on**: sandbox analysis library (`sandbox/analysis/analyze.py`) + eval harness
   (`eval/run_eval.mjs`) — **DONE**, 3/3 scenarios pass with correct recommended tests.
7. **Day 6**: freeze, record 3-min demo (beat sheet in IMPLEMENTATION.md §14), README polish,
   wire the analysis library into the agent flow end-to-end, submit.

## 4. Known gotchas

- TrueForge supports ONLY remote (URL) MCP servers — never stdio. Our HTTP bridge exists for this reason.
- Provider config PUT wipes stored API key unless re-sent — always paste keys in UI after provider edits.
- OpenRouter free models die at 50 req/day WITHOUT credit purchase; $5 top-up fixed it (is_free_tier=false).
- **OpenRouter ONLY for all model requests** (user decision, Aug 26). Do not switch the agent to
  Mistral/Gemini/Groq. If a run fails, retry on `openrouter/stealth-ox-alpha`.
- Registry agent can drift from `agent/faulttrace-investigator.agent.json` (UI edits). PUT
  `{"manifest": {...}}` (wrap fields in a manifest key) to `/api/v1/agents/{id}` to re-sync.
  A plain PUT of the raw file fails with "Unrecognized keys".
- Groq free tier cannot fit our prompt size (8K TPM cap). Do not waste time on it.
- Gemini Pro preview = zero free quota. Only flash matters on free tier.
- If a turn errors mid-loop due to 429, wait 60-90s then send a continuation message ("continue")
  on the SAME session rather than starting over.
- Ground truth for scenarios lives in mcp-server/scenarios/scenario_*/meta.json — NEVER exposed
  through MCP tools. `get_vehicle_info` filters out `ground_truth_eval_only` and `notes`.

## 5. Key IDs cheat-sheet

| Thing | ID |
| --- | --- |
| Investigator agent | `01m0wf4c58wkgbkmw9dyjm9shw` |
| Latest session | `01m0wxh4wq4waprd2dxfs5vkzj` (complete E2E Scenario A run) |
| MCP server name | `faulttrace-vehicle` |
| VIN (Scenario A) | `1HGCM82633A004352` — 2003 Honda Accord, vacuum leak |
| VIN (Scenario B) | `2T1BURHE0JC000001` — 2005 Toyota Camry, MAF contamination |
| VIN (Scenario C) | `1FTZX17N9XKA00002` — 2004 Ford F-150, O2 stuck lean |
| Repo | https://github.com/Harshul-Dwivedi/FaultTrace |
| PR #6 | https://github.com/Harshul-Dwivedi/FaultTrace/pull/6 |
| PR #7 | https://github.com/Harshul-Dwivedi/FaultTrace/pull/7 |
| PR #8 | https://github.com/Harshul-Dwivedi/FaultTrace/pull/8 |

---

## 6. Handoff for next session (Aug 25, 2026)

### Completed in this work block

- Added `mcp-server/src/scenarioStore.js` method `getCompactTelemetry()`.
  It downsamples synchronized sensor logs into deterministic bounded buckets; cumulative
  `misfire_count` preserves the bucket-end value while other signals use bucket means.
- Added the read-only MCP tool `get_compact_telemetry` in `mcp-server/src/tools.js`.
  It accepts `{vin, pids, sample_period_seconds}` and caps requests at 10 PIDs.
- Updated `agent/faulttrace-investigator.agent.json` and the live TrueForge registry agent with:
  exact MCP argument names, compact telemetry instructions, and explicit sandbox-computed
  Bayesian analysis requirements.
- Restarted the local MCP HTTP service on port 9090 so the new tool is live.
- Added compact-tool coverage to `mcp-server/tests/smoke.mjs` and `mcp-server/tests/http.mjs`.

### Verification

From `mcp-server/`, both commands pass:

```powershell
npm.cmd test
node tests/http.mjs
```

The HTTP test reports 11 tools and a 4-PID sample of 60 one-second buckets. The full seven-PID
Scenario A bundle is about 5 KB, compared with the oversized raw 10 Hz response that previously
stalled the agent.

### Investigation state

- Original raw-log run: `01m0wvpegh8aweafb1689dccb4` — cancelled by the 10-minute timeout.
- Replacement raw-log run: `01m0wwsdg4vy5cjp5vqk5qd2sb` — stalled after oversized telemetry.
- Compact run: `01m0wxh4wq4waprd2dxfs5vkzj` — gathered evidence, wrote the compact bundle to
  Daytona, then ended with OpenRouter/Stealth HTTP 502.
- A continuation was submitted in that same session as turn
  `01m0wxy1gzvnz8sja4tjh4nfh1.local`, asking it to reuse the compact bundle and proceed directly
  to sandbox calculations. Its final state was not checked before the session ended.

### Resume procedure

1. Check the continuation first:

```powershell
$sid = "01m0wxh4wq4waprd2dxfs5vkzj"
(Invoke-RestMethod "http://localhost:8790/api/v1/sessions/$sid/turns").data | Select-Object -First 2 | ConvertTo-Json -Depth 12
```

2. If the continuation is `done` with `tool.approval_required`, approve only the proposed
   `request_measurement` call after reviewing its test ID, justification, and expected
   information gain. Do not approve `clear_codes` or `order_part` yet.

3. If it is `error` from another 429/502, create a fresh session using the registered
   `faulttrace-investigator` agent and the compact-telemetry prompt. Do not fetch raw 10 Hz logs.
   If Stealth remains unavailable, temporarily switch the agent to a working configured backup
   model (Gemini Flash or Mistral) in TrueForge, then restore ox-alpha for the quality run.

4. After the Tier-2 measurement is approved, verify the follow-up result causes the posterior
   for `vacuum_leak` / brake-booster hose to rise, then demonstrate the separate Tier-3 gate.

### Files changed in this work block

- `mcp-server/src/scenarioStore.js`
- `mcp-server/src/tools.js`
- `mcp-server/tests/smoke.mjs`
- `mcp-server/tests/http.mjs`
- `agent/faulttrace-investigator.agent.json`
- `PROGRESS.md`

---

## 7. Work block Aug 26 — Scenario A end-to-end run (completed)

### What happened

1. Resumed session `01m0wxh4wq4waprd2dxfs5vkzj`. Found the smoke test had ALREADY executed
   inside an earlier turn marked `error` (the 422 was a follow-up API quirk, not the tool call):
   result = `confirmed_leak` at the brake booster supply hose.
2. Fixed registry drift: agent was on mistral with sandbox disabled; PUT manifest back to
   openrouter/stealth-ox-alpha + sandbox enabled (OpenRouter-only policy).
3. Sent continuation: sandbox Bayesian recompute -> final differential -> Tier-3 proposal.
   Agent produced posterior table (0.624 -> 0.970, Bayes factor ~68), ranked differential,
   root cause statement, and paused at the Tier-3 gate.
4. First Tier-3 call auto-rejected (missing `part_id`); agent resubmitted corrected args;
   approved; mock order placed for `booster_vacuum_hose_03_accord_2_4l` ("No real money moved").
5. Final case summary emitted by the agent with fully computed evidence chain.

### State now

- Session complete, no pending gates. Session is persistent/resumable (survived overnight).
- Agent definition in registry matches version-controlled JSON; OpenRouter only.

### Next work block should start with

1. Merge PR #3 after Qodo clean re-review.
2. Day-3 items per PLAN.md (subagent fan-out, formalize Bayesian + differential output shape).
3. Screen-record a fresh clean Scenario A run for demo footage (this session's transcript is
   the fallback narrative if a live re-run misbehaves).

---

## 8. Day 4 — Scenarios B & C, active diagnosis (Aug 26–27)

### What was built

**Scenarios B & C authored and verified:**
- Scenario B: 2005 Toyota Camry LE 2.4L, MAF contamination — 600 samples @ 10 Hz (seed 2749).
  Erratic MAF under-reporting, high trims proportional to MAF error, random misfires under load.
- Scenario C: 2004 Ford F-150 XLT 5.4L V8, O2 sensor stuck lean — 600 samples @ 10 Hz (seed 5891).
  Healthy MAF, railed-lean O2 voltage, gradual fuel-trim integration, limited misfires.

**Knowledge base expanded:**
- 7 DTC knowledge files across 3 scenarios (P0171×3, P0300×2, P0102, P0133).
- Each file includes `available_tests` with expected likelihoods and `common_causes` with priors.
- All `available_tests[].test_id` keys match followup measurement keys per scenario.
- All `expected_likelihood` keys match `common_causes[].cause` keys (validated by smoke test).

**Agent instructions updated:**
- Active diagnosis with full Bayesian expected information gain formula for test selection.
- Dynamic subagent delegation enabled (per-hypothesis fan-out).
- Generic vehicle support via VIN-driven identification (not Honda-specific).
- `get_vehicle_info` tool for displacement/MKP before MAF plausibility calculations.

**MCP server expanded to 12 tools:**
- Added `get_vehicle_info` (returns safe specs, filters ground truth).
- `lookup_dtc_knowledge` made VIN-aware — scenario-specific priors.
- Generators fixed: `phaseAt()` → `profile()` so RPM/load are populated (no nulls).

### Qodo review bugs resolved

| Bug | Fix |
|---|---|
| Null telemetry | `profile(ts)` instead of `phaseAt(ts)` — all channels populated |
| Knowledge ignores VIN | `lookupKnowledge(code, vin)` resolves from scenario first |
| Likelihood key mismatch | Aligned keys across P0102, P0133, P0300 |
| Test IDs don't match followup | Aligned `test_id` with actual measurement keys |
| Vehicle specs inaccessible | Added `get_vehicle_info` MCP tool |
| Ground truth leaked | Filter `ground_truth_eval_only` and `notes` from response |

### PR status

PR #6 (`feat/day4-scenarios-active-diagnosis`): **merged** (`cf47d49`).
Commits: `866f367` (initial), `8654fab` (bug fixes), `e4958a6` (ground-truth filter).

---

## 9. Day 5 — Dashboard investigation UI + Qodo remediation (Aug 27)

**What was built:**
- `fault-trace-ui/` Next.js dashboard rendering TrueForge sessions: active investigation
  timeline, ranked hypotheses w/ Bayesian posterior, info-gain bar chart per candidate test,
  vehicle/case metadata, export of the investigation report.

**Qodo review (rule `2937103`) findings on PR #8 — all remediated (commit `b7652e6`):**
1. **Fabricated infoGain** — replaced fabricated number with real expected entropy reduction
   (base-2 bits) computed from the actual posterior.
2. **Failed loads kept prior session** — reset payload + gate `canExport` on idle/loading/error.
3. **Refresh not reloading** — added `loadNonce` to force a fresh fetch per load/refresh.
4. **No-turn sessions shown COMPLETE** — explicit `'idle'` status for sessions with no turns.
5. **Sidebar import path** broken — `../lib/types` → `../../lib/types`.

**Qodo re-review confirmed resolved; two additional bugs fixed (commit `4d4fced`):**
- `posteriorOf` always divided by 100 (parser stores 0–100 scale) — fixed.
- `entropy()` used base-10 instead of base-2 (`log2` for bits) — fixed.

**Dismissed as false positive:** `@faulttrace/trueforge` dependency (returns 404 on npm; the real
package is `@truefoundry/trueforge`; UI uses pure REST) — reply posted on the PR.
`next build` passes on `ui/dashboard-report`.

- **PR #8 merged** into `origin/main` (`ba98bdb`).
- `*.tsbuildinfo` gitignored in `fault-trace-ui/.gitignore`.

---

## 10. Day 5 — Sandbox analysis library + eval harness (Aug 27)

**`sandbox/analysis/analyze.py`** — deterministic, pure-stdlib Python (no numpy) so it runs in the
TrueForge/Daytona sandbox with no install step. Implements the load-bearing SPEC §5.3 analysis
types and the SPEC §7 Bayesian update:

- `fft_signature`, `cross_correlate`, `sensor_plausibility`, `anomaly_vs_baseline`
- `bayesian_update(priors, likelihoods)`
- `expected_information_gain(posteriors, likelihoods)` — base-2, in bits
- `likelihoods_from_telemetry(series)` — maps ground-truth discriminators onto [0,1] per hypothesis
- `diagnose(series, priors, tests)` — likelihoods → posterior → ranked differential → recommended test
- CLI: `python analyze.py telemetry.json priors.json [tests.json]`

**Discriminator tuning verified against real scenario data:**
- MAF smoothness judged by first-difference **jitter** + **load correlation** (not CV, which is
  dominated by load range). Scenario A jitter 3.5% / corr 0.9966 vs Scenario B 12.0% / 0.9724 —
  this is what cleanly separates vacuum_leak from maf_fault.
- O2 railed (0 crossings, span 0.086, pinned low) + trims not load-linked → o2_sensor_fault,
  while a leak always drives load-linked trims.

**`eval/run_eval.mjs`** — ESM harness that builds compact telemetry + priors from each scenario,
drives analyze.py, and asserts both the top posterior **and** the recommended test match
meta.json ground truth (`canonical_cause` + `expected_test_id`, both eval-only):

- Scenario A → vacuum_leak (49.3%) — recommended `smoke_test`
- Scenario B → maf_fault (75.3%) — recommended `known_good_maf_swap`
- Scenario C → o2_sensor_fault (83.7%) — recommended `known_good_o2_swap`
- Plus an `fft_signature` self-test (in/out-of-band sinusoids across window lengths).
- **Result: FFT self-test PASS, 3/3 scenarios PASS**, exit 0. Deterministic.
  Run with: `node eval/run_eval.mjs` (interpreter via `FAULTTRACE_PYTHON`, else `python3`/`python`).

**PR #9 Qodo remediation (8 comments, all addressed):**
- **fft_signature scaling** (#4): Parseval-consistent normalization (ratio now ~0.5 for a pure
  in-band sine regardless of `n`; verified by the sinusoid self-test).
- **Zero posteriors for scenario-specific causes** (#2): `CAUSE_ALIASES` collapse
  `maf_contamination`/`maf_electrical_fault`/`o2_sensor_aging`/`o2_heater_fault`/... onto the
  canonical families, so P0102/P0133-only knowledge now diagnoses correctly (B→maf_fault 1.0,
  C→o2_sensor_fault 1.0) instead of all-zero.
- **Missing data became evidence** (#3): hypotheses are only scored when their deciding signals
  are present; absent data -> the cause is omitted -> posterior stays at prior (no fabricated
  likelihood / penalty).
- **Low-cost preference** (#7): `diagnose` picks the cheapest test within 90% of the best
  information gain (explicit low<medium<high ordering, deterministic tie-break).
- **Eval metadata truth** (#5) + **recommendations asserted** (#6): verdicts now read
  `canonical_cause`/`expected_test_id` from eval-only metadata and require the recommended test
  to match.
- **Python launcher portability** (#8): `FAULTTRACE_PYTHON` / `python3` / `python` fallback with a
  clear error.

**PR #9 Qodo re-review (3 more findings, addressed in `7c4badc`):** the round-1 fix that
*collapsed* scenario causes onto the 5 canonical families was too aggressive, so cause identity,
test selection, and partial-telemetry scoring were refined:
- **Canonicalization erased test choices** (#1): the posterior now **preserves fine-grained DTC
  cause identity** (`maf_contamination`, `maf_electrical_fault`, ..., `o2_sensor_aging`), instead
  of collapsing to one family. `bayesian_update` projects the analyzer's canonical-family
  likelihoods onto those fine-grained priors (via `family_of`/`CAUSE_ALIASES`) and never drops a
  valid cause, so a differential and info-gain test selection survive. The **family** of the top
  cause is exposed for eval/display via `family_of()`; `run_eval.mjs` asserts against it. Verified:
  a P0102-only prior now recommends `known_good_maf_swap` (was `recommended_test: null`).
- **Partial telemetry disabled scoring** (#2): removed the blanket `has_maf and has_load and has_o2`
  gate. `sensor_plausibility` now computes each discriminator only from supplied inputs and tags its
  availability; `likelihoods_from_telemetry` scores each hypothesis gated on its *own* deciding
  signals (a MAF-only bundle scores `maf_fault`; a fuel-trim+load bundle scores
  `weak_fuel_delivery`, etc.). Missing non-deciding signals are never converted to negative evidence.
- **Zero-gain tests got recommended** (#3): a `MIN_GAIN_BITS` (0.05) guard means a test is only
  recommended when the best expected info gain is meaningfully positive; an all-zero-gain set now
  yields `recommended_test: null` (the zero-gain `test_gains` rows are still returned for
  observability).

Eval now: FFT self-test PASS, **3/3 scenarios PASS** (B top family `maf_fault`, test
`known_good_maf_swap`; C top family `o2_sensor_fault`, test `known_good_o2_swap`). `npm test` in
mcp-server stays green.

**PR #9 Qodo re-review round 3 (2 findings, addressed in `f8e86d8`):** two hypothesis gates still
depended on unrelated sensors; each is now gated strictly on its own deciding signals:
- **Weak-fuel gate used wrong sensors** (#1): `weak_fuel_delivery` is now scored whenever
  **trims + load** are present (negative high-load trims), independent of MAF/O2 — it was
  previously nested under the MAF+trim+O2 gate, so O2 omission suppressed it. Verified: a
  trim+load bundle with MAF present but O2 absent scores weak_fuel_delivery=0.95.
- **O2 scoring wrongly required trims** (#2): `o2_sensor_fault` is now gated on **O2 + MAF**
  alone (railed O2 + healthy MAF); trim adjustments are applied only when trim/load telemetry is
  present. Verified: a MAF+O2 bundle with no trims scores o2_sensor_fault=0.95.
- **ESM vs CommonJS** (#1): dismissed as N/A — this repo's committed tests are ESM (`.mjs`).
