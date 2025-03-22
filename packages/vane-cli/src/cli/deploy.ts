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

    // Create target directories
    const lambdaPath = join(alexaSkillPath, "lambda");
    const customPath = join(lambdaPath, "custom");
    const utilsPath = join(customPath, "utils");

    // Ensure directories exist
    if (!existsSync(lambdaPath)) mkdirSync(lambdaPath, { recursive: true });
    if (!existsSync(customPath)) mkdirSync(customPath, { recursive: true });
    if (!existsSync(utilsPath)) mkdirSync(utilsPath, { recursive: true });

    // 1. Copy dist folder to Alexa skill
    const targetAgentPath = join(customPath, options.agentName);
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

    // 3. Generate example handler
    const handlersPath = join(customPath, "handlers");
    if (!existsSync(handlersPath)) mkdirSync(handlersPath, { recursive: true });

    const handlerPath = join(handlersPath, `${options.agentName}Handler.js`);
    await withSpinner(
      `Creating example handler at ${handlerPath}...`,
      async () => {
        const handlerContent = generateExampleHandler(options.agentName);
        writeFileSync(handlerPath, handlerContent);
        return true;
      }
    );

    // 4. Generate interaction model snippet
    const intentName = options.agentName.includes("-")
      ? capitalizeFirstLetter(options.agentName.replace(/-/g, ""))
      : capitalizeFirstLetter(options.agentName);

    const interactionModelSnippet = `
{
  "name": "${intentName}Intent",
  "slots": [
    {
      "name": "query",
      "type": "AMAZON.SearchQuery"
    }
  ],
  "samples": [
    "ask about {query}",
    "tell me about {query}",
    "what is {query}",
    "check {query}",
    "get information about {query}",
    "lookup {query}"
  ]
}`;

    // 5. Generate index.js import snippet
    const handlerName = intentName + "IntentHandler";

    console.log(`
✅ Deployment completed successfully!

Your agent has been deployed to: ${targetAgentPath}
A wrapper function has been created at: ${wrapperPath}
An example handler has been created at: ${handlerPath}

To use your agent in your Alexa skill:

1. Add the following to your index.js:

const ${handlerName} = require('./handlers/${options.agentName}Handler');

// Add to your skill builder
const skillBuilder = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    // ... your existing handlers
    ${handlerName}
  )
  .lambda();

2. Add this intent to your interaction model:
${interactionModelSnippet}

3. Build and deploy your Alexa skill
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

/**
 * Generate wrapper function to simplify agent usage
 */
function generateWrapperFunction(agentName) {
  return `// Auto-generated wrapper for ${agentName}
const path = require('path');

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
        // Using require instead of import for compatibility
        const agentModule = require(agentPath);
        
        // The agent might be the default export or named export
        queryAgent.agent = agentModule.default || agentModule.agent || agentModule;
        
        if (!queryAgent.agent || typeof queryAgent.agent !== 'function') {
          console.error('Agent not found or not a function in module:', Object.keys(agentModule));
          
          // Try to find any function export that could be the agent
          for (const key in agentModule) {
            if (typeof agentModule[key] === 'function') {
              console.log('Found potential agent function:', key);
              queryAgent.agent = agentModule[key];
              break;
            }
          }
          
          // If still not found, use the whole module as a fallback
          if (!queryAgent.agent || typeof queryAgent.agent !== 'function') {
            console.warn('Could not identify agent function, using module as agent');
            queryAgent.agent = agentModule;
          }
        }
        
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
    
    if (typeof queryAgent.agent === 'function') {
      response = await queryAgent.agent(prompt, options);
    } else if (queryAgent.agent && typeof queryAgent.agent.query === 'function') {
      response = await queryAgent.agent.query(prompt, options);
    } else if (queryAgent.agent && typeof queryAgent.agent.run === 'function') {
      response = await queryAgent.agent.run(prompt, options);
    } else {
      throw new Error('Could not determine how to invoke the agent');
    }
    
    console.log('Received response from agent');
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

/**
 * Generate example handler for the Alexa skill
 */
function generateExampleHandler(agentName) {
  const intentName = agentName.includes("-")
    ? capitalizeFirstLetter(agentName.replace(/-/g, ""))
    : capitalizeFirstLetter(agentName);

  const handlerName = intentName + "IntentHandler";

  return `// Auto-generated handler for ${agentName}
const Alexa = require('ask-sdk-core');
const { queryAgent } = require('../utils/${agentName}');

/**
 * Handler for ${intentName} queries
 */
const ${handlerName} = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === '${intentName}Intent'
    );
  },
  async handle(handlerInput) {
    // Get the user's query from the slot
    const query = Alexa.getSlotValue(handlerInput.requestEnvelope, 'query') || 
                  'What is the current price of Ethereum?';
    
    try {
      console.log('${handlerName} received query:', query);
      
      // Query the agent
      const response = await queryAgent(query, {
        // You can add options here as needed
        userId: handlerInput.requestEnvelope.session.user.userId
      });
      
      console.log('Agent response:', response);
      
      return handlerInput.responseBuilder
        .speak(response)
        .reprompt('Is there anything else you would like to know?')
        .getResponse();
    } catch (error) {
      console.error('Error in ${handlerName}:', error);
      
      return handlerInput.responseBuilder
        .speak('I had trouble accessing that information right now. Please try again later.')
        .getResponse();
    }
  }
};

module.exports = ${handlerName};
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
