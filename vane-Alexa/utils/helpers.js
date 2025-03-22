//utils/helpers.js
const AWS = require("aws-sdk");
const axios = require("axios");

// AWS services setup
const secretsManager = new AWS.SecretsManager();
const dynamoDB = new AWS.DynamoDB.DocumentClient();

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

async function getUserWalletId(userId) {
  try {
    const params = {
      TableName: "AlexaWalletUsers",
      Key: { userId: userId },
    };

    const result = await dynamoDB.get(params).promise();

    if (result.Item && result.Item.walletId) {
      return result.Item.walletId;
    } else {
      console.error(`No wallet ID found for user: ${userId}`);
      throw new Error("User wallet not found");
    }
  } catch (error) {
    console.error("Error retrieving user wallet ID:", error);
    throw error;
  }
}

// Helper function to make authenticated requests to Privy API
async function makePrivyRequest(endpoint, method, data = null, userId = null) {
  try {
    // Get secrets for Privy authentication
    const secrets = await getSecrets("PrivyWalletCredentials");
    const { appId, appSecret } = secrets;

    // Create auth credentials for Basic Auth
    const auth = {
      username: appId,
      password: appSecret,
    };

    let finalEndpoint = endpoint;

    const walletId = await getUserWalletId(userId);
    finalEndpoint = endpoint.replace("<wallet_id>", walletId);

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

// Example: Updating addAddressToAddressBook to pass userId
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
    // Pass the userId to updatePrivyPolicy
    await updatePrivyPolicy(address, userId);

    return true;
  } catch (error) {
    console.error("Error adding address to book:", error);
    return false;
  }
}

// Helper function to update Privy policy to allow transactions to an address
async function updatePrivyPolicy(newAddress, userId) {
  try {
    // Get secrets for Privy authentication
    const secrets = await getSecrets("PrivyWalletCredentials");
    const { policyId } = secrets;

    // First get the current policy
    const currentPolicy = await makePrivyRequest(
      `/policies/${policyId}`,
      "GET",
      null,
      userId
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
      await makePrivyRequest(
        `/policies/${policyId}`,
        "PATCH",
        {
          method_rules: methodRules,
        },
        userId
      );
    }

    return true;
  } catch (error) {
    console.error("Error updating policy:", error);
    return false;
  }
}

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

module.exports = {
  getSecrets,
  getUserWalletId,
  makePrivyRequest,
  getUserTrivia,
  verifyUserTrivia,
  getAddressBook,
  verifyContactExists,
  addAddressToAddressBook,
  updatePrivyPolicy,
  getSlotValue,
  TRIVIA_QUESTIONS,
};
