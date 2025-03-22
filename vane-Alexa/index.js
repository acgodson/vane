const Alexa = require("ask-sdk-core");
const AWS = require("aws-sdk");

// Import handlers and helpers
const {
  LaunchRequestHandler,
  HelpIntentHandler,
  CancelAndStopIntentHandler,
  SessionEndedRequestHandler,
  ErrorHandler,
} = require("./handlers/generalHandlers");

const {
  CheckNativeBalanceIntentHandler,
  SendTransactionIntentHandler,
  AnswerIntentHandler,
} = require("./handlers/transactionHandlers");

const {
  AddAddressIntentHandler,
  ScanAddressIntentHandler,
  CheckScanStatusIntentHandler,
  ImportFromShortCodeIntentHandler,
  AssociateAddressWithContactIntentHandler,
  PermissionsRequiredHandler,
} = require("./handlers/addressHandlers");

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
