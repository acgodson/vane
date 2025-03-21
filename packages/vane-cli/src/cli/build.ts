// src/cli/build.ts
import fs from "fs/promises";
import path from "path";
import { existsSync, mkdirSync } from "fs";
import inquirer from "inquirer";
import ora from "ora";
import { execSync, spawn } from "child_process";
import {
  executeCommand,
  getPackageManager,
  installDependencies,
  logger,
  toCamelCase,
  withSpinner,
} from "./utils";

/**
 * Run npm scripts to build the project
 */
async function runProjectBuild(projectPath: string): Promise<boolean> {
  const packageManager = getPackageManager();

  if (!packageManager) {
    logger.warn("No package manager found. Please build the project manually.");
    return false;
  }

  return executeCommand(packageManager, ["run", "build"], {
    cwd: projectPath,
    message: "Building project...",
  });
}

// ======== File Processing Functions ========

/**
 * Ensures the core agent-kit file exists and is properly copied
 */
async function ensureCoreFiles(
  projectPath: string,
  outputDir: string
): Promise<boolean> {
  return withSpinner("Ensuring core files exist...", async () => {
    try {
      // Path to source and destination agent-kit files
      const projectCorePath = path.join(projectPath, "src", "core");
      const outputCorePath = path.join(outputDir, "core");
      const cliCorePath = path.join(__dirname, "..", "core"); // CLI's core directory

      // Create core directory in output if it doesn't exist
      if (!existsSync(outputCorePath)) {
        mkdirSync(outputCorePath, { recursive: true });
      }

      // Check if we need to copy the full agent-kit implementation
      const projectAgentKitPath = path.join(projectCorePath, "agent-kit.ts");
      const outputAgentKitPath = path.join(outputCorePath, "agent-kit.js");
      const cliAgentKitPath = path.join(cliCorePath, "agent-kit.js");

      // Log the paths we're checking (debug-level)
      logger.debug("Checking core paths:", {
        projectCorePath,
        outputCorePath,
        cliCorePath,
      });

      let sourceFile = cliAgentKitPath;
      let shouldCopy = true;

      // First check if the output file already exists and has content
      if (existsSync(outputAgentKitPath)) {
        const outputContent = await fs.readFile(outputAgentKitPath, "utf-8");
        if (outputContent.length > 1000) {
          // Assuming a complete implementation is at least 1KB
          logger.debug(
            "Full agent-kit.js implementation already exists in output"
          );
          shouldCopy = false;
        }
      }

      // If we need to copy, first check if the project has a complete implementation
      if (shouldCopy && existsSync(projectAgentKitPath)) {
        const projectContent = await fs.readFile(projectAgentKitPath, "utf-8");
        if (projectContent.length > 1000) {
          sourceFile = projectAgentKitPath;
          logger.debug("Using project's agent-kit implementation");
        } else {
          logger.debug(
            "Project has incomplete agent-kit.ts, using CLI's implementation"
          );
        }
      }

      if (shouldCopy) {
        if (existsSync(sourceFile)) {
          await fs.copyFile(sourceFile, outputAgentKitPath);
          logger.debug(
            `Copied agent-kit from ${sourceFile} to ${outputAgentKitPath}`
          );
        } else {
          logger.error(
            `Could not find agent-kit implementation at ${sourceFile}`
          );
          logger.debug(
            "Available files in CLI core directory:",
            await fs.readdir(cliCorePath)
          );
          return false;
        }
      }

      // Also copy any other necessary files like tool-registry
      const toolRegistryFiles = ["tool-registry.js", "tool-registry.d.ts"];
      for (const file of toolRegistryFiles) {
        const sourcePath = path.join(cliCorePath, file);
        const destPath = path.join(outputCorePath, file);

        if (existsSync(sourcePath)) {
          await fs.copyFile(sourcePath, destPath);
          logger.debug(`Copied ${file} to output`);
        }
      }

      return true;
    } catch (error: any) {
      logger.error(`Error ensuring core files: ${error.message}`);
      logger.debug("Detailed error:", error);
      return false;
    }
  });
}

/**
 * Fixes import paths in the generated files
 */
