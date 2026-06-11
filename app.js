const socket = io();

// State management
let myUsername = '';
let activeRoomCode = '';

// AI Multi-conversation states
let aiConversations = []; 
let activeConversationId = '';

// DOM Elements
const appContainer = document.querySelector('.app-container');
const usernameScreen = document.getElementById('username-screen');
const homeScreen = document.getElementById('home-screen');
const chatScreen = document.getElementById('chat-screen');

// Game Menu & Panels
const mainMenu = document.getElementById('main-menu');
const publicChatsPanel = document.getElementById('public-chats-panel');
const createChatPanel = document.getElementById('create-chat-panel');
const joinPrivatePanel = document.getElementById('join-private-panel');
const aiChatsPanel = document.getElementById('ai-chats-panel'); 

// Navigation Buttons
const menuPublicBtn = document.getElementById('menu-public-btn');
const menuCreateBtn = document.getElementById('menu-create-btn');
const menuJoinBtn = document.getElementById('menu-join-btn');
const menuAiBtn = document.getElementById('menu-ai-btn'); 
const backBtns = document.querySelectorAll('.back-btn');

// Login Elements
const usernameInput = document.getElementById('username-input');
const enterBtn = document.getElementById('enter-btn');
const usernameError = document.getElementById('username-error');

// Home Sub-elements
const displayUsername = document.getElementById('display-username');
const publicRoomsList = document.getElementById('public-rooms-list');
const newRoomNameInput = document.getElementById('new-room-name');
const maxUsersInput = document.getElementById('max-users');
const maxUsersVal = document.getElementById('max-users-val');
const createRoomBtn = document.getElementById('create-room-btn');
const createError = document.getElementById('create-error');
const joinCodeInput = document.getElementById('join-code-input');
const joinRoomBtn = document.getElementById('join-room-btn');
const joinError = document.getElementById('join-error');

// AI Studio Panel Elements
const aiConversationsList = document.getElementById('ai-conversations-list');
const aiCurrentChatTitle = document.getElementById('ai-current-chat-title');
const newAiChatBtn = document.getElementById('new-ai-chat-btn');
const deleteCurrentChatBtn = document.getElementById('delete-current-chat-btn');
const aiMessagesDisplay = document.getElementById('ai-messages-display');
const aiMessageInput = document.getElementById('ai-message-input');
const aiSendBtn = document.getElementById('ai-send-btn');

// Chat Elements
const chatTitle = document.getElementById('chat-title');
const chatCodeDisplay = document.getElementById('chat-code-display');
const copyCodeBtn = document.getElementById('copy-code-btn');
const leaveChatBtn = document.getElementById('leave-chat-btn');
const messagesDisplay = document.getElementById('messages-display');
const messageInput = document.getElementById('message-input');
const sendMessageBtn = document.getElementById('send-message-btn');

// Show/Hide Screens
function showScreen(screen) {
    usernameScreen.classList.add('hidden');
    homeScreen.classList.add('hidden');
    chatScreen.classList.add('hidden');
    
    if (screen === chatScreen) {
        appContainer.style.maxWidth = "800px";
    } else {
        appContainer.style.maxWidth = "600px";
    }
    screen.classList.remove('hidden');
}

// Show specific game menu sub-panels
function showSubPanel(panel) {
    mainMenu.classList.add('hidden');
    publicChatsPanel.classList.add('hidden');
    createChatPanel.classList.add('hidden');
    joinPrivatePanel.classList.add('hidden');
    aiChatsPanel.classList.add('hidden');
    
    panel.classList.remove('hidden');
    
    if (panel === aiChatsPanel) {
        appContainer.style.maxWidth = "850px"; // Widen window to fit Studio sidebar
    } else {
        appContainer.style.maxWidth = "600px";
    }
}

// Reset view back to primary menu hub
function showMainMenu() {
    publicChatsPanel.classList.add('hidden');
    createChatPanel.classList.add('hidden');
    joinPrivatePanel.classList.add('hidden');
    aiChatsPanel.classList.add('hidden');
    
    mainMenu.classList.remove('hidden');
    appContainer.style.maxWidth = "600px";
    
    createError.textContent = '';
    joinError.textContent = '';
}

