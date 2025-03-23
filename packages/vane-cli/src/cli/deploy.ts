// src/cli/deploy.js
import { buildProject } from "./build";
import inquirer from "inquirer";
import fs, {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from "fs";
import { join, resolve } from "path";
import * as path from "path";
import { logger, withSpinner } from "./utils";

/**
 * A recursive directory copy function using only fs
 * Replacement for fs-extra's copySync
 */
function copyDirSync(src, dest) {
  // Create destination directory if it doesn't exist
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  // Read all files/directories in the source directory
  const entries = readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      // Recursively copy directories
      copyDirSync(srcPath, destPath);
    } else {
      // Copy files
      writeFileSync(destPath, readFileSync(srcPath));
    }
  }
}

/**
 * Replacement for fs-extra's remove using only fs
 */
function removeDirSync(dir) {
  if (!existsSync(dir)) return;

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      removeDirSync(fullPath);
    } else {
      fs.unlinkSync(fullPath);
    }
  }

  fs.rmdirSync(dir);
}

/**
 * Deploy the built agent to an Alexa skill
 */
export async function deployToAlexaSkill(projectPath, inputOptions = {}) {
  console.log(`
  ╔═════════════════════════════════════╗
  ║       Vane Alexa Deployment         ║
  ║                                     ║
  ║   Integrate your AI agent with      ║
  ║        your Alexa skill             ║
  ╚═════════════════════════════════════╝
  `);

  try {
    // Resolve project path
    projectPath = resolve(projectPath);
    logger.info("Project path:", projectPath);

    if (!existsSync(projectPath)) {
      throw new Error(`Project directory '${projectPath}' does not exist`);
    }

    // Check if dist directory exists
    const distPath = join(projectPath, "dist");
    if (!existsSync(distPath)) {
      throw new Error(
        `Dist directory not found. Please build your project first with 'vanekit build'.`
      );
    }

    // Collect deployment options
    const options = await collectDeployOptions(projectPath, inputOptions);

    // Ensure Alexa skill directory exists
    const alexaSkillPath = resolve(options.alexaSkillPath);
    if (!existsSync(alexaSkillPath)) {
      throw new Error(
        `Alexa skill directory '${alexaSkillPath}' does not exist`
      );
    }

    // Create target directories - FIXED: Use lambda directly without custom subfolder
    const lambdaPath = join(alexaSkillPath, "lambda");
    const utilsPath = join(lambdaPath, "utils");
    const handlersPath = join(lambdaPath, "handlers");

    // Ensure directories exist
    if (!existsSync(lambdaPath)) mkdirSync(lambdaPath, { recursive: true });
    if (!existsSync(utilsPath)) mkdirSync(utilsPath, { recursive: true });
    if (!existsSync(handlersPath)) mkdirSync(handlersPath, { recursive: true });

    // 1. Copy dist folder to Alexa skill
    const targetAgentPath = join(lambdaPath, options.agentName);
    await withSpinner(`Copying agent to ${targetAgentPath}...`, async () => {
      if (existsSync(targetAgentPath)) {
        // Remove existing directory to ensure clean deployment
        removeDirSync(targetAgentPath);
      }

      // Create the target directory
      mkdirSync(targetAgentPath, { recursive: true });

      // Copy dist folder to target path using our custom function
      copyDirSync(distPath, targetAgentPath);
      logger.info(`Agent copied to ${targetAgentPath}`);
      return true;
    });

    // 2. Generate wrapper utility function
    const wrapperPath = join(utilsPath, `${options.agentName}.js`);
    await withSpinner(
      `Creating agent wrapper at ${wrapperPath}...`,
      async () => {
        const wrapperContent = generateWrapperFunction(options.agentName);
        writeFileSync(wrapperPath, wrapperContent);
        return true;
      }
    );

    // 3. Generate default handler
    const handlerPath = join(handlersPath, `${options.agentName}Handler.js`);
    await withSpinner(
      `Creating default handler at ${handlerPath}...`,
      async () => {
        const handlerContent = generateExampleHandler(options.agentName);
        writeFileSync(handlerPath, handlerContent);
        return true;
      }
    );

    console.log(`
✅ Deployment completed successfully!

Your agent has been deployed to: ${targetAgentPath}
A wrapper function has been created at: ${wrapperPath}
An example handler has been created at: ${handlerPath}

To use your agent in your Alexa skill:

1. Commit and Git push changes to your Alexa Hosting  your Alexa skill

2. Use [agent Query] or default VaneAgentHandler intents in your interaction model:
`);

    return {
      status: "success",
      deployPath: targetAgentPath,
      message: `Agent successfully deployed to ${targetAgentPath}`,
    };
  } catch (error) {
    logger.error("Deployment failed:", error.message);
    return {
      status: "error",
      message: error.message,
    };
  }
}

