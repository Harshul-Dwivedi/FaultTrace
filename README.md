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

# 2. Install (applies the Windows kysely migration patch automatically)
npm install

# 3. Start the harness
npm start          # runs @truefoundry/trueforge on http://localhost:8790

# 4. Configure a model provider in the UI (Settings -> Models):
#    Gemini, OpenRouter, Mistral, Groq, or any OpenAI-compatible endpoint

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

### Model notes (free tiers)

| Provider | Usable for this project | Catch |
| --- | --- | --- |
| OpenRouter (`stealth/ox-alpha`) | Yes - primary today | ~20 RPM / 50 req/day free |
| Google AI Studio Flash | Yes after daily reset | Free tier quota varies by region |
| Mistral | Yes, slow mode | Free tier = 4 req/min |
| Groq | No | 8K tokens/min cap < our prompt size |
| Gemini Pro preview | No | Free-tier quota is zero |

### Tests

```bash
cd mcp-server
npm test           # smoke + stdio suites
node tests/http.mjs # HTTP transport suite (server must be running)
```

### Sandbox requirement

The agent definition enables the sandbox (`config.sandbox.enabled: true`) because
hypothesis testing must run as real computed code, not LLM text math. TrueForge's
catalog uses the **Daytona** provider - set a Daytona API key in Settings → Sandbox
before creating sessions from this definition.

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
