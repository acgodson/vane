import {
  dynamoDB,
  getAddressBook,
  getUserWalletId,
  createDefaultWalletPolicy,
} from "../utils/helpers";

// handlers/address.js
const Alexa = require("ask-sdk-core");
const { getSlotValue, makePrivyRequest } = require("../utils/helpers");

const SKILL_ID = "amzn1.ask.skill.b881427a-cf3d-4ea4-8ddc-c4f5f2d61d9c";
// Contact permission constants
const PERMISSIONS = [
  "alexa::profile:name:read",
  "alexa::profile:email:read",
  "alexa::profile:mobile_number:read",
  "alexa::profile:given_name:read",
];

// Function to generate appropriate card URL
function generateCardUrl(action, userId, params = {}) {
  const baseUrl = "https://vanewallet.com";

  switch (action) {
    case "create":
      return `${baseUrl}/setup?userId=${userId}&action=create`;

    case "view":
      return `${baseUrl}/view?userId=${userId}`;

    case "addContact":
      let url = `${baseUrl}/addcontact?userId=${userId}`;

      // Add optional parameters
      if (params.contact)
        url += `&contact=${encodeURIComponent(params.contact)}`;
      if (params.address)
        url += `&address=${encodeURIComponent(params.address)}`;
      // Add walletId parameter support
      if (params.walletId)
        url += `&walletId=${encodeURIComponent(params.walletId)}`;

      return url;

    case "viewContact":
      return `${baseUrl}/viewcontact?userId=${userId}${
        params.contact ? `&contact=${encodeURIComponent(params.contact)}` : ""
      }`;

    default:
      return `${baseUrl}/dashboard?userId=${userId}`;
  }
}

// Create Wallet Intent Handler - Updated to use the utility function
const CreateWalletIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "CreateWalletIntent"
    );
  },
  async handle(handlerInput) {
    try {
      const userId = handlerInput.requestEnvelope.session.user.userId;

      // Check if user already has a wallet
      try {
        const existingWalletId = await getUserWalletId(userId);
        if (existingWalletId) {
          // User already has a wallet
          const walletData = await makePrivyRequest(
            `/wallets/${existingWalletId}`,
            "GET"
          );
          const ethAddress = walletData.address;

          // Generate QR code for the existing wallet address
          const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
            ethAddress
          )}`;

          return handlerInput.responseBuilder
            .speak(
              "You already have a wallet set up. I've sent your wallet address to the Alexa app."
            )
            .withStandardCard(
              "Your Existing Wallet",
              `Your wallet is already set up with address:\n\n${ethAddress}`,
              qrCodeUrl,
              qrCodeUrl
            )
            .getResponse();
        }
      } catch (error) {
        // If error is "User wallet not found", continue to create one
        if (error.message !== "User wallet not found") {
          throw error; // For other errors, propagate them
        }
      }

      // 1. Create a default wallet policy using our utility function
      const policyId = await createDefaultWalletPolicy(userId);

      // 2. Create a wallet with the policy attached
      const createWalletData = await makePrivyRequest("/wallets", "POST", {
        chain: "ethereum", // Using Sepolia testnet
        policy_ids: [policyId],
      });

      const walletId = createWalletData.id;
      const ethAddress = createWalletData.address;

      // 3. Store wallet ID in DynamoDB
      const params = {
        TableName: `AlexaWalletUsers-${SKILL_ID}`,
        Item: {
          userId: userId,
          walletId: walletId,
          policyId: policyId,
          address: ethAddress,
          createdAt: new Date().toISOString(),
        },
      };

      await dynamoDB.put(params).promise();

      // Generate QR code for the new wallet address
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
        ethAddress
      )}`;

      return handlerInput.responseBuilder
        .speak(
          "Great! I've created your Ethereum wallet on the Sepolia testnet. I've sent the wallet address to the Alexa app."
        )
        .withStandardCard(
          "Your New Wallet",
          `Your new Ethereum wallet address is:\n\n${ethAddress}\n\nYou can share this address with others who want to send you funds.`,
          qrCodeUrl,
          qrCodeUrl
        )
        .getResponse();
    } catch (error) {
      console.error("Error creating wallet:", error);
      return handlerInput.responseBuilder
        .speak(
          "I'm having trouble creating your wallet right now. Please try again later."
        )
        .getResponse();
    }
  },
};

