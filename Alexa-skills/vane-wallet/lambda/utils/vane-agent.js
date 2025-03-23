// utils/vane-agent.js
const path = require("path");

// Load polyfills first
require("./polyfill");

/**
 * Simple wrapper for the Vane AI agent
 * @param {string} prompt - The user's query or prompt
 * @param {Object} [options] - Optional configuration
 * @returns {Promise<string>} - The agent's response
 */
async function queryAgent(prompt, options = {}) {
  try {
    // Use the pre-converted CommonJS version of the agent
    if (!queryAgent.agent) {
      const agentPath = path.join(__dirname, "..", "vane-agent-cjs");
      console.log("Loading agent from converted CJS path:", agentPath);

      // Try to load the index.js file
      const indexPath = path.join(agentPath, "index.js");
      console.log("Loading from index path:", indexPath);

      // Make sure TransformStream is defined before requiring modules that use it
      if (typeof TransformStream === "undefined") {
        console.error(
          "TransformStream is not defined! Polyfills may not have loaded correctly."
        );
        throw new Error(
          "Missing Web Streams API. Please ensure polyfills are loaded."
        );
      }

      // Using require is fine now as it's CommonJS
      const agentModule = require(indexPath);
      console.log("Available exports:", Object.keys(agentModule));

      // Find agent using various methods
      let agent = null;

      // Look for named exports ending with "Agent"
      for (const key of Object.keys(agentModule)) {
        if (key !== "default" && key.toLowerCase().includes("agent")) {
          console.log(`Found specific agent: ${key}`);
          agent = agentModule[key];
          break;
        }
      }

      // If no specific agent found yet, look in default export
      if (!agent && agentModule.default) {
        for (const key of Object.keys(agentModule.default)) {
          if (
            key.toLowerCase().includes("agent") &&
            key !== "getAllAgents" &&
            key !== "getAllTools"
          ) {
            console.log(`Found agent in default export: ${key}`);
            agent = agentModule.default[key];
            break;
          }
        }
      }

      // Final fallback - try getting all agents
      if (
        !agent &&
        agentModule.default &&
        typeof agentModule.default.getAllAgents === "function"
      ) {
        const allAgents = agentModule.default.getAllAgents();
        const agentNames = Object.keys(allAgents);
        if (agentNames.length > 0) {
          console.log(`Using first agent from getAllAgents: ${agentNames[0]}`);
          agent = allAgents[agentNames[0]];
        }
      }

      if (!agent) {
        throw new Error(
          "Could not find a suitable agent in the module exports"
        );
      }

      console.log("Found agent:", agent.name || "Unknown");

      // Initialize agent if needed
      if (typeof agent.initialize === "function") {
        console.log("Initializing agent...");
        await agent.initialize();
      }

      queryAgent.agent = agent;
    }

    // Get the loaded agent
    const agent = queryAgent.agent;

    // Send query to agent
    console.log("Sending query to agent:", prompt);
    let response;

    // Use generate() method if available
    if (typeof agent.generate === "function") {
      console.log("Using agent.generate() method");
      response = await agent.generate({
        messages: [{ role: "user", content: prompt }],
        ...options,
      });

      console.log(
        "Raw response:",
        JSON.stringify(response).substring(0, 100) + "..."
      );

      // Handle different response formats
      if (response && typeof response === "object") {
        if (response.type === "assistant" && response.value) {
          response = response.value;
        } else if (response.value) {
          response = response.value;
        } else if (response.content) {
          response = response.content;
        } else if (response.text) {
          response = response.text;
        }
      }
    } else {
      throw new Error("Agent does not have a generate() method");
    }

    // Ensure we return a string
    if (typeof response !== "string") {
      console.log("Response is not a string, converting...");
      if (response && typeof response === "object") {
        return JSON.stringify(response);
      }
      return String(response);
    }

    return response;
  } catch (error) {
    console.error("Error querying agent:", error);
    return (
      "I encountered an error while processing your request. " + error.message
    );
  }
}

// Export the wrapper function
module.exports = {
  queryAgent,
};
