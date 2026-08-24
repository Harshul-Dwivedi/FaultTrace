# FaultTrace - Build Plan

# Part II — Build Plan

Solo build. Window: **Mon Aug 24 – Sun Aug 30, 2026** (submission Sun 8 PM London).  
Full scope retained. This plan sequences the work so that a demoable core exists early and every later day adds a working layer on top of a thing that already runs.

## Guiding principles

1. **Vertical slice first.** Get one scenario running end-to-end (MCP → hypothesis → sandbox → gated action) by end of Day 2, even if crude. Everything after is widening and polishing a working spine, never integrating for the first time on Day 6.
2. **Data and analysis are co-designed.** Never author a sensor trace without simultaneously writing the analysis that detects its anomaly. They ship together.
3. **Cut from the bottom, never the middle.** The priority ladder (below) is ordered. If a day slips, drop the lowest unstarted item — don't leave the spine half-wired.
4. **Commit continuously, from commit #1 with Qodo installed.** The PR-review trail is graded and cannot be retrofitted.
5. **Record as you go.** Capture clean screen grabs of each milestone working, so the final video isn't a last-day scramble.

## Priority ladder (cut from the bottom if time runs out)

### MUST (demo is impossible without these)
1. TrueForge running locally + model key + sandbox verified
2. Mock MCP server: read tools + gated action tools
3. One authored scenario with detectable anomaly matching analysis
4. Orchestrator that investigates end-to-end on that one scenario
5. Sandbox analysis actually running agent-written code (load-bearing)
6. One human approval gate working
7. README + 3-min demo video + public repo (submission artifacts)

### SHOULD (turns a pass into a contender)
8. Per-hypothesis subagent fan-out
9. Real Bayesian confidence math
10. 3+ scenarios total
11. Differential output with supporting + contradictory evidence
12. Second approval gate (irreversible tier)
13. Active-diagnosis / information-gain next-test selection
14. Persistent investigation across rounds

### COULD (edge, originality, polish — cut first)
15. Evidence-graph UI visualization
16. Model routing demonstrated + measured
17. Fleet extension
18. 5 scenarios
19. Blog post (separate prize track) + social posts

## Day-by-day

### Day 0 — Mon Aug 24 — Setup + spine skeleton
**Goal: environment green, repo live, harness talking to a trivial MCP tool.**
- [ ] Confirm Node.js ≥ 22.13 (`node -v`); upgrade if needed. *(hard blocker)*
- [ ] Create **public GitHub repo**. Install/connect **Qodo before the first commit**.
- [ ] `.gitignore` with `.env`; commit the empty skeleton.
- [ ] Get a model API key; set a hard budget cap.
- [ ] Run `npx @truefoundry/trueforge`; get the chat UI up; chat with the agent.
- [ ] Verify the **sandbox** executes a trivial agent-written snippet (Daytona path works).
- [ ] Connect one **trivial MCP tool** (`ping` / `get_dtcs` returning hardcoded JSON) and confirm the agent can call it.
- **End of day:** harness runs, sandbox runs, agent calls your MCP tool. Spine exists.

### Day 1 — Tue Aug 25 — MCP server + first real scenario
**Goal: real read tools + one fully authored, analysis-detectable scenario.**
- [ ] Build the mock MCP server read tools: `get_dtcs`, `get_freeze_frame`, `get_sensor_log`, `get_service_history`, `lookup_dtc_knowledge`.
- [ ] Author **Scenario A** (recommend: lean misfire — P0171 + P0300). Baseline sensor traces + injected anomaly (e.g. fuel-trim climbs under load; MAF reads low for airflow → vacuum-leak signature).
- [ ] Write the **matching sandbox analysis** for Scenario A's anomaly at the same time (fuel-trim/load correlation; MAF plausibility). Prove by hand it fires.
- **End of day:** the agent can fetch real evidence for Scenario A, and there is a known analysis that detects its root cause.

### Day 2 — Wed Aug 26 — End-to-end vertical slice (the critical day)
**Goal: one scenario goes from failure event to gated action, fully wired.**
- [ ] Orchestrator prompt/flow: read codes → enumerate hypotheses (with predicted signatures) → run analysis in sandbox → produce a ranked result.
- [ ] Sandbox analysis invoked by the agent as generated code (not pre-baked) — confirm it's the agent writing/running it, per the load-bearing requirement.
- [ ] Wire **one approval gate**: recommend "clear codes" → pause → human approves → mocked action executes → session logs it.
- [ ] Snapshot-record this working. This is your **fallback demo** if later days slip.
- **End of day: MUST items 1–6 complete. You have a submittable (if bare) project.**

