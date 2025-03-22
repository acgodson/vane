# Vane Wallet Alexa Skill

An Alexa skill that allows users to interact with their Ethereum wallet through voice commands, integrated with Privy.io for wallet management. The skill uses Alexa cards to direct users to a companion web app for complex operations.

## Project Structure

```
/vane-wallet-alexa-skill
├── index.js                 # Main entry point
├── package.json             # Dependencies and package info
├── utils/
│   └── helpers.js           # Helper functions and constants
├── handlers/
│   ├── general.js   # General intent handlers (launch, help, stop)
│   ├── transaction.js # Transaction-related handlers
│   ├── address.js   # Address management handlers
```

## Features and Voice Commands

### Core Wallet Functions
1. **Create Wallet**
   * Invocation: "Alexa, create a wallet with Vane Wallet"
   * Response: "I've sent a link to the Alexa app where you can set up your new wallet"
   * Card URL: `https://vanewallet.com/setup?userId={alexaUserId}&action=create`

2. **Check Balance**
   * Invocation: "Alexa, check my balance"
   * Response: Speaks the current balance amount (no card URL needed)

3. **Show My Wallet Address**
   * Invocation: "Alexa, show me my wallet address"
   * Response: "I've sent your wallet address to the Alexa app"
   * Card URL: `https://vanewallet.com/view?userId={alexaUserId}`

### Transaction Functions
1. **Send Transaction**
   * Invocation: "Alexa, send 0.1 ETH to Bob"
   * Response: Multi-step voice verification with security trivia
   * Note: This is handled entirely through voice for better security

### Contact Management Functions
1. **Add Contact Address**
   * Invocation: "Alexa, add Bob's wallet address"
   * Response: "I've sent a link to the Alexa app where you can add Bob's address"
   * Card URL: `https://vanewallet.com/addcontact?userId={alexaUserId}&contact=Bob`

2. **Show Contact's Wallet Address**
   * Invocation: "Alexa, show me Bob's wallet address"
   * Response: "I've sent Bob's wallet address to the Alexa app"
   * Card URL: `https://vanewallet.com/viewcontact?userId={alexaUserId}&contact=Bob`


## Security Features

- Security trivia questions for transaction verification (hardcoded in the demo)
- Integration with Alexa permissions for contact access
- Complex operations handled through web UI for better security and UX

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Deploy to AWS Lambda:
   ```
   # Use your preferred deployment method (AWS CLI, Serverless Framework, etc.)
   ```

3. Configure the following AWS resources:
   - DynamoDB tables:
     - `AlexaWalletAddressBook`
     - `AlexaWalletShortCodes`
   - AWS Secrets Manager secret named `PrivyWalletCredentials` with:
     ```json
     {
       "appId": "your-privy-app-id",
       "appSecret": "your-privy-app-secret",
       "walletId": "your-privy-wallet-id",
       "policyId": "your-privy-policy-id"
     }
     ```

## Companion Web App

This skill relies on a companion web application that should handle the following URLs:

1. `/setup` - For wallet creation
2. `/view` - For displaying the user's own wallet address
3. `/addcontact` - For adding and managing contact addresses
4. `/viewcontact` - For displaying a contact's wallet address
