// Vane Wallet Alexa Skill with Privy.io Integration
const Alexa = require("ask-sdk-core");
const axios = require("axios");
const AWS = require("aws-sdk");

// AWS services setup
const secretsManager = new AWS.SecretsManager();
const dynamoDB = new AWS.DynamoDB.DocumentClient();

// Contact permission constants
const PERMISSIONS = [
  "alexa::profile:name:read",
  "alexa::profile:email:read",
  "alexa::profile:mobile_number:read",
  "alexa::profile:given_name:read",
];

// Base URLs
const PRIVY_API_URL = "https://api.privy.io/v1";

// Hard-coded trivia questions (for simplicity in the demo version)
const TRIVIA_QUESTIONS = [
  {
    question: "What was the name of your first pet?",
    answer: "fluffy", // Answer should be lowercase for case-insensitive comparison
  },
  {
    question: "What street did you grow up on?",
    answer: "maple street",
  },
  {
    question: "What was your childhood nickname?",
    answer: "buddy",
  },
];

// Helper function to get secrets from AWS Secrets Manager
async function getSecrets(secretName) {
  try {
    const data = await secretsManager
      .getSecretValue({ SecretId: secretName })
      .promise();
    return JSON.parse(data.SecretString);
  } catch (error) {
    console.error("Error retrieving secrets:", error);
    throw error;
  }
}

