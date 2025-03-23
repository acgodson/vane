// src/cli/index.js
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import dotenv from "dotenv";
import inquirer from "inquirer";
import ora from "ora";
import { buildProject } from "./build";
import createCLIIntegration from "./integration";
import { buildProjectFiles, installDependencies } from "./utils";
import { handleDeploy } from "./deploy";
import { generateFiles } from "../generators";
import {
  createWebSocketServer,
  createMirroredConsole,
} from "../websocket/server";

dotenv.config();

// Save the CLI configuration to a file
function saveConfig(config: any) {
  const configPath = join(process.cwd(), ".vanekit-config.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// Load the CLI configuration from a file
function loadConfig() {
  const configPath = join(process.cwd(), ".vanekit-config.json");
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      return config;
    } catch (error) {
      console.error("Failed to parse configuration file:", error);
    }
  }
  return undefined;
}
// Configure API keys
async function configureAPIKeys(config: any) {
  // Check if API keys are already configured
  if (config.apiKeys && config.apiKeys.openai) {
    const { useExisting } = await inquirer.prompt([
      {
        type: "confirm",
        name: "useExisting",
        message: "Use existing API keys?",
        default: true,
      },
    ]);

    if (useExisting) return config.apiKeys;
  }

  console.log("\n🔑 API Key Configuration");

  const apiKeys = await inquirer.prompt([
    {
      type: "password",
      name: "openai",
      message: "OpenAI API Key (for GPT models):",
      default: config.apiKeys?.openai || "",
    },
    {
      type: "password",
      name: "anthropic",
      message: "Anthropic API Key (for Claude models, optional):",
      default: config.apiKeys?.anthropic || "",
    },
  ]);

  // Update config with new API keys
  config.apiKeys = apiKeys;
  saveConfig(config);

  // Set environment variables for use in the current process
  process.env.OPENAI_API_KEY = apiKeys.openai;
  if (apiKeys.anthropic) {
    process.env.ANTHROPIC_API_KEY = apiKeys.anthropic;
  }

  return apiKeys;
}

// Create a new Vane project
async function createProject() {
  const { projectName } = await inquirer.prompt([
    {
      type: "input",
      name: "projectName",
      message: "What would you like to name your project?",
      default: "my-vane-project",
    },
  ]);

  const { projectDescription } = await inquirer.prompt([
    {
      type: "input",
      name: "projectDescription",
      message: "Describe your project:",
      default: "An AI agent system built with vane",
    },
  ]);

  // Normalize project name for path
  const projectPath = resolve(projectName.toLowerCase().replace(/\s+/g, "-"));

  // Create project directory if it doesn't exist
  if (!existsSync(projectPath)) {
    mkdirSync(projectPath, { recursive: true });
  }

  // 1. Generate project files first
  const spinner = ora("Generating project files...").start();
  try {
    await generateFiles(projectPath, {
      name: projectName,
      description: projectDescription,
    });
    spinner.succeed("Project files generated successfully");

    // 2. Save configuration to the project directory
    const config = {
      projectName,
      projectPath,
      lastInteraction: new Date(),
      savedConversation: [],
    };

    const configPath = join(projectPath, ".vanekit-config.json");
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`Configuration saved to ${configPath}`);
  } catch (error: any) {
    spinner.fail(`Failed to set up project: ${error.message}`);
    console.error(error);
  }

  console.log(`
  ✨ Project "${projectName}" created successfully!
  
  Next steps:
    1. cd ${projectPath}
    2. npm run dev
  
  To continue the conversation with Vane:
    vanekit chat ${projectPath}  
  `);
}

