// Main application logic
let currentUser = null;
let currentConversationId = null;
let token = localStorage.getItem('token');

// DOM Elements Utility
const getEl = (id) => document.getElementById(id);

const elements = {
    sidebar: getEl('sidebar'),
    menuBtn: getEl('menuBtn'),
    closeSidebarBtn: getEl('closeSidebar'),
    newChatBtn: getEl('newChatBtn'),
    sendBtn: getEl('sendBtn'),
    messageInput: getEl('messageInput'),
    chatMessages: getEl('chatMessages'),
    settingsModal: getEl('settingsModal'),
    settingsBtn: getEl('settingsBtn'),
    logoutBtn: getEl('logoutBtn'),
    voiceModeBtn: getEl('voiceModeBtn'),
    clearChatBtn: getEl('clearChatBtn'),
    themeToggleBtn: getEl('themeToggleBtn'),
    clearAllBtn: getEl('clearAllBtn'),
    attachBtn: getEl('attachBtn'),
    fileInput: getEl('fileInput'),
    attachmentPreview: getEl('attachmentPreview'),
    conversationsList: getEl('conversationsList'),
    userInfo: getEl('userInfo'),
    userDropdown: getEl('userDropdown'),
    switchUserBtn: getEl('switchUserBtn'),
    logoutBtnMain: getEl('logoutBtnMain')
};

let selectedFile = null;

// Safe Event Listener Attachment
function addSafeListener(el, event, handler) {
    if (el) {
        el.addEventListener(event, handler);
    }
}

// Authentication Check
if (!token && window.location.pathname === '/dashboard') {
    window.location.href = '/';
} else if (token) {
    const usernameEl = getEl('username');
    if (usernameEl) usernameEl.textContent = localStorage.getItem('username') || 'User';
    loadConversations();
}

// --- Event Handlers ---

addSafeListener(elements.menuBtn, 'click', () => {
    if (elements.sidebar) elements.sidebar.classList.remove('closed');
});

addSafeListener(elements.closeSidebarBtn, 'click', () => {
    if (elements.sidebar) elements.sidebar.classList.add('closed');
});

addSafeListener(elements.newChatBtn, 'click', () => {
    startNewConversation();
    if (window.innerWidth <= 768 && elements.sidebar) {
        elements.sidebar.classList.add('closed');
    }
});

addSafeListener(elements.sendBtn, 'click', sendMessage);

addSafeListener(elements.messageInput, 'keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

addSafeListener(elements.messageInput, 'input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

addSafeListener(elements.settingsBtn, 'click', () => {
    if (elements.settingsModal) elements.settingsModal.classList.add('active');
});

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        if (elements.settingsModal) elements.settingsModal.classList.remove('active');
    });
});

