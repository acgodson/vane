//utils/helpers.js

require("dotenv").config();

const AWS = require("aws-sdk");
const axios = require("axios");

const dynamoDB = new AWS.DynamoDB.DocumentClient({
  tableName: process.env.DYNAMODB_PERSISTENCE_TABLE_NAME,
  region: process.env.DYNAMODB_PERSISTENCE_REGION,
});

const PRIVY_API_URL = "https://api.privy.io/v1";

// Hard-coded trivia questions. NOT FOR PRODUCTION USE
const TRIVIA_QUESTIONS = [
  {
    question: "What was the name of your first pet?",
    answer: "fluffy",
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

async function getUserWalletId(handlerInput) {
  try {
    const attributesManager = handlerInput.attributesManager;
    const attributes =
      (await attributesManager.getPersistentAttributes()) || {};

    if (attributes.walletId) {
      return attributes.walletId;
    } else {
      throw new Error("User wallet not found");
    }
  } catch (error) {
    console.error("Error retrieving user wallet ID:", error);
    throw error;
  }
}

async function makePrivyRequest(
  endpoint,
  method,
  data = null,
  walletId = null
) {
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

    if (walletId && endpoint.includes("<wallet_id>")) {
      finalEndpoint = endpoint.replace("<wallet_id>", walletId);
    }

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

async function createDefaultWalletPolicy(userId) {
  try {
    const policyResponse = await makePrivyRequest("/policies", "POST", {
      version: "1.0",
      name: `Vane Wallet Policy`,
      chain_type: "ethereum",
      method_rules: [
        {
          method: "eth_sendTransaction",
          rules: [
            {
              name: "Allow zero-value transactions",
              conditions: [
                {
                  field_source: "ethereum_transaction",
                  field: "value",
                  operator: "eq",
                  value: "0",
                },
              ],
              action: "ALLOW",
            },
            {
              name: "Block ERC20 transfers",
              conditions: [
                {
                  field_source: "ethereum_calldata",
                  field: "transfer.amount",
                  operator: "eq",
                  value: "0",
                  abi: [
                    {
                      inputs: [
                        {
                          internalType: "address",
                          name: "to",
                          type: "address",
                        },
                        {
                          internalType: "uint256",
                          name: "amount",
                          type: "uint256",
                        },
                      ],
                      name: "transfer",
                      outputs: [
                        {
                          internalType: "bool",
                          name: "",
                          type: "bool",
                        },
                      ],
                      stateMutability: "nonpayable",
                      type: "function",
                    },
                  ],
                },
              ],
              action: "ALLOW",
            },
          ],
        },
      ],
      default_action: "DENY",
    });

    return policyResponse.id;
  } catch (error) {
    console.error("Error creating default wallet policy:", error);
    throw error;
  }
}

async function allowAddressInPolicy(policyId, contactName, contactAddress) {
  try {
    // First get the current policy
    const currentPolicy = await makePrivyRequest(
      `/policies/${policyId}`,
      "GET"
    );

    // Extract the existing method rules
    const methodRules = currentPolicy.method_rules || [];

    // Find the eth_sendTransaction method rule
    const sendTxRule = methodRules.find(
      (rule) => rule.method === "eth_sendTransaction"
    );

    if (!sendTxRule) {
      throw new Error("eth_sendTransaction rule not found in policy");
    }

    // Add a new rule to allow transactions to this contact's address
    sendTxRule.rules.unshift({
      name: `Allow transfers to ${contactName}`,
      conditions: [
        {
          field_source: "ethereum_transaction",
          field: "to",
          operator: "eq",
          value: contactAddress,
        },
      ],
      action: "ALLOW",
    });

    // Update the policy
    await makePrivyRequest(`/policies/${policyId}`, "PATCH", {
      method_rules: methodRules,
    });

    return true;
  } catch (error) {
    console.error(`Error allowing address ${contactAddress} in policy:`, error);
    throw error;
  }
}

async function getWalletPolicyId(handlerInput) {
  try {
    const walletId = await getUserWalletId(handlerInput);
    const walletData = await makePrivyRequest(`/wallets/${walletId}`, "GET");

    // Check if there's at least one policy ID
    if (walletData.policy_ids && walletData.policy_ids.length > 0) {
      return walletData.policy_ids[0];
    } else {
      console.error(`No policy IDs found for wallet: ${walletId}`);
      throw new Error("Wallet policy not found");
    }
  } catch (error) {
    console.error("Error retrieving wallet policy ID:", error);
    throw error;
  }
}

async function getSecrets(secretName) {
  console.log(
    `Loading privy secrets for ${secretName} from local environment variables`
  );
  const secretMappings = {
    PrivyWalletCredentials: {
      appId: process.env.PRIVY_APP_ID,
      appSecret: process.env.PRIVY_APP_SECRET,
    },
  };
  // Return the mapped secrets if they exist
  if (secretMappings[secretName]) {
    return secretMappings[secretName];
  } else {
    throw new Error(
      `Secret mapping for ${secretName} not found in local environment`
    );
  }
}

async function getUserTrivia(userId) {
  try {
    // In a production version, we would retrieve from DynamoDB
    // For the hackathon demo, we are using hard-coded questions

    // Get random question from the array
    const randomIndex = Math.floor(Math.random() * TRIVIA_QUESTIONS.length);
    return TRIVIA_QUESTIONS[randomIndex].question;
  } catch (error) {
    console.error("Error getting trivia:", error);
    return TRIVIA_QUESTIONS[0].question; // Fallback to first question
  }
}

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

async function getAddressBook(handlerInput) {
  try {
    const attributesManager = handlerInput.attributesManager;
    const attributes =
      (await attributesManager.getPersistentAttributes()) || {};

    return attributes.addressBook || {};
  } catch (error) {
    console.error("Error retrieving address book:", error);
    return {};
  }
}

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
  getSlotValue,
  getWalletPolicyId,
  createDefaultWalletPolicy,
  allowAddressInPolicy,
  TRIVIA_QUESTIONS,
  dynamoDB,
};
