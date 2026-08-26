function routeHypothesis(hypothesis) {
  const subagentMap = {
    P0171: 'fuel-trim-subagent',
    P0300: 'misfire-subagent',
    // ...other hypotheses...
  };
  return subagentMap[hypothesis.code] || 'default-subagent';
}

function registerSubagents() {
  TrueForge.registerSubagent('fuel-trim-subagent', require('../subagents/fuel-trim-subagent'));
  TrueForge.registerSubagent('misfire-subagent', require('../subagents/misfire-subagent'));
}

// Initialize during agent startup
registerSubagents();