/**
 * Collect deployment options through CLI prompts
 */
async function collectDeployOptions(projectPath, inputOptions) {
  // Get project name from package.json if not provided
  let projectName = inputOptions.projectName;
  if (!projectName) {
    try {
      const packageJsonPath = join(projectPath, "package.json");
      if (existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
        projectName = packageJson.name;
      }
    } catch (error) {
      logger.warn("Could not read package.json to determine project name");
    }
  }

  // If still no project name, use the directory name
  if (!projectName) {
    projectName = projectPath.split("/").pop() || "vane-agent";
  }

  // Prompt for Alexa skill path
  const { alexaSkillPath } = await inquirer.prompt([
    {
      type: "input",
      name: "alexaSkillPath",
      message: "Enter the path to your Alexa skill root directory:",
      default: inputOptions.alexaSkillPath || "../Alexa-skills/vanewallet",
    },
  ]);

  // Validate Alexa skill path
  const resolvedSkillPath = resolve(alexaSkillPath);
  if (!existsSync(resolvedSkillPath)) {
    throw new Error(`Alexa skill directory not found at: ${resolvedSkillPath}`);
  }

  // Prompt for agent name (used for target directory)
  const { agentName } = await inquirer.prompt([
    {
      type: "input",
      name: "agentName",
      message:
        "What name would you like to use for the agent in your Alexa skill?",
      default: inputOptions.agentName || "vane-agent",
    },
  ]);

  return {
    projectPath,
    projectName,
    alexaSkillPath,
    agentName,
  };
}

// Updated wrapper with proper agent selection
function generateWrapperFunction(agentName) {
  return `// Auto-generated wrapper for ${agentName}
  const path = require('path');
  const fs = require('fs');
  
  /**
   * Simple wrapper for the Vane AI agent
   * @param {string} prompt - The user's query or prompt
   * @param {Object} [options] - Optional configuration
   * @returns {Promise<string>} - The agent's response
   */
  async function queryAgent(prompt, options = {}) {
    try {
      // Dynamically import the agent (only once)
      if (!queryAgent.agent) {
        const agentPath = path.join(__dirname, '..', '${agentName}');
        console.log('Loading agent from:', agentPath);
        
        try {
          // First try to import the index.js file
          const indexPath = path.join(agentPath, 'index.js');
          console.log('Trying to load from index path:', indexPath);
          
          // Using require instead of import for compatibility
          const agentModule = require(indexPath);
          
          console.log('Available exports:', Object.keys(agentModule));
          
          // Look for named exports ending with "Agent" (like mathSolverAgent)
          for (const key of Object.keys(agentModule)) {
            if (key !== 'default' && key.toLowerCase().includes('agent')) {
              console.log(\`Found specific agent: \${key}\`);
              queryAgent.agent = agentModule[key];
              break;
            }
          }
          
          // If no specific agent found yet, look in default export
          if (!queryAgent.agent && agentModule.default) {
            // Look for properties in the default export that end with "Agent"
            for (const key of Object.keys(agentModule.default)) {
              if (key.toLowerCase().includes('agent') && 
                  key !== 'getAllAgents' && // Skip helper functions
                  key !== 'getAllTools') {
                console.log(\`Found agent in default export: \${key}\`);
                queryAgent.agent = agentModule.default[key];
                break;
              }
            }
          }
          
          // Final fallback - try getting all agents and using the first one
          if (!queryAgent.agent && 
              agentModule.default && 
              typeof agentModule.default.getAllAgents === 'function') {
            const allAgents = agentModule.default.getAllAgents();
            const agentNames = Object.keys(allAgents);
            if (agentNames.length > 0) {
              console.log(\`Using first agent from getAllAgents: \${agentNames[0]}\`);
              queryAgent.agent = allAgents[agentNames[0]];
            }
          }
          
          if (!queryAgent.agent) {
            throw new Error("Could not find a suitable agent in the module exports");
          }
          
          console.log("Found agent:", queryAgent.agent.name || "Unknown");
          
          // Initialize agent if needed
          if (typeof queryAgent.agent.initialize === 'function') {
            console.log('Initializing agent...');
            await queryAgent.agent.initialize();
          }
        } catch (error) {
          console.error('Error importing agent:', error);
          throw error;
        }
      }
      
      // Send query to agent
      console.log('Sending query to agent:', prompt);
      let response;
      
      // Use generate() method if available
      if (typeof queryAgent.agent.generate === 'function') {
        console.log('Using agent.generate() method');
        response = await queryAgent.agent.generate({
          messages: [{ role: 'user', content: prompt }],
          ...options
        });
        
        console.log('Raw response:', JSON.stringify(response).substring(0, 100) + '...');
        
        // Handle different response formats
        if (response && typeof response === 'object') {
          if (response.type === 'assistant' && response.value) {
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
        throw new Error('Agent does not have a generate() method');
      }
      
      console.log('Processed response:', response);
      
      // Ensure we return a string
      if (typeof response !== 'string') {
        console.log('Response is not a string, converting...');
        if (response && typeof response === 'object') {
          return JSON.stringify(response);
        }
        return String(response);
      }
      
      return response;
    } catch (error) {
      console.error('Error querying agent:', error);
      return 'I encountered an error while processing your request. ' + error.message;
    }
  }
  
  // Export the wrapper function
  module.exports = {
    queryAgent
  };
  `;
}