// Helper function to make authenticated requests to Privy API
async function makePrivyRequest(endpoint, method, data = null) {
  try {
    // Get secrets for Privy authentication
    const secrets = await getSecrets("PrivyWalletCredentials");
    const { appId, appSecret, walletId } = secrets;

    // Create auth credentials for Basic Auth
    const auth = {
      username: appId,
      password: appSecret,
    };

    // Replace any instances of walletId placeholder in the endpoint
    const finalEndpoint = endpoint.replace("<wallet_id>", walletId);

    // Make the API request
    const response = await axios({
      method: method,
      url: `${PRIVY_API_URL}${finalEndpoint}`,
      auth: auth,
      headers: {
        "privy-app-id": appId,
        "Content-Type": "application/json",
      },
      data: data || undefined,
    });

    return response.data;
  } catch (error) {
    console.error(
      "Privy API error:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

// Updated function to get random trivia question
async function getUserTrivia(userId) {
  try {
    // In a production version, we would retrieve from DynamoDB
    // For the demo, we'll use the hard-coded questions

    // Get random question from the array
    const randomIndex = Math.floor(Math.random() * TRIVIA_QUESTIONS.length);
    return TRIVIA_QUESTIONS[randomIndex].question;
  } catch (error) {
    console.error("Error getting trivia:", error);
    return TRIVIA_QUESTIONS[0].question; // Fallback to first question
  }
}

// Bug fix for the verifyUserTrivia function to avoid reference to handlerInput
async function verifyUserTrivia(userId, answer, currentQuestion) {
  try {
    // In a production version, we would check against answers in DynamoDB
    // For the demo, we'll check against hard-coded answers

    const questionObj = TRIVIA_QUESTIONS.find(
      (q) => q.question === currentQuestion
    );
    if (!questionObj) return false;

    // Compare answers (case insensitive)
    return questionObj.answer === answer.toLowerCase();
  } catch (error) {
    console.error("Error verifying trivia:", error);
    return false;
  }
}

// Helper function to get addresses from address book
async function getAddressBook(userId) {
  try {
    const params = {
      TableName: "AlexaWalletAddressBook",
      Key: { userId: userId },
    };

    const result = await dynamoDB.get(params).promise();
    return result.Item ? result.Item.addresses : {};
  } catch (error) {
    console.error("Error retrieving address book:", error);
    return {};
  }
}

// Helper function to verify contact exists in user's phone
async function verifyContactExists(handlerInput, contactName) {
  try {
    // Check for permission to access contacts
    const { permissions } = handlerInput.requestEnvelope.context.System.user;
    if (!permissions) {
      return { exists: false, permissionNeeded: true };
    }

    // Use Alexa API to get contacts
    const serviceClientFactory = handlerInput.serviceClientFactory;
    const profileApi = serviceClientFactory.getUpsServiceClient();

    // Get user's contact list
    const contacts = await profileApi.getProfileContacts();

    // Find the requested contact
    const foundContact = contacts.find((contact) =>
      contact.name.toLowerCase().includes(contactName.toLowerCase())
    );

    if (foundContact) {
      return {
        exists: true,
        name: foundContact.name,
        phoneNumber: foundContact.phoneNumber,
      };
    } else {
      return { exists: false, permissionNeeded: false };
    }
  } catch (error) {
    console.log("Error accessing contacts:", error);
    return { exists: false, error: error.message };
  }
}

// Helper function to add address to address book
async function addAddressToAddressBook(userId, nickname, address) {
  try {
    // First get current address book
    const addressBook = await getAddressBook(userId);

    // Add new address
    addressBook[nickname] = address;

    // Save updated address book
    const params = {
      TableName: "AlexaWalletAddressBook",
      Item: {
        userId: userId,
        addresses: addressBook,
      },
    };

    await dynamoDB.put(params).promise();

    // Update the policy on Privy to allow transactions to this address
    await updatePrivyPolicy(address);

    return true;
  } catch (error) {
    console.error("Error adding address to book:", error);
    return false;
  }
}

// Helper function to update Privy policy to allow transactions to an address
async function updatePrivyPolicy(newAddress) {
  try {
    // Get secrets for Privy authentication
    const secrets = await getSecrets("PrivyWalletCredentials");
    const { policyId } = secrets;

    // First get the current policy
    const currentPolicy = await makePrivyRequest(
      `/policies/${policyId}`,
      "GET"
    );

    // Extract the existing rules
    const methodRules = currentPolicy.method_rules;

    // Find the eth_sendTransaction rule
    const sendTxRule = methodRules.find(
      (rule) => rule.method === "eth_sendTransaction"
    );

    if (sendTxRule) {
      // Add the new address to the rules
      const newRule = {
        name: `Allow ${newAddress}`,
        conditions: [
          {
            field_source: "ethereum_transaction",
            field: "to",
            operator: "eq",
            value: newAddress,
          },
        ],
        action: "ALLOW",
      };

      sendTxRule.rules.push(newRule);

      // Update the policy
      await makePrivyRequest(`/policies/${policyId}`, "PATCH", {
        method_rules: methodRules,
      });
    }

    return true;
  } catch (error) {
    console.error("Error updating policy:", error);
    return false;
  }
}

// Launch Request Handler
const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest"
    );
  },
  handle(handlerInput) {
    const speakOutput =
      "Welcome to Vane Wallet. You can check your balance, send ETH to your contacts, or manage your address book. What would you like to do?";

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};

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

// Add Address Intent Handler
const AddAddressIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "AddAddressIntent"
    );
  },
  async handle(handlerInput) {
    const userId = handlerInput.requestEnvelope.session.user.userId;
    const address = getSlotValue(handlerInput, "address");
    let nickname = getSlotValue(handlerInput, "nickname");
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();

    try {
      // If this is a follow-up after requesting permissions
      if (sessionAttributes.pendingContactVerification) {
        const contactToVerify = sessionAttributes.pendingContactName;
        sessionAttributes.pendingContactVerification = false;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        // Verify the contact exists
        const contactResult = await verifyContactExists(
          handlerInput,
          contactToVerify
        );

        if (contactResult.permissionNeeded) {
          sessionAttributes.pendingPermissionRequest = true;
          handlerInput.attributesManager.setSessionAttributes(
            sessionAttributes
          );

          return handlerInput.responseBuilder
            .speak(
              "To associate addresses with your contacts, I'll need permission to access your contacts. Would you like to grant this permission?"
            )
            .reprompt(
              "Would you like to grant permission to access your contacts?"
            )
            .getResponse();
        }

        if (!contactResult.exists) {
          return handlerInput.responseBuilder
            .speak(
              `I couldn't find ${contactToVerify} in your contacts. Please make sure the contact exists in your phone and try again.`
            )
            .getResponse();
        }

        // Use the verified contact name
        nickname = contactResult.name;
      }

      // Check if user wants to associate address with a contact
      if (nickname && nickname.toLowerCase().includes("contact")) {
        // Extract the contact name
        const contactName = nickname
          .toLowerCase()
          .replace("contact", "")
          .trim();

        // Verify the contact exists
        const contactResult = await verifyContactExists(
          handlerInput,
          contactName
        );

        if (contactResult.permissionNeeded) {
          // Save info for when we get permission response
          sessionAttributes.pendingPermissionRequest = true;
          sessionAttributes.pendingContactVerification = true;
          sessionAttributes.pendingContactName = contactName;
          sessionAttributes.pendingAddress = address;
          handlerInput.attributesManager.setSessionAttributes(
            sessionAttributes
          );

          return handlerInput.responseBuilder
            .speak(
              "To associate addresses with your contacts, I'll need permission to access your contacts. Would you like to grant this permission?"
            )
            .reprompt(
              "Would you like to grant permission to access your contacts?"
            )
            .getResponse();
        }

        if (!contactResult.exists) {
          return handlerInput.responseBuilder
            .speak(
              `I couldn't find ${contactName} in your contacts. Please make sure the contact exists in your phone and try again.`
            )
            .getResponse();
        }

        // Use the verified contact name
        nickname = contactResult.name;
      }

      // Add the address to the user's address book
      const success = await addAddressToAddressBook(userId, nickname, address);

      if (success) {
        return handlerInput.responseBuilder
          .speak(
            `I've associated ${nickname} with the blockchain address. You can now send transactions to them by saying "send ETH to ${nickname}".`
          )
          .getResponse();
      } else {
        return handlerInput.responseBuilder
          .speak(
            "I'm sorry, I couldn't save this address association. Please try again later."
          )
          .getResponse();
      }
    } catch (error) {
      console.log("Error adding address:", error);

      return handlerInput.responseBuilder
        .speak(
          "I'm sorry, there was an error associating this address. Please try again later."
        )
        .getResponse();
    }
  },
};