// Update Max Users Label dynamically
maxUsersInput.addEventListener('input', (e) => {
    maxUsersVal.textContent = e.target.value;
});

// Menu Button Click Listeners
menuPublicBtn.addEventListener('click', () => {
    showSubPanel(publicChatsPanel);
    fetchPublicRooms();
});
menuCreateBtn.addEventListener('click', () => {
    showSubPanel(createChatPanel);
});
menuJoinBtn.addEventListener('click', () => {
    showSubPanel(joinPrivatePanel);
});
menuAiBtn.addEventListener('click', () => {
    showSubPanel(aiChatsPanel);
    loadAndInitializeAiConversations();
});

// Hook up Back buttons to return to the Lobby menu
backBtns.forEach(btn => {
    btn.addEventListener('click', showMainMenu);
});
document.querySelector('.sidebar-back-btn').addEventListener('click', showMainMenu);

// 1. CHOOSE USERNAME
enterBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (!username) return;

    socket.emit('check-username', username, (response) => {
        if (response.success) {
            myUsername = username;
            displayUsername.textContent = myUsername;
            showMainMenu();
            showScreen(homeScreen);
        } else {
            usernameError.textContent = response.message;
        }
    });
});

// 2. FETCH PUBLIC ROOMS (Option 1)
function fetchPublicRooms() {
    socket.emit('get-public-rooms', (rooms) => {
        publicRoomsList.innerHTML = '';
        if (rooms.length === 0) {
            publicRoomsList.innerHTML = `<p class="empty-state">No public chats available. Create one!</p>`;
            return;
        }
        rooms.forEach(room => {
            const roomDiv = document.createElement('div');
            roomDiv.classList.add('room-item');
            roomDiv.innerHTML = `
                <div class="room-info">
                    <h4>${escapeHTML(room.name)}</h4>
                    <p>${room.userCount}/${room.maxUsers} Users</p>
                </div>
                <button class="join-room-badge-btn" onclick="joinRoomByCode('${room.code}')">Join</button>
            `;
            publicRoomsList.appendChild(roomDiv);
        });
    });
}

// 3. CREATE A CHAT (Option 2)
createRoomBtn.addEventListener('click', () => {
    const roomName = newRoomNameInput.value.trim();
    const isPublic = document.querySelector('input[name="room-privacy"]:checked').value === 'public';
    const maxUsers = parseInt(maxUsersInput.value);

    if (!roomName) {
        createError.textContent = 'Please enter a chat room name';
        return;
    }

    createError.textContent = '';

    socket.emit('create-room', { name: roomName, maxUsers, isPublic }, (response) => {
        if (response.success) {
            enterRoom(response.name, response.code);
            newRoomNameInput.value = '';
            showMainMenu();
        } else {
            createError.textContent = response.message;
        }
    });
});

// 4. JOIN CHAT VIA CODE (Option 3 & Option 1 click helper)
joinRoomBtn.addEventListener('click', () => {
    const code = joinCodeInput.value.trim().toUpperCase();
    if (code.length !== 5) {
        joinError.textContent = 'Please enter a valid 5-character code.';
        return;
    }
    joinRoomByCode(code);
});

window.joinRoomByCode = function(code) {
    socket.emit('join-room', code, (response) => {
        if (response.success) {
            enterRoom(response.name, response.code);
            joinCodeInput.value = '';
            joinError.textContent = '';
            showMainMenu();
        } else {
            if (homeScreen.classList.contains('hidden')) {
                alert(response.message);
            } else {
                joinError.textContent = response.message;
            }
        }
    });
};

// Enter Room GUI Switch
function enterRoom(roomName, code) {
    activeRoomCode = code;
    chatTitle.textContent = roomName;
    chatCodeDisplay.textContent = code;
    messagesDisplay.innerHTML = '';
    showScreen(chatScreen);
}