async function fixImportPaths(outputDir: string): Promise<boolean> {
  return withSpinner("Fixing import paths...", async () => {
    try {
      // Get all JS files in the output directory
      const findJsFiles = async (
        dir: string,
        fileList: string[] = []
      ): Promise<string[]> => {
        const files = await fs.readdir(dir, { withFileTypes: true });

        for (const file of files) {
          const filePath = path.join(dir, file.name);

          if (file.isDirectory()) {
            fileList = await findJsFiles(filePath, fileList);
          } else if (file.name.endsWith(".js")) {
            fileList.push(filePath);
          }
        }

        return fileList;
      };

      const jsFiles = await findJsFiles(outputDir);
      logger.debug(`Found ${jsFiles.length} JS files to fix`);

      for (const filePath of jsFiles) {
        let content = await fs.readFile(filePath, "utf-8");

        // Fix paths with missing extensions
        content = content.replace(
          /from\s+['"]([^'"]*\/[^'"]*?)['"];/g,
          (match, importPath) => {
            if (importPath.startsWith(".") && !importPath.endsWith(".js")) {
              return `from "${importPath}.js";`;
            }
            return match;
          }
        );

        await fs.writeFile(filePath, content);
      }

      logger.debug(`Fixed import paths in ${jsFiles.length} files`);
      return true;
    } catch (error: any) {
      logger.error(`Error fixing import paths: ${error.message}`);
      return false;
    }
  });
}

/**
 * Scan project directories for agents and tools
 */
async function scanProject(projectPath: string): Promise<{
  toolFiles: string[];
  agentFiles: string[];
}> {
  return withSpinner("Scanning project files...", async () => {
    const toolsDir = path.join(projectPath, "src/tools");
    const agentsDir = path.join(projectPath, "src/agents");

    let toolFiles: string[] = [];
    let agentFiles: string[] = [];

    if (existsSync(toolsDir)) {
      toolFiles = (await fs.readdir(toolsDir)).filter(
        (file) =>
          (file.endsWith(".ts") || file.endsWith(".js")) &&
          file !== "index.ts" &&
          file !== "index.js"
      );
    }

    if (existsSync(agentsDir)) {
      agentFiles = (await fs.readdir(agentsDir)).filter(
        (file) =>
          (file.endsWith(".ts") || file.endsWith(".js")) &&
          file !== "index.ts" &&
          file !== "index.js"
      );
    }

    logger.debug(
      `Found ${toolFiles.length} tools and ${agentFiles.length} agents`
    );
    return { toolFiles, agentFiles };
  });
}

/**
 * Generate the main index file
 */
async function generateIndexFile(
  projectPath: string,
  options: BuildOptions,
  toolFiles: string[],
  agentFiles: string[]
): Promise<void> {
  return withSpinner("Generating index file...", async () => {
    let indexContent = `// Auto-generated index file for ${options.projectName}\n`;
    indexContent += `// Generated on ${new Date().toISOString()}\n\n`;
    indexContent += `import AgentKit from "./core/agent-kit.js";\n\n`;

    // Import all tools and agents
    toolFiles.forEach((toolFile) => {
      const toolName = path.basename(toolFile, path.extname(toolFile));
      indexContent += `import "./tools/${toolName}.js";\n`;
    });

    indexContent += `\n`;

    agentFiles.forEach((agentFile) => {
      const agentName = path.basename(agentFile, path.extname(agentFile));
      indexContent += `import "./agents/${agentName}.js";\n`;
    });

    // Compile AgentKit configuration
    indexContent += `\n// Compile the AgentKit configuration\n`;
    indexContent += `const compiledKit = AgentKit.compile();\n\n`;

    // Get the main agent if specified, otherwise use the first agent
    let mainAgentName = options.mainAgent;
    if (!mainAgentName && agentFiles.length > 0) {
      mainAgentName = path.basename(agentFiles[0], path.extname(agentFiles[0]));
    }

    // Export all agents with proper naming
    indexContent += `// Export individual agents\n`;
    agentFiles.forEach((agentFile) => {
      const agentName = path.basename(agentFile, path.extname(agentFile));
      const exportName = toCamelCase(agentName);
      indexContent += `export const ${exportName} = compiledKit.agents["${agentName}"];\n`;
    });

    // Create an agents object with all available agents
    if (agentFiles.length > 0) {
      indexContent += `\n// Create an agents object with all the agents\n`;
      indexContent += `const output = {\n`;
      agentFiles.forEach((agentFile) => {
        const agentName = path.basename(agentFile, path.extname(agentFile));
        const exportName = toCamelCase(agentName);
        indexContent += `  ${exportName},\n`;
      });

      // Add utility methods
      indexContent += `  getAllAgents: () => compiledKit.agents,\n`;
      indexContent += `  getAllTools: () => compiledKit.tools,\n`;
      indexContent += `};\n\n`;

      // Export the agents object as default
      indexContent += `// Export the agents object as default\n`;
      indexContent += `export default output;\n`;
    } else {
      // If there are no agents, export the compiled kit
      indexContent += `\n// Export compiled kit as default\n`;
      indexContent += `export default compiledKit;\n`;
    }

    // Add usage examples in comments
    indexContent += `\n/*
Example usage:

// Using the default import (all agents)
import agents from "./index.js";
const response = await agents.${
      agentFiles.length > 0
        ? toCamelCase(path.basename(agentFiles[0], path.extname(agentFiles[0])))
        : "yourAgentName"
    }.generate({
  messages: [{ role: 'user', content: 'Your message here' }]
});

// Using named exports for specific agents
import { ${agentFiles
      .map((file) => toCamelCase(path.basename(file, path.extname(file))))
      .join(", ")} } from "./index.js";
const specificResponse = await ${
      agentFiles.length > 0
        ? toCamelCase(path.basename(agentFiles[0], path.extname(agentFiles[0])))
        : "yourAgentName"
    }.generate({
  messages: [{ role: 'user', content: 'A message for this specific agent' }]
});
*/\n`;

    // Write the index file
    await fs.writeFile(path.join(projectPath, "src/index.ts"), indexContent);
  });
}