// Show Wallet Address Intent Handler
const ShowWalletAddressIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "ShowWalletAddressIntent"
    );
  },
  async handle(handlerInput) {
    try {
      const userId = handlerInput.requestEnvelope.session.user.userId;

      // Get wallet ID using helper function
      const walletId = await getUserWalletId(userId);

      // Fetch wallet data from Privy API
      const walletData = await makePrivyRequest(`/wallets/${walletId}`, "GET");

      // Extract the Ethereum address from wallet data
      const ethAddress = walletData.address;

      if (!ethAddress) {
        throw new Error("No wallet address found");
      }

      // Generate QR code for the wallet address
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
        ethAddress
      )}`;

      return handlerInput.responseBuilder
        .speak(
          "I've sent your Ethereum wallet address to the Alexa app. You can share this address with others who want to send you funds."
        )
        .withStandardCard(
          "Your Wallet Address",
          `${ethAddress}\n\nShare this address or have others scan the QR code to send you Ethereum.`,
          qrCodeUrl,
          qrCodeUrl
        )
        .getResponse();
    } catch (error) {
      console.error("Error retrieving wallet address:", error);

      if (error.message === "User wallet not found") {
        return handlerInput.responseBuilder
          .speak(
            "I couldn't find your wallet. Please set up your wallet first by saying 'create wallet'."
          )
          .reprompt("Would you like to create a wallet now?")
          .getResponse();
      } else {
        return handlerInput.responseBuilder
          .speak(
            "I'm having trouble accessing your wallet address right now. Please try again later."
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
    try {
      const userId = handlerInput.requestEnvelope.session.user.userId;
      const nickname = getSlotValue(handlerInput, "nickname");

      // Check if user has a wallet
      try {
        const walletId = await getUserWalletId(userId);

        // Generate URL with needed parameters
        const contactParam = nickname ? nickname : "";
        const cardUrl = generateCardUrl("addContact", userId, {
          contact: contactParam,
          walletId: walletId, // Include walletId as a parameter
        });

        // Generate QR code for the URL
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
          cardUrl
        )}`;

        // Customize response based on whether a contact name was provided
        let speakOutput;
        let cardTitle;
        let cardContent;

        if (nickname) {
          speakOutput = `I've sent a QR code to the Alexa app where you can add ${nickname}'s wallet address.`;
          cardTitle = `Add ${nickname}'s Wallet Address`;
          cardContent = `Scan this QR code or visit this link to add ${nickname}'s wallet address to your Vane Wallet:\n\n${cardUrl}`;
        } else {
          speakOutput =
            "I've sent a QR code to the Alexa app where you can add a contact's wallet address.";
          cardTitle = "Add Wallet Address";
          cardContent = `Scan this QR code or visit this link to add a wallet address to your Vane Wallet:\n\n${cardUrl}`;
        }

        return handlerInput.responseBuilder
          .speak(speakOutput)
          .withStandardCard(cardTitle, cardContent, qrCodeUrl, qrCodeUrl)
          .getResponse();
      } catch (error) {
        return handlerInput.responseBuilder
          .speak(
            "You need to set up a wallet first before adding contacts. Would you like to create a wallet?"
          )
          .reprompt("Would you like to create a wallet now?")
          .getResponse();
      }
    } catch (error) {
      console.error("Error in AddAddressIntent:", error);
      return handlerInput.responseBuilder
        .speak(
          "I'm having trouble processing your request right now. Please try again later."
        )
        .getResponse();
    }
  },
};

// Show Contact Wallet Address Intent Handler
const ShowContactAddressIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "ShowContactAddressIntent"
    );
  },
  async handle(handlerInput) {
    try {
      const userId = handlerInput.requestEnvelope.session.user.userId;
      const contactName = getSlotValue(handlerInput, "contactName");

      if (!contactName) {
        return handlerInput.responseBuilder
          .speak(
            "I need a contact name to show their wallet address. Please try again with a contact name."
          )
          .reprompt("Which contact's wallet address would you like to see?")
          .getResponse();
      }

      // Get the address book using helper function
      const addressBook = await getAddressBook(userId);

      // Find the contact in the address book (case insensitive search)
      const contactKey = Object.keys(addressBook).find(
        (key) => key.toLowerCase() === contactName.toLowerCase()
      );

      if (!contactKey || !addressBook[contactKey]) {
        return handlerInput.responseBuilder
          .speak(
            `I couldn't find ${contactName} in your address book. You can add them by saying 'add contact ${contactName}'.`
          )
          .reprompt(
            `Would you like to add ${contactName} to your address book?`
          )
          .getResponse();
      }

      const contactAddress = addressBook[contactKey];

      // Generate QR code for the contact's address
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
        contactAddress
      )}`;

      return handlerInput.responseBuilder
        .speak(`I've sent ${contactName}'s wallet address to the Alexa app.`)
        .withStandardCard(
          `${contactName}'s Wallet Address`,
          `${contactAddress}\n\nUse this address to send Ethereum to ${contactName}.`,
          qrCodeUrl,
          qrCodeUrl
        )
        .getResponse();
    } catch (error) {
      console.error("Error retrieving contact address:", error);
      return handlerInput.responseBuilder
        .speak(
          "I'm having trouble accessing your address book right now. Please try again later."
        )
        .getResponse();
    }
  },
};

// Add a handler to prompt for permissions if needed
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

// Export handlers
module.exports = {
  generateCardUrl,
  CreateWalletIntentHandler,
  ShowWalletAddressIntentHandler,
  AddAddressIntentHandler,
  ShowContactAddressIntentHandler,
  PermissionsRequiredHandler,
};
