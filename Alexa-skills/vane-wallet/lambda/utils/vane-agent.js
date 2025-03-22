// Default placeholder for vane-agent utility
// This file will be replaced during agent deployment

/**
 * Placeholder wrapper for the Vane AI agent
 * @param {string} prompt - The user's query or prompt
 * @param {Object} [options] - Optional configuration
 * @returns {Promise<string>} - The agent's response
 */
async function queryAgent(prompt, options = {}) {
  console.log("Agent query received:", prompt);

  // When no agent is deployed, return a default message
  return "I'm sorry, but the AI agent is not available yet. Please try again after deploying your agent using the Vane CLI.";
}

// Export the wrapper function
module.exports = {
  queryAgent,
};