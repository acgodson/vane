// handlers/address.js
const Alexa = require("ask-sdk-core");
const { getSlotValue } = require("../utils/helpers");

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

      return url;

    case "viewContact":
      return `${baseUrl}/viewcontact?userId=${userId}${
        params.contact ? `&contact=${encodeURIComponent(params.contact)}` : ""
      }`;

    default:
      return `${baseUrl}/dashboard?userId=${userId}`;
  }
}

// Create Wallet Intent Handler
const CreateWalletIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "CreateWalletIntent"
    );
  },
  handle(handlerInput) {
    const userId = handlerInput.requestEnvelope.session.user.userId;
    const cardUrl = generateCardUrl("create", userId);

    return handlerInput.responseBuilder
      .speak(
        "I've sent a link to the Alexa app where you can set up your new wallet."
      )
      .withStandardCard(
        "Vane Wallet Setup",
        "Tap the link below to create your new Ethereum wallet.",
        null,
        cardUrl
      )
      .getResponse();
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
  handle(handlerInput) {
    const userId = handlerInput.requestEnvelope.session.user.userId;
    const cardUrl = generateCardUrl("view", userId);

    return handlerInput.responseBuilder
      .speak("I've sent your wallet address to the Alexa app.")
      .withStandardCard(
        "Your Wallet Address",
        "Tap the link below to view or copy your wallet address.",
        null,
        cardUrl
      )
      .getResponse();
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
  handle(handlerInput) {
    const userId = handlerInput.requestEnvelope.session.user.userId;
    const nickname = getSlotValue(handlerInput, "nickname");

    // Generate URL with contact parameter if provided
    const contactParam = nickname ? nickname : "";
    const cardUrl = generateCardUrl("addContact", userId, {
      contact: contactParam,
    });

    // Customize response based on whether a contact name was provided
    let speakOutput;
    let cardTitle;
    let cardContent;

    if (nickname) {
      speakOutput = `I've sent a link to the Alexa app where you can add ${nickname}'s wallet address.`;
      cardTitle = `Add ${nickname}'s Wallet Address`;
      cardContent = `Use this page to add ${nickname}'s wallet address to your Vane Wallet.`;
    } else {
      speakOutput =
        "I've sent a link to the Alexa app where you can add a contact's wallet address.";
      cardTitle = "Add Wallet Address";
      cardContent =
        "Use this page to add a wallet address to your Vane Wallet.";
    }

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .withStandardCard(cardTitle, cardContent, null, cardUrl)
      .getResponse();
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
  handle(handlerInput) {
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

    const cardUrl = generateCardUrl("viewContact", userId, {
      contact: contactName,
    });

    return handlerInput.responseBuilder
      .speak(`I've sent ${contactName}'s wallet address to the Alexa app.`)
      .withStandardCard(
        `${contactName}'s Wallet Address`,
        `Here is the wallet address for ${contactName}.`,
        null,
        cardUrl
      )
      .getResponse();
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
