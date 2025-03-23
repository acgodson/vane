// utils/comprehensive-polyfill.js

function setupPolyfills() {
  console.log("Setting up comprehensive Web API polyfills...");

  // 1. Web Streams API
  if (typeof TransformStream === "undefined") {
    try {
      const streams = require("web-streams-polyfill/ponyfill");
      global.ReadableStream = global.ReadableStream || streams.ReadableStream;
      global.WritableStream = global.WritableStream || streams.WritableStream;
      global.TransformStream =
        global.TransformStream || streams.TransformStream;
      global.ByteLengthQueuingStrategy =
        global.ByteLengthQueuingStrategy || streams.ByteLengthQueuingStrategy;
      global.CountQueuingStrategy =
        global.CountQueuingStrategy || streams.CountQueuingStrategy;
      console.log("✓ Web Streams API polyfilled");
    } catch (err) {
      console.error("✗ Failed to polyfill Web Streams API:", err.message);
    }
  }

  // 2. Fetch API
  if (typeof fetch === "undefined") {
    try {
      const nodeFetch = require("node-fetch");
      global.fetch = nodeFetch;
      global.Headers = nodeFetch.Headers;
      global.Request = nodeFetch.Request;
      global.Response = nodeFetch.Response;
      console.log("✓ Fetch API polyfilled with node-fetch");
    } catch (err) {
      console.error("✗ Failed to polyfill Fetch API:", err.message);
    }
  }

  // 3. structuredClone
  if (typeof structuredClone === "undefined") {
    try {
      // Method 1: Use structured-clone package if available
      try {
        const structuredCloneLib = require("structured-clone");
        global.structuredClone = structuredCloneLib;
        console.log(
          "✓ structuredClone polyfilled with structured-clone package"
        );
      } catch (err) {
        // Method 2: Use a JSON-based implementation
        global.structuredClone = function simpleStructuredClone(obj) {
          return JSON.parse(JSON.stringify(obj));
        };
        console.log(
          "✓ structuredClone polyfilled with JSON-based implementation"
        );
      }
    } catch (err) {
      console.error("✗ Failed to polyfill structuredClone:", err.message);
    }
  }

  // 4. AbortController and AbortSignal
  if (typeof AbortController === "undefined") {
    try {
      const {
        AbortController: NodeAbortController,
        AbortSignal: NodeAbortSignal,
      } = require("abort-controller");
      global.AbortController = NodeAbortController;
      global.AbortSignal = NodeAbortSignal;
      console.log("✓ AbortController polyfilled");
    } catch (err) {
      console.error("✗ Failed to polyfill AbortController:", err.message);
    }
  }

  // 5. URL and URLSearchParams (should be available in Node.js 10+, but just in case)
  if (typeof URL === "undefined" || typeof URLSearchParams === "undefined") {
    try {
      const {
        URL: NodeURL,
        URLSearchParams: NodeURLSearchParams,
      } = require("url");
      global.URL = global.URL || NodeURL;
      global.URLSearchParams = global.URLSearchParams || NodeURLSearchParams;
      console.log("✓ URL and URLSearchParams polyfilled");
    } catch (err) {
      console.error("✗ Failed to polyfill URL/URLSearchParams:", err.message);
    }
  }

  // 6. TextEncoder and TextDecoder (should be available in Node.js 11+, but just in case)
  if (
    typeof TextEncoder === "undefined" ||
    typeof TextDecoder === "undefined"
  ) {
    try {
      const {
        TextEncoder: NodeTextEncoder,
        TextDecoder: NodeTextDecoder,
      } = require("util");
      global.TextEncoder = global.TextEncoder || NodeTextEncoder;
      global.TextDecoder = global.TextDecoder || NodeTextDecoder;
      console.log("✓ TextEncoder/TextDecoder polyfilled");
    } catch (err) {
      console.error(
        "✗ Failed to polyfill TextEncoder/TextDecoder:",
        err.message
      );
    }
  }

  // 7. Event, EventTarget and CustomEvent
  if (typeof Event === "undefined" || typeof EventTarget === "undefined") {
    try {
      const eventsModule = require("events");

      if (typeof Event === "undefined") {
        global.Event = class Event {
          constructor(type, options = {}) {
            this.type = type;
            this.bubbles = !!options.bubbles;
            this.cancelable = !!options.cancelable;
            this.composed = !!options.composed;
            this.timeStamp = Date.now();
          }
        };
      }

      if (typeof CustomEvent === "undefined") {
        global.CustomEvent = class CustomEvent extends Event {
          constructor(type, options = {}) {
            super(type, options);
            this.detail = options.detail || null;
          }
        };
      }

      if (typeof EventTarget === "undefined") {
        global.EventTarget = class EventTarget extends (
          eventsModule.EventEmitter
        ) {
          addEventListener(type, listener) {
            this.on(type, listener);
          }

          removeEventListener(type, listener) {
            this.off(type, listener);
          }

          dispatchEvent(event) {
            this.emit(event.type, event);
            return !event.defaultPrevented;
          }
        };
      }

      console.log("✓ Event/EventTarget/CustomEvent polyfilled");
    } catch (err) {
      console.error("✗ Failed to polyfill Event system:", err.message);
    }
  }

  // 8. Promise.allSettled (available in Node.js 12.9.0+)
  if (typeof Promise.allSettled !== "function") {
    Promise.allSettled = function allSettled(promises) {
      return Promise.all(
        promises.map((promise) =>
          Promise.resolve(promise)
            .then((value) => ({ status: "fulfilled", value }))
            .catch((reason) => ({ status: "rejected", reason }))
        )
      );
    };
    console.log("✓ Promise.allSettled polyfilled");
  }

  // 9. Promise.any (available in Node.js 15.0.0+)
  if (typeof Promise.any !== "function") {
    Promise.any = function any(promises) {
      return new Promise((resolve, reject) => {
        if (promises.length === 0) {
          reject(new AggregateError([], "All promises were rejected"));
          return;
        }

        let errors = [];
        let pending = promises.length;

        promises.forEach((promise) => {
          Promise.resolve(promise)
            .then((value) => {
              resolve(value);
            })
            .catch((error) => {
              errors.push(error);
              pending--;
              if (pending === 0) {
                reject(
                  new AggregateError(errors, "All promises were rejected")
                );
              }
            });
        });
      });
    };
    console.log("✓ Promise.any polyfilled");
  }

  // 10. AggregateError (for Promise.any, available in Node.js 15.0.0+)
  if (typeof AggregateError === "undefined") {
    global.AggregateError = class AggregateError extends Error {
      constructor(errors, message) {
        super(message);
        this.name = "AggregateError";
        this.errors = errors;
      }
    };
    console.log("✓ AggregateError polyfilled");
  }

  // 11. globalThis (available in Node.js 12.0.0+)
  if (typeof globalThis === "undefined") {
    global.globalThis = global;
    console.log("✓ globalThis polyfilled");
  }

  console.log("Completed setting up Web API polyfills");
}

// Run the polyfills immediately
setupPolyfills();

// Export for explicit usage
module.exports = {
  setupPolyfills,
};