// Copy Code Button
copyCodeBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(activeRoomCode).then(() => {
        copyCodeBtn.textContent = 'Copied!';
        setTimeout(() => copyCodeBtn.textContent = 'Copy', 2000);
    });
});

// LEAVE CHAT
leaveChatBtn.addEventListener('click', () => {
    socket.emit('leave-room');
    activeRoomCode = '';
    showMainMenu();
    showScreen(homeScreen);
});

// SEND MESSAGE
sendMessageBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    socket.emit('send-message', text);
    messageInput.value = '';
}

// SOCKET MESSAGE LISTENERS
socket.on('message', (message) => {
    const isSystem = message.system;
    const isMyMsg = message.sender === myUsername;

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message-bubble');

    if (isSystem) {
        messageDiv.classList.add('system');
        messageDiv.textContent = message.text;
    } else {
        messageDiv.classList.add(isMyMsg ? 'outgoing' : 'incoming');
        messageDiv.innerHTML = `
            ${!isMyMsg ? `<div class="msg-sender">${escapeHTML(message.sender)}</div>` : ''}
            <div>${escapeHTML(message.text)}</div>
        `;
    }

    messagesDisplay.appendChild(messageDiv);
    messagesDisplay.scrollTop = messagesDisplay.scrollHeight;
});

// Dynamic Update of Public Chat rooms list
socket.on('public-rooms-updated', () => {
    if (!publicChatsPanel.classList.contains('hidden')) {
        fetchPublicRooms();
    }
});


/* =========================================
   NEW FEATURE: PRIVATE AI CHAT FUNCTIONALITY
   ========================================= */

// Custom Markdown Code Block & Inline Code Parser
// Custom Markdown Parser (Supports Code Blocks, Inline Code, Headings, Bold, Italic, Strikethrough)
function formatAiResponse(text) {
    const parts = text.split(/```/g);
    let formatted = '';
    
    for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 1) { // Inside triple backticks (code block)
            const blockContent = parts[i];
            const match = blockContent.match(/^([a-zA-Z0-9+#-]+)?\n([\s\S]*)$/);
            const language = match ? (match[1] || '').trim() : '';
            const code = match ? match[2] : blockContent;
            
            formatted += `
                <div class="code-block-container">
                    <div class="code-block-header">
                        <span>${language.toUpperCase() || 'CODE'}</span>
                        <button class="copy-snippet-btn" onclick="copyCodeSnippet(this)">Copy Code</button>
                    </div>
                    <pre><code>${escapeHTML(code.trim())}</code></pre>
                </div>
            `;
        } else { // Standard text block
            let escapedText = escapeHTML(parts[i]);
            
            // Split by line breaks to process block-level elements (headings) cleanly
            const lines = escapedText.split('\n');
            const processedLines = lines.map(line => {
                let processed = line;
                
                // 1. Headings (strictly parsed at the start of a line)
                if (processed.startsWith('### ')) {
                    processed = `<h3>${processed.substring(4)}</h3>`;
                } else if (processed.startsWith('## ')) {
                    processed = `<h2>${processed.substring(3)}</h2>`;
                } else if (processed.startsWith('# ')) {
                    processed = `<h1>${processed.substring(2)}</h1>`;
                }
                
                // 2. Inline Code `code`
                processed = processed.replace(/`(.*?)`/g, '<code class="inline-code">$1</code>');
                
                // 3. Bold **text**
                processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                
                // 4. Italic *text*
                processed = processed.replace(/\*(.*?)\*/g, '<em>$1</em>');
                
                // 5. Strikethrough ~~text~~
                processed = processed.replace(/~~(.*?)~~/g, '<del>$1</del>');
                  // 6. Markdown Links [text](url) - Sanitized to block javascript: protocol
                processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
                    const lowerUrl = url.trim().toLowerCase();
                    if (lowerUrl.startsWith('javascript:')) {
                        return match; // Render as raw plain text if malicious protocol detected
                    }
                    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-link">${linkText}</a>`;
                });
                return processed;
            });
            
            formatted += processedLines.join('<br>');
        }
    }
    return formatted;
}
window.copyCodeSnippet = function(button) {
    const preElement = button.closest('.code-block-container').querySelector('pre code');
    if (!preElement) return;
    
    navigator.clipboard.writeText(preElement.innerText).then(() => {
        button.textContent = 'Copied!';
        setTimeout(() => {
            button.textContent = 'Copy Code';
        }, 2000);
    });
};

