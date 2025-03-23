require("dotenv").config();

const Alexa = require("ask-sdk-core");
const {
  makePrivyRequest,
  getUserTrivia,
  verifyUserTrivia,
  getAddressBook,
  getSlotValue,
} = require("../utils/helpers");
const axios = require("axios");

const { createPublicClient, custom, getAddress, formatEther } = require("viem");
const { sepolia } = require("viem/chains");

const RPC_URL = `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`;

const transport = custom({
  async request({ method, params }) {
    try {
      const response = await axios.post(
        RPC_URL,
        {
          jsonrpc: "2.0",
          id: 1,
          method,
          params,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.error) {
        throw new Error(
          `RPC Error: ${
            response.data.error.message || JSON.stringify(response.data.error)
          }`
        );
      }

      return response.data.result;
    } catch (error) {
      if (error.response) {
        // The request was made and the server responded with a status code
        // outside of the 2xx range
        throw new Error(
          `HTTP Error: ${error.response.status} - ${error.response.statusText}`
        );
      } else if (error.request) {
        // The request was made but no response was received
        throw new Error(
          "Network Error: No response received from RPC endpoint"
        );
      } else {
        // Something happened in setting up the request that triggered an Error
        throw error;
      }
    }
  },
});

const client = createPublicClient({
  chain: sepolia,
  transport,
});

// Bob's address for DEMO
const BOB_ADDRESS = getAddress("0xf2750684eB187fF9f82e2F980f6233707eF5768C");
const BOB_NAME = "Bob";

async function addBobToPolicy(policyId) {
  try {
    // First get the current policy
    const currentPolicy = await makePrivyRequest(
      `/policies/${policyId}`,
      "GET"
    );

    const methodRules = currentPolicy.method_rules || [];
    const sendTxRule = methodRules.find(
      (rule) => rule.method === "eth_sendTransaction"
    );

    if (!sendTxRule) {
      throw new Error("eth_sendTransaction rule not found in policy");
    }

    const bobRuleExists = sendTxRule.rules.some(
      (rule) =>
        rule.name === `Whitelist ${BOB_NAME}` &&
        rule.conditions.some(
          (cond) => cond.field === "to" && cond.value === BOB_ADDRESS
        )
    );

    // Only add if the rule doesn't exist
    if (!bobRuleExists) {
      sendTxRule.rules.unshift({
        name: `Whitelist ${BOB_NAME}`,
        conditions: [
          {
            field_source: "ethereum_transaction",
            field: "to",
            operator: "eq",
            value: BOB_ADDRESS,
          },
        ],
        action: "ALLOW",
      });
      await makePrivyRequest(`/policies/${policyId}`, "PATCH", {
        method_rules: methodRules,
      });

      console.log(`Added ${BOB_NAME} to policy successfully`);
    } else {
      console.log(`${BOB_NAME} already exists in policy`);
    }

    return true;
  } catch (error) {
    console.error(`Error allowing address ${BOB_ADDRESS} in policy:`, error);
    throw error;
  }
}

// Check Native Balance Intent Handler
const CheckNativeBalanceIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "CheckNativeBalanceIntent"
    );
  },
  async handle(handlerInput) {
    try {
      // Get user's saved address from attributes
      const attributesManager = handlerInput.attributesManager;
      const persistentAttributes =
        (await attributesManager.getPersistentAttributes()) || {};

      // Check if user has a wallet address saved
      if (!persistentAttributes.address) {
        return handlerInput.responseBuilder
          .speak(
            "You don't have a wallet set up yet. Would you like to create one?"
          )
          .reprompt("Would you like to create a wallet?")
          .getResponse();
      }

      const address = persistentAttributes.address;

      // Use viem to check the balance
      const balance = await client.getBalance({
        address: getAddress(address),
      });

      // Convert balance from wei to ETH (balance is already in BigInt)
      const ethBalance = formatEther(balance);

      const speakOutput = `Your wallet has ${Number(ethBalance).toFixed(
        4
      )} ETH.`;

      return handlerInput.responseBuilder.speak(speakOutput).getResponse();
    } catch (error) {
      console.log("Error checking balance:", error);

      return handlerInput.responseBuilder
        .speak(
          "I'm sorry, I couldn't retrieve your balance at this time. Please try again later."
        )
        .getResponse();
    }
  },
};