/**
 * Create distribution package.json
 */
async function createDistPackageJson(
  outputDir: string,
  options: BuildOptions
): Promise<void> {
  return withSpinner("Creating package.json for distribution...", async () => {
    const packageJson = {
      name: options.projectName.toLowerCase().replace(/\s+/g, "-"),
      version: "1.0.0",
      description: `AgentKit project: ${options.projectName}`,
      type: options.format === "esm" ? "module" : "commonjs",
      main: options.format === "esm" ? "index.js" : "index.cjs",
      scripts: {
        test: 'echo "No tests specified"',
      },
      dependencies: {
        "@covalenthq/ai-agent-sdk": "latest",
        zod: "^3.22.4",
      },
    };

    await fs.writeFile(
      path.join(outputDir, "package.json"),
      JSON.stringify(packageJson, null, 2)
    );
  });
}

/**
 * Create a browser bundle with HTML example
 */
async function createBrowserBundle(
  outputDir: string,
  options: BuildOptions
): Promise<void> {
  return withSpinner("Creating browser bundle...", async () => {
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${options.projectName}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    textarea { width: 100%; padding: 10px; font-family: inherit; }
    button { padding: 8px 16px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; }
    #response { white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>${options.projectName}</h1>
  <div>
    <textarea id="userInput" rows="4" placeholder="Enter your message here..."></textarea>
    <div style="margin-top: 10px;">
      <button id="sendBtn">Send</button>
    </div>
  </div>
  <div id="response" style="margin-top: 20px; border: 1px solid #ccc; padding: 10px; min-height: 200px;"></div>

  <script type="module">
    import agent from './index.js';
    
    const sendBtn = document.getElementById('sendBtn');
    const userInput = document.getElementById('userInput');
    const responseDiv = document.getElementById('response');
    
    sendBtn.addEventListener('click', async () => {
      const message = userInput.value;
      if (!message) return;
      
      responseDiv.innerHTML = 'Thinking...';
      
      try {
        const response = await agent.generate({
          messages: [{ role: 'user', content: message }]
        });
        
        responseDiv.innerHTML = response.content || response;
      } catch (error) {
        responseDiv.innerHTML = 'Error: ' + error.message;
      }
    });
  </script>
</body>
</html>`;

    await fs.writeFile(path.join(outputDir, "index.html"), htmlContent);
  });
}

/**
 * Create README file
 */
async function createReadme(
  outputDir: string,
  options: BuildOptions,
  toolFiles: string[],
  agentFiles: string[]
): Promise<void> {
  return withSpinner("Creating README...", async () => {
    const readmeContent = `# ${options.projectName}

This is an AgentKit project compiled for deployment.

## Usage

\`\`\`javascript
${
  options.format === "esm"
    ? `import agent from './${options.outputDir}/index.js';`
    : `const agent = require('./${options.outputDir}/index');`
}

const response = await agent.generate({
  messages: [{ role: 'user', content: 'Your message here' }]
});

console.log(response);
\`\`\`

## Available Agents

${agentFiles
  .map((file) => {
    const agentName = path.basename(file, path.extname(file));
    return `- ${agentName}\n`;
  })
  .join("")}

## Available Tools

${toolFiles
  .map((file) => {
    const toolName = path.basename(file, path.extname(file));
    return `- ${toolName}\n`;
  })
  .join("")}
`;

    await fs.writeFile(path.join(outputDir, "README.md"), readmeContent);
  });
}

