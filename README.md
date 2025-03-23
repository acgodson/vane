# Vane - ETHGlobal Trifecta

**Vane** is an AI-powered agent creation toolkit enabling **conversational AI development** via CLI. It uses a custom TypeScript wrapper that compiles down to **Covalent and Vercel's AI Agent infrastructure**

Vane Wallet, a **voice-controlled Ethereum wallet**, showcases the power of Vane by enabling **wallet management and web3 insights via Alexa**.

## 🏗️ Repository Structure

```
/Vane
│── /vaneagent                             # Generated AI Vane agent used in the Alexa-based Vane Wallet demo
│── /vaneagent/.vanekit-config.json        # Creation Conversation logs from the Vane agent
│── /packages/vane-cli                     # CLI toolkit for conversational AI agent creation
│── /Alexa-skills/                         # Clone from Alexa-hosted Vane Wallet Skills code
│── /client                                # WebSocket-based UI editor for agent creation
```

## 🚀 Features

✅ **Conversational AI Agent Creation** – No prompt engineering required  
✅ **CLI & WebSocket Editor** – Develop via CLI or browser UI  
✅ **AI-Enhanced Ethereum Wallet** – Execute transactions via voice  
✅ **Alexa Integration** – Hands-free, smart contract interactions  
✅ **AWS Lambda Hosting** – Serverless and scalable

## 📦 Installation

### Option 1: Install from GitHub Packages

```bash
# Create or edit .npmrc with your GitHub access token
echo "@acgodson:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc

# Then install globally
npm install -g @acgodson/vane-tool-kit
```

### Option 2: Local Development Setup

```bash
# Clone the repository
git clone https://github.com/acgodson/vane.git
cd vane/packages/vane-cli

# Run the setup script
npm run setup

# Navigate to the dist directory and start
npm run start
```

## 📖 Getting Started

1️⃣ Create an AI Agent Project

```bash
vanekit
```

2️⃣ Navigate to your project and start a conversation

```bash
cd <project-name> && vanekit chat
```

3️⃣ Deploy to Alexa

```bash
vanekit build && vanekit deploy
```

## 🔗 Resources

- **Project Summary**: https://ethglobal.com/showcase/vane-2v96c
- **Vane Editor**: https://vane-editor.vercel.app
- **Docs**: (Coming soon)

## 💡 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.
