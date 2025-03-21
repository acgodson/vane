// src/cli/integration.ts
import { createCLIAgent, processCLICommand } from "./sytem/cli-agent";
import ora from "ora";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";

export class CLIIntegration {
  private agent: any;
  private conversation: Array<{ role: string; content: string }> = [];
  private config: any;
  private context: any = {
    conversation: [],
    currentTask: {
      type: null,
      status: "idle",
      collectedInfo: {},
      currentQuestion: null,
      expectedAnswer: null,
    },
    createdEntities: {
      tools: [],
      agents: [],
    },
  };

  constructor(config: any) {
    this.config = config;

    // Initialize conversation from config if available
    if (config.savedConversation && Array.isArray(config.savedConversation)) {
      this.conversation = [...config.savedConversation];
      this.context.conversation = [...config.savedConversation];
    }

    // Ensure project directories exist
    this.ensureProjectDirectories();
  }

  /**
   * Ensure required project directories exist
   */
  private ensureProjectDirectories(): void {
    const directories = [
      join(this.config.projectPath, "src/tools"),
      join(this.config.projectPath, "src/agents"),
      join(this.config.projectPath, "src/core"),
    ];

    for (const dir of directories) {
      if (!existsSync(dir)) {
        try {
          mkdirSync(dir, { recursive: true });
        } catch (error) {
          console.warn(`Could not create directory ${dir}: ${error}`);
        }
      }
    }
  }

  /**
   * Initialize the CLI agent
   */
  async initialize() {
    if (this.agent) return this.agent;

    const spinner = ora("Initializing CLI assistant...").start();
    try {
      this.agent = await createCLIAgent();
      spinner.succeed("CLI assistant ready");
      return this.agent;
    } catch (error) {
      spinner.fail(
        `Failed to initialize CLI assistant: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Process a user message and handle file generation
   */
  async processMessage(message: string): Promise<string> {
    // Initialize agent if needed
    if (!this.agent) {
      await this.initialize();
    }

    // Add message to conversation history
    this.conversation.push({ role: "user", content: message });
    this.context.conversation = this.conversation;

    // Process with agent
    const spinner = ora("Processing...").start();
    try {
      // Process the command
      const result = await processCLICommand(this.agent, message, this.context);

      // Update context from result if available
      if (result.metadata && result.metadata.contextState) {
        this.context = result.metadata.contextState;
      }

      spinner.succeed("Done");

      // Handle file generation
      let filesGenerated = false;
      if (
        result.metadata?.filesGenerated &&
        result.metadata.filesGenerated.length > 0
      ) {
        filesGenerated = true;

        // Log each generated file
        result.metadata.filesGenerated.forEach((file: any) => {
          if (file.status === "success") {
            console.log(`✅ ${file.operation} file: ${file.path}`);
          } else {
            console.error(`❌ Failed to ${file.operation} file: ${file.path}`);
            if (file.error) {
              console.error(`   Error: ${file.error}`);
            }
          }
        });
      }

      // Extract response
      let responseText: any;
      if (result.status === "error") {
        responseText =
          result.response ||
          result.message ||
          "An error occurred while processing your request.";
      } else {
        responseText =
          result.response ||
          "I processed your request but couldn't generate a response.";
      }

      // If files were generated, append info to response
      if (filesGenerated) {
        // Check what was just created
        const justCreated =
          this.context.currentTask.type === "tool_creation"
            ? "tool"
            : this.context.currentTask.type === "agent_creation"
            ? "agent"
            : "file";

        // Get the name of what was created
        const justCreatedName =
          this.context.currentTask.collectedInfo?.name || "item";

        // Add a success message to the response
        if (!responseText.includes("successfully")) {
          responseText += `\n\nThe ${justCreated} \`${justCreatedName}\` has been successfully created.`;
        }

        // Reset task status
        this.context.currentTask.status = "complete";
      }

      // Add response to conversation
      this.conversation.push({ role: "assistant", content: responseText });
      this.context.conversation = this.conversation;

      // Log current task for debugging
      if (this.context.currentTask?.type) {
        console.debug(
          `Current task: ${this.context.currentTask.type} (${this.context.currentTask.status})`
        );
        console.debug(
          `Collected info: ${JSON.stringify(
            this.context.currentTask.collectedInfo
          )}`
        );
      }

      return responseText;
    } catch (error) {
      spinner.fail(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
      const errorMessage = `I encountered an error processing your request: ${
        error instanceof Error ? error.message : String(error)
      }`;
      this.conversation.push({ role: "assistant", content: errorMessage });
      this.context.conversation = this.conversation;
      return errorMessage;
    }
  }

  /**
   * Get current task status
   */
  getCurrentTaskStatus(): any {
    return {
      type: this.context.currentTask?.type || null,
      status: this.context.currentTask?.status || "idle",
    };
  }

  /**
   * Get the created entities
   */
  getCreatedEntities(): any {
    return {
      tools: [...(this.context.createdEntities?.tools || [])],
      agents: [...(this.context.createdEntities?.agents || [])],
    };
  }

  /**
   * Get the current conversation history
   */
  getConversation(): Array<{ role: string; content: string }> {
    return [...this.conversation];
  }
}

/**
 * Create a new CLI integration
 */
export default function createCLIIntegration(config: any): CLIIntegration {
  return new CLIIntegration(config);
}
