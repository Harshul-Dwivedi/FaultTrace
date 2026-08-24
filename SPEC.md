# FaultTrace - Autonomous Forensic Agent for Physical Systems

**Hackathon:** TrueForge Agent Harness Hackathon (Aug 24-30, 2026)  
**MVP Substrate:** Vehicle Diagnostics (OBD-II / DTC forensics)  
**Team:** Solo  

> "Something expensive broke. Figure out why and prove it. Ask a human before you touch anything."

This document combines three parts: **Part I Specification**, **Part II Build Plan**, and **Part III Implementation Guide**.

---

# Part I Specification

## 1. One-paragraph definition

FaultTrace is an autonomous forensic investigation agent. Given a failure event (a diagnostic trouble code plus the sensor conditions around it), it gathers evidence from multiple sources, generates competing root-cause hypotheses, **writes and runs analytical code in a sandbox to test each hypothesis against the telemetry**, ranks the causes with supporting and contradictory evidence, recommends the single most informative next diagnostic step, and **stops before any irreversible physical action until a human approves**. The hackathon build demonstrates this on vehicle diagnostics, but the architecture is domain-agnostic (the same design applies to compressors, turbines, pumps, HVAC, data-center gear).

## 2. Why this exists (the problem)

A trouble code names a *symptom*, not a *cause*. P0300 (random misfire) can be plugs, coils, injectors, vacuum leak, or compression. Today a technician manually correlates the code against freeze-frame conditions, live sensor logs, and service history forming and eliminating hypotheses by hand. That manual differential diagnosis is slow and causes unnecessary parts replacement (people swap the wrong part because the code was ambiguous).

FaultTrace automates the **reasoning and investigation**, never the physical intervention. It behaves like a forensic reliability engineer, not a chatbot and not a predictive-maintenance model.

### Contrast with predictive maintenance

* **Predictive maintenance asks:** "Will this machine fail?" (pattern → probability)
* **FaultTrace asks:** "Why did it fail, what evidence supports that explanation, and what should we check next?" (evidence → tested hypothesis → next action)

## 3. Why it fits the hackathon (eligibility mapping)

The harness must visibly be doing real work on all three levers. This design makes each lever **structurally required**, not decorative.

| Harness lever | How FaultTrace requires it (not bolts it on) |
| :--- | :--- |
| **Real tool via MCP** | A mock vehicle-service MCP server exposes read tools (codes, freeze-frame, sensor logs, service history) and gated action tools (clear codes, order part). The agent cannot investigate without reaching these. |
| **Sandbox executes agent-written code** | Hypotheses are *tested by computation* — FFT / frequency analysis, time-series cross-correlation, sensor plausibility checks, statistical anomaly detection. The LLM cannot assert "bearing-frequency signature detected" or "MAF reads implausibly low for airflow"; it must run code that finds it. This is the load-bearing differentiator. |
| **Human approval before irreversible action** | Three-tier safety model (§6). Clearing codes destroys the diagnostic trail; ordering a part spends money. Both are gated. The gate is a genuine domain requirement. |
| **Subagents (bonus)** | One investigator subagent per hypothesis class; each runs its own sandbox analysis independently, then results are merged into a ranked differential. Fan-out is genuine parallel investigation, not decorative. |
| **Persistent sessions (bonus)** | An investigation spans multiple diagnostic rounds (hypothesize → request measurement → human approves → new evidence arrives → re-rank). Session state must survive across those rounds. |

### The six judging criteria, addressed

* **Impact:** Reduces downtime and wrong-part replacement; a real job engineers do.
* **Creativity / originality:** Not a RAG bot or coding agent; the "active diagnosis / information-gain" loop (§5.4) is genuinely novel.
* **Technical excellence:** Multi-agent orchestration, signal processing, statistical reasoning, sandboxed execution, real confidence math.
* **Sponsor-tool use:** TrueForge is central (harness runs the loop, sandbox, approvals, subagents, sessions); model routing used deliberately; Qodo PR reviews from commit one.
* **Control & safety:** The three-tier model is the spine of the product, and produces two distinct approval moments to demonstrate.
* **Presentation:** The demo tells a natural story: broke → investigate → hypothesize → test → ask permission → new evidence → proven cause.