// Start the chat functionality with our vane CLI agent
async function startChat(config: any) {
  console.log(`
💬 Welcome to Vane Chat!
You're working on project: ${config.projectName}
`);

  // Normalize project ID for consistent use
  const projectId = config.projectPath.split("/").pop() || config.projectName;
  console.log(`Using project ID: ${projectId}`);

  // Ensure API keys are configured - we still need these for the agent
  if (!config.apiKeys?.openai) {
    console.log("⚠️ API keys not configured. Setting them up now.");
    await configureAPIKeys(config);
  } else {
    // Set environment variables for the current process
    process.env.OPENAI_API_KEY = config.apiKeys.openai;
    if (config.apiKeys.anthropic) {
      process.env.ANTHROPIC_API_KEY = config.apiKeys.anthropic;
    }
  }

  // Initialize memory from local config
  if (!config.memory) {
    config.memory = {
      toolUsage: {},
      agentUsage: {},
      errors: [],
      warnings: [],
      conversation: [],
      createdAt: new Date().toISOString(),
    };
  }

  // Initialize CLI integration
  const cliIntegration = createCLIIntegration(config);

  // Ask if the user wants to enable browser interface
  const { enableBrowser } = await inquirer.prompt([
    {
      type: "confirm",
      name: "enableBrowser",
      message:
        "Would you like to enable browser interface for this chat session?",
      default: true,
    },
  ]);

  // WebSocket server reference
  let wsServer: any = null;

  if (enableBrowser) {
    // Ask for port
    const { port } = await inquirer.prompt([
      {
        type: "number",
        name: "port",
        message: "Enter port for browser interface:",
        default: 8080,
        validate: (value) => {
          const port = parseInt(value);
          if (isNaN(port) || port < 1024 || port > 65535) {
            return "Please enter a valid port number (1024-65535)";
          }
          return true;
        },
      },
    ]);

    // Create a wrapper for CLI message processing
    const processMessage = async (message: string): Promise<string> => {
      try {
        // Process using the real CLI integration
        return await cliIntegration.processMessage(message);
      } catch (error: any) {
        return `Error: ${error.message}`;
      }
    };

    // Start WebSocket server
    wsServer = createWebSocketServer(processMessage, port, config);

    // Replace console with mirrored version
    Object.assign(console, createMirroredConsole(wsServer));

    console.log(`
    🔗 Browser interface is now available
    
    To use the browser interface:
    1. Open the Vane browser interface in your web browser
    2. Connect to ws://localhost:${port}
    3. Chat from either the browser or this terminal
    `);
  }

  // Save function - only saves to local config during development
  const saveConversation = async () => {
    // Update memory with current conversation from CLI integration
    const conversation = cliIntegration.getConversation();
    config.memory.conversation = conversation;
    config.memory.lastSaved = new Date().toISOString();
    config.lastInteraction = new Date();
    // Save local config
    saveConfig(config);
  };

  // Start conversation loop
  let chatting = true;
  while (chatting) {
    const { message } = await inquirer.prompt([
      {
        type: "input",
        name: "message",
        message: "👤 You:",
      },
    ]);

    // Handle direct commands first
    if (message.toLowerCase() === "exit") {
      // Save on exit
      const spinner = ora("Saving conversation before exit...").start();
      await saveConversation();
      spinner.succeed("Conversation saved");

      if (wsServer) {
        wsServer.close();
        console.log("WebSocket server closed");
      }

      chatting = false;
      continue;
    }

    if (message.toLowerCase() === "help") {
      console.log(`
Available commands:
  exit - Exit the chat (auto-saves)
  deploy - Deploy your website
  save - Save the current conversation
  clear - Clear the conversation history
  generate <filename> - Generate a new file based on description
  install - Install dependencies in the project
  build - Build the project
  api - Configure API keys
  help - Show this help message
`);
      continue;
    }

    if (message.toLowerCase() === "save") {
      const spinner = ora("Saving conversation...").start();
      await saveConversation();
      spinner.succeed("Conversation saved");
      continue;
    }

    if (message.toLowerCase() === "api") {
      await configureAPIKeys(config);
      console.log("✅ API keys updated");
      continue;
    }

    if (message.toLowerCase() === "clear") {
      // Reset the conversation history
      config.savedConversation = [];
      // Reinitialize the CLI integration
      const cliIntegration = createCLIIntegration(config);
      console.log("🧹 Conversation history cleared");
      continue;
    }

    if (message.toLowerCase() === "install") {
      await installDependencies(config.projectPath);
      continue;
    }

    if (
      message.toLowerCase() === "build" ||
      message.toLowerCase().match(/^build\s+--[\w-]+=?/)
    ) {
      await buildProjectFiles(message, config);
      continue;
    }

    if (message.toLowerCase() === "deploy") {
      await handleDeploy(config, projectId);
      continue;
    }

    // For all other messages, use the CLI integration
    try {
      const response = await cliIntegration.processMessage(message);
      console.log(`🤖 Assistant: ${response}`);
    } catch (error: any) {
      console.error("Error processing message:", error);
      console.log(
        `🤖 Assistant: I encountered an error processing your request: ${error.message}`
      );
    }

    // Auto-save after each exchange
    await saveConversation().catch((err) =>
      console.error("Failed to save conversation:", err.message)
    );
  }

  console.log("👋 Thanks for using Vanekit! Goodbye.");
}

// Main CLI entry point
async function main() {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║              VANE CLI                 ║
  ║                                       ║
  ║  Build, manage and deploy AI agents   ║
  ║                                       ║
  ╚═══════════════════════════════════════╝
`);
  const existingConfig = loadConfig();

  if (existingConfig) {
    console.log(`Found existing project: ${existingConfig.projectName}`);
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices: [
          { name: "Continue working on this project", value: "continue" },
          { name: "Create a new project", value: "new" },
          { name: "Build project for deployment", value: "build" },
          { name: "Deploy project", value: "deploy" },
          { name: "Install dependencies", value: "install" },
          { name: "Exit", value: "exit" },
        ],
      },
    ]);

    switch (action) {
      case "continue":
        await startChat(existingConfig);
        break;

      case "new":
        await createProject();
        break;

      case "install":
        await installDependencies(existingConfig.projectPath);
        break;

      case "build":
        console.log("Starting build process...");
        const buildResult = await buildProject(existingConfig.projectPath, {
          projectName: existingConfig.projectName,
          skipDependencyPrompt: false,
        });
        if (buildResult.status === "error") {
          console.error(`Build failed: ${buildResult.message}`);
        }
        break;

      case "deploy":
        await handleDeploy(existingConfig, existingConfig.projectName);
        break;

      case "exit":
        console.log("👋 Goodbye!");
        process.exit(0);
        break;
    }
  } else {
    // No existing configuration, ask to create a new project
    const { createNew } = await inquirer.prompt([
      {
        type: "confirm",
        name: "createNew",
        message: "Would you like to create a new Vane project?",
        default: true,
      },
    ]);

    if (createNew) {
      await createProject();
    } else {
      console.log("👋 Goodbye!");
      process.exit(0);
    }
  }
}

// Export functions
export { createProject, startChat };

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