// Initialize Studio State on load
function loadAndInitializeAiConversations() {
    aiConversations = JSON.parse(localStorage.getItem('skyline_ai_conversations')) || [];
    activeConversationId = localStorage.getItem('skyline_active_ai_chat_id') || '';
    
    if (aiConversations.length === 0) {
        createNewConversation();
    } else {
        renderConversationsSidebarList();
        const activeExists = aiConversations.some(c => c.id === activeConversationId);
        if (activeExists) {
            loadConversationThread(activeConversationId);
        } else {
            loadConversationThread(aiConversations[0].id);
        }
    }
}

// Generate new independent conversation payload
function createNewConversation() {
    const newId = 'chat_' + Date.now();
    const newChat = {
        id: newId,
        title: 'New Conversation',
        messages: []
    };
    aiConversations.unshift(newChat); // Put at top
    saveConversationsToLocal();
    renderConversationsSidebarList();
    loadConversationThread(newId);
}

// Save local storage states
function saveConversationsToLocal() {
    localStorage.setItem('skyline_ai_conversations', JSON.stringify(aiConversations));
    localStorage.setItem('skyline_active_ai_chat_id', activeConversationId);
}

// Render left sidebar items list
function renderConversationsSidebarList() {
    aiConversationsList.innerHTML = '';
    aiConversations.forEach(chat => {
        const item = document.createElement('button');
        item.classList.add('chat-list-item');
        if (chat.id === activeConversationId) {
            item.classList.add('active');
        }
        item.textContent = chat.title;
        item.addEventListener('click', () => {
            loadConversationThread(chat.id);
        });
        aiConversationsList.appendChild(item);
    });
}

// Switch Conversation Window View
function loadConversationThread(id) {
    activeConversationId = id;
    saveConversationsToLocal();
    renderConversationsSidebarList();
    
    const activeChat = aiConversations.find(c => c.id === id);
    if (!activeChat) return;

    aiCurrentChatTitle.textContent = activeChat.title;
    aiMessagesDisplay.innerHTML = '';
    
    if (activeChat.messages.length === 0) {
        aiMessagesDisplay.innerHTML = `<p class="empty-state">Start a private conversation with the AI!</p>`;
        return;
    }
    
    activeChat.messages.forEach(msg => {
        appendAiBubbleToDOM(msg.role, msg.content);
    });
    aiMessagesDisplay.scrollTop = aiMessagesDisplay.scrollHeight;
}

// Draw dynamic conversation bubbles
function appendAiBubbleToDOM(role, content) {
    const isUser = role === 'user';
    const bubble = document.createElement('div');
    bubble.classList.add('message-bubble', isUser ? 'outgoing' : 'incoming');
    
    if (isUser) {
        bubble.textContent = content;
    } else {
        bubble.innerHTML = formatAiResponse(content);
    }
    
    aiMessagesDisplay.appendChild(bubble);
}

// Delete Active Conversation
deleteCurrentChatBtn.addEventListener('click', () => {
    if (confirm("Delete this conversation thread permanently?")) {
        aiConversations = aiConversations.filter(c => c.id !== activeConversationId);
        saveConversationsToLocal();
        
        if (aiConversations.length === 0) {
            createNewConversation();
        } else {
            loadAndInitializeAiConversations();
        }
    }
});

// Create New Chat Button Listener
newAiChatBtn.addEventListener('click', createNewConversation);

// Send message & stream responses
aiSendBtn.addEventListener('click', sendAiMessageToStream);
aiMessageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendAiMessageToStream();
});

let activeStreamText = '';

