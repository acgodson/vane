#!/bin/bash
# Simple setup script for AgentKit that includes vendor creation

# Print banner
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║                     VANE Setup                             ║"
echo "║                                                            ║"
echo "║  Build, manage and deploy AI agents with VANE Toolkit      ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js v18 or newer."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d 'v' -f 2)
NODE_MAJOR=$(echo $NODE_VERSION | cut -d '.' -f 1)

if [ $NODE_MAJOR -lt 18 ]; then
    echo "❌ Node.js v$NODE_VERSION is not supported. Please upgrade to v18 or newer."
    exit 1
fi

echo "✅ Node.js v$NODE_VERSION detected"

# Make sure we're using CommonJS mode
echo "📝 Switching to CommonJS mode..."

# Clean up any existing builds
echo "🧹 Cleaning up..."
rm -rf dist node-loader.mjs

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install


# Check for .env file
if [ ! -f .env ] && [ -f .env.example ]; then
    echo "⚠️ No .env file found. Creating from .env.example template."
    cp .env.example .env
    echo "🔧 Please edit the .env file with your configuration."
fi

# Build the project
echo "🔨 Building project..."
node build.js

# Make the binary executable
echo "🔑 Making the binary executable..."
chmod +x dist/bin.js

echo ""
echo "✨ Setup complete! To get started, run:"
echo "   pnpm start"
echo ""
echo "📚 Documentation: https://ethglobal.com/vane/"
echo "🐞 Report issues: https://github.com/acgodson/vane"