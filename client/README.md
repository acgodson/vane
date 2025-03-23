# Vane CLI WebSocket Bridge UI

1. **WebSocket Server** - Runs alongside your CLI when needed
2. **CLI Integration** - Connects your existing CLI to the WebSocket server
3. **Browser Interface** - Standalone HTML/CSS/JS that you can host anywhere

### Connection Flow

1. CLI starts WebSocket server on specified port
2. Browser interface connects to localhost:port
3. Communication flows in both directions
4. Console output is mirrored to the browser

### How to use

1. Clone or Install the Vane CLI
2. Create a New Vane Project
3. Start Chat in the Directory 
4. Choose Browser Support 
5. Connect to localhost port 


### Security Considerations

- The WebSocket server only runs when explicitly started
- It only accepts connections from localhost by default
- No sensitive data is stored in the browser interface



