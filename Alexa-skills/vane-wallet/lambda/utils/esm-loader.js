// utils/esm-loader.js
const fs = require("fs");
const path = require("path");

/**
 * Helper to load ES modules in a CommonJS environment by converting to temp CJS
 * @param {string} esmFilePath - Path to the ES module
 * @returns {any} - The loaded module
 */
function loadESModuleAsCJS(esmFilePath) {
  try {
    const esmContent = fs.readFileSync(esmFilePath, "utf8");

    // Create temp directory in /tmp which is writable in Lambda
    const tempDir = "/tmp";

    // Create a temp file with CommonJS equivalent
    const tempFile = path.join(tempDir, `temp-${Date.now()}.cjs`);

    // Convert ESM to CJS using a simple transformation
    let cjsContent = esmContent
      .replace(
        /import\s+(\w+)\s+from\s+["']([^"']+)["'];?/g,
        'const $1 = require("$2");'
      )
      .replace(
        /import\s+{([^}]+)}\s+from\s+["']([^"']+)["'];?/g,
        'const {$1} = require("$2");'
      )
      .replace(/import\s+["']([^"']+)["'];?/g, 'require("$1");')
      .replace(/export\s+default\s+(\w+);?/g, "module.exports = $1;")
      .replace(
        /export\s+const\s+(\w+)\s+=\s+([^;]+);?/g,
        "module.exports.$1 = $2;"
      )
      .replace(/export\s+{([^}]+)};?/g, "module.exports = { $1 };");

    // Handle relative imports by replacing .js with nothing (Node.js will resolve)
    cjsContent = cjsContent.replace(
      /require\("\.\/([^"]+)\.js"\)/g,
      'require("./$1")'
    );

    fs.writeFileSync(tempFile, cjsContent);

    // Load the CJS version
    const module = require(tempFile);

    return module;
  } catch (error) {
    console.error("Error converting ESM to CJS:", error);
    throw error;
  }
}

module.exports = { loadESModuleAsCJS };