addSafeListener(elements.clearChatBtn, 'click', async () => {
    if (!currentConversationId || currentConversationId === 'new') {
        if (elements.chatMessages.innerHTML !== '') {
            if (confirm('Clear current messages?')) {
                elements.chatMessages.innerHTML = '';
                loadWelcomeScreen();
            }
        }
        return;
    }

    if (confirm('Are you sure you want to delete this entire conversation?')) {
        try {
            const response = await fetch(`/api/chat/conversations/${currentConversationId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                showToast('Conversation deleted', 'success');
                startNewConversation();
                loadConversations();
            } else {
                const data = await response.json();
                showToast(data.error || 'Failed to delete', 'error');
            }
        } catch (error) {
            showToast('Error deleting conversation', 'error');
        }
    }
});

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/';
}

addSafeListener(elements.logoutBtn, 'click', logout);
addSafeListener(elements.logoutBtnMain, 'click', logout);
addSafeListener(elements.switchUserBtn, 'click', logout);

addSafeListener(elements.userInfo, 'click', (e) => {
    e.stopPropagation();
    if (elements.userDropdown) elements.userDropdown.classList.toggle('active');
});

document.addEventListener('click', () => {
    if (elements.userDropdown) elements.userDropdown.classList.remove('active');
});

addSafeListener(elements.attachBtn, 'click', () => {
    if (elements.fileInput) elements.fileInput.click();
});

addSafeListener(elements.fileInput, 'change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    selectedFile = file;
    updateAttachmentPreview(file);
});

addSafeListener(elements.themeToggleBtn, 'click', () => {
    const isDark = document.body.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
    showToast(`${isDark ? 'Dark' : 'Light'} mode enabled`, 'success');
    const themeSelect = getEl('themeSelect');
    if (themeSelect) themeSelect.value = isDark ? 'dark' : 'light';
});

addSafeListener(elements.clearAllBtn, 'click', clearAllHistory);

// --- Functions ---

function updateThemeIcon(isDark) {
    if (elements.themeToggleBtn) {
        elements.themeToggleBtn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    }
}

function updateAttachmentPreview(file) {
    if (!elements.attachmentPreview) return;
    if (file) {
        elements.attachmentPreview.innerHTML = `
            <div class="preview-chip">
                <i class="fas ${getFileIcon(file.name)}"></i>
                <span>${file.name}</span>
                <i class="fas fa-times remove-file" id="removeFile"></i>
            </div>
        `;
        elements.attachmentPreview.style.display = 'flex';
        const removeBtn = getEl('removeFile');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                selectedFile = null;
                if (elements.fileInput) elements.fileInput.value = '';
                elements.attachmentPreview.style.display = 'none';
                elements.attachmentPreview.innerHTML = '';
            });
        }
    } else {
        elements.attachmentPreview.style.display = 'none';
        elements.attachmentPreview.innerHTML = '';
    }
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'fa-file-image';
    if (['mp4', 'webm', 'ogg'].includes(ext)) return 'fa-file-video';
    if (ext === 'pdf') return 'fa-file-pdf';
    return 'fa-file-alt';
}

async function clearAllHistory() {
    if (!confirm('Are you sure you want to clear ALL chat history?')) return;
    try {
        const response = await fetch('/api/chat/conversations/clear', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            showToast('All chat history cleared', 'success');
            startNewConversation();
            loadConversations();
        }
    } catch (error) {
        showToast('Error clearing history', 'error');
    }
}

async function loadConversations() {
    if (!elements.conversationsList) return;
    try {
        const response = await fetch('/api/chat/conversations', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const convs = await response.json();
        elements.conversationsList.innerHTML = '';
        if (convs.length > 0) {
            convs.forEach(conv => {
                const convElement = document.createElement('div');
                convElement.className = 'conversation-item';
                convElement.innerHTML = `<i class="fas fa-comment"></i><span>${conv.title.substring(0, 30)}</span>`;
                convElement.addEventListener('click', () => loadConversation(conv.id));
                elements.conversationsList.appendChild(convElement);
            });
        } else {
            elements.conversationsList.innerHTML = '<div style="text-align: center; padding: 20px; color: gray;">No conversations yet</div>';
        }
    } catch (error) {
        console.error('Load conversations error:', error);
    }
}

async function loadConversation(conversationId) {
    currentConversationId = conversationId;
    try {
        const response = await fetch(`/api/chat/history/${conversationId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (elements.chatMessages) {
            elements.chatMessages.innerHTML = '';
            if (data.messages && data.messages.length > 0) {
                data.messages.forEach(msg => addMessageToUI(msg.role, msg.content));
            } else {
                loadWelcomeScreen();
            }
        }
        const titleEl = getEl('chatTitle');
        if (titleEl) titleEl.textContent = 'Conversation';
        scrollToBottom();
    } catch (error) {
        showToast('Error loading conversation', 'error');
    }
}

function startNewConversation() {
    currentConversationId = 'new';
    const titleEl = getEl('chatTitle');
    if (titleEl) titleEl.textContent = 'New Conversation';
    if (elements.chatMessages) elements.chatMessages.innerHTML = '';
    loadWelcomeScreen();
}

function loadWelcomeScreen() {
    if (!elements.chatMessages) return;
    elements.chatMessages.innerHTML = `
        <div class="welcome-screen">
            <div class="welcome-icon"><i class="fas fa-comments"></i></div>
            <h2>Welcome to AI Voice Assistant</h2>
            <p>Ask me anything! I can help with questions, calculations, weather, and more.</p>
            <div class="suggestions">
                <div class="suggestion-chip" data-msg="What's the weather like?">
                    <i class="fas fa-cloud-sun"></i> Weather
                </div>
                <div class="suggestion-chip" data-msg="Calculate 15 + 27">
                    <i class="fas fa-calculator"></i> Calculate
                </div>
                <div class="suggestion-chip" data-msg="Tell me a joke">
                    <i class="fas fa-smile"></i> Joke
                </div>
                <div class="suggestion-chip" data-msg="Search for AI news">
                    <i class="fas fa-search"></i> Search
                </div>
            </div>
        </div>
    `;
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const msg = chip.dataset.msg;
            if (msg.toLowerCase().includes('weather')) {
                handleWeatherRequest();
            } else {
                if (elements.messageInput) {
                    elements.messageInput.value = msg;
                    sendMessage();
                }
            }
        });
    });
}