// Add Scan Address Intent Handler
const ScanAddressIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "ScanAddressIntent"
    );
  },
  async handle(handlerInput) {
    const userId = handlerInput.requestEnvelope.session.user.userId;

    try {
      // Generate a unique session code for this scan request
      const sessionCode = Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

      // Store the session code in DynamoDB with status "pending"
      const params = {
        TableName: "AlexaWalletScanSessions",
        Item: {
          sessionCode: sessionCode,
          userId: userId,
          status: "pending",
          createdAt: Date.now(),
          expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes expiration
        },
      };

      await dynamoDB.put(params).promise();

      // In a real implementation, you would send a push notification to the companion app
      // with the session code or use the Alexa Presentation Language (APL) to display a QR code

      // For demo purposes, we'll just tell the user the code to enter in the companion app
      return handlerInput.responseBuilder
        .speak(
          `To scan a wallet address, open your blockchain wallet companion app and enter session code ${sessionCode}. Once you've scanned an address, you can say "Check scan status" to continue associating it with a contact.`
        )
        .reprompt(
          `Your session code is ${sessionCode}. Let me know when you've scanned the address by saying "Check scan status".`
        )
        .getResponse();
    } catch (error) {
      console.log("Error initiating scan:", error);

      return handlerInput.responseBuilder
        .speak(
          "I'm sorry, there was an error starting the address scan process. Please try again later."
        )
        .getResponse();
    }
  },
};

