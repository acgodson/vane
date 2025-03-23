// utils/reset-agent.js
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/**
 * Reset the Vane Agent to its placeholder state
 */
function resetAgent() {
  const rootDir = path.resolve(__dirname, "..");
  console.log("Resetting Vane Agent to placeholder state...");

  try {
    // Reset the utils/vane-agent.js wrapper
    const wrapperContent = `// Default placeholder for vane-agent utility
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
};`;

    fs.writeFileSync(
      path.join(rootDir, "utils", "vane-agent.js"),
      wrapperContent
    );
    console.log("✓ Reset utils/vane-agent.js wrapper");

    // Reset the handlers/vane-agentHandler.js with the updated version
    const handlerContent = `// Default placeholder for Vane agent handler
// This file will be replaced during agent deployment

require("dotenv").config();

const Alexa = require("ask-sdk-core");
const { queryAgent } = require("../utils/vane-agent");

/**
 * Handler for Vane AI agent queries through the "lookup" command
 */
const VaneagentIntentHandler = {
  canHandle(handlerInput) {
    console.log("Checking if VaneagentIntentHandler can handle the request...");
    const canHandle =
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "VaneagentIntent";
    console.log(\`Can handle: \${canHandle}\`);
    return canHandle;
  },
  async handle(handlerInput) {
    try {
      const querySlot = handlerInput.requestEnvelope.request.intent.slots.query;
      const query = querySlot ? querySlot.value : null;
      console.log("Query slot:", querySlot);
      console.log("Query value:", query);
      if (!query) {
        console.log("No query value detected");
        return handlerInput.responseBuilder
          .speak("What would you like to look up?")
          .reprompt("Please tell me what to look up.")
          .addElicitSlotDirective("query")
          .getResponse();
      }

      console.log("About to call queryAgent with:", query);
      let response;
      try {
        response = "Not available at the moment";

        await queryAgent(query, {
          userId: handlerInput.requestEnvelope.session.user.userId,
        });
        console.log("Raw response from queryAgent:", response);
      } catch (queryError) {
        console.error("Error calling queryAgent:", queryError);
        response = "I encountered an error processing your request.";
      }

      // Check if response is undefined or empty
      if (!response) {
        console.log("Response is empty or undefined, using fallback message");
        response =
          "I'm sorry, but I couldn't get a proper response at this time.";
      }

      console.log("Final response to be sent:", response);
      return handlerInput.responseBuilder
        .speak(response)
        .reprompt("Is there anything else you would like to look up?")
        .getResponse();
    } catch (error) {
      console.error("Unhandled error in VaneagentIntentHandler:", error);
      return handlerInput.responseBuilder
        .speak(
          "I had trouble looking up that information right now. Please try again later."
        )
        .getResponse();
    }
  },
};

module.exports = { VaneagentIntentHandler };`;

    fs.writeFileSync(
      path.join(rootDir, "handlers", "vane-agentHandler.js"),
      handlerContent
    );
    console.log("✓ Reset handlers/vane-agentHandler.js");

    // Reset vane-agent directory
    const agentDir = path.join(rootDir, "vane-agent");

    // If directory exists, delete it first
    if (fs.existsSync(agentDir)) {
      console.log("Removing existing vane-agent directory...");
      // Use a node-friendly way to remove directories recursively
      if (process.platform === "win32") {
        execSync(`rmdir /s /q "${agentDir}"`);
      } else {
        execSync(`rm -rf "${agentDir}"`);
      }
    }

    // Create fresh placeholder directory structure
    console.log("Creating placeholder vane-agent directory structure...");
    fs.mkdirSync(path.join(agentDir, "core"), { recursive: true });
    fs.mkdirSync(path.join(agentDir, "agents"), { recursive: true });
    fs.mkdirSync(path.join(agentDir, "tools"), { recursive: true });

    // Create placeholder core/agent-kit.js
    fs.writeFileSync(
      path.join(agentDir, "core", "agent-kit.js"),
      `// Placeholder agent-kit core module
module.exports = {
  compile: () => {
    console.log("Placeholder agent-kit compiled");
    return {
      agents: {
        "PlaceholderAgent": {
          generate: async () => ({
            type: "assistant",
            value: "This is a placeholder agent. Please deploy a real agent using the Vane CLI."
          })
        }
      },
      tools: {}
    };
  }
};`
    );

    // Create placeholder tools
    fs.writeFileSync(
      path.join(agentDir, "tools", "PlaceholderTool.js"),
      `// Placeholder tool implementation
module.exports = class PlaceholderTool {
  constructor() {
    this.name = "PlaceholderTool";
  }
};`
    );

    // Create placeholder agent
    fs.writeFileSync(
      path.join(agentDir, "agents", "PlaceholderAgent.js"),
      `// Placeholder agent implementation
module.exports = class PlaceholderAgent {
  constructor() {
    this.name = "PlaceholderAgent";
  }
  
  async generate(options) {
    console.log("Placeholder agent received request:", options);
    return {
      type: "assistant",
      value: "This is a placeholder agent. Please deploy a real agent using the Vane CLI."
    };
  }
};`
    );

    // Create placeholder index.js (CommonJS version for Node.js compatibility)
    fs.writeFileSync(
      path.join(agentDir, "index.js"),
      `// Placeholder index file for vane-agent
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
module.exports = output;`
    );

    console.log("✓ Created placeholder vane-agent directory structure");
    console.log("✅ Agent successfully reset to placeholder state!");
  } catch (error) {
    console.error("❌ Error resetting agent:", error.message);
    process.exit(1);
  }
}

// Run the reset if this file is called directly
if (require.main === module) {
  resetAgent();
}

module.exports = { resetAgent };