window.sendMessage = sendMessage;

async function sendMessage() {
    if (!elements.messageInput) return;
    const message = elements.messageInput.value.trim();
    if (!message && !selectedFile) return;

    const currentFile = selectedFile;
    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';
    selectedFile = null;
    if (elements.fileInput) elements.fileInput.value = '';
    if (elements.attachmentPreview) {
        elements.attachmentPreview.style.display = 'none';
        elements.attachmentPreview.innerHTML = '';
    }

    if (message) addMessageToUI('user', message);
    scrollToBottom();

    if (currentFile) await handleFileUpload(currentFile);
    if (!message) return;

    const typingIndicator = showTypingIndicator();

    try {
        const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                message: message,
                conversation_id: currentConversationId || 'new'
            })
        });

        if (!response.ok) throw new Error('Response not ok');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantMessage = '';
        if (typingIndicator) typingIndicator.remove();
        const messageDiv = createAssistantMessageElement();

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.substring(6));
                        if (data.chunk) {
                            assistantMessage += data.chunk;
                            updateAssistantMessage(messageDiv, assistantMessage);
                        }
                        if (data.conversation_id) {
                            currentConversationId = data.conversation_id;
                        }
                    } catch (e) {}
                }
            }
        }
        
        // Check for system commands in the assistant message
        processSystemCommands(assistantMessage);

        if (localStorage.getItem('autoPlayVoice') === 'true') {
            window.speakText(assistantMessage);
        }
    } catch (error) {
        if (typingIndicator) typingIndicator.remove();
        addMessageToUI('assistant', 'Sorry, something went wrong.');
    }
}

