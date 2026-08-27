# Workflow Optimization

## Testing
- Run `cd mcp-server; npm test` for quick validation
- Use explicit exit codes: `process.exit(allChecksPassed ? 0 : 1)`

## Debugging
- Check `agent/logs/` for subagent errors
- Verify TrueForge linkage first if tests fail

## Code Structure
- Subagents: `agent/subagents/*`
- Orchestrator: `agent/orchestrator/main.js`