/**
 * Helper function to check if npm or another package manager is installed
 */

import { execSync, spawn } from "child_process";
import ora from "ora";
import { buildProject } from "../build";

export function getPackageManager() {
  try {
    // Check for pnpm first (fastest)
    execSync("pnpm --version", { stdio: "ignore" });
    return "pnpm";
  } catch (e) {
    try {
      // Then yarn
      execSync("yarn --version", { stdio: "ignore" });
      return "yarn";
    } catch (e) {
      try {
        // Then npm
        execSync("npm --version", { stdio: "ignore" });
        return "npm";
      } catch (e) {
        return undefined;
      }
    }
  }
}

/**
 * Install dependencies in the project directory
 */
export async function installDependencies(projectPath: any) {
  const packageManager = getPackageManager();

  if (!packageManager) {
    console.warn(
      "⚠️ No package manager (npm, yarn, pnpm) found. Please install dependencies manually."
    );
    return false;
  }

  return new Promise((resolve) => {
    const spinner = ora(
      `Installing dependencies with ${packageManager}...`
    ).start();

    const installCommand = packageManager === "yarn" ? "add" : "install";
    const installProcess = spawn(packageManager, [installCommand], {
      cwd: projectPath,
      stdio: "pipe",
    });

    installProcess.on("close", (code) => {
      if (code === 0) {
        spinner.succeed(
          `Dependencies installed successfully with ${packageManager}`
        );
        resolve(true);
      } else {
        spinner.fail(`Failed to install dependencies (exit code: ${code})`);
        console.log(
          `Please run '${packageManager} install' in the project directory manually.`
        );
        resolve(false);
      }
    });

    // Handle potential errors
    installProcess.on("error", (err) => {
      spinner.fail(`Error installing dependencies: ${err.message}`);
      console.log(
        `Please run '${packageManager} install' in the project directory manually.`
      );
      resolve(false);
    });
  });
}

/**
 * Build the project
 */
export async function buildProjectFiles(message: any, config: any) {
  const args = message.split(" ");
  const options: any = {
    projectName: config.projectName,
    skipDependencyPrompt: true, // Skip dependency prompt in chat mode by default
  };

  // Parse options if provided
  if (args.length > 1) {
    if (args[1] === "--help" || args[1] === "-h") {
      console.log(`
  Build command options:
    build                       - Build with interactive prompts
    build --format=esm          - Specify output format (esm, cjs, browser)
    build --output=dist         - Specify output directory
    build --agent=AgentName     - Specify main agent to export as default
    build --deps                - Prompt to install dependencies
    build --no-deps             - Skip dependency installation prompt
        `);
      return;
    }

    // Parse command line args
    args.slice(1).forEach((arg: string) => {
      if (arg.startsWith("--format=")) {
        options.format = arg.split("=")[1];
      } else if (arg.startsWith("--output=")) {
        options.outputDir = arg.split("=")[1];
      } else if (arg.startsWith("--agent=")) {
        options.mainAgent = arg.split("=")[1];
      } else if (arg === "--deps") {
        options.skipDependencyPrompt = false;
      } else if (arg === "--no-deps") {
        options.skipDependencyPrompt = true;
      }
    });
  }

  // Use full path
  const buildResult = await buildProject(config.projectPath, options);
  if (buildResult.status === "error") {
    console.log(`🤖 Assistant: Build failed: ${buildResult.message}`);
  } else {
    console.log(
      `🤖 Assistant: Build completed successfully! Your compiled project is available in: ${buildResult.outputDir}`
    );
  }
}

/**
 * Convert string to camelCase
 */
export function toCamelCase(str: string): string {
  return str
    .replace(/\s+(.)/g, (_, char) => char.toUpperCase())
    .replace(/\s/g, "")
    .replace(/^(.)/, (_, char) => char.toLowerCase())
    .replace(/[^a-zA-Z0-9_]/g, "");
}

/**
 * Logger with configurable verbosity
 */
export const logger = {
  debug: (message: string, ...args: any[]) => {
    if (process.env.AGENT_KIT_DEBUG === "true") {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },
  info: (message: string, ...args: any[]) => console.log(message, ...args),
  warn: (message: string, ...args: any[]) =>
    console.warn(`⚠️ ${message}`, ...args),
  error: (message: string, ...args: any[]) =>
    console.error(`❌ ${message}`, ...args),
};

/**
 * Execute a task with a spinner
 */
export async function withSpinner<T>(
  message: string,
  task: () => Promise<T>
): Promise<T> {
  const spinner = ora(message).start();
  try {
    const result = await task();
    spinner.succeed();
    return result;
  } catch (error: any) {
    spinner.fail(`${message} failed: ${error.message}`);
    throw error;
  }
}

/**
 * Execute a command with a Promise interface
 */
export function executeCommand(
  command: string,
  args: string[],
  options: { cwd: string; message: string }
): Promise<boolean> {
  return new Promise((resolve) => {
    const spinner = ora(options.message).start();

    const process = spawn(command, args, {
      cwd: options.cwd,
      stdio: "pipe",
    });

    process.on("close", (code) => {
      if (code === 0) {
        spinner.succeed(`${options.message} completed successfully`);
        resolve(true);
      } else {
        spinner.fail(`${options.message} failed (exit code: ${code})`);
        resolve(false);
      }
    });

    process.on("error", (err) => {
      spinner.fail(`${options.message} error: ${err.message}`);
      resolve(false);
    });
  });
}