// Send Transaction Intent Handler
const SendTransactionIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "SendTransactionIntent"
    );
  },
  async handle(handlerInput) {
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    const userId = handlerInput.requestEnvelope.session.user.userId;

    try {
      // Get user's persistent attributes to check if they have a wallet
      const attributesManager = handlerInput.attributesManager;
      const persistentAttributes =
        (await attributesManager.getPersistentAttributes()) || {};

      // Check if user has a wallet address saved
      if (!persistentAttributes.address) {
        return handlerInput.responseBuilder
          .speak(
            "You don't have a wallet set up yet. Would you like to create one?"
          )
          .reprompt("Would you like to create a wallet?")
          .getResponse();
      }

      // Check if this is the initial request or if we're in the confirmation flow
      if (!sessionAttributes.inSendConfirmation) {
        // First, ensure Bob is added to the policy
        const policyId = persistentAttributes.policyId;
        if (!policyId) {
          return handlerInput.responseBuilder
            .speak(
              "Your wallet isn't fully set up yet. Please try again later."
            )
            .getResponse();
        }

        // Add Bob to the policy
        await addBobToPolicy(policyId);

        const amount = getSlotValue(handlerInput, "amount");

        // Always send to Bob
        const recipient = BOB_NAME;

        // Save transaction details for confirmation
        sessionAttributes.inSendConfirmation = true;
        sessionAttributes.transactionAmount = amount;
        sessionAttributes.transactionRecipient = recipient;
        sessionAttributes.confirmationStage = "trivia";

        // Get a random trivia question
        const triviaQuestion = await getUserTrivia(userId);

        if (!triviaQuestion) {
          return handlerInput.responseBuilder
            .speak(
              "I couldn't find any security questions for your account. Please try again later."
            )
            .getResponse();
        }

        sessionAttributes.currentTrivia = triviaQuestion;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        return handlerInput.responseBuilder
          .speak(
            `Before I send ${amount} ETH to ${recipient}, I need to verify it's you. ${triviaQuestion}`
          )
          .reprompt(triviaQuestion)
          .getResponse();
      } else if (sessionAttributes.confirmationStage === "trivia") {
        // Get the user's answer to the trivia question
        const triviaAnswer = getSlotValue(handlerInput, "answer");
        const currentQuestion = sessionAttributes.currentTrivia;

        // Check if the answer is correct
        const isCorrect = await verifyUserTrivia(
          userId,
          triviaAnswer,
          currentQuestion
        );

        if (!isCorrect) {
          // Reset the send flow
          sessionAttributes.inSendConfirmation = false;
          handlerInput.attributesManager.setSessionAttributes(
            sessionAttributes
          );

          return handlerInput.responseBuilder
            .speak(
              "I'm sorry, that's not the correct answer. For security reasons, I've canceled the transaction. Please try again."
            )
            .getResponse();
        }

        // Proceed with the transaction after successful trivia verification
        const amount = sessionAttributes.transactionAmount;
        // Always use Bob as recipient
        const recipient = BOB_NAME;
        const recipientAddress = BOB_ADDRESS;

        try {
          // Use the user's stored address as the sender/wallet_id
          const walletId = persistentAttributes.address;

          // Convert ETH amount to wei (1 ETH = 10^18 wei)
          // Convert to a raw number, not hex string
          const weiAmount = Math.floor(parseFloat(amount) * 1e18);

          // Send transaction using Privy API
          const transaction = await makePrivyRequest(
            `/wallets/${walletId}/rpc`,
            "POST",
            {
              method: "eth_sendTransaction",
              caip2: "eip155:11155111", // Sepolia testnet
              chain_type: "ethereum",
              params: {
                transaction: {
                  to: recipientAddress,
                  value: weiAmount,
                },
              },
            }
          );

          // Reset the send flow
          sessionAttributes.inSendConfirmation = false;
          handlerInput.attributesManager.setSessionAttributes(
            sessionAttributes
          );

          const txHash = transaction.result;
          const explorerUrl = `https://sepolia.etherscan.io/tx/${txHash}`;

          return handlerInput.responseBuilder
            .speak(
              `Success! I've sent ${amount} ETH to ${recipient}. The transaction has been submitted.`
            )
            .withStandardCard(
              `ETH Transaction Sent`,
              `Amount: ${amount} ETH\nTo: ${recipient}\nTransaction Hash: ${txHash}\n\nView on Explorer: ${explorerUrl}`,
              null,
              null
            )
            .getResponse();
        } catch (error) {
          // Reset the send flow
          sessionAttributes.inSendConfirmation = false;
          handlerInput.attributesManager.setSessionAttributes(
            sessionAttributes
          );

          console.error("Transaction error:", error);

          return handlerInput.responseBuilder
            .speak(
              "I'm sorry, there was an error processing your transaction. Please try again later."
            )
            .getResponse();
        }
      }
    } catch (error) {
      console.error("Error in SendTransactionIntentHandler:", error);

      // Reset the send flow
      sessionAttributes.inSendConfirmation = false;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

      return handlerInput.responseBuilder
        .speak(
          "I'm sorry, there was an error processing your request. Please try again later."
        )
        .getResponse();
    }
  },
};

// Answer Handler for transaction confirmation
const AnswerIntentHandler = {
  canHandle(handlerInput) {
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "AnswerIntent" &&
      sessionAttributes.inSendConfirmation === true
    );
  },
  handle(handlerInput) {
    // This is a passthrough that will be handled by the SendTransactionIntentHandler
    // based on the current confirmation stage
    return SendTransactionIntentHandler.handle(handlerInput);
  },
};

module.exports = {
  CheckNativeBalanceIntentHandler,
  SendTransactionIntentHandler,
  AnswerIntentHandler,
};
