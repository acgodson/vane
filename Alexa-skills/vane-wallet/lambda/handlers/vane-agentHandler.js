// Default placeholder for Vane agent handler
// This file will be replaced during agent deployment
const Alexa = require("ask-sdk-core");
const { queryAgent } = require("../utils/vane-agent");

/**
 * Handler for Vane AI agent queries through the "lookup" command
 */
const VaneagentIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "VaneagentIntent"
    );
  },
  async handle(handlerInput) {
    // Get the user's query from the slot
    const query = Alexa.getSlotValue(handlerInput.requestEnvelope, "query");

    if (!query) {
      return handlerInput.responseBuilder
        .speak(
          "I didn't catch what you wanted to look up. Could you try again?"
        )
        .reprompt("What would you like to look up?")
        .getResponse();
    }

    try {
      console.log("VaneagentIntentHandler received query:", query);

      // Query the agent
      const response = await queryAgent(query, {
        userId: handlerInput.requestEnvelope.session.user.userId,
      });

      console.log("Agent response:", response);

      return handlerInput.responseBuilder
        .speak(response)
        .reprompt("Is there anything else you would like to look up?")
        .getResponse();
    } catch (error) {
      console.error("Error in VaneagentIntentHandler:", error);

      return handlerInput.responseBuilder
        .speak(
          "I had trouble looking up that information right now. Please try again later."
        )
        .getResponse();
    }
  },
};

module.exports = VaneagentIntentHandler;