# Vane - ETHGlobal Trifecta

**Vane** is an AI-powered agent creation toolkit enabling **conversational AI development** via CLI. It uses custom Typescript wrapper that compiles down to **Covalent and Vercel’s AI Agent infrastructure**

Vane Wallet, a **voice-controlled Ethereum wallet**, showcases the power of Vane by enabling **wallet management and web3 insights via Alexa**.

## 🏗️ Repository Structure

```
/Vane
│── /vaneagent                             # Generated AI Vane agentused in the Alexa-based Vane Wallet demo
│── /vaneagent/.vanekit-config.json        # Creation Conversation logs from the Vane agent
│── /Packages/Vane-CLI                     # CLI toolkit for conversational AI agent creation
│── /Alexa-Skills/                         # Clone from Alexa-hosted Vane Wallet Skills code
│── /client                                # WebSocket-based UI editor for agent creation
```

## 🚀 Features

✅ **Conversational AI Agent Creation** – No prompt engineering required  
✅ **CLI & WebSocket Editor** – Develop via CLI or browser UI  
✅ **AI-Enhanced Ethereum Wallet** – Execute transactions via voice  
✅ **Alexa Integration** – Hands-free, smart contract interactions  
✅ **AWS Lambda Hosting** – Serverless and scalable

## 📖 Getting Started

### 1️⃣ Install Vane CLI

```sh
npm install -g vane-cli
```

### 2️⃣ Create an AI Agent Project

```sh
npm setup
vanekit
cd <project-name> && vanekit chat
```

### 3️⃣ Deploy to Alexa

```sh
vanekit build && vanekit deploy
```

## 🔗 Resources

- **Project Summary**: [https://ethglobal.com/showcase/vane-2v96c](https://ethglobal.com/showcase/vane-2v96c)
- **Vane Editor**: [https://vane-editor.vercel.app](https://vane-editor.vercel.app)
- **Docs**: (Coming soon)

## 💡 Contributing

Contributions are welcome!
