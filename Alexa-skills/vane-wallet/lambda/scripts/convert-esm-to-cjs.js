const fs = require("fs");
const path = require("path");

/**
 * Converts ESM files to CommonJS format with better handling of edge cases
 * @param {string} dir - Directory to process
 * @param {string} outputDir - Output directory
 */
function convertEsmToCjs(dir, outputDir) {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Get all files in the directory
  const files = fs.readdirSync(dir);

  // Process each file
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      // Recursively process subdirectories
      const subOutputDir = path.join(outputDir, file);
      convertEsmToCjs(filePath, subOutputDir);
    } else if (file.endsWith(".js")) {
      // Convert JS files from ESM to CJS
      const outputPath = path.join(outputDir, file);
      let content = fs.readFileSync(filePath, "utf8");

      // Add package.json with type: "commonjs" to output directory
      const packageJsonPath = path.join(outputDir, "package.json");
      if (!fs.existsSync(packageJsonPath)) {
        fs.writeFileSync(
          packageJsonPath,
          JSON.stringify({ type: "commonjs" }, null, 2)
        );
      }

      // Handle different import patterns
      content = content
        // Handle default imports
        .replace(
          /import\s+(\w+)\s+from\s+["']([^"']+)["'];?/g,
          'const $1 = require("$2");'
        )
        // Handle named imports with aliases (import { x as y })
        .replace(
          /import\s+{([^}]+)}\s+from\s+["']([^"']+)["'];?/g,
          (match, imports, source) => {
            const namedImports = imports
              .split(",")
              .map((i) => {
                const parts = i.trim().split(/\s+as\s+/);
                if (parts.length === 2) {
                  return `${parts[1].trim()}: ${parts[0].trim()}`;
                }
                return parts[0].trim();
              })
              .join(", ");
            return `const {${namedImports}} = require("${source}");`;
          }
        )
        // Handle side-effect imports
        .replace(/import\s+["']([^"']+)["'];?/g, 'require("$1");')
        // Handle dynamic imports
        .replace(/import\s*\(\s*["']([^"']+)["']\s*\)/g, 'require("$1")')
        // Handle export default
        .replace(/export\s+default\s+(\w+);?/g, "module.exports = $1;")
        // Handle export default with object/function expression
        .replace(
          /export\s+default\s+({[^;]+}|function[^;]+}|class[^;]+})/g,
          "module.exports = $1"
        )
        // Handle named exports
        .replace(
          /export\s+const\s+(\w+)\s+=\s+([^;]+);?/g,
          "const $1 = $2;\nmodule.exports.$1 = $1;"
        )
        .replace(/export\s+function\s+(\w+)/g, "function $1")
        // Add exports after function declarations
        .replace(/function\s+(\w+)\s*\([^)]*\)\s*{/g, (match, funcName) => {
          return `${match}\n// Add to exports\nif (typeof module !== 'undefined') module.exports.${funcName} = ${funcName};`;
        })
        // Handle export { x, y }
        .replace(/export\s+{([^}]+)};?/g, (match, exports) => {
          const namedExports = exports
            .split(",")
            .map((e) => e.trim())
            .join(", ");
          return `module.exports = { ${namedExports}, ...module.exports };`;
        });

      // Add module.exports initialization at the top of the file
      content =
        "if (typeof module !== 'undefined') module.exports = {};\n" + content;

      // Handle relative imports by replacing .js extensions
      content = content.replace(
        /require\("(\.\.?\/[^"]+)(?:\.js)?"\)/g,
        'require("$1")'
      );

      fs.writeFileSync(outputPath, content);
      console.log(`Converted ${filePath} to ${outputPath}`);
    } else {
      // Copy non-JS files as-is
      const outputPath = path.join(outputDir, file);
      fs.copyFileSync(filePath, outputPath);
      console.log(`Copied ${filePath} to ${outputPath}`);
    }
  }
}

// Get source and destination directories from command line arguments
const srcDir = process.argv[2] || path.join(__dirname, "..", "vane-agent");
const destDir = process.argv[3] || path.join(__dirname, "..", "vane-agent-cjs");

console.log(`Converting ESM to CJS from ${srcDir} to ${destDir}`);
convertEsmToCjs(srcDir, destDir);
console.log(`Conversion complete! CJS version available at ${destDir}`);