// Prevent multiple messages sent simultaneously by disabling elements
function toggleAiInputState(disabled) {
    aiMessageInput.disabled = disabled;
    aiSendBtn.disabled = disabled;
    if (!disabled) {
        aiMessageInput.focus();
    }
}

function sendAiMessageToStream() {
    const query = aiMessageInput.value.trim();
    if (!query) return;

    const activeChat = aiConversations.find(c => c.id === activeConversationId);
    if (!activeChat) return;

    // Remove empty state
    const emptyState = aiMessagesDisplay.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    // Disable input immediately to prevent dual submit commands
    toggleAiInputState(true);

    // Append and save Client message
    appendAiBubbleToDOM('user', query);
    aiMessageInput.value = '';
    aiMessagesDisplay.scrollTop = aiMessagesDisplay.scrollHeight;

    activeChat.messages.push({ role: 'user', content: query });
    
    // Auto-update conversation title based on initial user query
    if (activeChat.title === 'New Conversation') {
        activeChat.title = query.substring(0, 22) + (query.length > 22 ? '...' : '');
        aiCurrentChatTitle.textContent = activeChat.title;
        renderConversationsSidebarList();
    }
    
    saveConversationsToLocal();

    // Append standard loader template element
    const loadingBubble = document.createElement('div');
    loadingBubble.classList.add('message-bubble', 'incoming', 'ai-loading-bubble');
    loadingBubble.innerHTML = `
        <div class="typing-dots">
            <span></span><span></span><span></span>
        </div>
    `;
    aiMessagesDisplay.appendChild(loadingBubble);
    aiMessagesDisplay.scrollTop = aiMessagesDisplay.scrollHeight;

    // Limit previous conversation history context (Capped at last 10 messages)
    const payloadContext = activeChat.messages.slice(-10);

    activeStreamText = ''; // Reset streaming buffers
    socket.emit('ai-message-stream', payloadContext);
}

// SOCKET STREAM LISTENERS
socket.on('ai-stream-chunk', (chunk) => {
    const loader = aiMessagesDisplay.querySelector('.ai-loading-bubble');
    if (loader) loader.remove();

    // Find or create active streaming block
    let streamingBubble = aiMessagesDisplay.querySelector('.ai-streaming-bubble');
    if (!streamingBubble) {
        streamingBubble = document.createElement('div');
        streamingBubble.classList.add('message-bubble', 'incoming', 'ai-streaming-bubble');
        aiMessagesDisplay.appendChild(streamingBubble);
    }

    activeStreamText += chunk;
    streamingBubble.innerHTML = formatAiResponse(activeStreamText);
    aiMessagesDisplay.scrollTop = aiMessagesDisplay.scrollHeight;
});

socket.on('ai-stream-end', () => {
    // Save generated reply inside active context array
    const activeChat = aiConversations.find(c => c.id === activeConversationId);
    if (activeChat && activeStreamText) {
        activeChat.messages.push({ role: 'assistant', content: activeStreamText });
        saveConversationsToLocal();
    }

    // Convert active streaming block to standard incoming bubble
    const streamingBubble = aiMessagesDisplay.querySelector('.ai-streaming-bubble');
    if (streamingBubble) {
        streamingBubble.classList.remove('ai-streaming-bubble');
    }

    // Re-enable inputs
    toggleAiInputState(false);
});

socket.on('ai-stream-error', (errMsg) => {
    const loader = aiMessagesDisplay.querySelector('.ai-loading-bubble');
    if (loader) loader.remove();

    const streamingBubble = aiMessagesDisplay.querySelector('.ai-streaming-bubble');
    if (streamingBubble) streamingBubble.remove();

    const errBubble = document.createElement('div');
    errBubble.classList.add('message-bubble', 'system');
    errBubble.textContent = `Stream Error: ${errMsg}`;
    aiMessagesDisplay.appendChild(errBubble);
    aiMessagesDisplay.scrollTop = aiMessagesDisplay.scrollHeight;

    toggleAiInputState(false);
});


// Helper function to prevent HTML/XSS injection
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}