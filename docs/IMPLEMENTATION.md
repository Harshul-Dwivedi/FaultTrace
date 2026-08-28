# FaultTrace - Implementation Guide

# Part III — Implementation Guide

Concrete build guidance grounded in TrueForge's actual shape. Code sketches are illustrative scaffolding, not copy-paste — verify names against the repo's README and the SDK package when you wire them, since the project is days old and evolving.

## 0. What TrueForge actually gives you (verified)

TrueForge is the **runtime/harness**, exposed three ways:
1. A **core server** that runs the agent loop (model calls, tool calls, sandbox, approvals, context compaction, subagents, persisted sessions).
2. An **HTTP API + TypeScript SDK**: `@truefoundry/trueforge-sdk`.
3. A **chat UI + UI SDK**: `@truefoundry/trueforge-ui` (use as-is, theme, or embed).

Run locally with one command: `npx @truefoundry/trueforge`.

Key architectural facts that shape your design:
* **Bring-your-own** model provider, MCP servers, and sandbox — you configure them; agents pick from what you connected (catalog-based setup, YAML presets).
* **The sandbox is treated as a tool** — the harness only spins one up when the agent needs to run code. Non-code turns don't pay for it. Sandbox backend is **Daytona**; generated code runs in a disposable environment that never touches your host.
* **Requirements:** Node.js ≥ 22.13. MIT-licensed. Free with your own model keys.
* Model/MCP interactions can flow through TrueFoundry's gateway (rate limits, budget caps, RBAC, auditing) — useful for your cost cap.
* **You build three things on top:** (1) a mock vehicle MCP server, (2) authored scenario data + a sandbox analysis library, (3) the agent configuration (orchestrator + subagents + gated tools) plus any UI theming.

> Before writing integration code, read the repo README, the "harness capability guide," and the SDK reference. Confirm the exact names for registering an MCP server, marking a tool as approval-required, spawning a subagent, and reading session state. The shapes below are the concepts you're looking for.

## 1. System architecture

```
                    User / Technician
                   (chat UI or your UI)
                            │
                            ▼
                  TrueForge core server
            (agent loop, approvals, sessions)
                            │
                            ▼
                    Orchestrator Agent
                  (controller / planner)
                 /          │                           /           │                   MCP read tools  spawn subagents  MCP action tools (gated)
      ┌───────────────┐     │          ┌───────────────────────┐
      │ Evidence tools│     ▼          │ clear_codes           │
      │ get_dtcs      │ Hypothesis     │ order_part            │
      │ get_freeze_   │ subagent(s)    └───────────────────────┘
      │   frame       │ (one per class)            ▲
      │ get_sensor_log│     │                      │
      │ get_service_  │     ▼                      │
      │   history     │ Request logs (MCP)         │
      │ Knowledge tool│ Write analysis code        │
      │ lookup_dtc_   │ Run in SANDBOX (Daytona)   │
      │   knowledge   │ Return likelihood +        │
      └───────────────┘   evidence                 │
                            │                      │
                            ▼                      │
                     Bayesian ranking              │
                     prior × likelihood            │
                   (normalized posterior)          │
                            │                      │
                            ▼                      │
                  Differential + next-test         │
               (info gain) recommendation          │
                            │                      │
                            ▼                      │
                  HUMAN GATE (Tier 2/3) ───────────┘
                            │
                            ▼
                  New evidence → re-rank
                       (persistent)
```

### Two agent layers:
* **Orchestrator** owns the investigation: gathers evidence, enumerates hypotheses, delegates to subagents, merges results, decides the next test, requests approvals.
* **Hypothesis subagents:** each investigates one hypothesis by running its own sandbox analysis and returning structured likelihood + evidence. This keeps every subagent genuinely computational (avoids the "thin RAG wrapper subagent" trap).

## 2. The mock vehicle MCP server

