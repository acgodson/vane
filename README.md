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

You can install the Vane CLI toolkit from GitHub Packages:

```bash
# For users with GitHub Package access
npm install @acgodson/vane-tool-kit
```

Or install globally:

```bash
npm install -g @acgodson/vane-tool-kit
```

## 📖 Getting Started

1️⃣ Install Vane CLI

```bash
npm install -g @acgodson/vane-tool-kit
```

2️⃣ Create an AI Agent Project

```bash
vanekit
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
