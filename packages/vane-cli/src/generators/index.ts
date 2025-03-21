//generators/index.ts
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

interface ProjectOptions {
  name: string;
  description: string;
}

/**
 * Ensures a directory exists, creating it if needed
 */
function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Creates a file with the given content
 */
function createFile(path: string, content: string): void {
  writeFileSync(path, content);
}

/**
 * Generates the package.json file
 */
function generatePackageJson(
  projectPath: string,
  options: ProjectOptions
): void {
  const packageJson = {
    name: options.name.toLowerCase().replace(/\s+/g, "-"),
    version: "0.1.0",
    description: options.description,
    main: "dist/index.js",
    type: "module",
    scripts: {
      build: "tsc",
      dev: "ts-node src/index.ts",
      start: "node dist/index.js",
      test: "vitest run",
      "test:watch": "vitest",
    },
    dependencies: {
      "@covalenthq/ai-agent-sdk": "^0.3.0",
      ai: "^2.2.30",
      dotenv: "^16.3.1",
      zod: "^3.22.4",
    },
    devDependencies: {
      "@types/node": "^20.10.0",
      typescript: "^5.3.3",
      "ts-node": "^10.9.2",
      vitest: "^1.2.1",
    },
    engines: {
      node: ">=18.0.0",
    },
    license: "MIT",
  };

  createFile(
    join(projectPath, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );
}

/**
 * Generates the tsconfig.json file
 */
function generateTsConfig(projectPath: string): void {
  const tsConfig = {
    compilerOptions: {
      target: "ES2020",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      esModuleInterop: true,
      strict: true,
      skipLibCheck: true,
      outDir: "dist",
      declaration: true,
      sourceMap: true,
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist"],
  };

  createFile(
    join(projectPath, "tsconfig.json"),
    JSON.stringify(tsConfig, null, 2)
  );
}

/**
 * Generates the .env file
 */
function generateEnvFile(projectPath: string, options: ProjectOptions): void {
  let envContent = `# Environment Variables
NODE_ENV=development
`;
  createFile(join(projectPath, ".env.example"), envContent);
}

/**
 * Generates the .gitignore file
 */
function generateGitignore(projectPath: string): void {
  const gitignore = `# Dependencies
node_modules
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build output
dist
build

# Environment variables
.env
.env.local
.env.*.local

# Editor directories and files
.idea
.vscode
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw*

# OS files
.DS_Store
Thumbs.db
`;

  createFile(join(projectPath, ".gitignore"), gitignore);
}

/**
 * Generates the main index.ts file
 */
function generateIndexFile(projectPath: string, options: ProjectOptions): void {
  const indexContent = `// src/index.ts
import dotenv from 'dotenv';
import { AgentKit } from './core/agent-kit.js';

// Load environment variables
dotenv.config();

async function main() {
  console.log('🚀 Starting ${options.name}...');

  // Initialize AgentKit
  const agentKit = new AgentKit();
  
  // TODO: Define your tools, and agents here
  // Example tool
  agentKit.tool('Calculator', {
    description: 'Performs mathematical calculations',
    parameters: {
      expression: { type: 'string', description: 'The mathematical expression to evaluate' }
    },
    execute: async ({ expression }) => {
      try {
        // Simple evaluation (for demonstration purposes only)
        // In a real application, use a safer evaluation method
        const result = eval(expression);
        return \`Result: \${result}\`;
      } catch (error) {
        return \`Error: \${error}\`;
      }
    }
  });
  
  // Example agent
  agentKit.agent('MathAssistant', {
    description: 'Helps solve mathematical problems',
    model: 'gpt-4o',
    instructions: [
      'Analyze mathematical problems',
      'Use the Calculator tool to compute results'
    ],
    tools: ['Calculator']
  });
  
  
  // Compile the configuration
  const compiled = agentKit.compile();
  
  console.log('AgentKit configuration compiled successfully');
  console.log(\`Available agents: \${Object.keys(compiled.agents).join(', ')}\`);
  
  // Example usage
  // const result = (await compiled.agents["MathAssistant"]).generate([{type: 'user', content: 'Calculate the area of a circle with radius 5cm'}]);
  // console.log('Result:', result);
}

// Run the main function
main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
`;

  ensureDir(join(projectPath, "src"));
  createFile(join(projectPath, "src", "index.ts"), indexContent);
}

/**
 * Generates the core AgentKit implementation
 */
function generateAgentKitCore(projectPath: string): void {
  const coreDir = join(projectPath, "src", "core");
  ensureDir(coreDir);

  // Full implementation of agent-kit.ts, simplified version
  const agentKitContent = `// src/core/agent-kit.ts
import { z, ZodObject, ZodTypeAny } from "zod";
import {
  Agent,
  Tool as SDKTool,
  type ModelProvider,
} from "@covalenthq/ai-agent-sdk";

type ModelType = "gpt-4o" | "gpt-4-turbo" | "claude-3-opus" | "claude-3-sonnet";

type ParamType = "string" | "number" | "boolean" | "array" | "object";

interface ParameterDefinition {
  type: ParamType;
  description?: string;
  items?: {
    type: string;
  };
}

interface ToolConfig {
  description: string;
  parameters: Record<string, ParameterDefinition>;
  execute: (params: Record<string, any>) => Promise<unknown>;
  provider?: string;
}

interface AgentConfig {
  description: string;
  model: ModelType;
  instructions?: string[];
  tools?: string[];
  temperature?: number;
}

interface ToolDefinition extends ToolConfig {
  name: string;
  zodSchema: ZodObject<any>;
  dependencies?: string[]; // Optional tool dependencies
}

interface AgentDefinition extends AgentConfig {
  name: string;
}

// Memory structure for tracking agent and tool usage
interface MemoryState {
  toolUsage: Record<
    string,
    {
      agents: string[];
      usageCount: number;
      lastUsed: Date;
    }
  >;
  agentUsage: Record<
    string,
    {
      usageCount: number;
      lastUsed: Date;
    }
  >;
  errors: string[];
  warnings: string[];
  conversation?: any[];
}

// Default usage structure for when an item isn't found in memory
interface DefaultToolUsage {
  agents: string[];
  usageCount: number;
  lastUsed: null;
}

interface DefaultAgentUsage {
  usageCount: number;
  lastUsed: null;
}

interface CompiledResult {
  tools: Record<string, SDKTool<any>>;
  agents: Record<string, Agent>;
  memory: MemoryState;
}

export class AgentKit {
  private tools: Record<string, ToolDefinition> = {};
  private agents: Record<string, AgentDefinition> = {};
  private errors: string[] = [];
  private warnings: string[] = [];
  private memory: MemoryState = {
    toolUsage: {},
    agentUsage: {},
    errors: [],
    warnings: [],
  };
  private modelMap: Record<ModelType, ModelProvider> = {
    "gpt-4o": { provider: "openai", id: "gpt-4o" },
    "gpt-4-turbo": { provider: "openai", id: "gpt-4-turbo" },
    "claude-3-opus": { provider: "anthropic", id: "claude-3-opus-20240229" },
    "claude-3-sonnet": {
      provider: "anthropic",
      id: "claude-3-sonnet-20240229",
    },
  };

  constructor() {
    // Initialize empty memory state
    this.resetMemory();
  }

  // Memory management
  private resetMemory(): void {
    this.memory = {
      toolUsage: {},
      agentUsage: {},
      errors: [],
      warnings: [],
    };
  }

  private trackToolUsage(toolName: string, agentName?: string): void {
    if (!this.memory.toolUsage[toolName]) {
      this.memory.toolUsage[toolName] = {
        agents: [],
        usageCount: 0,
        lastUsed: new Date(),
      };
    }

    this.memory.toolUsage[toolName].usageCount++;
    this.memory.toolUsage[toolName].lastUsed = new Date();

    if (
      agentName &&
      !this.memory.toolUsage[toolName].agents.includes(agentName)
    ) {
      this.memory.toolUsage[toolName].agents.push(agentName);
    }
  }

  private trackAgentUsage(agentName: string): void {
    if (!this.memory.agentUsage[agentName]) {
      this.memory.agentUsage[agentName] = {
        usageCount: 0,
        lastUsed: new Date(),
      };
    }

    this.memory.agentUsage[agentName].usageCount++;
    this.memory.agentUsage[agentName].lastUsed = new Date();
  }

  // Tool definition and validation
  public tool(name: string, config: ToolConfig): AgentKit {
    try {
      // Check if tool already exists
      if (this.tools[name]) {
        throw new Error(\`Tool '\${name}' already exists\`);
      }

      // Validate parameters against Zod schema
      const paramSchema: Record<string, ZodTypeAny> = {};
      for (const [key, param] of Object.entries(config.parameters)) {
        switch (param.type) {
          case "string":
            paramSchema[key] = z.string().describe(param.description || "");
            break;
          case "number":
            paramSchema[key] = z.number().describe(param.description || "");
            break;
          case "boolean":
            paramSchema[key] = z.boolean().describe(param.description || "");
            break;
          case "array":
            paramSchema[key] = z
              .array(z.any())
              .describe(param.description || "");
            break;
          case "object":
            paramSchema[key] = z
              .record(z.any())
              .describe(param.description || "");
            break;
          default:
            throw new Error(\`Unsupported parameter type: \${param.type}\`);
        }
      }

      // Validate execute function
      if (typeof config.execute !== "function") {
        throw new Error("Tool execute must be a function");
      }

      // Create mock parameters for validation
      const mockParams: Record<string, any> = {};
      for (const [key, param] of Object.entries(config.parameters)) {
        switch (param.type) {
          case "string":
            mockParams[key] = "test";
            break;
          case "number":
            mockParams[key] = 0;
            break;
          case "boolean":
            mockParams[key] = false;
            break;
          case "array":
            mockParams[key] = [];
            break;
          case "object":
            mockParams[key] = {};
            break;
        }
      }

      // Store the tool definition
      this.tools[name] = {
        ...config,
        name,
        zodSchema: z.object(paramSchema).passthrough(),
      };

      // Track the tool creation in memory
      this.trackToolUsage(name);

      return this;
    } catch (error) {
      const errorMessage = \`Error in tool '\${name}': \${
        (error as Error).message
      }\`;
      this.errors.push(errorMessage);
      this.memory.errors.push(errorMessage);
      return this;
    }
  }

  // Agent definition and validation
  public agent(name: string, config: AgentConfig): AgentKit {
    try {
      // Check if agent already exists
      if (this.agents[name]) {
        throw new Error(\`Agent '\${name}' already exists\`);
      }

      // Validate model
      if (!config.model || !this.modelMap[config.model]) {
        throw new Error(\`Invalid model: \${config.model}\`);
      }

      // Validate tools if present and track usage
      if (config.tools && config.tools.length > 0) {
        for (const toolName of config.tools) {
          if (!this.tools[toolName]) {
            throw new Error(
              \`Tool '\${toolName}' not defined. Define it before adding to agent.\`
            );
          }
          // Track tool usage by this agent
          this.trackToolUsage(toolName, name);
        }
      }

      // Store the agent definition
      this.agents[name] = {
        ...config,
        name,
      };

      // Track the agent creation in memory
      this.trackAgentUsage(name);

      return this;
    } catch (error) {
      const errorMessage = \`Error in agent '\${name}': \${
        (error as Error).message
      }\`;
      this.errors.push(errorMessage);
      this.memory.errors.push(errorMessage);
      return this;
    }
  }

  // Validation functions
  public validateToolDependencies(): boolean {
    let isValid = true;

    // Check for circular dependencies between tools
    const visited: Record<string, boolean> = {};
    const recursionStack: Record<string, boolean> = {};

    const checkCircular = (toolName: string, path: string[] = []): boolean => {
      if (!visited[toolName]) {
        visited[toolName] = true;
        recursionStack[toolName] = true;

        const tool = this.tools[toolName];
        if (tool.dependencies) {
          for (const dep of tool.dependencies) {
            if (!visited[dep] && checkCircular(dep, [...path, toolName])) {
              return true;
            } else if (recursionStack[dep]) {
              const cycle = [...path, toolName, dep].join(" -> ");
              const warningMsg = \`Circular dependency detected: \${cycle}\`;
              this.warnings.push(warningMsg);
              this.memory.warnings.push(warningMsg);
              isValid = false;
              return true;
            }
          }
        }

        recursionStack[toolName] = false;
      }
      return false;
    };

    Object.keys(this.tools).forEach((toolName) => {
      if (!visited[toolName]) {
        checkCircular(toolName);
      }
    });

    return isValid;
  }

  public validateHierarchy(): boolean {
    let isValid = true;

    // Check that all tools used by agents exist
    Object.entries(this.agents).forEach(([agentName, agent]) => {
      if (agent.tools) {
        for (const toolName of agent.tools) {
          if (!this.tools[toolName]) {
            const errorMsg = \`Agent '\${agentName}' references non-existent tool '\${toolName}'\`;
            this.errors.push(errorMsg);
            this.memory.errors.push(errorMsg);
            isValid = false;
          }
        }
      }
    });

    return isValid;
  }

  // Utility functions
  public getMemory(): MemoryState {
    return { ...this.memory };
  }

  public getErrors(): string[] {
    return [...this.errors];
  }

  public getWarnings(): string[] {
    return [...this.warnings];
  }

  public getToolsInfo(): Record<
    string,
    {
      definition: ToolDefinition;
      usage: MemoryState["toolUsage"][string] | DefaultToolUsage;
    }
  > {
    const result: Record<
      string,
      {
        definition: ToolDefinition;
        usage: MemoryState["toolUsage"][string] | DefaultToolUsage;
      }
    > = {};

    Object.keys(this.tools).forEach((toolName) => {
      result[toolName] = {
        definition: this.tools[toolName],
        usage: this.memory.toolUsage[toolName] || {
          agents: [],
          usageCount: 0,
          lastUsed: null,
        },
      };
    });

    return result;
  }

  public getAgentsInfo(): Record<
    string,
    {
      definition: AgentDefinition;
      usage: MemoryState["agentUsage"][string] | DefaultAgentUsage;
    }
  > {
    const result: Record<
      string,
      {
        definition: AgentDefinition;
        usage: MemoryState["agentUsage"][string] | DefaultAgentUsage;
      }
    > = {};

    Object.keys(this.agents).forEach((agentName) => {
      result[agentName] = {
        definition: this.agents[agentName],
        usage: this.memory.agentUsage[agentName] || {
          usageCount: 0,
          lastUsed: null,
        },
      };
    });

    return result;
  }

  // Save a message to the conversation history
  public addToConversation(message: { role: string; content: string }): void {
    if (!this.memory.conversation) {
      this.memory.conversation = [];
    }
    this.memory.conversation.push(message);
  }

  // Compilation
  public compile(): CompiledResult {
    // Validate hierarchy and dependencies
    this.validateHierarchy();
    this.validateToolDependencies();

    // Check for any validation errors
    if (this.errors.length > 0) {
      console.error("Compilation failed with errors:");
      this.errors.forEach((err) => console.error(\`- \${err}\`));
      throw new Error("Compilation failed due to validation errors");
    }

    // Show warnings but continue
    if (this.warnings.length > 0) {
      console.warn("Compilation proceeded with warnings:");
      this.warnings.forEach((warn) => console.warn(\`- \${warn}\`));
    }

    // Store a reference to this for use in closures
    const self = this;

    try {
      // Compile tools
      const compiledTools: Record<string, SDKTool<any>> = {};
      Object.entries(this.tools).forEach(([name, config]) => {
        const zodSchema: Record<string, ZodTypeAny> = {};

        // Convert parameter definitions to zod
        for (const [key, param] of Object.entries(config.parameters)) {
          let schema: ZodTypeAny;
          switch (param.type) {
            case "string":
              schema = z.string();
              break;
            case "number":
              schema = z.number();
              break;
            case "boolean":
              schema = z.boolean();
              break;
            case "array":
              let itemSchema: ZodTypeAny = z.any();
              if (param.items && param.items.type === "string") {
                itemSchema = z.string();
              }
              schema = z.array(itemSchema);
              break;
            case "object":
              schema = z.record(z.any());
              break;
            default:
              throw new Error(\`Unsupported parameter type: \${param.type}\`);
          }

          if (param.description) {
            schema = schema.describe(param.description);
          }
          zodSchema[key] = schema.optional();
        }

        compiledTools[name] = new SDKTool({
          name: name,
          description: config.description,
          parameters: z.object(zodSchema),
          execute: config.execute,
          provider: (config.provider || "openai") as "openai" | "anthropic",
        });
      });

      // Compile agents
      const compiledAgents: Record<string, Agent> = {};
      Object.entries(this.agents).forEach(([name, config]) => {
        // Collect tools for this agent
        const agentTools: Record<string, SDKTool<any>> = {};
        if (config.tools) {
          for (const toolName of config.tools) {
            agentTools[toolName] = compiledTools[toolName];
          }
        }

        compiledAgents[name] = new Agent({
          name: name,
          description: config.description,
          instructions: config.instructions || [],
          model: this.modelMap[config.model],
          tools: Object.keys(agentTools).length > 0 ? agentTools : undefined,
          temperature: config.temperature || 0.5,
        });
      });

      // Build and return the result object
      const result: CompiledResult = {
        tools: compiledTools,
        agents: compiledAgents,
        memory: { ...this.memory },
      };

      return result;
    } catch (error) {
      console.error("Compilation error:", error);
      this.memory.errors.push(\`Failed to compile: \${(error as Error).message}\`);
      throw new Error(\`Failed to compile: \${(error as Error).message}\`);
    }
  }
}

// Singleton instance as the default export
export default new AgentKit();
`;
  createFile(join(coreDir, "agent-kit.ts"), agentKitContent);

  // Create an index file for the core directory
  const coreIndexContent = `// src/core/index.ts
export * from './agent-kit.js';
`;

  createFile(join(coreDir, "index.ts"), coreIndexContent);
}

/**
 * Main function to generate all project files
 */
export async function generateFiles(
  projectPath: string,
  options: ProjectOptions
): Promise<void> {
  // Create the project directory structure
  ensureDir(projectPath);
  ensureDir(join(projectPath, "src"));
  ensureDir(join(projectPath, "src", "agents"));
  ensureDir(join(projectPath, "src", "tools"));

  // Generate configuration files
  generatePackageJson(projectPath, options);
  generateTsConfig(projectPath);
  generateEnvFile(projectPath, options);
  generateGitignore(projectPath);

  // Generate main source files
  generateIndexFile(projectPath, options);
  generateAgentKitCore(projectPath);

  // Create placeholder files
  createFile(
    join(projectPath, "src", "agents", "index.ts"),
    "// Export your agent definitions here\n"
  );
  createFile(
    join(projectPath, "src", "tools", "index.ts"),
    "// Export your tool implementations here\n"
  );

  console.log(`Project files generated at: ${projectPath}`);
}
