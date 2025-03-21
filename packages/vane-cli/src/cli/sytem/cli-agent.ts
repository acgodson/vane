// src/cli/system/cli-agent.ts

import AgentKit from "../../core/agent-kit";
import fs from "fs/promises";
import path from "path";
import {
  CONVERSATIONAL_ASSISTANT_PROMPT,
  TOOL_IMPLEMENTATION_GUIDELINES,
} from "./prompts";
import { registerCLITools } from "./tools";

interface ConversationContext {
  conversation: Array<{ role: string; content: string }>;
  currentTask: {
    type: string | null; // 'tool_creation', 'agent_creation', etc.
    status: "collecting_info" | "generating" | "complete" | "idle";
    collectedInfo: Record<string, any>;
    currentQuestion: string | null;
    expectedAnswer: string | null;
  };
  createdEntities: {
    tools: Array<{ name: string; path: string }>;
    agents: Array<{ name: string; path: string }>;
  };
}

/**
 * Creates a CLI agent that interacts with users conversationally
 */
export function createCLIAgent(): any {
  try {
    // Register the required tools first
    registerCLITools();

    // Register agent with core instructions
    AgentKit.agent("cliAgent", {
      description:
        "CLI assistant for Vanekit that helps users build and manage AI agents conversationally",
      model: "gpt-4o",
      instructions: [
        // Core purpose definition
        "You are a CLI assistant for Vane`s Agentkit that helps users build and deploy AI agents through natural conversation.",
        "Your primary role is to guide users through creating tools and agents in a friendly, step-by-step manner.",

        // Conversation guidelines
        "Always be conversational and personable. Ask one clear question at a time to guide the user.",
        "After each user response, thank them, acknowledge their input, and provide the next step.",
        "Maintain context throughout the conversation to build tools and agents incrementally.",

        // Tool creation guidance
        "When creating a tool, collect information one question at a time: name, description, parameters, and implementation.",
        "For tool parameters, choose the most fitting type (string, number, boolean, etc.) and description for each parameter, unless user gives you otherwise.",
        "For tool implementation, help users write appropriate JavaScript/TypeScript code that fulfills their needs.",
        TOOL_IMPLEMENTATION_GUIDELINES,

        // Agent creation guidance
        "When creating an agent, collect information one question at a time: name, description, instructions, tools, and model.",
        "For agent instructions, collect multiple clear instructions that will guide the agent's behavior.",
        "For agent tools, list the names of tools that have been previously created or are built into the system.",

        // FILE GENERATION USING NEW TEMPLATE SYSTEM
        "When all information has been collected and you're ready to generate a file:",
        "- For tools: use the 'generateToolFile' tool with name, description, parameters (MUST be an object with parameter definitions), and implementation",
        "- For agents: use the 'generateAgentFile' tool with name, description, model, instructions (array), tools (array), and temperature",
        "Never skip the parameters object for tools - if there are no parameters, provide an empty object {}.",

        // Action orientation
        "End responses with questions or suggested next steps rather than just statements.",
        "Use the collectedInfo field to track information gathered during the conversation.",

        // Progress tracking
        "When a task status is 'generating', immediately use the generateFile tool with the collected information.",
        "After successfully generating a file, set the task status to 'complete' and suggest the next steps to the user.",
      ],
      tools: [
        "generateToolFile",
        "generateAgentFile",
        "buildTool",
        "readFile",
        "updateFile",
        "listDirectory",
      ],
      temperature: 0.3,
    });
    return {
      compiled: null,

      getCompiled() {
        if (!this.compiled) {
          this.compiled = AgentKit.compile();
        }
        return this.compiled;
      },
    };
  } catch (error) {
    console.error("Error creating CLI agent:", error);
    throw error;
  }
}

/**
 * Process a natural language command conversationally
 */