## 4. Scope (full — nothing cut for solo)

Everything below is in scope. During development, cut from the bottom of the priority order in PLAN.md if time runs short — but design the whole thing.

### In scope
1. Mock vehicle-service MCP server (read + gated-action tools).
2. Authored fault scenarios with realistic sensor time-series (target 5; floor 3).
3. Orchestrator (controller) agent that runs the investigation.
4. Evidence-gathering tools (telemetry, freeze-frame, service history, knowledge lookup).
5. Hypothesis subagents (one per hypothesis class), each running sandbox analysis.
6. Sandbox analysis library: FFT, correlation, plausibility, anomaly detection.
7. **Real confidence math:** Bayesian update, not LLM-guessed percentages (§7).
8. Differential-diagnosis ranking with supporting + contradictory evidence.
9. Active-diagnosis loop: choose the highest-information-gain next test.
10. Three-tier safety model with human approval gates.
11. Persistent investigation state across diagnostic rounds.
12. Evidence graph / structured investigation view (UI).
13. Fleet-level extension (find other machines with the same early signature).
14. Model routing (cheap model for orchestration chatter, strong model for reasoning).

### Explicitly out of scope (real vehicle integration)
* No connection to a real vehicle or real OBD-II hardware. **Synthetic data only.**
* No real parts ordering / no real money. Gated actions are mocked.
* No PII, no secrets in the repo or demo video.

## 5. Functional requirements

### 5.1 Evidence gathering
The agent retrieves, via MCP tools:
* Active + pending DTCs for a VIN.
* Freeze-frame snapshot for each DTC (RPM, load, coolant temp, fuel trims, speed, etc.).
* Sensor time-series logs for requested PIDs over a time window.
* Service / maintenance history for the VIN.
* Knowledge lookup: common causes + characteristic signatures for a given DTC.

### 5.2 Hypothesis generation
From the codes + freeze-frame, the orchestrator enumerates competing hypotheses (e.g. for a lean misfire case: vacuum leak, failing MAF, weak fuel delivery, ignition fault, O2 sensor fault). Each hypothesis has a stated *predicted signature* — the thing that would have to be true in the data if this hypothesis were correct.

### 5.3 Hypothesis testing (sandbox — load-bearing)
Each hypothesis is handed to an investigator subagent that:
* Requests the relevant sensor logs via MCP.
* Writes analysis code and runs it **in the sandbox**.
* Returns a likelihood: how well does the data match this hypothesis's predicted signature? (a real number, not a vibe — see §7).
* Returns the supporting and contradictory evidence it found.

Minimum analysis types implemented:
* FFT / frequency-domain (e.g. detect a periodic signature).
* Time-series cross-correlation (e.g. do fuel-trim spikes align with misfire events?).
* Sensor plausibility (is a reading physically consistent with the others, or is the sensor itself suspect?).
* Baseline / statistical anomaly detection (deviation from known-good envelope).

### 5.4 Active diagnosis (information gain)
After the first round, the agent does not just report. It computes: given the remaining hypotheses and their current probabilities, what is the single cheapest observation that would most reduce uncertainty? It recommends that next test, states the expected information gain, and stops for approval.

### 5.5 Differential diagnosis output
Ranked hypotheses, each with: current probability, supporting evidence list, contradictory evidence list, evidence freshness, and (for the top candidate) the recommended next action. Never a single unexplained LLM paragraph.

### 5.6 Human-in-the-loop
Per the three-tier model (§6): read/analyze runs autonomously; diagnostic actions and irreversible actions pause for explicit human approval. The UI must clearly show what the agent did, what it is waiting on, and what requires approval.

