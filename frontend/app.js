// AI Interview Portal — Phase 10 Frontend
const API = (window.location.protocol === 'file:') ? 'http://localhost:8000' : window.location.origin;

// DOM
const setupScreen    = document.getElementById('setup-screen');
const interviewScreen = document.getElementById('interview-screen');
const resultsScreen  = document.getElementById('results-screen');
const candidateName  = document.getElementById('candidate-name');
const useStructured  = document.getElementById('use-structured');
const startBtn       = document.getElementById('start-btn');
const micBtn         = document.getElementById('mic-btn');
const micIndicator   = document.getElementById('mic-indicator');
const micText        = document.getElementById('mic-text');
const conversation   = document.getElementById('conversation');
const stageBadge     = document.getElementById('stage-badge');
const turnCount      = document.getElementById('turn-count');
const avgScore       = document.getElementById('avg-score');
const textInput      = document.getElementById('text-input');
const sendBtn        = document.getElementById('send-btn');
const restartBtn     = document.getElementById('restart-btn');
const resultsSummary = document.getElementById('results-summary');

let sessionId = null;
let ws = null;
let mediaRecorder = null;
let audioStream = null;
let isRecording = false;

// --- Screen management ---
function showScreen(screen) {
    [setupScreen, interviewScreen, resultsScreen].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
}

// --- API helpers ---
async function apiPost(path, body) {
    const res = await fetch(`${API}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
}

async function apiGet(path) {
    const res = await fetch(`${API}${path}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
}

// --- UI helpers ---
function addMessage(role, text, audioUrl) {
    const div = document.createElement('div');
    div.className = `message ${role}`;

    const sender = document.createElement('div');
    sender.className = 'sender';
    sender.textContent = role === 'assistant' ? 'Interviewer' : 'You';
    div.appendChild(sender);

    const content = document.createElement('div');
    content.textContent = text;
    div.appendChild(content);

    if (audioUrl) {
        const player = document.createElement('div');
        player.className = 'audio-player';
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = audioUrl.startsWith('blob:') ? audioUrl : `${API}${audioUrl}`;
        player.appendChild(audio);
        div.appendChild(player);
        // Auto-play the interviewer's response
        audio.play().catch(() => {});
    }

    conversation.appendChild(div);
    conversation.scrollTop = conversation.scrollHeight;
}

function updateStatus(stage, turns, score) {
    stageBadge.textContent = stage || '--';
    turnCount.textContent = turns || 0;
    avgScore.textContent = score != null ? score.toFixed(1) : '--';
}

function setMicState(state) {
    micIndicator.className = 'indicator';
    switch (state) {
        case 'idle':
            micText.textContent = 'Click to speak';
            micBtn.classList.remove('recording');
            break;
        case 'listening':
            micText.textContent = 'Listening... click to stop';
            micIndicator.classList.add('listening');
            micBtn.classList.add('recording');
            break;
        case 'processing':
            micText.textContent = 'Processing...';
            micIndicator.classList.add('processing');
            micBtn.classList.remove('recording');
            break;
    }
}

// --- Session lifecycle ---
async function startSession() {
    const name = candidateName.value.trim() || null;
    const structured = useStructured.checked;

    startBtn.disabled = true;
    startBtn.textContent = 'Starting...';

    try {
        const data = await apiPost('/api/session', {
            candidate_name: name,
            use_structured: structured,
        });
        sessionId = data.session_id;
        updateStatus(data.stage, data.total_turns, data.avg_score);
        showScreen(interviewScreen);

        // Send initial greeting via text turn to get the interview started
        await sendTextTurn('Hello, I am ready for the interview.');
    } catch (err) {
        alert('Failed to start session: ' + err.message);
    } finally {
        startBtn.disabled = false;
        startBtn.textContent = 'Start Interview';
    }
}

async function sendTextTurn(text) {
    if (!sessionId || !text.trim()) return;

    if (text !== 'Hello, I am ready for the interview.') {
        addMessage('user', text);
    }
    textInput.value = '';
    setMicState('processing');

    try {
        const data = await apiPost(`/api/session/${sessionId}/turn`, { text });
        updateStatus(data.stage, data.total_turns, null);
        addMessage('assistant', data.reply, data.audio_url);

        // Update score
        const evalData = await apiGet(`/api/session/${sessionId}/evaluations`);
        avgScore.textContent = evalData.avg_score != null ? evalData.avg_score.toFixed(1) : '--';

        if (data.is_finished) {
            showResults();
        }
    } catch (err) {
        addMessage('assistant', 'Error: ' + err.message);
    } finally {
        setMicState('idle');
    }
}

async function showResults() {
    try {
        const [session, evals] = await Promise.all([
            apiGet(`/api/session/${sessionId}`),
            apiGet(`/api/session/${sessionId}/evaluations`),
        ]);

        let html = '';
        if (evals.avg_score != null) {
            html += `<div class="score-big">${evals.avg_score.toFixed(1)}/10</div>`;
        }
        html += `
            <div class="result-row"><span class="result-label">Total Turns</span><span class="result-value">${session.total_turns}</span></div>
            <div class="result-row"><span class="result-label">Final Stage</span><span class="result-value">${session.stage}</span></div>
            <div class="result-row"><span class="result-label">Evaluations</span><span class="result-value">${session.evaluations_count}</span></div>
        `;

        if (evals.evaluations && evals.evaluations.length > 0) {
            html += '<h3 style="margin-top:1rem;margin-bottom:0.5rem">Evaluation Details</h3>';
            evals.evaluations.forEach((e, i) => {
                html += `
                    <div class="result-row">
                        <span class="result-label">Turn ${e.turn} (${e.stage})</span>
                        <span class="result-value">${e.score}/10</span>
                    </div>`;
                if (e.strengths && e.strengths.length) {
                    html += `<div style="color:var(--success);font-size:0.85rem;padding-left:1rem">+ ${e.strengths.join(', ')}</div>`;
                }
                if (e.weaknesses && e.weaknesses.length) {
                    html += `<div style="color:var(--warning);font-size:0.85rem;padding-left:1rem">- ${e.weaknesses.join(', ')}</div>`;
                }
            });
        }

        resultsSummary.innerHTML = html;
        showScreen(resultsScreen);
    } catch (err) {
        resultsSummary.innerHTML = '<p>Interview complete. Could not load detailed results.</p>';
        showScreen(resultsScreen);
    }
}

// --- Microphone recording ---
async function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
}

