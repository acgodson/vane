// src/websocket/server.ts
import { WebSocketServer, WebSocket } from "ws";
import http from "http";

// Define types for our config and messages
interface VaneConfig {
  projectName: string;
  projectPath: string;
  memory?: {
    conversation: any[];
    [key: string]: any;
  };
  [key: string]: any;
}

interface WebSocketMessage {
  type: string;
  content: any;
}

/**
 * Creates a standalone WebSocket server for CLI/browser communication
 * @param cliMessageProcessor Function to process messages (using the actual CLI integration)
 * @param port Port to run the WebSocket server on
 * @param config Vane configuration
 * @returns WebSocket controller
 */
export function createWebSocketServer(
  cliMessageProcessor: (message: string) => Promise<string>,
  port: number = 8080,
  config: VaneConfig
) {
  // Create a new HTTP server
  const server = http.createServer();

  // Create WebSocket server attached to the HTTP server
  const wss = new WebSocketServer({ server });

  // Store connected clients
  const clients = new Set<WebSocket>();

  // Handle WebSocket connections
  wss.on("connection", (ws: WebSocket) => {
    console.log("🌐 Browser client connected");
    clients.add(ws);

    // Send project info to the client
    sendMessage(ws, "system", `Connected to project: ${config.projectName}`);

    // Load conversation history
    if (config.memory && config.memory.conversation) {
      sendMessage(ws, "history", config.memory.conversation);
    }

    // Handle messages from browser
    ws.on("message", async (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;

        if (message.type === "user-message") {
          // Mirror message to CLI
          console.log(`🌐 Browser: ${message.content}`);

          // Process the message using the actual CLI message processor
          const response = await cliMessageProcessor(message.content);

          // Send response back to the browser
          sendMessage(ws, "assistant", response);
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
        sendMessage(
          ws,
          "error",
          `Error processing message: ${(error as Error).message}`
        );
      }
    });

    // Handle disconnection
    ws.on("close", () => {
      console.log("🌐 Browser client disconnected");
      clients.delete(ws);
    });
  });

  // Helper to send a typed message to a WebSocket client
  function sendMessage(ws: WebSocket, type: string, content: any) {
    ws.send(JSON.stringify({ type, content }));
  }

  // Start the server
  server.listen(port, () => {
    console.log(`
    🌐 WebSocket server running on port ${port}
    Open your browser interface and connect to use the chat
    `);
  });

  return {
    sendToAll: (type: string, content: any) => {
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          sendMessage(client, type, content);
        }
      }
    },
    getConnectedClients: () => clients.size,
    close: () => {
      server.close();
    },
    getPort: () => port,
  };
}

/**
 * Create a console wrapper that mirrors output to WebSocket
 */
export function createMirroredConsole(wsController: any) {
  // Store original console methods
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
  };

  // Create wrapped functions
  return {
    log: (...args: any[]) => {
      // Call original console
      originalConsole.log(...args);
      // Mirror to WebSocket clients
      const message = args
        .map((arg) =>
          typeof arg === "object" ? JSON.stringify(arg) : String(arg)
        )
        .join(" ");
      wsController.sendToAll("console", message);
    },

    error: (...args: any[]) => {
      originalConsole.error(...args);
      const message = args
        .map((arg) =>
          typeof arg === "object" ? JSON.stringify(arg) : String(arg)
        )
        .join(" ");
      wsController.sendToAll("console", `ERROR: ${message}`);
    },

    warn: (...args: any[]) => {
      originalConsole.warn(...args);
      const message = args
        .map((arg) =>
          typeof arg === "object" ? JSON.stringify(arg) : String(arg)
        )
        .join(" ");
      wsController.sendToAll("console", `WARNING: ${message}`);
    },
  };
}