/**
 * Generate usage examples for the console output
 */
function generateUsageExamples(
  options: BuildOptions,
  agentFiles: string[]
): string {
  let usageExamples = "";

  // If we have agents, show examples using the agents object
  if (agentFiles.length > 0) {
    const firstAgentName = path.basename(
      agentFiles[0],
      path.extname(agentFiles[0])
    );
    const firstAgentExportName = toCamelCase(firstAgentName);
    const agentExports = agentFiles
      .map((file) => toCamelCase(path.basename(file, path.extname(file))))
      .join(", ");

    usageExamples += `
// Using the agents object (default export):
${
  options.format === "esm"
    ? `import agents from './${options.outputDir}/index.js';`
    : `const agents = require('./${options.outputDir}/index');`
}

const response = await agents.${firstAgentExportName}.generate({
  messages: [{ role: 'user', content: 'Your message here' }]
});
console.log(response.content);

`;

    // Always show named exports example
    usageExamples += `
// Using named exports for specific agents:
${
  options.format === "esm"
    ? `import { ${agentExports} } from './${options.outputDir}/index.js';`
    : `const { ${agentExports} } = require('./${options.outputDir}/index');`
}

const specificResponse = await ${firstAgentExportName}.generate({
  messages: [{ role: 'user', content: 'A message for a specific agent' }]
});
`;
  } else {
    // No agents - show basic import
    usageExamples += `
// Import the compiled kit:
${
  options.format === "esm"
    ? `import compiledKit from './${options.outputDir}/index.js';`
    : `const compiledKit = require('./${options.outputDir}/index');`
}

// No agents were found, so you'll need to create them after importing.
`;
  }

  return usageExamples;
}

/**
 * Collect build options from command line or prompt
 */
async function collectBuildOptions(
  projectPath: string,
  options: Partial<BuildOptions>
): Promise<BuildOptions> {
  // Get user input for build options if not provided
  if (!options.outputDir || !options.format || !options.projectName) {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "projectName",
        message: "Project name:",
        default: path.basename(projectPath),
        when: !options.projectName,
      },
      {
        type: "input",
        name: "outputDir",
        message: "Output directory:",
        default: "dist",
        when: !options.outputDir,
      },
      {
        type: "list",
        name: "format",
        message: "Output format:",
        choices: [
          { name: "ESM (modern JavaScript modules)", value: "esm" },
          { name: "CommonJS (Node.js require)", value: "cjs" },
          { name: "Browser (web bundle)", value: "browser" },
        ],
        default: "esm",
        when: !options.format,
      },
      {
        type: "input",
        name: "mainAgent",
        message: "Main agent to export (leave empty to export all):",
        when: !options.mainAgent,
      },
    ]);

    // Merge provided options with answers
    options = { ...options, ...answers } as BuildOptions;
  }

  // Validate output format
  if (!["esm", "cjs", "browser"].includes(options.format!)) {
    throw new Error(`Invalid output format: ${options.format}`);
  }

  return options as BuildOptions;
}

// ======== Types ========

/**
 * Build options type
 */
interface BuildOptions {
  projectName: string;
  outputDir: string;
  format: "esm" | "cjs" | "browser";
  mainAgent?: string;
  skipDependencyPrompt?: boolean;
}

/**
 * Build result type
 */
interface BuildResult {
  status: "success" | "error";
  outputDir?: string;
  format?: string;
  projectName?: string;
  agents?: string[];
  tools?: string[];
  message?: string;
}

// ======== Main Build Function ========

/**
 * Build command for compiling and exporting an AgentKit project
 */
