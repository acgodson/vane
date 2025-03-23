import AgentKit from "../core/agent-kit.js";

/**
 * An agent that provides the latest Ethereum price in US dollars.
 */
AgentKit.agent("EthereumPriceAgent", {
  description: "An agent that provides the latest Ethereum price in US dollars.",
  model: "gpt-4o",
  instructions: [
    "Fetch Latest Price: Retrieve the current Ethereum price from the EthereumPriceTool whenever requested.",
    "Format Response: Present the Ethereum price in a user-friendly format, always in US dollars, including currency and timestamp."
  ],
  tools: [
    "EthereumPriceTool"
  ],
  temperature: 0.3,
});