export async function processCLICommand(
  agentWrapper: any,
  command: string,
  context: ConversationContext
): Promise<any> {
  try {
    // Initialize context if needed
    if (!context.currentTask) {
      context.currentTask = {
        type: null,
        status: "idle",
        collectedInfo: {},
        currentQuestion: null,
        expectedAnswer: null,
      };
    }
    if (!context.createdEntities) {
      context.createdEntities = { tools: [], agents: [] };
    }

    // Get the CLI agent
    const cliAgent = agentWrapper.getCompiled().agents.cliAgent;
    if (!cliAgent) {
      throw new Error("CLI agent not found in compiled result");
    }

    // Build the system message content
    const systemContent = `${CONVERSATIONAL_ASSISTANT_PROMPT}

    Current task status: ${JSON.stringify(context.currentTask)}
    Previously created:
    - Tools: ${JSON.stringify(context.createdEntities.tools.map((t) => t.name))}
    - Agents: ${JSON.stringify(
      context.createdEntities.agents.map((a) => a.name)
    )}
    
    IMPORTANT GUIDELINES:
    1. Ask only ONE QUESTION at a time
    2. Acknowledge the user's previous answer before asking the next question
    3. Track all collected information in the collectedInfo field
    4. Generate files ONLY when all information is collected
    6. For tool creation, you need: name, description, parameters, implementation
    7. For agent creation, you need: name, description, instructions, tools, model
    
    Remember to make the experience conversational and friendly!`;

    const messages: any = [];

    // Add system message
    messages.push({
      role: "system",
      content: systemContent,
    });

    // Add conversation history
    if (
      context &&
      context.conversation &&
      Array.isArray(context.conversation)
    ) {
      // Add up to 10 recent messages for better context
      const recentMessages = context.conversation.slice(-10);
      for (const msg of recentMessages) {
        if (
          msg &&
          typeof msg === "object" &&
          "role" in msg &&
          "content" in msg
        ) {
          messages.push({
            role: msg.role,
            content: msg.content,
          });
        }
      }
    }

    // Add the current user message
    messages.push({
      role: "user",
      content: command,
    });

    // Generate response with simpler schema
    const response = await cliAgent.generate({
      messages: messages,
      temperature: 0.2,
    });

    console.log(
      "Received response:",
      JSON.stringify(response).slice(0, 100) + "..."
    );

    // Extract response content and any potential schema information
    let responseContent = "";
    let currentTask = {
      type: context.currentTask.type || "none",
      status: context.currentTask.status || "idle",
      collectedInfo: context.currentTask.collectedInfo || {},
      nextQuestion: null,
    };
    let filesToGenerate: any = [];

    // Handle different response formats
    if (typeof response === "string") {
      // Simple string response
      responseContent = response;
    } else if (response && typeof response === "object") {
      // Check for content field directly
      if ("content" in response) {
        responseContent = response.content;
      }
      // Check for value field containing content
      else if (
        response.value &&
        typeof response.value === "object" &&
        "content" in response.value
      ) {
        responseContent = response.value.content;

        // Try to extract task information too if available
        if ("currentTask" in response.value) {
          currentTask = response.value.currentTask;
        }

        // Try to extract files to generate if available
        if (
          "filesToGenerate" in response.value &&
          Array.isArray(response.value.filesToGenerate)
        ) {
          filesToGenerate = response.value.filesToGenerate;
        }
      }
      // Try text field if others aren't available
      else if ("text" in response) {
        responseContent = response.text;
      }
      // Last resort - stringify the whole thing
      else {
        responseContent = JSON.stringify(response);
      }
    } else {
      responseContent =
        "I received your message but couldn't generate a proper response.";
    }

    // Process any file generation requests
    const generatedFiles: any[] = [];

    for (const file of filesToGenerate) {
      try {
        if (!file.path || !file.content) continue;

        // Ensure directory exists
        const dir = path.dirname(file.path);
        await fs.mkdir(dir, { recursive: true });

        // Write the file
        await fs.writeFile(file.path, file.content);

        // Add to generated files list
        generatedFiles.push({
          path: file.path,
          operation: "created",
          status: "success",
        });

        // Track created entity based on file path
        if (file.path.includes("/tools/")) {
          const toolName = path.basename(file.path, path.extname(file.path));
          context.createdEntities.tools.push({
            name: toolName,
            path: file.path,
          });
        } else if (file.path.includes("/agents/")) {
          const agentName = path.basename(file.path, path.extname(file.path));
          context.createdEntities.agents.push({
            name: agentName,
            path: file.path,
          });
        }
      } catch (error) {
        console.error(`Error generating file ${file.path}:`, error);
        generatedFiles.push({
          path: file.path,
          operation: "failed",
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Update task status in context
    context.currentTask = {
      type: currentTask.type || context.currentTask.type,
      status: currentTask.status || context.currentTask.status,
      collectedInfo:
        currentTask.collectedInfo || context.currentTask.collectedInfo,
      currentQuestion: currentTask.nextQuestion || null,
      expectedAnswer: null,
    };

    // Return the response
    return {
      status: "success",
      response: responseContent, // Always return this explicitly
      metadata: {
        filesGenerated: generatedFiles.length > 0 ? generatedFiles : undefined,
        contextState: context,
      },
    };
  } catch (error) {
    console.error("Error processing command:", error);
    return {
      status: "error",
      message: `Error processing command: ${
        error instanceof Error ? error.message : String(error)
      }`,
      response: `I encountered an error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