export async function buildProject(
  projectPath: string,
  inputOptions: Partial<BuildOptions> = {}
): Promise<BuildResult> {
  console.log(`
  ╔═════════════════════════════════════╗
  ║         AgentKit Build Tool         ║
  ║                                     ║
  ║  Compile and export your AI agents  ║
  ╚═════════════════════════════════════╝
  `);

  try {
    // Resolve project path
    projectPath = path.resolve(projectPath);
    logger.info("Project path:", projectPath);

    if (!existsSync(projectPath)) {
      throw new Error(`Project directory '${projectPath}' does not exist`);
    }

    // Check if package.json exists and install dependencies if needed
    const packageJsonPath = path.join(projectPath, "package.json");
    if (existsSync(packageJsonPath)) {
      logger.debug("Found package.json:", packageJsonPath);

      const { installDeps } = await inquirer.prompt([
        {
          type: "confirm",
          name: "installDeps",
          message:
            "Would you like to install/update dependencies before building?",
          default: false,
          when: !inputOptions.skipDependencyPrompt,
        },
      ]);

      if (installDeps) {
        const installed = await installDependencies(projectPath);
        if (!installed) {
          logger.warn(
            "Could not install dependencies. Continuing with build..."
          );
        }
      }
    } else {
      logger.warn("No package.json found in project directory");
    }

    // Collect build options
    const options = await collectBuildOptions(projectPath, inputOptions);

    // Create output directory
    const outputDir = path.resolve(projectPath, options.outputDir);
    if (!existsSync(outputDir)) {
      await fs.mkdir(outputDir, { recursive: true });
    }

    // 1. Scan for tools and agents
    const { toolFiles, agentFiles } = await scanProject(projectPath);

    // 2. Generate index file
    await generateIndexFile(projectPath, options, toolFiles, agentFiles);

    // 3. Create package.json for distribution
    await createDistPackageJson(outputDir, options);

    // 4. Run the project's build script first if available
    let projectBuildSuccess = true;
    const projectPackageJsonPath = path.join(projectPath, "package.json");

    if (existsSync(projectPackageJsonPath)) {
      try {
        const packageJsonContent = await fs.readFile(
          projectPackageJsonPath,
          "utf-8"
        );
        const packageData = JSON.parse(packageJsonContent);

        if (packageData.scripts && packageData.scripts.build) {
          projectBuildSuccess = await runProjectBuild(projectPath);

          if (!projectBuildSuccess) {
            logger.warn(
              "Project build script failed, attempting to continue with TypeScript compilation"
            );
          }
        }
      } catch (error) {
        logger.warn(
          "Could not read package.json, skipping project build script"
        );
      }
    }

    // 5. Run TypeScript compiler if project build didn't succeed or doesn't exist
    if (!projectBuildSuccess) {
      await withSpinner("Running TypeScript compiler...", async () => {
        try {
          // Run tsc
          execSync(`npx tsc --outDir ${options.outputDir}`, {
            cwd: projectPath,
            stdio: "pipe",
          });
          return true;
        } catch (error: any) {
          logger.error(`TypeScript compilation failed: ${error.message}`);
          logger.debug(
            "TypeScript compiler output:",
            error.stdout?.toString() || "No output"
          );
          logger.info("Trying to continue by ensuring core files...");
          return false;
        }
      });
    }

    // 6. Ensure core files exist (agent-kit.js, etc.)
    const coreFilesSuccess = await ensureCoreFiles(projectPath, outputDir);
    if (!coreFilesSuccess) {
      logger.warn("Warning: Failed to ensure core files");
    }

    // 7. Fix import paths in compiled files
    const fixImportsSuccess = await fixImportPaths(outputDir);
    if (!fixImportsSuccess) {
      logger.warn("Warning: Failed to fix import paths");
    }

    // 8. Generate browser bundle if requested
    if (options.format === "browser") {
      await createBrowserBundle(outputDir, options);
    }

    // 9. Create README
    await createReadme(outputDir, options, toolFiles, agentFiles);

    // 10. Generate usage examples for the console output
    const usageExamples = generateUsageExamples(options, agentFiles);

    // Output success message
    console.log(`
✅ Build completed successfully!

Your compiled project is available in: ${outputDir}

## Usage Examples:
${usageExamples}
`);

    return {
      status: "success",
      outputDir,
      format: options.format,
      projectName: options.projectName,
      agents: agentFiles.map((file) => path.basename(file, path.extname(file))),
      tools: toolFiles.map((file) => path.basename(file, path.extname(file))),
    };
  } catch (error: any) {
    logger.error("Build failed:", error.message);
    return {
      status: "error",
      message: error.message,
    };
  }
}
