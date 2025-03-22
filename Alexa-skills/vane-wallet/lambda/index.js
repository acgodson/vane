const Alexa = require("ask-sdk-core");

// Import handlers and helpers
const {
  LaunchRequestHandler,
  HelpIntentHandler,
  CancelAndStopIntentHandler,
  SessionEndedRequestHandler,
  ErrorHandler,
} = require("./handlers/general");

const {
  CheckNativeBalanceIntentHandler,
  SendTransactionIntentHandler,
  AnswerIntentHandler,
} = require("./handlers/transaction");

const {
  CreateWalletIntentHandler,
  ShowWalletAddressIntentHandler,
  AddAddressIntentHandler,
  ShowContactAddressIntentHandler,
  PermissionsRequiredHandler,
} = require("./handlers/address");

// Contact permission constants
const PERMISSIONS = [
  "alexa::profile:name:read",
  "alexa::profile:email:read",
  "alexa::profile:mobile_number:read",
  "alexa::profile:given_name:read",
];

// Skill Builder with all handlers
exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    CheckNativeBalanceIntentHandler,
    SendTransactionIntentHandler,
    CreateWalletIntentHandler,
    ShowWalletAddressIntentHandler,
    AddAddressIntentHandler,
    ShowContactAddressIntentHandler,
    AnswerIntentHandler,
    PermissionsRequiredHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .withApiClient(new Alexa.DefaultApiClient())
  .lambda();
