// Auto-generated index file for vaneagent
// Generated on 2025-03-23T07:54:11.887Z

import AgentKit from "./core/agent-kit.js";

import "./tools/EthereumPriceTool.js";

import "./agents/EthereumPriceAgent.js";

// Compile the AgentKit configuration
const compiledKit = AgentKit.compile();

// Export individual agents
export const ethereumPriceAgent = compiledKit.agents["EthereumPriceAgent"];

// Create an agents object with all the agents
const output = {
  ethereumPriceAgent,
  getAllAgents: () => compiledKit.agents,
  getAllTools: () => compiledKit.tools,
};

// Export the agents object as default
export default output;

/*
Example usage:

// Using the default import (all agents)
import agents from "./index.js";
const response = await agents.ethereumPriceAgent.generate({
  messages: [{ role: 'user', content: 'Your message here' }]
});

// Using named exports for specific agents
import { ethereumPriceAgent } from "./index.js";
const specificResponse = await ethereumPriceAgent.generate({
  messages: [{ role: 'user', content: 'A message for this specific agent' }]
});
*/
