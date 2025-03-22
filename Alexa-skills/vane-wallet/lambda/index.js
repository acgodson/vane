require("dotenv").config();

const Alexa = require("ask-sdk-core");
const AWS = require("aws-sdk");
const ddbAdapter = require("ask-sdk-dynamodb-persistence-adapter");

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

// Import the Vane AI agent handler
const { VaneagentIntentHandler } = require("./handlers/vane-agentHandler");

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
    VaneagentIntentHandler,
    AnswerIntentHandler,
    PermissionsRequiredHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .withPersistenceAdapter(
    new ddbAdapter.DynamoDbPersistenceAdapter({
      tableName: process.env.DYNAMODB_PERSISTENCE_TABLE_NAME,
      createTable: false,
      dynamoDBClient: new AWS.DynamoDB({
        apiVersion: "latest",
        region: process.env.DYNAMODB_PERSISTENCE_REGION,
      }),
    })
  )
  .withApiClient(new Alexa.DefaultApiClient())
  .lambda();
