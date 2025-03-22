// Placeholder index file for vane-agent
// This file will be replaced during agent deployment

const AgentKit = require("./core/agent-kit.js");
require("./tools/PlaceholderTool.js");
require("./agents/PlaceholderAgent.js");

// Compile the AgentKit configuration
const compiledKit = AgentKit.compile();

// Create an agents object with all the agents
const output = {
  placeholderSolverAgent: compiledKit.agents["PlaceholderAgent"],
  getAllAgents: () => compiledKit.agents,
  getAllTools: () => compiledKit.tools,
};

// Export the agents object as default
module.exports = output;