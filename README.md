# FaultTrace — Autonomous Forensic Agent for Physical Systems

**Hackathon:** TrueForge Agent Harness Hackathon (Aug 24–30, 2026)
**MVP substrate:** Vehicle diagnostics (OBD-II / DTC forensics)
**Harness:** [TrueForge](https://github.com/truefoundry/trueforge)

> "Something expensive broke. Figure out why and prove it. Ask a human before you touch anything."

FaultTrace is an autonomous forensic investigation agent. Given a failure event (a diagnostic trouble code plus surrounding sensor conditions), it gathers evidence via MCP tools, generates competing root-cause hypotheses, writes and runs analytical code in a sandbox to test each hypothesis against the telemetry, ranks causes with real Bayesian math, recommends the highest-information-gain next diagnostic step — and stops for human approval before any irreversible action.

## Quickstart

```bash
# 1. Requirements: Node.js >= 22.13
node -v

# 2. Start the harness
npx @truefoundry/trueforge

# 3. Configure your model key
cp .env.example .env   # fill in values

# 4. Start the mock vehicle MCP server (coming soon)
```

## Architecture

See [SPEC.md](SPEC.md) for the full specification.

```
User / Technician → TrueForge core server → Orchestrator Agent
    ├─ Evidence tools (MCP read: dtcs, freeze-frame, sensor logs, history, knowledge)
    ├─ Hypothesis subagents → sandbox analysis (FFT, correlation, plausibility, anomaly)
    ├─ Bayesian ranking (prior × likelihood → posterior)
    └─ Gated action tools (Tier 2: measurements / Tier 3: clear codes, order part)
```

## Safety model

- **Tier 1 — Read/analyze:** autonomous.
- **Tier 2 — Diagnostic actions:** pauses for approval.
- **Tier 3 — Irreversible actions** (clear codes, order parts): pauses for approval, never autonomous.

*Investigate freely. Act carefully.*

## What's mocked / future work

- Synthetic vehicle data only — no real OBD-II hardware.
- Parts ordering is mocked; no real money moves.
- Fleet extension is a stretch goal.

## License

MIT
