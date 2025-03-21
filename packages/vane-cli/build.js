//vane-cli/build.js
const esbuild = require("esbuild");
const { join, resolve } = require("path");
const { writeFileSync, mkdirSync, existsSync } = require("fs");

// Ensure the dist directory exists
if (!existsSync("./dist")) {
  mkdirSync("./dist", { recursive: true });
}

// Create a simple bin entry point
const binFile = `#!/usr/bin/env node
require('./cli.js');
`;

writeFileSync("./dist/bin.js", binFile, { mode: 0o755 });

// Build CLI with CommonJS format for compatibility
esbuild
  .build({
    entryPoints: ["./src/cli/index.ts"],
    outfile: "./dist/cli.js",
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    sourcemap: true,
    banner: {
      js: "#!/usr/bin/env node\n",
    },
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    // External dependencies that shouldn't be bundled
    external: [
      "inquirer",
      "ora",
      "dotenv",
      "fs",
      "path",
      "child_process",
      "stream",
      "events",
      "util",
      "assert",
      "tty",
      "os",
      "crypto",
      "axios",
    ],
  })
  .then(() => {
    console.log("CLI built successfully");
  })
  .catch((error) => {
    console.error("CLI build failed:", error);
    process.exit(1);
  });
