require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Server State variables
const activeUsers = new Set();
const rooms = {}; 
const userSocketMap = {}; 

function generateRoomCode() {
    let code;
    do {
        code = Math.random().toString(36).substring(2, 7).toUpperCase();
    } while (rooms[code]);
    return code;
}

io.on('connection', (socket) => {
    let assignedUsername = null;
    let currentRoomCode = null;

    // Choose temporary username
    socket.on('check-username', (username, callback) => {
        const cleanName = username.trim();
        if (activeUsers.has(cleanName)) {
            callback({ success: false, message: 'This username is already taken.' });
        } else {
            assignedUsername = cleanName;
            activeUsers.add(cleanName);
            userSocketMap[socket.id] = cleanName;
            callback({ success: true });
        }
    });

    // Send available public rooms list
    socket.on('get-public-rooms', (callback) => {
        const publicRooms = Object.keys(rooms)
            .filter(code => rooms[code].isPublic)
            .map(code => ({
                code,
                name: rooms[code].name,
                userCount: rooms[code].users.length,
                maxUsers: rooms[code].maxUsers
            }));
        callback(publicRooms);
    });

    // Create a Room (Now with uniqueness enforcement)
    socket.on('create-room', ({ name, maxUsers, isPublic }, callback) => {
        if (!assignedUsername) return callback({ success: false, message: 'Username is not registered.' });

        const cleanRoomName = name.trim();

        // Check if another active room already has this name
        const roomNameExists = Object.values(rooms).some(
            (room) => room.name.toLowerCase() === cleanRoomName.toLowerCase()
        );

        if (roomNameExists) {
            return callback({ 
                success: false, 
                message: 'A chat room with this name already exists. Please pick a unique name.' 
            });
        }

        const code = generateRoomCode();
        rooms[code] = {
            name: cleanRoomName,
            maxUsers: parseInt(maxUsers) || 10,
            isPublic: isPublic,
            users: [socket.id]
        };

        currentRoomCode = code;
        socket.join(code);
        callback({ success: true, code, name: cleanRoomName });

        // Broadcast list updates
        io.emit('public-rooms-updated');
    });

    // Join existing Room
    socket.on('join-room', (code, callback) => {
        if (!assignedUsername) return callback({ success: false, message: 'Username is not registered.' });

        const room = rooms[code];
        if (!room) {
            return callback({ success: false, message: 'Room code not found.' });
        }
        if (room.users.length >= room.maxUsers) {
            return callback({ success: false, message: 'This room is currently full.' });
        }

        room.users.push(socket.id);
        currentRoomCode = code;
        socket.join(code);
        callback({ success: true, name: room.name, code });

        io.to(code).emit('message', {
            system: true,
            text: `${assignedUsername} has joined the chat.`
        });
        io.emit('public-rooms-updated');
    });

    // Handle messages
    socket.on('send-message', (text) => {
        if (currentRoomCode && assignedUsername) {
            io.to(currentRoomCode).emit('message', {
                sender: assignedUsername,
                text,
                system: false
            });
        }
    });

    // NEW: OpenRouter Real-Time Socket Chunks Streaming Handler
    socket.on('ai-message-stream', async (conversationHistory) => {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            return socket.emit('ai-stream-error', 'API Key configuration is missing on the server.');
        }

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "HTTP-Referer": "http://localhost:3000", 
                    "X-Title": "Skyline Chat", 
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    // TIP: Switch the string below to 'meta-llama/llama-3-8b-instruct:free' for even faster generation speeds
                    "model": "nex-agi/nex-n2-pro:free",
                    "messages": conversationHistory,
                    "stream": true // Enable streaming completions
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                return socket.emit('ai-stream-error', `OpenRouter error status (${response.status}): ${errText}`);
            }

            // Read the stream chunk-by-chunk using native response body reader
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                
                // Retain incomplete chunks in the buffer
                buffer = lines.pop();

                for (const line of lines) {
                    const cleanLine = line.trim();
                    if (cleanLine === '') continue;
                    if (cleanLine === 'data: [DONE]') {
                        socket.emit('ai-stream-end');
                        return;
                    }

                    if (cleanLine.startsWith('data: ')) {
                        try {
                            const parsed = JSON.parse(cleanLine.substring(6));
                            const content = parsed.choices[0]?.delta?.content || '';
                            if (content) {
                                socket.emit('ai-stream-chunk', content);
                            }
                        } catch (e) {
                            // Suppress parsing quirks of unfinished buffer parts
                        }
                    }
                }
            }

            socket.emit('ai-stream-end');

        } catch (error) {
            console.error("Server Streaming Error:", error);
            socket.emit('ai-stream-error', 'An internal connection breakdown occurred while streaming.');
        }
    });

    // Handle Leave room requests
    socket.on('leave-room', () => {
        handleDisconnectFromRoom();
    });

    // Connection loss cleanup (Releasing temp usernames and cleanup rooms)
    socket.on('disconnect', () => {
        handleDisconnectFromRoom();
        if (assignedUsername) {
            activeUsers.delete(assignedUsername);
            delete userSocketMap[socket.id];
        }
    });

    function handleDisconnectFromRoom() {
        if (currentRoomCode) {
            const room = rooms[currentRoomCode];
            if (room) {
                room.users = room.users.filter(id => id !== socket.id);
                
                if (assignedUsername) {
                    io.to(currentRoomCode).emit('message', {
                        system: true,
                        text: `${assignedUsername} has left the chat.`
                    });
                }

                socket.leave(currentRoomCode);

                if (room.users.length === 0) {
                    delete rooms[currentRoomCode];
                }
            }
            currentRoomCode = null;
            io.emit('public-rooms-updated');
        }
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Skyline server initialized on http://localhost:${PORT}`);
});