// Check Scan Status Intent Handler
const CheckScanStatusIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "CheckScanStatusIntent"
    );
  },
  async handle(handlerInput) {
    const userId = handlerInput.requestEnvelope.session.user.userId;

    try {
      // Find the most recent pending scan session for this user
      const params = {
        TableName: "AlexaWalletScanSessions",
        IndexName: "UserIdStatusIndex",
        KeyConditionExpression: "userId = :userId AND #status = :status",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":userId": userId,
          ":status": "completed",
        },
        ScanIndexForward: false, // Get most recent first
        Limit: 1,
      };

      const result = await dynamoDB.query(params).promise();

      if (!result.Items || result.Items.length === 0) {
        return handlerInput.responseBuilder
          .speak(
            "I don't see any completed address scans. Please scan an address using the companion app first, or say 'scan address' to start a new scan."
          )
          .reprompt("Would you like to start a new address scan?")
          .getResponse();
      }

      const scanSession = result.Items[0];
      const scannedAddress = scanSession.address;

      // Store the address in session for the next step
      const sessionAttributes =
        handlerInput.attributesManager.getSessionAttributes();
      sessionAttributes.scannedAddress = scannedAddress;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

      return handlerInput.responseBuilder
        .speak(
          `Great! I found a scanned address ending in ${scannedAddress.slice(
            -6
          )}. Which contact would you like to associate this address with?`
        )
        .reprompt(
          "Please tell me which contact you'd like to associate with this address."
        )
        .getResponse();
    } catch (error) {
      console.log("Error checking scan status:", error);

      return handlerInput.responseBuilder
        .speak(
          "I'm sorry, there was an error checking your scan status. Please try again later."
        )
        .getResponse();
    }
  },
};

// Import From Short Code Intent Handler
const ImportFromShortCodeIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "ImportFromShortCodeIntent"
    );
  },
  async handle(handlerInput) {
    const shortCode = getSlotValue(handlerInput, "shortCode");

    try {
      // Check if the short code exists in our database
      const params = {
        TableName: "AlexaWalletShortCodes",
        Key: {
          shortCode: shortCode.toUpperCase(),
        },
      };

      const result = await dynamoDB.get(params).promise();

      if (!result.Item) {
        return handlerInput.responseBuilder
          .speak(
            `I couldn't find an address with the short code ${shortCode}. Please check that you've entered it correctly and try again.`
          )
          .getResponse();
      }

      const address = result.Item.address;

      // Store the address in session attributes for the next step
      const sessionAttributes =
        handlerInput.attributesManager.getSessionAttributes();
      sessionAttributes.shortCodeAddress = address;
      sessionAttributes.shortCode = shortCode;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

      return handlerInput.responseBuilder
        .speak(
          `I found the address for short code ${shortCode}. Which contact would you like to associate this with?`
        )
        .reprompt(
          "Please tell me which contact you'd like to associate with this address."
        )
        .getResponse();
    } catch (error) {
      console.log("Error resolving short code:", error);

      return handlerInput.responseBuilder
        .speak(
          `I'm sorry, I had trouble finding the address for short code ${shortCode}. Please try again later.`
        )
        .getResponse();
    }
  },
};

