// Advanced chat features (additional utilities)
// This file extends the main chat functionality

class ChatManager {
    constructor() {
        this.conversations = new Map();
    }
    
    saveConversation(conversation) {
        this.conversations.set(conversation.id, conversation);
        const conversations = JSON.parse(localStorage.getItem('conversations_backup') || '[]');
        const index = conversations.findIndex(c => c.id === conversation.id);
        if (index >= 0) {
            conversations[index] = conversation;
        } else {
            conversations.unshift(conversation);
        }
        localStorage.setItem('conversations_backup', JSON.stringify(conversations.slice(0, 20)));
    }
    
    loadConversations() {
        return JSON.parse(localStorage.getItem('conversations_backup') || '[]');
    }
    
    deleteConversation(id) {
        this.conversations.delete(id);
        const conversations = JSON.parse(localStorage.getItem('conversations_backup') || '[]');
        const filtered = conversations.filter(c => c.id !== id);
        localStorage.setItem('conversations_backup', JSON.stringify(filtered));
    }
    
    exportConversations() {
        const conversations = this.loadConversations();
        const data = JSON.stringify(conversations, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat_export_${new Date().toISOString()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Conversations exported!', 'success');
    }
    
    searchConversations(query) {
        const conversations = this.loadConversations();
        const results = [];
        
        for (const conv of conversations) {
            if (conv.messages) {
                const matches = conv.messages.filter(msg => 
                    msg.content && msg.content.toLowerCase().includes(query.toLowerCase())
                );
                if (matches.length > 0) {
                    results.push({
                        conversation: conv,
                        matches: matches
                    });
                }
            }
        }
        
        return results;
    }
}

// Initialize chat manager
const chatManager = new ChatManager();
window.chatManager = chatManager;

// Add copy functionality to messages
function addCopyButtonToMessages() {
    document.querySelectorAll('.message-text').forEach((msgElement, index) => {
        if (!msgElement.parentElement.querySelector('.copy-btn')) {
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
            copyBtn.style.cssText = `
                position: absolute;
                top: 5px;
                right: 5px;
                background: none;
                border: none;
                cursor: pointer;
                opacity: 0;
                transition: opacity 0.2s;
                padding: 4px;
                border-radius: 4px;
            `;
            copyBtn.onclick = () => {
                const text = msgElement.innerText;
                navigator.clipboard.writeText(text);
                showToast('Copied to clipboard!', 'success');
            };
            msgElement.parentElement.style.position = 'relative';
            msgElement.parentElement.appendChild(copyBtn);
            
            msgElement.parentElement.addEventListener('mouseenter', () => {
                copyBtn.style.opacity = '1';
            });
            msgElement.parentElement.addEventListener('mouseleave', () => {
                copyBtn.style.opacity = '0';
            });
        }
    });
}

// Format code blocks in messages
function formatCodeBlocks() {
    document.querySelectorAll('.message-text pre').forEach(pre => {
        const code = pre.textContent;
        const language = pre.getAttribute('data-language') || 'code';
        pre.innerHTML = `<code class="language-${language}">${escapeHtml(code)}</code>`;
    });
}

// Escape HTML for code blocks
function escapeHtmlForCode(text) {
    return text.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Auto-resize for all textareas
document.querySelectorAll('textarea').forEach(textarea => {
    textarea.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K to focus on message input
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const messageInput = document.getElementById('messageInput');
        if (messageInput) messageInput.focus();
    }
    
    // Ctrl/Cmd + N for new chat
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        if (window.startNewConversation) window.startNewConversation();
    }
    
    // Escape to close modals
    if (e.key === 'Escape') {
        const modals = document.querySelectorAll('.modal.active');
        modals.forEach(modal => modal.classList.remove('active'));
    }
});

// Monitor connection status
let connectionCheckInterval = null;

function startConnectionMonitoring() {
    if (connectionCheckInterval) clearInterval(connectionCheckInterval);
    
    connectionCheckInterval = setInterval(async () => {
        try {
            const response = await fetch('/health');
            if (response.ok) {
                document.body.classList.remove('offline');
            } else {
                document.body.classList.add('offline');
            }
        } catch (error) {
            document.body.classList.add('offline');
        }
    }, 30000); // Check every 30 seconds
}

// Add offline indicator to body
const offlineStyle = document.createElement('style');
offlineStyle.textContent = `
    body.offline::before {
        content: "⚠️ Connection lost. Check if backend is running on port 5000";
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #ef4444;
        color: white;
        text-align: center;
        padding: 8px;
        z-index: 10000;
        font-size: 14px;
    }
    body.offline {
        padding-top: 40px;
    }
`;
document.head.appendChild(offlineStyle);

// Start monitoring when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startConnectionMonitoring);
} else {
    startConnectionMonitoring();
}

// Export functions for debugging
window.debug = {
    chatManager,
    clearStorage: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        localStorage.removeItem('conversations_backup');
        showToast('Storage cleared. Refresh the page.', 'info');
    },
    testApi: async () => {
        try {
            const response = await fetch('/health');
            const data = await response.json();
            console.log('API Status:', data);
            showToast('API is reachable!', 'success');
        } catch (error) {
            console.error('API Error:', error);
            showToast('API is not reachable. Make sure backend is running on port 5000', 'error');
        }
    }
};

console.log('Chat.js loaded. Use window.debug.testApi() to test connection');