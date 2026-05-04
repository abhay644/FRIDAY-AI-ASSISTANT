// Voice recording and playback functionality
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recognition = null;
let isVoiceMode = false;

// DOM Elements
const voiceInputBtn = document.getElementById('voiceInputBtn');
const voiceModeBtn = document.getElementById('voiceModeBtn');
const recordingIndicator = document.getElementById('recordingIndicator');
const messageInput = document.getElementById('messageInput');

// Initialize speech recognition for instant feedback
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (voiceInputBtn) {
    voiceInputBtn.addEventListener('click', toggleVoiceInput);
}

if (recordingIndicator) {
    recordingIndicator.addEventListener('click', stopRecording);
}

if (voiceModeBtn) {
    voiceModeBtn.addEventListener('click', toggleVoiceMode);
}

async function toggleVoiceInput() {
    if (isRecording) {
        stopRecording();
        return;
    }

    // Prefer SpeechRecognition for "responsive" feel (real-time text)
    if (SpeechRecognition) {
        startSpeechRecognition();
    } else {
        // Fallback to MediaRecorder + Backend STT
        startRecording();
    }
}

function startSpeechRecognition() {
    if (recognition) {
        recognition.stop();
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'en-US'; // Default to English, can be made dynamic
    recognition.interimResults = true;
    
    recognition.onstart = () => {
        isRecording = true;
        voiceInputBtn.classList.add('recording-active');
        voiceInputBtn.innerHTML = '<i class="fas fa-stop"></i>';
        showToast('Listening...', 'info');
        if (recordingIndicator) recordingIndicator.style.display = 'flex';
    };

    recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
            .map(result => result[0].transcript)
            .join('');
        
        if (messageInput) {
            messageInput.value = transcript;
            messageInput.style.height = 'auto';
            messageInput.style.height = messageInput.scrollHeight + 'px';
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        showToast(`Error: ${event.error}`, 'error');
        stopSpeechRecognition();
    };

    recognition.onend = () => {
        if (isRecording && !isVoiceMode) {
            stopSpeechRecognition();
            // Auto-send if there's text
            if (messageInput && messageInput.value.trim() && window.sendMessage) {
                setTimeout(() => window.sendMessage(), 300);
            }
        }
    };

    recognition.start();
}

function stopSpeechRecognition() {
    isRecording = false;
    if (recognition) {
        recognition.stop();
        recognition = null;
    }
    voiceInputBtn.classList.remove('recording-active');
    voiceInputBtn.innerHTML = '<i class="fas fa-microphone-alt"></i>';
    if (recordingIndicator) recordingIndicator.style.display = 'none';
}

// MediaRecorder Fallback (for browsers without SpeechRecognition)
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            if (audioBlob.size > 1000) {
                await sendAudioToServer(audioBlob);
            } else {
                showToast('Recording too short', 'warning');
            }
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        isRecording = true;
        voiceInputBtn.classList.add('recording-active');
        voiceInputBtn.innerHTML = '<i class="fas fa-stop"></i>';
        if (recordingIndicator) recordingIndicator.style.display = 'flex';
        
    } catch (error) {
        console.error('Mic access error:', error);
        showToast('Microphone access denied', 'error');
    }
}

function stopRecording() {
    if (recognition) {
        stopSpeechRecognition();
    } else if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        voiceInputBtn.classList.remove('recording-active');
        voiceInputBtn.innerHTML = '<i class="fas fa-microphone-alt"></i>';
        if (recordingIndicator) recordingIndicator.style.display = 'none';
    }
}

async function sendAudioToServer(audioBlob) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    
    showToast('Processing speech...', 'info');
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/voice/stt', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        const data = await response.json();
        if (response.ok && data.text) {
            if (messageInput) {
                messageInput.value = data.text;
                if (window.sendMessage) window.sendMessage();
            }
        } else {
            showToast(data.error || 'STT failed', 'error');
        }
    } catch (error) {
        console.error('STT error:', error);
        showToast('Speech recognition error', 'error');
    }
}

// Voice Mode (Continuous Listening)
function toggleVoiceMode() {
    isVoiceMode = !isVoiceMode;
    if (isVoiceMode) {
        voiceModeBtn.style.color = 'var(--danger-color)';
        voiceModeBtn.classList.add('active');
        showToast('Voice mode active', 'success');
        startContinuousListening();
    } else {
        voiceModeBtn.style.color = '';
        voiceModeBtn.classList.remove('active');
        stopContinuousListening();
    }
}

function startContinuousListening() {
    if (!SpeechRecognition) {
        showToast('Continuous listening not supported', 'error');
        isVoiceMode = false;
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
            .map(result => result[0].transcript)
            .join('');
        
        if (messageInput) {
            if (event.results[event.results.length - 1].isFinal) {
                messageInput.value = transcript;
                if (window.sendMessage) window.sendMessage();
            } else {
                messageInput.placeholder = `Listening: ${transcript}`;
            }
        }
    };

    recognition.onend = () => {
        if (isVoiceMode) recognition.start();
    };

    recognition.start();
}

function stopContinuousListening() {
    if (recognition) {
        recognition.onend = null;
        recognition.stop();
        recognition = null;
    }
    if (messageInput) messageInput.placeholder = 'Type your message here...';
}

// Text-to-Speech
window.speakText = async function(text) {
    if (!text || !text.trim()) return;
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/voice/tts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ text: text })
        });
        
        const data = await response.json();
        
        if (response.ok && data.audio_url) {
            const audio = new Audio(data.audio_url);
            audio.play().catch(() => browserTTS(text));
        } else {
            browserTTS(text);
        }
    } catch (error) {
        browserTTS(text);
    }
};

function browserTTS(text) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    }
}