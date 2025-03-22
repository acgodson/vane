//handlers/transaction.js
const Alexa = require("ask-sdk-core");
const {
  makePrivyRequest,
  getUserTrivia,
  verifyUserTrivia,
  getAddressBook,
  getSlotValue,
} = require("../utils/helpers");

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
      // Get wallet balance using Privy API
      const balance = await makePrivyRequest(
        "/wallets/<wallet_id>/rpc",
        "POST",
        {
          method: "eth_getBalance",
          caip2: "eip155:1", // Ethereum mainnet
          params: ["latest"],
        }
      );

      // Convert balance from wei to ETH
      const ethBalance = parseInt(balance.result, 16) / 1e18;

      const speakOutput = `Your wallet has ${ethBalance.toFixed(4)} ETH.`;

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

    // Check if this is the initial request or if we're in the confirmation flow
    if (!sessionAttributes.inSendConfirmation) {
      const amount = getSlotValue(handlerInput, "amount");
      const recipient = getSlotValue(handlerInput, "recipient");

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
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        return handlerInput.responseBuilder
          .speak(
            "I'm sorry, that's not the correct answer. For security reasons, I've canceled the transaction. Please try again."
          )
          .getResponse();
      }

      // Proceed with the transaction after successful trivia verification
      const amount = sessionAttributes.transactionAmount;
      const recipient = sessionAttributes.transactionRecipient;

      // Get the recipient's address from the address book
      const addressBook = await getAddressBook(userId);

      if (!addressBook[recipient]) {
        sessionAttributes.inSendConfirmation = false;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        return handlerInput.responseBuilder
          .speak(
            `I couldn't find ${recipient} in your address book. You can add them by saying "add contact".`
          )
          .getResponse();
      }

      const recipientAddress = addressBook[recipient];

      try {
        // Convert ETH amount to wei (1 ETH = 10^18 wei)
        const weiAmount = Math.floor(parseFloat(amount) * 1e18).toString(16);

        // Send transaction using Privy API
        const transaction = await makePrivyRequest(
          "/wallets/<wallet_id>/rpc",
          "POST",
          {
            method: "eth_sendTransaction",
            caip2: "eip155:1", // Ethereum mainnet
            params: {
              transaction: {
                to: recipientAddress,
                value: `0x${weiAmount}`,
              },
            },
          }
        );

        // Reset the send flow
        sessionAttributes.inSendConfirmation = false;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        return handlerInput.responseBuilder
          .speak(
            `Success! I've sent ${amount} ETH to ${recipient}. The transaction hash is ${transaction.result.slice(
              0,
              10
            )}...`
          )
          .getResponse();
      } catch (error) {
        // Reset the send flow
        sessionAttributes.inSendConfirmation = false;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        console.error("Transaction error:", error);

        return handlerInput.responseBuilder
          .speak(
            "I'm sorry, there was an error processing your transaction. Please try again later."
          )
          .getResponse();
      }
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
