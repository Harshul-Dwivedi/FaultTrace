function routeHypothesis(hypothesis) {
  const subagentMap = {
    P0171: 'fuel-trim-subagent',
    P0300: 'misfire-subagent',
    // ...other hypotheses...
  };
  return subagentMap[hypothesis.code] || 'default-subagent';
}