Standard MCP server (build in whatever you're fastest in — Node/TS keeps the stack uniform with the SDK; Python is fine too). It serves **seeded synthetic data** from scenario files. Register it with TrueForge via the MCP catalog config.

### 2.1 Read tools (Tier 1 — autonomous)

* `get_dtcs(vin)` -> `[{code, status: "active"|"pending", priority}]`
* `get_freeze_frame(vin, code)` -> `{rpm, engine_load, coolant_temp, short_fuel_trim, long_fuel_trim, vehicle_speed, maf, o2_voltage, ...}`
* `get_sensor_log(vin, pid, window)` -> `{t: [...], value: [...]}` # time-series
* `get_service_history(vin)` -> `[{date, work, parts, notes}]`
* `lookup_dtc_knowledge(code)` -> `{common_causes: [{cause, prior}], characteristic_signatures: {cause: "what to look for"}}`

`lookup_dtc_knowledge` is where your **priors** live (feeds the Bayesian update) and where each hypothesis's **predicted signature** is described (so the subagent knows what to test for).

### 2.2 Action tools (gated — Tier 2 / Tier 3)

* `request_measurement(vin, measurement_spec)` # Tier 2 — returns NEW sensor data
* `clear_codes(vin)` # Tier 3 — destroys diagnostic trail
* `order_part(vin, part_id)` # Tier 3 — spends money

Mark these **approval-required** in the harness (see §5). They return mocked results (e.g. `request_measurement` returns the next authored data slice for the scenario; `clear_codes` returns success + logs it).

### 2.3 Scenario data model

Each scenario is a self-contained fixture:

```
scenario_A/
  meta.json               # vin, description, GROUND-TRUTH root cause (for eval only)
  dtcs.json
  freeze_frames.json
  sensors/                # per-PID time-series, baseline + injected anomaly
  service_history.json
  followup/               # data returned when a Tier-2 measurement is approved
```

**Ground truth stays server-side / eval-only** — never fed to the agent. It's how you verify the agent reaches the right cause, and how you script the demo.

## 3. The sandbox analysis library (load-bearing core)

This is the part that must not be decorative. The **agent writes analysis code and runs it in the sandbox**; the sandbox returns numbers the agent reasons over.

Two viable patterns — pick based on how much you trust generation vs. determinism:
* **A. Agent-authored analysis (max "harness doing work" credit):** The subagent is prompted to *write* the analysis (e.g. "compute correlation between short_fuel_trim and engine_load; report r and whether trims rise with load") and execute it in the sandbox. Most impressive; slightly less deterministic.
* **B. Agent-invoked analysis helpers (max reliability):** You ship a small analysis module into the sandbox; the agent writes the driver code that calls it with the right PIDs and interprets results. Deterministic and still genuinely sandbox-executed.

Recommended: **B for the scored/critical analyses, A to show off** on one hypothesis in the demo. Both satisfy "generated code running in a sandbox."

### 3.1 Minimum analysis functions (co-design each with a scenario anomaly)

```python
# frequency-domain: is there periodic energy in the expected band?
# e.g. a recurring misfire cadence, or (industrial) a bearing frequency
def fft_signature(t, value, expected_freq_band):
    return {"peak_freq": ..., "band_energy_ratio": ..., "match": bool}

# do fuel-trim spikes align in time with misfire events / load changes?
def cross_correlate(series_a, series_b, max_lag):
    return {"max_r": ..., "lag": ..., "aligned": bool}

# is a sensor physically consistent with the others, or is the SENSOR suspect?
# e.g. O2 flatlined/railed while fuel system is clearly cycling -> sensor fault,
# not a real lean condition. This distinguishes "sensor failure" from
# "the condition the sensor measures" — a core diagnostic move.
def sensor_plausibility(readings):
    return {"implausible": bool, "which": ..., "reason": ...}

# z-score / deviation from known-good operating envelope
def anomaly_vs_baseline(value, baseline_mean, baseline_std):
    return {"max_z": ..., "anomalous": bool, "where": ...}
```

### 3.2 Likelihood output (feeds Bayesian update)

Each analysis returns not just booleans but a **likelihood score** in `[0, 1]`: how well the data matches the hypothesis's predicted signature. Keep the mapping explicit and inspectable (e.g. `band_energy_ratio` mapped through a documented function), so the number is defensible under questioning.

### 3.3 Determinism

Seed everything. Same scenario in → same likelihoods out. This makes the demo repeatable and the confidence math trustworthy.

## 4. Confidence: the Bayesian update (real, not vibes)

* **priors:** $P(H_i)$ from `lookup_dtc_knowledge` (sum to 1 over hypotheses)
* **likelihoods:** $L_i = P(	ext{evidence} \mid H_i)$ from each subagent's sandbox analysis
* **posterior:** $P(H_i \mid 	ext{evidence}) = rac{P(H_i) \cdot L_i}{\sum_j (P(H_j) \cdot L_j)}$

* **Round 1:** priors × first-round likelihoods → posteriors (the initial ranking).
* **After an approved measurement:** treat new evidence as another likelihood term and update again (sequential Bayesian updating). This *is* the "68% → 91% → 96%" progression — and now it means something.
* Compute this in a tool/sandbox call, **not** in the LLM's head. The LLM narrates the result; it does not invent the number.
* If a hypothesis has no computable likelihood, drop to ordinal (strong/moderate/weak) for that one rather than fabricating a percentage.

## 5. Human-approval gates (the safety spine)

The harness natively pauses on sensitive actions. Your job is to declare which tools are sensitive and to make the pause legible.

1. Mark `request_measurement` (Tier 2), `clear_codes` and `order_part` (Tier 3) as **approval-required** in the harness config for the agent.
2. On a gated call the loop **pauses and surfaces the pending action**; the UI shows what the agent wants to do and why; the human approves/denies; the loop resumes.
3. Make the approval prompt carry the *justification*: the recommended action, the evidence behind it, and (Tier 2) the expected information gain.

Two distinct demo moments fall out naturally:
1. **Tier 2 gate:** "I want to take measurement X; expected info gain HIGH. Approve?"
2. **Tier 3 gate:** "Root cause found. Recommend clear codes + order part Y. Approve?"

Confirm in the SDK/README the exact mechanism (a tool-level flag and/or an approval callback / interrupt-and-resume). The concept you need: tool requires approval → loop pauses → human decides → loop resumes with the outcome.

## 6. Active diagnosis (information gain) — the originality piece

After round 1 you have posteriors over hypotheses. For each *candidate next test*, estimate how much it would sharpen the distribution:

* Simple, defensible version: pick the test whose predicted outcome most **separates** the top competing hypotheses (i.e. the two hypotheses currently closest in posterior make the most different predictions about that test's result). That's the test that best breaks the tie.
* Frame it as expected reduction in uncertainty (entropy) if you want the formal story; even the tie-break heuristic reads as principled and is easy to explain in the demo.
* **Output:** the recommended test, *why* (which hypotheses it discriminates), and the expected information gain label. Then gate it (Tier 2).

## 7. Persistent investigation

One investigation = one TrueForge **session**; the harness persists session state across reconnects/restarts, which is exactly the multi-round loop you need.

* Store in session/investigation state: hypotheses, current posteriors, evidence gathered (with freshness), actions taken, actions pending approval.
* When an approved `request_measurement` returns `followup/` data, feed it as a new likelihood term, re-run the Bayesian update, and continue — no restart.

## 8. Model routing (scored TrueForge behavior)

TrueForge's headline capability is per-task model choice. Use it deliberately:
* **Strong model** for the actual differential reasoning and next-test selection.
* **Cheap/open model** (e.g. a GLM/Qwen-class model via an OpenAI-compatible endpoint) for orchestration chatter, evidence summarization, routing.
* Capture a short before/after cost or token note for the README/demo — it's both a real optimization and directly on the sponsor's narrative.

## 9. Fleet extension (COULD — cut first)

Given many VINs, run the per-hypothesis analyses in batch and rank vehicles by how they've progressed toward a known failure mode:

```python
for vin in fleet:
    signature_match = analyze(vin, target_failure_mode)
# rank by progression; flag the few needing inspection
```

Same analysis code, applied breadth-first. Turns the single-machine tool into a fleet reliability view. Only build after everything in SHOULD is solid.

## 10. UI (theme the provided chat UI; add an investigation view if time)

* Start from `@truefoundry/trueforge-ui` — you get streaming, approvals, and session handling for free. Don't build a UI from scratch.
* **Investigation view** (structured panel is enough; graph is a stretch): current hypotheses + posteriors, supporting vs contradictory evidence, evidence freshness, recommended next test, actions done, actions awaiting approval.
* The evidence graph (§SPEC 5.5) is the visual flourish — do it only if SHOULD items are all done. A clean panel scores fine; a broken graph scores worse than a panel.

## 11. Repo hygiene / eligibility

* **Qodo installed before commit #1.** Open real PRs (even solo: branch → PR → Qodo review → merge) so the review trail exists. This is graded and non-retrofittable.
* `.env` gitignored; **no secrets** in code, history, or the video.
* **README:** what it is, Node.js requirement, 60-second quickstart, architecture diagram, the three-tier safety model, and an honest "what's mocked / future work" section.
* **MIT license** (matches TrueForge).
* Deterministic seeds documented so judges can reproduce a run.

## 12. Suggested repo layout

```
FaultTrace/
├── README.md
├── SPEC.md
├── PLAN.md
├── IMPLEMENTATION.md
├── .env.example                     # names only, no values
├── mcp-server/                      # mock vehicle-service MCP server
│   ├── tools/                       # get_dtcs, get_freeze_frame, get_sensor_log, ...
│   └── scenarios/                   # scenario_A/, scenario_B/, ... (+ ground truth, eval-only)
├── agent/
│   ├── orchestrator/                # controller prompt/flow, hypothesis enumeration
│   ├── subagents/                   # per-hypothesis investigator
│   └── ranking/                     # bayesian update, info-gain next-test
├── sandbox/
│   └── analysis/                    # fft, cross_correlate, sensor_plausibility, anomaly
├── ui/                              # theming / investigation view (if built)
├── eval/                            # per-scenario: does the agent reach ground-truth cause?
└── trueforge.config.*               # model(s), MCP server, sandbox registration
```

Add a tiny **eval harness** early: for each scenario, assert the agent's top posterior matches the ground-truth cause. It catches regressions when you refactor to subagents on Day 3 and add scenarios on Day 4 — cheap insurance for a solo dev moving fast.

## 13. Recommended scenarios (co-design data + analysis)

1. **Lean misfire / vacuum leak (Scenario A, the demo hero):** `P0171` + `P0300`. Fuel trims climb under load; MAF reads low for airflow. Analysis: `cross_correlate(trim, load)` + MAF plausibility. Vacuum leak beats "bad MAF" and "ignition." Clear, legible, great for the video.
2. **MAF fault (Scenario B):** Similar surface symptoms, but MAF itself reads implausibly vs. derived airflow — plausibility flips the ranking toward the sensor. Shows the agent distinguishing *sensor* from *condition*.
3. **O2-sensor failure masquerading as a real lean condition (Scenario C):** O2 flatlined/railed while the fuel system clearly cycles — `sensor_plausibility` says the sensor is lying. The strongest "investigation, not lookup" moment.
4. **EVAP (Scenario D, breadth):** P0442-class small leak; different signature.
5. **U-code / bus fault (Scenario E, breadth):** Network/wiring; anomaly is dropouts, not a physical trend — shows range beyond powertrain.

> Do A fully before B–E. B and C carry the most originality per hour.

## 14. Demo beat sheet (3 minutes — record Day 6)

* **0:00** Failure event on screen: `P0171` + `P0300`, freeze-frame shows high load + high trim.
* **0:15** "Investigate why this vehicle threw these codes." Agent starts.
* **0:25** Agent calls MCP read tools — codes, freeze-frame, sensor log. *(visible tool calls)*
* **0:45** Agent enumerates hypotheses with predicted signatures. Fans out subagents.
* **1:05** Subagents run analysis **IN THE SANDBOX** — show the generated code executing.
* **1:25** Bayesian update: posteriors shift as likelihoods arrive *(real math, show it)*.
* **1:40** Differential: vacuum leak > MAF > ignition, with supporting + contradictory evidence.
* **1:55** Active diagnosis: "Cheapest test to confirm is X; expected info gain HIGH."
* **2:05** **TIER-2 GATE:** agent pauses for approval. Human approves. *(the money shot)*
* **2:15** New measurement returns; posterior for vacuum leak jumps. Root cause emerges.
* **2:35** **TIER-3 GATE:** "Recommend clear codes + order part. Approve?" Agent **STOPS**.
* **2:50** Human approves; mocked action logs. Investigation complete + resumable.
* **3:00** Close on the safety line: "Investigate freely. Act carefully." + time-saved stat.

Show, in order and unmistakably: a **real MCP tool call**, **agent code running in the sandbox**, and **both approval gates**. Those three are the eligibility proof; make each one visually obvious.

## 15. First-hour checklist (do these before anything else)

1. `node -v` $\ge 22.13$.
2. Public GitHub repo + **Qodo connected before first commit**.
3. `npx @truefoundry/trueforge` runs; chat UI loads.
4. Model key set; **budget cap set**.
5. Sandbox executes a trivial agent-written snippet.
6. A hardcoded `get_dtcs` MCP tool is callable by the agent.

When these six are green, you have the whole spine proven in miniature and every later day is adding real substance onto something that already runs.