### 5.7 Persistent investigation
An investigation is resumable. New evidence (from an approved measurement) re-enters the loop and updates the hypotheses without restarting.

### 5.8 Fleet extension
Given a fleet of VINs, find vehicles showing the early signature of a diagnosed failure mode, ranked by how far each has progressed. (Batch application of the same per-hypothesis analysis across many machines.)

## 6. Safety model (three tiers)

### Tier 1 — Read / Analyze (autonomous)
Read DTCs, read freeze-frame, read sensor logs, read service history, search knowledge, run sandbox analysis, generate + rank hypotheses, compare historical incidents, choose next test. No approval needed.

### Tier 2 — Diagnostic actions (require approval)
Request a physical inspection, trigger a diagnostic procedure, collect new measurements, temporarily change an operating parameter to observe an effect.

### Tier 3 — Irreversible actions (require approval, never autonomous)
Clear DTCs (destroys the diagnostic trail), order replacement parts (spends money), authorize a repair, shut down / restart equipment, change configuration.

**Principle:** *Investigate freely. Act carefully. The agent may reason to a firm conclusion autonomously, but a human owns every physical-world / irreversible action.*

## 7. Confidence must be real (anti-hallucination requirement)

This is a hard requirement, not a nice-to-have. Confidence numbers must be **computed**, not produced by the language model.

* Each hypothesis starts with a **prior** (from the DTC knowledge base — e.g. for P0300, ignition and vacuum are more common than compression).
* Each sandbox analysis produces a **likelihood** (a score of how well the observed data matches that hypothesis's predicted signature).
* **Posterior is a Bayesian update:** `posterior ∝ prior × likelihood`, normalized across the hypothesis set.
* The displayed "68% → 91%" style movement is the posterior shifting as sandbox evidence arrives — and it is defensible because a judge can inspect the math.
* Fake precision is worse than no number. If the analysis can't produce a real likelihood for a given hypothesis, rank it ordinally (strong/moderate/weak) instead.

## 8. Non-functional requirements

* **Reproducibility:** Every run on the same seeded scenario produces the same analysis result. Sandbox analysis must be deterministic given the data.
* **Data/analysis co-design:** Each authored anomaly must be detectable by the corresponding sandbox analysis. Author data and analysis together, not separately.
* **Legibility:** A non-automotive judge should follow the investigation. Prefer clear evidence statements over jargon dumps.
* **No secrets in repo/video:** API keys in gitignored `.env` only.
* **Qodo installed before first commit** (Best Code Quality eligibility).
* **Public repo, MIT-compatible**, clean README with a 60-second quickstart.
* **Cost control:** Hard budget cap on the model gateway; cheap model for orchestration turns, strong model for diagnostic reasoning.

## 9. Acceptance criteria (definition of done for the MVP)

The build is demo-ready when, for at least one seeded scenario, all of the following happen end to end in a single session:
1. Agent pulls codes + freeze-frame + sensor log via MCP tool calls (visible).
2. Agent enumerates ≥ 3 competing hypotheses with predicted signatures.
3. Agent fans out to per-hypothesis subagents that each run real code in the sandbox.
4. Confidence updates via genuine Bayesian math from the analysis likelihoods.
5. Agent produces a ranked differential with supporting + contradictory evidence.
6. Agent recommends the highest-information-gain next test and **pauses for approval**.
7. Human approves; new evidence enters; hypotheses re-rank; a root cause emerges.
8. Agent recommends the irreversible action (clear codes / order part) and **pauses again — never executing it without approval**.
9. The whole session is resumable (persistent state).
10. Nothing in the repo or the recording exposes a secret.

**Stretch acceptance (in scope, cut last):** evidence-graph UI (§5.5 visualized), fleet extension (§5.8), model routing demonstrated and measured.

---

