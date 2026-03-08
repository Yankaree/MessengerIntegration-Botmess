const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const appstateFilePath = path.join(__dirname, 'appstate.json');

// --- Appstate Handling (Simulated) ---
let appstate = [];
try {
    const appstateContent = fs.readFileSync(appstateFilePath, 'utf8');
    appstate = JSON.parse(appstateContent);
    console.log('Appstate loaded successfully from appstate.json');
} catch (error) {
    console.warn('Could not load appstate.json. Starting with empty appstate.', error.message);
}

// Function to simulate saving appstate (in a real bot, you'd save actual appstate from meta-messenger.js)
function saveAppstate(newAppstate) {
    fs.writeFile(appstateFilePath, JSON.stringify(newAppstate, null, 2), 'utf8', (err) => {
        if (err) {
            console.error('Failed to save appstate.json:', err);
        } else {
            console.log('Appstate (simulated) saved to appstate.json');
        }
    });
}

// --- Messenger Client (Conceptual using meta-messenger.js) ---
// In a real setup, you would initialize meta-messenger.js here:
// const { Client } = require('meta-messenger.js');
// const messengerClient = new Client({ appstate: appstate });
// messengerClient.connect();
//
// messengerClient.on('ready', () => {
//     console.log('meta-messenger.js client ready!');
//     // After ready, you can start listening for messages from Messenger
//     // messengerClient.on('message', (message) => {
//     //     simulateMessengerMessage(message.sender.name, message.threadId, message.text);
//     // });
// });
//
// messengerClient.on('appstate', (newAppstate) => {
//     // When appstate changes (e.g., after initial login), save it
//     saveAppstate(newAppstate);
// });
//
// messengerClient.on('error', (err) => {
//     console.error('meta-messenger.js error:', err);
// });


// --- WebSocket Server ---
const wss = new WebSocket.Server({ port: 8080 });
let minecraftWsClient = null; // To hold the connected Minecraft client
let targetMessengerThreadId = null; // Stores the currently targeted Messenger thread ID

console.log('WebSocket Server started on port 8080');

wss.on('connection', ws => {
    console.log('Minecraft Plugin connected via WebSocket.');
    minecraftWsClient = ws;

    ws.on('message', message => {
        const msgStr = message.toString();
        console.log(`Received from Minecraft Plugin: ${msgStr}`);

        try {
            const data = JSON.parse(msgStr);
            let messageToMessenger = '';

            // Check if it's a chat message, say command, or other type
            if (data.type === 'chat' || data.type === 'say' || data.type === 'death' || data.type === 'advancement') {
                messageToMessenger = data.content;
            } else if (data.type === 'server_status') {
                messageToMessenger = `[Server Status]\nTPS: ${data.tps.toFixed(2)}\nPlayers: ${data.online_players}/${data.max_players}\nCPU Load: ${data.cpu_load.toFixed(2)}\nMemory: ${((data.memory.total - data.memory.free) / 1024 / 1024).toFixed(2)}MB / ${(data.memory.max / 1024 / 1024).toFixed(2)}MB`;
            } else {
                messageToMessenger = `[Minecraft Info]: ${msgStr}`; // Fallback for other JSON types
            }
            
            // Simulate sending to Messenger (for now, just log)
            if (targetMessengerThreadId && messageToMessenger) {
                console.log(`[BOT -> MESSENGER (Thread: ${targetMessengerThreadId})]: ${messageToMessenger}`);
                // In a real scenario, you'd use meta-messenger.js here to send to the target thread
                // client.send(targetMessengerThreadId, messageToMessenger);
            } else if (!targetMessengerThreadId) {
                console.log('[BOT -> MESSENGER]: No target Messenger thread set. Message not sent.');
            } else if (!messageToMessenger) {
                console.log('[BOT -> MESSENGER]: No message content to send.');
            }

        } catch (e) {
            console.error('Error parsing JSON from Minecraft Plugin:', e);
            // If it's not JSON, treat it as a raw message from Minecraft
            if (targetMessengerThreadId) {
                console.log(`[BOT -> MESSENGER (Thread: ${targetMessengerThreadId})]: ${msgStr}`);
                // client.send(targetMessengerThreadId, msgStr);
            } else {
                console.log('[BOT -> MESSENGER]: No target Messenger thread set for raw message. Not sent.');
            }
        }
    });

    ws.on('close', () => {
        console.log('Minecraft Plugin disconnected.');
        minecraftWsClient = null;
    });

    ws.on('error', error => {
        console.error('Minecraft Plugin WebSocket error:', error);
    });

    // Send a welcome message to Minecraft after connection
    ws.send(JSON.stringify({ type: "info", message: "Connected to Messenger Bridge Bot." }));
});

// --- Dummy Messenger Bot Logic ---
// This part simulates receiving messages from Messenger
// In a real application, you'd use meta-messenger.js client.on('message')
function simulateMessengerMessage(sender, threadId, content) {
    console.log(`[MESSENGER -> BOT (from ${sender} in ${threadId})]: ${content}`);

    if (content.startsWith('!target ')) {
        const newTarget = content.substring('!target '.length).trim();
        if (newTarget) {
            targetMessengerThreadId = newTarget;
            console.log(`[BOT]: Messenger target thread set to: ${targetMessengerThreadId}`);
            if (minecraftWsClient && minecraftWsClient.readyState === WebSocket.OPEN) {
                minecraftWsClient.send(JSON.stringify({ type: "command_response", message: `Messenger target thread set to: ${targetMessengerThreadId}` }));
            }
        } else {
            console.log('[BOT]: Invalid !target command. Usage: !target <threadId>');
            if (minecraftWsClient && minecraftWsClient.readyState === WebSocket.OPEN) {
                minecraftWsClient.send(JSON.stringify({ type: "command_response", message: 'Invalid !target command. Usage: !target <threadId>' }));
            }
        }
    } else if (content.trim().equalsIgnoreCase("/status")) { // Handle /status command from Messenger
        console.log('[BOT]: Received /status command from Messenger. Requesting status from Minecraft.');
        if (minecraftWsClient && minecraftWsClient.readyState === WebSocket.OPEN) {
            minecraftWsClient.send(JSON.stringify({ type: "status_request" }));
        } else {
            console.log('[BOT]: Minecraft Plugin not connected. Cannot request status.');
            // In a real bot, you'd send a message back to Messenger here
        }
    } else if (threadId === targetMessengerThreadId && minecraftWsClient && minecraftWsClient.readyState === WebSocket.OPEN) {
        // Only forward if it's from the target thread
        minecraftWsClient.send(JSON.stringify({ type: "messenger_message", sender: sender, message: content, threadId: threadId }));
    } else {
        console.log('[BOT]: Message not from target thread or Minecraft not connected. Not forwarding.');
    }
}

// --- Example usage (simulate incoming Messenger messages) ---
// You can call this function from your terminal or another script to test
// For example: simulateMessengerMessage('User123', 'thread_12345', 'Hello Minecraft!');
// simulateMessengerMessage('Admin', 'thread_67890', '!target thread_12345');
// simulateMessengerMessage('User123', 'thread_12345', 'How are you all?');
// simulateMessengerMessage('User456', 'thread_98765', 'This message should not be forwarded.');

// To start the bot: node index.js
// Then, from Minecraft, connect to ws://localhost:8080
// Use the 'simulateMessengerMessage' function calls to test interactions.