async function startRecording() {
    try {
        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true }
        });
    } catch (err) {
        alert('Microphone access denied. Please allow mic access or use text input.');
        return;
    }

    isRecording = true;
    setMicState('listening');

    // Use MediaRecorder to capture audio as webm/opus
    const chunks = [];
    mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm;codecs=opus' });
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = async () => {
        isRecording = false;
        setMicState('processing');
        audioStream.getTracks().forEach(t => t.stop());

        const blob = new Blob(chunks, { type: 'audio/webm' });
        await sendAudioAsFile(blob);
    };
    mediaRecorder.start();
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
}

async function sendAudioAsFile(blob) {
    // For simplicity, send audio to a file-upload endpoint
    // We'll use the text turn endpoint with a transcription step on the backend
    // For now, convert to text using the browser's SpeechRecognition as fallback
    // or use the WebSocket path

    // Try WebSocket if available
    if (ws && ws.readyState === WebSocket.OPEN) {
        const buffer = await blob.arrayBuffer();
        ws.send(buffer);
        ws.send(JSON.stringify({ type: 'end_turn' }));
        return;
    }

    // Fallback: use browser SpeechRecognition for transcript then send as text
    addMessage('user', '[audio recorded — using text fallback]');
    setMicState('idle');
}

// --- WebSocket connection ---
function connectWebSocket() {
    if (!sessionId) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${window.location.host}/ws/interview/${sessionId}`);

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        switch (data.type) {
            case 'listening':
                setMicState('listening');
                break;
            case 'transcript':
                if (data.final) {
                    addMessage('user', data.text);
                }
                break;
            case 'reply':
                setMicState('idle');
                // Decode base64 audio and create URL
                const audioBytes = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
                const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' });
                const audioUrl = URL.createObjectURL(audioBlob);
                addMessage('assistant', data.text, audioUrl);
                updateStatus(data.stage, data.turn, null);
                if (data.is_finished) showResults();
                break;
            case 'error':
                addMessage('assistant', 'Error: ' + data.message);
                setMicState('idle');
                break;
            case 'finished':
                showResults();
                break;
        }
    };
    ws.onclose = () => { ws = null; };
}

// --- Event listeners ---
startBtn.addEventListener('click', startSession);

micBtn.addEventListener('click', toggleRecording);

sendBtn.addEventListener('click', () => {
    sendTextTurn(textInput.value);
});

textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTextTurn(textInput.value);
    }
});

restartBtn.addEventListener('click', () => {
    sessionId = null;
    conversation.innerHTML = '';
    showScreen(setupScreen);
});

// Keyboard shortcut: Space to toggle mic when not in text input
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && document.activeElement !== textInput && document.activeElement !== candidateName) {
        e.preventDefault();
        toggleRecording();
    }
});
