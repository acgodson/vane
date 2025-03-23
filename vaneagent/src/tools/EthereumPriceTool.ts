import AgentKit from "../core/agent-kit.js";
    
  /**
   * This tool retrieves the current price of Ethereum from the CoinGecko API, allowing users to access real-time cryptocurrency data without the need for an API key.
   */
  AgentKit.tool("EthereumPriceTool", {
    description: "This tool retrieves the current price of Ethereum from the CoinGecko API, allowing users to access real-time cryptocurrency data without the need for an API key.",
    parameters: {
      date: {
        type: "string",
        description: "The date and time when the request is made, used for logging purposes."
      }
    },
    execute: async ({ date }) => {
      try {
        // Fetch the current price of Ethereum from CoinGecko API
      const apiUrl = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd';
      const response = await fetch(apiUrl);
      const data = await response.json();
      
      // Log the date parameter for tracking
      console.log(`Request made at: ${date}`);
      
      // Extract the Ethereum price
      const ethereumPrice = data.ethereum.usd;
      
      // Return the result
      return {
        status: "success",
        data: ethereumPrice,
        message: `Successfully retrieved the current price of Ethereum: $${ethereumPrice}`
      };
      } catch (error) {
        return {
          status: "error",
          message: `Error in EthereumPriceTool: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  });
  