async function handleFileUpload(file) {
    const formData = new FormData();
    formData.append('file', file);
    showToast('Uploading file...', 'info');
    try {
        const response = await fetch('/api/memory/documents', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const data = await response.json();
        if (response.ok) {
            addMediaMessageToUI(data);
            showToast('File uploaded successfully', 'success');
        } else {
            showToast(data.error || 'Upload failed', 'error');
        }
    } catch (error) {
        showToast('Upload error', 'error');
    }
}

function addMessageToUI(role, content) {
    if (!elements.chatMessages) return;
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    messageDiv.innerHTML = `
        <div class="message-avatar"><i class="fas fa-${role === 'user' ? 'user' : 'robot'}"></i></div>
        <div class="message-content">
            <div class="message-text">${formatMessage(content)}</div>
        </div>
    `;
    elements.chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

function addMediaMessageToUI(data) {
    if (!elements.chatMessages) return;
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant media-message';
    let mediaHtml = '';
    if (data.type === 'image') {
        mediaHtml = `<img src="${data.url}" alt="${data.name}" class="chat-image" onclick="window.open('${data.url}')">`;
    } else if (data.type === 'video') {
        mediaHtml = `<video src="${data.url}" controls class="chat-video"></video>`;
    } else {
        mediaHtml = `<div class="file-link"><i class="fas fa-file-alt"></i> <a href="${data.url}" target="_blank">${data.name}</a></div>`;
    }
    messageDiv.innerHTML = `
        <div class="message-avatar"><i class="fas fa-file-import"></i></div>
        <div class="message-content">${mediaHtml}</div>
    `;
    elements.chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

function createAssistantMessageElement() {
    if (!elements.chatMessages) return;
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';
    messageDiv.innerHTML = `
        <div class="message-avatar"><i class="fas fa-robot"></i></div>
        <div class="message-content"><div class="message-text"></div></div>
    `;
    elements.chatMessages.appendChild(messageDiv);
    return messageDiv;
}

function updateAssistantMessage(messageDiv, content) {
    const textDiv = messageDiv.querySelector('.message-text');
    if (textDiv) textDiv.innerHTML = formatMessage(content);
    scrollToBottom();
}

function showTypingIndicator() {
    if (!elements.chatMessages) return;
    const indicator = document.createElement('div');
    indicator.className = 'message assistant';
    indicator.innerHTML = `
        <div class="message-avatar"><i class="fas fa-robot"></i></div>
        <div class="message-content"><div class="typing-indicator"><span></span><span></span><span></span></div></div>
    `;
    elements.chatMessages.appendChild(indicator);
    scrollToBottom();
    return indicator;
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function formatMessage(text) {
    // Remove command tags from the displayed text
    const cleanText = text.replace(/\[COMMAND: [^\]]+\]/g, '').trim();
    const div = document.createElement('div');
    div.textContent = cleanText;
    return div.innerHTML.replace(/\n/g, '<br>');
}

async function processSystemCommands(text) {
    const commandMatch = text.match(/\[COMMAND: ([^\]]+)\]/);
    if (commandMatch) {
        const command = commandMatch[1];
        console.log(`Detected system command: ${command}`);
        
        try {
            const response = await fetch('/api/system/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ command })
            });
            
            const data = await response.json();
            if (response.ok) {
                showToast(`Assistant: ${data.message}`, 'info');
            } else {
                console.error('System command failed:', data.error);
            }
        } catch (error) {
            console.error('Error executing system command:', error);
        }
    }
}

function scrollToBottom() {
    if (elements.chatMessages) elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function loadSettings() {
    const theme = localStorage.getItem('theme') || 'light';
    const autoPlay = localStorage.getItem('autoPlayVoice') === 'true';
    const fontSize = localStorage.getItem('fontSize') || '14';
    if (theme === 'dark') document.body.classList.add('dark');
    document.body.style.fontSize = fontSize + 'px';
    const themeSelect = getEl('themeSelect');
    if (themeSelect) themeSelect.value = theme;
    const autoPlayCheck = getEl('autoPlayVoice');
    if (autoPlayCheck) autoPlayCheck.checked = autoPlay;
    const fontSizeRange = getEl('fontSize');
    if (fontSizeRange) fontSizeRange.value = fontSize;
}

addSafeListener(getEl('saveSettingsBtn'), 'click', () => {
    const theme = getEl('themeSelect').value;
    const autoPlay = getEl('autoPlayVoice').checked;
    const fontSize = getEl('fontSize').value;
    localStorage.setItem('theme', theme);
    localStorage.setItem('autoPlayVoice', autoPlay);
    localStorage.setItem('fontSize', fontSize);
    if (theme === 'dark') document.body.classList.add('dark');
    else document.body.classList.remove('dark');
    document.body.style.fontSize = fontSize + 'px';
    if (elements.settingsModal) elements.settingsModal.classList.remove('active');
    showToast('Settings saved!', 'success');
});

// Weather Analysis
async function handleWeatherRequest() {
    addMessageToUI('user', "What's the weather like?");
    const typingIndicator = showTypingIndicator();
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const { latitude, longitude } = pos.coords;
            const res = await fetch('/api/weather', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ lat: latitude, lon: longitude })
            });
            const data = await res.json();
            if (typingIndicator) typingIndicator.remove();
            displayWeatherReport(data);
        });
    }
}

function displayWeatherReport(data) {
    let report = `### 🌦️ Weather Report\n\n**Current**: ${data.current.temperature}°C\n\n**Forecast**:\n`;
    for(let i=0; i<7; i++) report += `- ${data.forecast.time[i]}: ${data.forecast.temperature_2m_max[i]}°C\n`;
    addMessageToUI('assistant', report);
}

loadWelcomeScreen();