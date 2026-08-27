# FaultTrace Agent Guidelines

## Key Patterns
- **Subagent Registration**: Must use `TrueForge.registerSubagent()` explicitly
- **Testing**: 
  - Smoke tests validate core functionality (`tests/smoke.js`)
  - Use CommonJS (`require`) in test files
- **Configuration**:
  - Edit `faulttrace-investigator.agent.json` for hypothesis routing

## Common Pitfalls
- Avoid mixing ESM/CommonJS in tests
- Always validate subagent registration in smoke tests
- Ensure `@faulttrace/trueforge` is properly linked in package.json