### Day 3 — Thu Aug 27 — Subagents + real confidence
**Goal: genuine fan-out and defensible numbers.**
- [ ] Refactor the single investigation into **per-hypothesis subagents**, each running its own sandbox analysis and returning likelihood + evidence.
- [ ] Implement **Bayesian confidence**: priors from the DTC knowledge base × analysis likelihoods → normalized posteriors. Wire the "68% → 91%" movement to *real math*.
- [ ] Differential output: ranked hypotheses with supporting + contradictory evidence.
- [ ] Add the **second (irreversible-tier) gate** cleanly separated from Tier 2.
- **End of day:** the harness's subagent + approval story is fully real; numbers defensible.

### Day 4 — Fri Aug 28 — Breadth + active diagnosis + persistence
**Goal: more scenarios, the novel loop, resumable investigations.**
- [ ] Author **Scenarios B and C** (e.g. MAF fault; O2-sensor failure that *looks* like a real lean condition — the sensor-plausibility case is a great demo). Co-design each analysis. Target 3 solid; push toward 5 if smooth.
- [ ] Implement **active diagnosis**: compute the highest-information-gain next test from the current posteriors; recommend it; gate it.
- [ ] Implement **persistent investigation**: approved measurement → new evidence → re-rank without restart. Confirm resume-after-reconnect works.
- **End of day: SHOULD items complete. This is now a strong contender.**

### Day 5 — Sat Aug 29 — Polish, COULD items, story
**Goal: make it legible and inventive; add edge if time allows.**
- [ ] **Evidence-graph / investigation view** in the UI (structured, clear; graph if time, clean panel if not). Show: did / waiting-on / requires-approval.
- [ ] **Model routing**: cheap model for orchestration chatter, strong model for diagnostic reasoning. Capture a before/after cost note (this is a scored, on-narrative TrueForge behavior).
- [ ] **Fleet extension** if time remains: batch the analysis across a VIN set; rank by failure-mode progression.
- [ ] Harden: deterministic seeds, error handling, no-secret sweep of repo + logs.
- **End of day: feature-complete to whatever depth time allowed; frozen for demo.**

### Day 6 — Sun Aug 30 — Freeze, record, submit (finish by early afternoon)
**Goal: submission in hand well before 8 PM London. No new features today.**
- [ ] **Code freeze in the morning.** Bugfixes only past this point.
- [ ] Record the **3-minute demo** following the beat sheet in IMPLEMENTATION.md. Keep secrets off-screen. Show a real tool call, real sandbox execution, and both approval gates.
- [ ] Finalize **README**: what it is, the 60-second quickstart, the architecture diagram, the safety model, and an honest "what's mocked / future work" section.
- [ ] Confirm Qodo PR-review trail is visible in the repo history.
- [ ] Submit. Then (optional, separate tracks) post the blog + social entries.
- **Buffer:** leave the afternoon for the inevitable recording re-take and a broken-link check. Do not schedule new work into it.

## Time-zone note

Submission is **Sunday 8 PM London**. If you're in IST (London +5:30 in summer, i.e. London 8 PM = 12:30 AM IST Monday), treat your **real deadline as Sunday afternoon London / Sunday evening IST** and don't rely on the post-midnight cushion.

## Risk register (solo-specific)

| Risk | Likelihood | Mitigation |
| :--- | :--- | :--- |
| Data authoring eats the week | High | Co-design data + analysis; 1 scenario fully before breadth; scenarios are the cuttable breadth, the spine is not. |
| Sandbox reads as decorative | Med | Enforce: the agent writes/runs the analysis code; verify in Day 2. If the LLM is "reasoning" in text instead of executing, it's wrong. |
| Fake confidence hurts credibility | Med | Bayesian math is a MUST-adjacent SHOULD; if cut, use ordinal ranking, never invented percentages. |
| Node/sandbox setup burns Day 0 | Med | Day 0 is only setup; if it slips, everything shifts a day and COULD items are dropped, spine stays. |
| Scope creep from full-scope mandate | Med | The priority ladder is the contract. Widen only after the current tier is fully working. |
| Last-day recording scramble | Med | Record milestones as they land; Day 2 snapshot is a guaranteed fallback demo. |
| Cost runaway from fan-out loops | Low | Hard gateway budget cap set Day 0; cheap model for orchestration. |

### Definition of "safe to stop"
At any day's end you should have a **runnable, submittable** artifact. Day 2 gives the first one; every day after strictly improves it. If life interrupts on Day 4, you still submit the Day 3 state and it's a real project.

---