// Associate Address With Contact Intent Handler
const AssociateAddressWithContactIntentHandler = {
  canHandle(handlerInput) {
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "AssociateAddressWithContactIntent" &&
      (sessionAttributes.scannedAddress || sessionAttributes.shortCodeAddress)
    );
  },
  async handle(handlerInput) {
    const userId = handlerInput.requestEnvelope.session.user.userId;
    const contactName = getSlotValue(handlerInput, "contactName");
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();

    // Get the address from one of the possible sources
    const address =
      sessionAttributes.scannedAddress || sessionAttributes.shortCodeAddress;

    if (!address) {
      return handlerInput.responseBuilder
        .speak(
          "I don't have an address to associate. Please scan an address or enter a short code first."
        )
        .getResponse();
    }

    try {
      // Verify the contact exists
      const contactResult = await verifyContactExists(
        handlerInput,
        contactName
      );

      if (contactResult.permissionNeeded) {
        sessionAttributes.pendingPermissionRequest = true;
        sessionAttributes.pendingContactName = contactName;
        // Keep the address in session for after permission is granted
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        return handlerInput.responseBuilder
          .speak(
            "To associate addresses with your contacts, I'll need permission to access your contacts. Would you like to grant this permission?"
          )
          .reprompt(
            "Would you like to grant permission to access your contacts?"
          )
          .getResponse();
      }

      if (!contactResult.exists) {
        return handlerInput.responseBuilder
          .speak(
            `I couldn't find ${contactName} in your contacts. Please make sure the contact exists in your phone and try again.`
          )
          .getResponse();
      }

      // Use the verified contact name
      const verifiedName = contactResult.name;

      // Add the address to the user's address book
      const success = await addAddressToAddressBook(
        userId,
        verifiedName,
        address
      );

      // Clear the session attributes
      delete sessionAttributes.scannedAddress;
      delete sessionAttributes.shortCodeAddress;
      delete sessionAttributes.shortCode;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

      if (success) {
        let source = "";
        if (sessionAttributes.shortCode) {
          source = ` from short code ${sessionAttributes.shortCode}`;
        }

        return handlerInput.responseBuilder
          .speak(
            `I've associated ${verifiedName} with the blockchain address${source}. You can now send transactions to them by saying "send ETH to ${verifiedName}".`
          )
          .getResponse();
      } else {
        return handlerInput.responseBuilder
          .speak(
            "I'm sorry, I couldn't save this address association. Please try again later."
          )
          .getResponse();
      }
    } catch (error) {
      console.log("Error associating address with contact:", error);

      return handlerInput.responseBuilder
        .speak(
          "I'm sorry, there was an error associating this address. Please try again later."
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

// Add a handler to prompt for permissions
const PermissionsRequiredHandler = {
  canHandle(handlerInput) {
    // Check if the request came from a AMAZON.YesIntent after a permissions ask
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "AMAZON.YesIntent" &&
      sessionAttributes.pendingPermissionRequest === true
    );
  },
  handle(handlerInput) {
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    sessionAttributes.pendingPermissionRequest = false;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

    return handlerInput.responseBuilder
      .speak(
        "Great! You'll need to approve the permission request in your Alexa app. Once that's done, you can try adding a contact again."
      )
      .withAskForPermissionsConsentCard(PERMISSIONS)
      .getResponse();
  },
};

// Help Intent Handler
const HelpIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.HelpIntent"
    );
  },
  handle(handlerInput) {
    const speakOutput =
      'You can say things like "check my balance", "send 0.1 ETH to Bob", "scan an address", or "import from short code ABC123". What would you like to do with Vane Wallet?';

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};

// Cancel and Stop Intent Handler
const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      (Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "AMAZON.CancelIntent" ||
        Alexa.getIntentName(handlerInput.requestEnvelope) ===
          "AMAZON.StopIntent")
    );
  },
  handle(handlerInput) {
    const speakOutput = "Goodbye! Your Vane Wallet is safely stored.";

    return handlerInput.responseBuilder.speak(speakOutput).getResponse();
  },
};

// Session Ended Request Handler
const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
      "SessionEndedRequest"
    );
  },
  handle(handlerInput) {
    // Clean up any open sessions or resources here
    return handlerInput.responseBuilder.getResponse();
  },
};

// Error Handler
const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log(`Error handled: ${error.message}`);
    console.log(`Error stack: ${error.stack}`);

    const speakOutput =
      "Sorry, I couldn't understand that command. Please try again.";

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};

// Helper Functions
function getSlotValue(handlerInput, slotName) {
  const request = handlerInput.requestEnvelope.request;
  if (
    request.intent &&
    request.intent.slots &&
    request.intent.slots[slotName]
  ) {
    return request.intent.slots[slotName].value;
  }
  return null;
}

// Skill Builder with ENS handlers removed
exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    CheckNativeBalanceIntentHandler,
    SendTransactionIntentHandler,
    AddAddressIntentHandler,
    ScanAddressIntentHandler,
    CheckScanStatusIntentHandler,
    ImportFromShortCodeIntentHandler,
    AssociateAddressWithContactIntentHandler,
    AnswerIntentHandler,
    PermissionsRequiredHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .withApiClient(new Alexa.DefaultApiClient())
  .lambda();
