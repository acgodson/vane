//cli/system/tools
import path from "path";
import fs from "fs/promises";
import AgentKit from "../../core/agent-kit";
import { buildProject } from "../build";

/**
 * Register the core tools needed by the CLI agent
 */
function registerCLITools() {
  // Tool creation tool
  AgentKit.tool("generateToolFile", {
    description:
      "Generates a new tool file using the AgentKit template with direct implementation",
    parameters: {
      name: {
        type: "string",
        description: "Name of the tool",
      },
      description: {
        type: "string",
        description: "Description of the tool",
      },
      parameters: {
        type: "object",
        description:
          "Parameters object for tools, with key-value pairs of parameter definitions",
      },
      implementation: {
        type: "string",
        description: "Direct implementation code for the tool",
      },
    },
    execute: async ({ name, description, parameters, implementation }) => {
      try {
        // Debug logging
        console.log("========== GENERATE TOOL FILE DEBUG ==========");
        console.log("Tool Name:", name);
        console.log("Description:", description);
        console.log("Parameters:", JSON.stringify(parameters, null, 2));
        console.log("==============================================");

        // Handle case where parameters is undefined or null - provide empty object
        const toolParams = parameters || {};

        // Format parameters for template
        let paramsStr = "";

        if (Object.keys(toolParams).length > 0) {
          paramsStr = Object.entries(toolParams)
            .map(([key, param]) => {
              const paramObj =
                typeof param === "object" ? param : { type: "string" };
              const type = (paramObj as any).type || "string";
              const desc = (paramObj as any).description || "";
              return `    ${key}: {
        type: "${type}",
        description: "${desc.replace(/"/g, '\\"')}"
      }`;
            })
            .join(",\n");
        }

        // Create parameter names for destructuring
        const paramNames =
          Object.keys(toolParams).length > 0
            ? `{ ${Object.keys(toolParams).join(", ")} }`
            : "parameters";

        // Format implementation with proper indentation
        const formattedImplementation = implementation
          ? implementation
              .split("\n")
              .map((line: any) => `      ${line}`)
              .join("\n")
          : "      // TODO: Implement tool functionality";

        // Generate the final file content
        const content = `import AgentKit from "../core/agent-kit.js";
    
  /**
   * ${description}
   */
  AgentKit.tool("${name}", {
    description: "${description}",
    parameters: {
  ${paramsStr || "    // No parameters"}
    },
    execute: async (${paramNames}) => {
      try {
  ${formattedImplementation}
      } catch (error) {
        return {
          status: "error",
          message: \`Error in ${name}: \${error instanceof Error ? error.message : String(error)}\`
        };
      }
    }
  });
  `;

        // Create the file
        const filename = `src/tools/${name}.ts`;
        const dir = path.dirname(filename);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filename, content);

        console.log(`Generated tool file: ${filename}`);

        return {
          status: "success",
          message: `Tool file ${filename} generated successfully`,
          metadata: {
            name,
            description,
            path: filename,
          },
        };
      } catch (error) {
        console.error(`Error generating tool file:`, error);
        return {
          status: "error",
          message: `Failed to generate tool file: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    },
  });

  // Agent creation tool
  AgentKit.tool("generateAgentFile", {
    description: "Generates a new agent file using the AgentKit template",
    parameters: {
      name: {
        type: "string",
        description: "Name of the agent",
      },
      description: {
        type: "string",
        description: "Description of the agent",
      },
      model: {
        type: "string",
        description: "Model to use for the agent (e.g., gpt-4o)",
      },
      instructions: {
        type: "array",
        description: "Array of instruction strings for the agent",
        items: {
          type: "string",
        },
      },
      tools: {
        type: "array",
        description: "Array of tool names for the agent",
        items: {
          type: "string",
        },
      },
      temperature: {
        type: "number",
        description: "Temperature setting for the agent",
      },
    },
    execute: async ({
      name,
      description,
      model = "gpt-4o",
      instructions = [],
      tools = [],
      temperature = 0.3,
    }) => {
      try {
        // Debug logging
        console.log("========== GENERATE AGENT FILE DEBUG ==========");
        console.log("Agent Name:", name);
        console.log("Description:", description);
        console.log("Model:", model);
        console.log("Instructions:", JSON.stringify(instructions, null, 2));
        console.log("Tools:", JSON.stringify(tools, null, 2));
        console.log("Temperature:", temperature);
        console.log("==============================================");

        // Format instructions for template
        const formattedInstructions =
          instructions.length > 0
            ? instructions
                .map((instr: any) => `    "${instr.replace(/"/g, '\\"')}"`)
                .join(",\n")
            : '    "Assist users with their requests in a helpful manner."';

        // Format tools for template
        const formattedTools =
          tools.length > 0
            ? tools.map((tool: any) => `    "${tool}"`).join(",\n")
            : "";

        // Generate the file content directly for consistency
        const content = `import AgentKit from "../core/agent-kit.js";

/**
 * ${description}
 */
AgentKit.agent("${name}", {
  description: "${description}",
  model: "${model}",
  instructions: [
${formattedInstructions}
  ],
  tools: [
${formattedTools}
  ],
  temperature: ${temperature},
});
`;

        // Create the file
        const filename = `src/agents/${name}.ts`;
        const dir = path.dirname(filename);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filename, content);

        console.log(`Generated agent file: ${filename}`);

        return {
          status: "success",
          message: `Agent file ${filename} generated successfully`,
          metadata: {
            name,
            description,
            path: filename,
          },
        };
      } catch (error) {
        console.error(`Error generating agent file:`, error);
        return {
          status: "error",
          message: `Failed to generate agent file: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    },
  });

  // Build project tool
  AgentKit.tool("buildTool", {
    description: "Builds and compiles the AgentKit project for deployment",
    parameters: {
      outputDir: {
        type: "string",
        description:
          "Output directory for the compiled files (default: 'dist')",
      },
      format: {
        type: "string",
        description: "Output format ('esm', 'cjs', or 'browser')",
      },
      mainAgent: {
        type: "string",
        description:
          "Name of the main agent to be exported as the default entry point",
      },
      installDependencies: {
        type: "boolean",
        description: "Whether to install dependencies before building",
      },
    },
    execute: async ({
      outputDir = "dist",
      format = "esm",
      mainAgent,
      installDependencies = false,
    }) => {
      try {
        // Get current working directory
        const projectPath = process.cwd();

        // Call the build function
        const result = await buildProject(projectPath, {
          outputDir,
          format,
          mainAgent,
          skipDependencyPrompt: !installDependencies,
          // We'll get the project name from the directory if needed
        });

        if (result.status === "error") {
          return {
            status: "error",
            message: `Build failed: ${result.message}`,
          };
        }

        return {
          status: "success",
          data: result,
          message: `Successfully built project. Output is available in: ${result.outputDir}`,
        };
      } catch (error) {
        return {
          status: "error",
          message: `Error in buildTool: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    },
  });

  // Register readFile tool
  AgentKit.tool("readFile", {
    description: "Reads the content of a file",
    parameters: {
      filename: {
        type: "string",
        description: "Path to the file to read",
      },
    },
    execute: async ({ filename }) => {
      try {
        // Check if file exists
        try {
          await fs.access(filename);
        } catch {
          return {
            status: "error",
            message: `File ${filename} does not exist`,
          };
        }

        // Read the file
        const content = await fs.readFile(filename, "utf-8");

        console.log(`Read file: ${filename}`);

        return {
          status: "success",
          message: `File ${filename} read successfully`,
          data: {
            content,
            path: filename,
          },
        };
      } catch (error) {
        console.error(`Error reading file ${filename}:`, error);
        return {
          status: "error",
          message: `Failed to read file: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    },
  });

  // Register updateFile tool
  AgentKit.tool("updateFile", {
    description: "Updates the content of a file",
    parameters: {
      filename: {
        type: "string",
        description: "Path to the file to update",
      },
      content: {
        type: "string",
        description: "New content for the file",
      },
    },
    execute: async ({ filename, content }) => {
      try {
        // Check if file exists
        try {
          await fs.access(filename);
        } catch {
          return {
            status: "error",
            message: `File ${filename} does not exist`,
          };
        }

        // Write the file
        await fs.writeFile(filename, content);

        console.log(`Updated file: ${filename}`);

        return {
          status: "success",
          message: `File ${filename} updated successfully`,
          metadata: {
            filename,
            path: filename,
          },
        };
      } catch (error) {
        console.error(`Error updating file ${filename}:`, error);
        return {
          status: "error",
          message: `Failed to update file: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    },
  });

  // Register listDirectory tool
  AgentKit.tool("listDirectory", {
    description: "Lists the contents of a directory",
    parameters: {
      directory: {
        type: "string",
        description: "Path to the directory to list",
      },
    },
    execute: async ({ directory }) => {
      try {
        // Check if directory exists
        try {
          await fs.access(directory);
        } catch {
          return {
            status: "error",
            message: `Directory ${directory} does not exist`,
          };
        }

        // List the directory
        const entries = await fs.readdir(directory, { withFileTypes: true });

        const files = entries
          .filter((entry) => entry.isFile())
          .map((entry) => entry.name);

        const directories = entries
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);

        console.log(`Listed directory: ${directory}`);

        return {
          status: "success",
          message: `Directory ${directory} listed successfully`,
          data: {
            path: directory,
            files,
            directories,
          },
        };
      } catch (error) {
        console.error(`Error listing directory ${directory}:`, error);
        return {
          status: "error",
          message: `Failed to list directory: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    },
  });
}

export { registerCLITools };