function generateExampleHandler(agentName) {
  const intentName = agentName.includes("-")
    ? capitalizeFirstLetter(agentName.replace(/-/g, ""))
    : capitalizeFirstLetter(agentName);

  const handlerName = intentName + "IntentHandler";

  return `// Auto-generated handler for ${agentName}
// This file will be replaced during agent deployment

require("dotenv").config();

const Alexa = require('ask-sdk-core');
const { queryAgent } = require('../utils/${agentName}');

/**
 * Handler for ${intentName} queries through the "lookup" command
 */
const ${handlerName} = {
  canHandle(handlerInput) {
    console.log("Checking if ${handlerName} can handle the request...");
    const canHandle =
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === '${intentName}Intent';
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
        response = await queryAgent(query, {
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

      // Format response for better Alexa speech
      let formattedResponse = response;
      
      // Convert LaTeX-style math notation to plain text for better speech
      formattedResponse = formattedResponse.replace(/\\\\?\\(([^)]+)\\\\?\\)/g, '$1');
      formattedResponse = formattedResponse.replace(/\\\\times/g, 'times');
      formattedResponse = formattedResponse.replace(/\\\\div/g, 'divided by');
      formattedResponse = formattedResponse.replace(/\\\\sqrt/g, 'square root of');

      console.log("Final response to be sent:", formattedResponse);
      return handlerInput.responseBuilder
        .speak(formattedResponse)
        .reprompt("Is there anything else you would like to look up?")
        .getResponse();
    } catch (error) {
      console.error("Unhandled error in ${handlerName}:", error);
      return handlerInput.responseBuilder
        .speak(
          "I had trouble looking up that information right now. Please try again later."
        )
        .getResponse();
    }
  }
};

module.exports = { ${handlerName} };
`;
}

/**
 * Helper to capitalize the first letter of a string
 */
function capitalizeFirstLetter(string) {
  if (!string) return "";
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Handle deploy command in the main CLI
export async function handleDeploy(config, projectId) {
  try {
    const projectPath = config.projectPath;

    // Check if project is built
    if (!existsSync(path.join(projectPath, "dist"))) {
      const { shouldBuild } = await inquirer.prompt([
        {
          type: "confirm",
          name: "shouldBuild",
          message: "Project needs to be built first. Build now?",
          default: true,
        },
      ]);

      if (shouldBuild) {
        console.log("Building project before deployment...");
        const buildResult = await buildProject(projectPath, {
          projectName: config.projectName,
          skipDependencyPrompt: false,
        });

        if (buildResult.status === "error") {
          console.error(`Build failed: ${buildResult.message}`);
          return;
        }
      } else {
        console.log(
          'Deployment canceled. Please build the project first with "vanekit build".'
        );
        return;
      }
    }

    // Deploy to Alexa skill
    const result = await deployToAlexaSkill(projectPath, {
      projectName: config.projectName,
    });

    if (result.status === "error") {
      console.error(`❌ Deployment failed: ${result.message}`);
    }
  } catch (error) {
    console.error(`❌ Deployment failed: ${error.message}`);
  }
}
