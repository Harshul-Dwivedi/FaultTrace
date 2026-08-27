# FaultTrace — Autonomous Forensic Agent for Physical Systems

**Hackathon:** TrueForge Agent Harness Hackathon (Aug 24–30, 2026)
**MVP substrate:** Vehicle diagnostics (OBD-II / DTC forensics)
**Harness:** [TrueForge](https://github.com/truefoundry/trueforge)

> "Something expensive broke. Figure out why and prove it. Ask a human before you touch anything."

FaultTrace is an autonomous forensic investigation agent. Given a failure event (a diagnostic trouble code plus surrounding sensor conditions), it gathers evidence via MCP tools, generates competing root-cause hypotheses, writes and runs analytical code in a sandbox to test each hypothesis against the telemetry, ranks causes with real Bayesian math, recommends the highest-information-gain next diagnostic step — and stops for human approval before any irreversible action.

**Three scenarios are implemented:**

| Scenario | Vehicle | Fault | DTCs |
| --- | --- | --- | --- |
| A | 2003 Honda Accord EX 2.4L | Vacuum leak (cracked brake-booster hose) | P0171, P0300 |
| B | 2005 Toyota Camry LE 2.4L | MAF sensor contamination (hot-wire coated) | P0171, P0102, P0300 |
| C | 2004 Ford F-150 XLT 5.4L V8 | O2 sensor stuck lean (no switching) | P0171, P0133 |

## Quickstart

```bash
# 1. Requirements: Node.js >= 22.13
node -v

# 2. Install (applies the Windows kysely migration patch automatically)
npm install

# 3. Start the harness
npm start          # runs @truefoundry/trueforge on http://localhost:8790

# 4. Configure a model provider in the UI (Settings -> Models):
#    OpenRouter (stealth/ox-alpha) is the primary provider — $5 top-up recommended

# 5. Start the mock vehicle MCP server (HTTP transport)
cd mcp-server && npm install && npm run start:http
#    serves http://localhost:9090/mcp - register it as a remote MCP server
#    named "faulttrace-vehicle" in TrueForge Settings -> Connectors

# 6. Create the agent from agent/faulttrace-investigator.agent.json
```

### Windows note

TrueForge v0.1.4 fails to start on Windows because kysely's `FileMigrationProvider`
passes raw `C:\...` paths to ESM `import()`. `patches/kysely+0.29.5.patch` fixes this
and is applied automatically via `postinstall` (patch-package). See PR #2 for details.

### Model notes

| Provider | Status | Notes |
| --- | --- | --- |
| OpenRouter (`stealth/ox-alpha`) | Primary | $5 top-up done, ~1000 req/day |
| Google AI Studio Flash | Backup | Free tier quota-limited |
| Mistral | Backup | Free tier = 4 req/min |
| Groq | Unusable | 8K tokens/min cap < prompt size |

### Tests

```bash
cd mcp-server
npm test           # smoke.mjs + stdio.mjs — 12 tools, 3 scenarios, ground-truth filtering
node tests/http.mjs # HTTP transport suite (server must be running)
```

The smoke test validates: tool registration, 3-VIN support, freeze-frame values, sensor windows,
compact telemetry, DTC knowledge with correct priors, `get_vehicle_info` ground-truth filtering,
Tier-2/3 gating, and DTC state mutations.

### Sandbox requirement

The agent definition enables the sandbox (`config.sandbox.enabled: true`) because
hypothesis testing must run as real computed code, not LLM text math. TrueForge's
catalog uses the **Daytona** provider - set a Daytona API key in Settings → Sandbox
before creating sessions from this definition.

## Architecture

See [SPEC.md](SPEC.md) for the full specification.

```
User / Technician → TrueForge core server → Orchestrator Agent
    ├─ Evidence tools (MCP: dtcs, freeze-frame, sensor logs, history, knowledge,
    │                   vehicle-info, compact-telemetry)
    ├─ Dynamic subagent delegation (per-hypothesis fan-out)
    │   └─ Each subagent: sandbox analysis (correlation, plausibility, anomaly)
    ├─ Bayesian ranking (prior × likelihood → posterior, info-gain test selection)
    └─ Gated action tools (Tier 2: measurements / Tier 3: clear codes, order part)
```

**12 MCP tools** across Tier-1 (reads), Tier-2 (diagnostic), and Tier-3 (irreversible):

| Tier | Tools | Gating |
| --- | --- | --- |
| 1 (read) | `list_vehicles`, `get_dtcs`, `get_freeze_frame`, `get_pid_list`, `get_sensor_log`, `get_compact_telemetry`, `get_service_history`, `lookup_dtc_knowledge`, `get_vehicle_info` | Autonomous |
| 2 (diagnostic) | `request_measurement` | Pauses for human approval |
| 3 (irreversible) | `clear_codes`, `order_part` | Pauses for human approval |

## Safety model

- **Tier 1 — Read/analyze:** autonomous.
- **Tier 2 — Diagnostic actions:** pauses for approval.
- **Tier 3 — Irreversible actions** (clear codes, order parts): pauses for approval, never autonomous.

Gated tools require `approved_by_human=true` in their arguments; the harness pauses before
execution. This is defense-in-depth — the MCP server independently refuses unapproved calls.

*Investigate freely. Act carefully.*

## What's mocked / future work

- Synthetic vehicle data only — no real OBD-II hardware.
- Parts ordering is mocked; no real money moves.
- Three deterministic scenarios with seeded telemetry generators.
- Fleet extension is a stretch goal.

## License

MIT
