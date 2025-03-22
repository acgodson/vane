// Placeholder index file for vane-agent
// This file is always  replaced during agent deployment

class PlaceholderAgent {
  constructor() {
    this.name = "PlaceholderAgent";
  }

  async generate(options) {
    console.log("Placeholder agent received request:", options);
    return {
      type: "assistant",
      value:
        "This is a placeholder agent. Please deploy a real agent using the Vane CLI.",
    };
  }
}

class PlaceholderTool {
  constructor() {
    this.name = "PlaceholderTool";
  }
}

const placeholderAgent = new PlaceholderAgent();

export const placeholderSolverAgent = placeholderAgent;

const output = {
  placeholderSolverAgent,
  getAllAgents: () => ({ PlaceholderAgent: placeholderAgent }),
  getAllTools: () => ({ PlaceholderTool: new PlaceholderTool() }),
};

export default output;
