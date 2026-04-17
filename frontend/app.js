// AI Interview Portal — Full Frontend
const API = (window.location.protocol === 'file:') ? 'http://localhost:8000' : window.location.origin;

// --- DOM refs ---
const setupScreen     = document.getElementById('setup-screen');
const interviewScreen = document.getElementById('interview-screen');
const resultsScreen   = document.getElementById('results-screen');
const jobsScreen      = document.getElementById('jobs-screen');
const applyScreen     = document.getElementById('apply-screen');
const companyScreen   = document.getElementById('company-screen');
const candidateName   = document.getElementById('candidate-name');
const useStructured   = document.getElementById('use-structured');
const startBtn        = document.getElementById('start-btn');
const micBtn          = document.getElementById('mic-btn');
const micIndicator    = document.getElementById('mic-indicator');
const micText         = document.getElementById('mic-text');
const conversation    = document.getElementById('conversation');
const stageBadge      = document.getElementById('stage-badge');
const turnCount       = document.getElementById('turn-count');
const avgScore        = document.getElementById('avg-score');
const textInput       = document.getElementById('text-input');
const sendBtn         = document.getElementById('send-btn');
const restartBtn      = document.getElementById('restart-btn');
const resultsSummary  = document.getElementById('results-summary');
const cameraBtn       = document.getElementById('camera-btn');
const speakerBtn      = document.getElementById('speaker-btn');
const cameraFeed      = document.getElementById('camera-feed');
const cameraPlaceholder = document.getElementById('camera-placeholder');
const speakingIndicator = document.getElementById('speaking-indicator');
const resumeUpload    = document.getElementById('resume-upload');
const resumeStatus    = document.getElementById('resume-status');
const navTabs         = document.getElementById('nav-tabs');

let sessionId = null;
let resumeId = null;
let jobId = null;
let mediaRecorder = null;
let audioStream = null;
let isRecording = false;        // recording a single utterance
let cameraStream = null;
let isCameraOn = false;
let isSpeakerOn = true;
let antiCheat = null;
let questionShownAt = 0;
let companyId = null;
let companyToken = null;
let currentTypingAnimation = null;

// --- VAD (Voice Activity Detection) state ---
let vad = {
    enabled: true,
    muted: false,              // user toggled the mic off
    audioCtx: null,
    analyser: null,
    sourceNode: null,
    rafId: null,
    recorder: null,
    chunks: [],
    speaking: false,           // candidate is currently producing speech
    speechStartAt: 0,
    lastSpeechAt: 0,
    processing: false,         // we're uploading / waiting for a reply
    interviewerSpeaking: false // we pause VAD while the interviewer talks
};
const VAD_RMS_THRESHOLD = 0.022;   // energy above this = probable speech
const VAD_SILENCE_MS = 1400;       // end-of-utterance after this much silence
const VAD_MIN_UTTERANCE_MS = 700;  // discard blips shorter than this

// --- Screen management ---
function showScreen(screen) {
    [setupScreen, interviewScreen, resultsScreen, jobsScreen, applyScreen, companyScreen].forEach(s => {
        if (s) s.classList.remove('active');
    });
    screen.classList.add('active');
    if (navTabs) {
        navTabs.style.display = (screen === interviewScreen || screen === resultsScreen) ? 'none' : 'flex';
    }
}

// --- Nav tabs ---
if (navTabs) {
    navTabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.nav-tab');
        if (!tab) return;
        navTabs.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const screenId = tab.dataset.screen;
        const screen = document.getElementById(screenId);
        if (screen) showScreen(screen);
        if (screenId === 'jobs-screen') loadJobs();
    });
}

// --- API helpers ---
async function apiPost(path, body, authToken) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(`${API}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const detail = await res.text();
        throw new Error(`${res.status}: ${detail}`);
    }
    return res.json();
}

async function apiGet(path, authToken) {
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(`${API}${path}`, { headers });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
}

// --- Browser TTS with word-by-word sync ---
function speakText(text, contentEl) {
    if (!isSpeakerOn || !('speechSynthesis' in window)) {
        // No speech — just reveal all text immediately
        if (contentEl) contentEl.textContent = text;
        onSpeechFinished();
        return;
    }
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.3;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en'))
                   || voices.find(v => v.lang.startsWith('en-US'))
                   || voices.find(v => v.lang.startsWith('en'));
    if (preferred) utterance.voice = preferred;

    speakingIndicator.classList.add('active');

    // Word-by-word typing animation synced with speech duration
    if (contentEl) {
        const words = text.split(' ');
        // Estimate speech duration: ~150 words/min at rate 1.3 => ~115ms per word adjusted
        const msPerWord = Math.max(60, (60000 / (150 * utterance.rate)) * 0.9);
        contentEl.textContent = '';
        let wordIndex = 0;

        // Cancel any previous animation
        if (currentTypingAnimation) clearInterval(currentTypingAnimation);

        currentTypingAnimation = setInterval(() => {
            if (wordIndex < words.length) {
                contentEl.textContent += (wordIndex > 0 ? ' ' : '') + words[wordIndex];
                wordIndex++;
                conversation.scrollTop = conversation.scrollHeight;
            } else {
                clearInterval(currentTypingAnimation);
                currentTypingAnimation = null;
            }
        }, msPerWord);
    }

    utterance.onend = () => {
        speakingIndicator.classList.remove('active');
        // Ensure all text is revealed when speech ends
        if (contentEl) {
            if (currentTypingAnimation) {
                clearInterval(currentTypingAnimation);
                currentTypingAnimation = null;
            }
            contentEl.textContent = text;
        }
        onSpeechFinished();
    };
    utterance.onerror = () => {
        speakingIndicator.classList.remove('active');
        if (contentEl) contentEl.textContent = text;
        if (currentTypingAnimation) {
            clearInterval(currentTypingAnimation);
            currentTypingAnimation = null;
        }
        onSpeechFinished();
    };

    window.speechSynthesis.speak(utterance);
}

// Called both when TTS finishes and when the typed-text animation completes.
// Resumes VAD so the candidate can respond without clicking.
function onSpeechFinished() {
    vad.interviewerSpeaking = false;
    if (!sessionId) return;
    if (vad.audioCtx && !vad.muted) {
        setMicState('listening');
    }
}

if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
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
    div.appendChild(content);

    conversation.appendChild(div);
    conversation.scrollTop = conversation.scrollHeight;

    if (role === 'assistant') {
        // While the interviewer talks we pause VAD so our own TTS doesn't
        // get picked up as the candidate speaking.
        vad.interviewerSpeaking = true;
        // For assistant: typing animation synced with speech, no audio player controls
        if (audioUrl) {
            // Server TTS available — play it hidden, type along
            const audio = new Audio(audioUrl.startsWith('blob:') ? audioUrl : `${API}${audioUrl}`);
            audio.play().catch(() => {});
            // Still do typing animation
            const words = text.split(' ');
            const msPerWord = 100;
            content.textContent = '';
            let i = 0;
            if (currentTypingAnimation) clearInterval(currentTypingAnimation);
            currentTypingAnimation = setInterval(() => {
                if (i < words.length) {
                    content.textContent += (i > 0 ? ' ' : '') + words[i];
                    i++;
                    conversation.scrollTop = conversation.scrollHeight;
                } else {
                    clearInterval(currentTypingAnimation);
                    currentTypingAnimation = null;
                }
            }, msPerWord);
            speakingIndicator.classList.add('active');
            audio.onended = () => {
                speakingIndicator.classList.remove('active');
                if (currentTypingAnimation) {
                    clearInterval(currentTypingAnimation);
                    currentTypingAnimation = null;
                }
                content.textContent = text;
                onSpeechFinished();
            };
        } else {
            // Browser TTS — typing animation synced with speech
            speakText(text, content);
        }
        questionShownAt = Date.now();
    } else {
        // User messages appear instantly
        content.textContent = text;
    }
}

function updateStatus(stage, turns, score) {
    stageBadge.textContent = stage || '--';
    turnCount.textContent = turns || 0;
    if (score != null) avgScore.textContent = score.toFixed(1);
}

function setMicState(state) {
    micIndicator.className = 'indicator';
    switch (state) {
        case 'idle':
            micText.textContent = vad.muted ? 'Mic muted — click to unmute' : 'Mic off';
            micBtn.classList.remove('recording');
            break;
        case 'listening':
            micText.textContent = 'Listening — just speak, pause when done';
            micIndicator.classList.add('listening');
            micBtn.classList.add('recording');
            break;
        case 'speaking':
            micText.textContent = 'Hearing you...';
            micIndicator.classList.add('listening');
            micBtn.classList.add('recording');
            break;
        case 'processing':
            micText.textContent = 'Thinking...';
            micIndicator.classList.add('processing');
            micBtn.classList.remove('recording');
            break;
        case 'muted':
            micText.textContent = 'Mic muted — click to unmute';
            micBtn.classList.remove('recording');
            break;
    }
}

// --- Camera ---
async function findSystemCamera() {
    try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
        tempStream.getTracks().forEach(t => t.stop());
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        if (videoDevices.length === 0) return null;
        if (videoDevices.length === 1) return videoDevices[0].deviceId;
        const skipPatterns = /phone|android|iphone|virtual|obs|snap|droid|mobile/i;
        const preferPatterns = /integrated|built-in|webcam|hd camera|usb camera|facetime|front/i;
        const preferred = videoDevices.find(d => preferPatterns.test(d.label) && !skipPatterns.test(d.label));
        if (preferred) return preferred.deviceId;
        const fallback = videoDevices.find(d => !skipPatterns.test(d.label));
        if (fallback) return fallback.deviceId;
        return videoDevices[0].deviceId;
    } catch (err) { return null; }
}

async function startCamera() {
    try {
        const deviceId = await findSystemCamera();
        const constraints = deviceId
            ? { video: { deviceId: { exact: deviceId }, width: 320, height: 240 } }
            : { video: { width: 320, height: 240 } };
        cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        cameraFeed.srcObject = cameraStream;
        cameraFeed.onloadedmetadata = () => {
            cameraFeed.play();
            cameraFeed.classList.remove('hidden');
            cameraPlaceholder.classList.add('hidden');
        };
        isCameraOn = true;
        cameraBtn.classList.add('active');
        if (antiCheat && sessionId) {
            antiCheat.attachCamera(cameraFeed, cameraStream, onCameraLost);
        }
    } catch (err) {
        cameraFeed.classList.add('hidden');
        cameraPlaceholder.classList.remove('hidden');
        cameraPlaceholder.querySelector('span').textContent = 'Camera denied';
        isCameraOn = false;
        cameraBtn.classList.remove('active');
    }
}

// Called by AntiCheatMonitor when the camera track ends unexpectedly (user
// stopped it from the browser UI, unplugged the device, revoked permission).
async function onCameraLost() {
    if (!sessionId) return;
    isCameraOn = false;
    cameraBtn.classList.remove('active');
    cameraFeed.classList.add('hidden');
    cameraPlaceholder.classList.remove('hidden');
    cameraPlaceholder.querySelector('span').textContent = 'Camera required — restarting...';
    // Try to restart once; if it fails the warning banner from anticheat stays up.
    setTimeout(() => { if (sessionId && !isCameraOn) startCamera(); }, 1000);
}

function stopCamera() {
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
    cameraFeed.srcObject = null;
    cameraFeed.classList.add('hidden');
    cameraPlaceholder.classList.remove('hidden');
    cameraPlaceholder.querySelector('span').textContent = 'Camera off';
    isCameraOn = false;
    cameraBtn.classList.remove('active');
}

// Builds the rich resume-analysis panel shown after upload. Each field
// is labelled with what it will be used for downstream (tailoring
// questions, selecting topics, driving AI-detection weighting, etc.)
// so the candidate can see exactly what the system extracted.
function renderResumeSummary(data) {
    const esc = (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const chips = (arr) => (arr || []).map(x => `<span class="chip">${esc(x)}</span>`).join('');
    const section = (label, content, hint) => content
        ? `<div class="resume-section">
             <div class="resume-label">${label}${hint ? ` <span class="resume-hint">— ${hint}</span>` : ''}</div>
             <div class="resume-value">${content}</div>
           </div>`
        : '';
    const skills = chips(data.skills);
    const domains = chips(data.domains);
    const projects = (data.key_projects || []).map(p => `<li>${esc(p)}</li>`).join('');
    const suggestions = (data.suggested_questions || []).slice(0, 5).map(q => `<li>${esc(q)}</li>`).join('');
    return `
      <div class="resume-summary">
        <div class="resume-header">Resume parsed successfully</div>
        ${section('Skills', skills || '<em>none detected</em>', 'used to tailor technical questions')}
        ${section('Experience', data.experience_years ? `${esc(data.experience_years)} years` : '', 'calibrates question difficulty')}
        ${section('Domains', domains, 'biases topic selection (backend, ML, mobile, etc.)')}
        ${section('Education', esc(data.education), 'context for theoretical questions')}
        ${section('Summary', esc(data.experience_summary), 'shown to the interviewer LLM as background')}
        ${projects ? section('Key projects', `<ul>${projects}</ul>`, 'the interviewer will drill into these') : ''}
        ${suggestions ? section('Suggested questions', `<ol>${suggestions}</ol>`, 'seeded into the interview topic pool') : ''}
      </div>
    `;
}

// --- Resume Upload ---
if (resumeUpload) {
    resumeUpload.addEventListener('change', async () => {
        const file = resumeUpload.files[0];
        if (!file) return;
        resumeStatus.textContent = 'Uploading and analyzing resume...';
        resumeStatus.className = 'upload-status processing';
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('candidate_name', candidateName.value.trim());
            const res = await fetch(`${API}/api/resume/upload`, { method: 'POST', body: formData });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            resumeId = data.resume_id;
            resumeStatus.innerHTML = renderResumeSummary(data);
            resumeStatus.className = 'upload-status success';
        } catch (err) {
            resumeStatus.textContent = 'Failed to parse resume: ' + err.message;
            resumeStatus.className = 'upload-status error';
        }
    });
}

// --- Session lifecycle ---
async function startSession() {
    const name = candidateName.value.trim() || null;
    const structured = useStructured.checked;
    startBtn.disabled = true;
    startBtn.textContent = 'Starting...';
    try {
        const data = await apiPost('/api/session', {
            candidate_name: name, use_structured: structured, resume_id: resumeId, job_id: jobId,
        });
        sessionId = data.session_id;
        updateStatus(data.stage, data.total_turns, data.avg_score);
        showScreen(interviewScreen);
        startCamera();
        antiCheat = new AntiCheatMonitor(sessionId, API);
        antiCheat.start();
        questionShownAt = Date.now();
        // Kick off always-on mic. The VAD loop auto-pauses while the
        // interviewer is speaking so the greeting won't be captured.
        startVAD();
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
    const isGreeting = text === 'Hello, I am ready for the interview.';
    if (!isGreeting) addMessage('user', text);
    textInput.value = '';
    setMicState('processing');
    const responseTime = questionShownAt ? Date.now() - questionShownAt : 0;
    try {
        const data = await apiPost(`/api/session/${sessionId}/turn`, {
            text, time_to_respond_ms: responseTime, is_voice_input: false,
        });
        updateStatus(data.stage, data.total_turns, null);
        addMessage('assistant', data.reply, data.audio_url);
        try {
            const evalData = await apiGet(`/api/session/${sessionId}/evaluations`);
            avgScore.textContent = evalData.avg_score != null ? evalData.avg_score.toFixed(1) : '--';
        } catch (_) {}
        if (data.is_finished) showResults();
    } catch (err) {
        addMessage('assistant', 'Error: ' + err.message);
    } finally {
        setMicState('idle');
    }
}

async function showResults() {
    stopVAD();
    stopCamera();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (currentTypingAnimation) { clearInterval(currentTypingAnimation); currentTypingAnimation = null; }
    if (antiCheat) await antiCheat.stop();
    try {
        const [session, evals] = await Promise.all([
            apiGet(`/api/session/${sessionId}`),
            apiGet(`/api/session/${sessionId}/evaluations`),
        ]);
        let html = '';
        if (evals.avg_score != null) {
            html += `<div class="score-big">${evals.avg_score.toFixed(1)}/10</div>`;
        }
        if (evals.avg_ai_likelihood != null && evals.avg_ai_likelihood > 0) {
            const aiPct = (evals.avg_ai_likelihood * 100).toFixed(0);
            const aiColor = evals.avg_ai_likelihood > 0.5 ? 'var(--danger)' : evals.avg_ai_likelihood > 0.3 ? 'var(--warning)' : 'var(--success)';
            html += `<div class="result-row"><span class="result-label">AI Detection</span><span class="result-value" style="color:${aiColor}">${aiPct}% likelihood</span></div>`;
        }
        if (evals.cheating_flags_count > 0) {
            html += `<div class="result-row"><span class="result-label">Integrity Flags</span><span class="result-value" style="color:var(--warning)">${evals.cheating_flags_count} violations</span></div>`;
        }
        html += `
            <div class="result-row"><span class="result-label">Total Turns</span><span class="result-value">${session.total_turns}</span></div>
            <div class="result-row"><span class="result-label">Final Stage</span><span class="result-value">${session.stage}</span></div>
            <div class="result-row"><span class="result-label">Evaluations</span><span class="result-value">${session.evaluations_count}</span></div>
        `;
        if (evals.evaluations && evals.evaluations.length > 0) {
            html += '<h3 style="margin-top:1.5rem;margin-bottom:0.5rem">Turn-by-Turn Evaluation</h3>';
            evals.evaluations.forEach((e) => {
                const aiFlag = e.ai_likelihood > 0.5 ? ' [AI suspected]' : '';
                html += `<div class="result-row">
                    <span class="result-label">Turn ${e.turn} (${e.stage})${aiFlag}</span>
                    <span class="result-value">${e.score}/10</span>
                </div>`;
                if (e.correctness != null) {
                    html += `<div style="font-size:0.75rem;color:var(--text-muted);padding-left:1rem">
                        C:${e.correctness} D:${e.depth} Cm:${e.communication} R:${e.relevance}</div>`;
                }
                if (e.strengths && e.strengths.length) {
                    html += `<div style="color:var(--success);font-size:0.8rem;padding-left:1rem">+ ${e.strengths.join(', ')}</div>`;
                }
                if (e.weaknesses && e.weaknesses.length) {
                    html += `<div style="color:var(--warning);font-size:0.8rem;padding-left:1rem">- ${e.weaknesses.join(', ')}</div>`;
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

// --- Always-on mic with Voice Activity Detection ---
//
// Once the interview starts we hold an open audio stream and continuously
// analyze RMS energy. When energy rises above VAD_RMS_THRESHOLD we start a
// MediaRecorder; when energy stays below the threshold for VAD_SILENCE_MS
// we stop the recorder and submit the utterance as a turn. The mic button
// becomes a mute toggle instead of a push-to-talk button.

async function startVAD() {
    if (vad.audioCtx) return; // already running
    try {
        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            }
        });
    } catch (err) {
        alert('Microphone access denied. Please allow mic access to continue.');
        vad.enabled = false;
        return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    vad.audioCtx = new AudioCtx();
    vad.sourceNode = vad.audioCtx.createMediaStreamSource(audioStream);
    vad.analyser = vad.audioCtx.createAnalyser();
    vad.analyser.fftSize = 1024;
    vad.sourceNode.connect(vad.analyser);
    setMicState('listening');
    vadLoop();
}

function vadLoop() {
    const buf = new Float32Array(vad.analyser.fftSize);
    const tick = () => {
        if (!vad.audioCtx) return;
        vad.analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        const now = performance.now();

        const blocked = vad.muted || vad.processing || vad.interviewerSpeaking;
        const above = rms > VAD_RMS_THRESHOLD;

        if (!blocked) {
            if (above) {
                vad.lastSpeechAt = now;
                if (!vad.speaking) {
                    vad.speaking = true;
                    vad.speechStartAt = now;
                    startUtteranceRecording();
                }
            } else if (vad.speaking && (now - vad.lastSpeechAt) > VAD_SILENCE_MS) {
                const duration = now - vad.speechStartAt;
                vad.speaking = false;
                if (duration >= VAD_MIN_UTTERANCE_MS) {
                    finishUtteranceRecording();
                } else {
                    discardUtteranceRecording();
                }
            }
        }

        // Visual feedback — subtle indicator animation
        if (!blocked) {
            if (vad.speaking) setMicState('speaking');
            else setMicState('listening');
        }

        vad.rafId = requestAnimationFrame(tick);
    };
    vad.rafId = requestAnimationFrame(tick);
}

function startUtteranceRecording() {
    if (!audioStream) return;
    try {
        vad.chunks = [];
        vad.recorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm;codecs=opus' });
        vad.recorder.ondataavailable = (e) => { if (e.data.size > 0) vad.chunks.push(e.data); };
        vad.recorder.start();
        isRecording = true;
    } catch (_) {
        vad.recorder = null;
    }
}

function finishUtteranceRecording() {
    if (!vad.recorder) return;
    const recorder = vad.recorder;
    vad.recorder = null;
    isRecording = false;
    recorder.onstop = async () => {
        const blob = new Blob(vad.chunks, { type: 'audio/webm' });
        vad.chunks = [];
        await sendAudioAsFile(blob);
    };
    try { recorder.stop(); } catch (_) {}
}

function discardUtteranceRecording() {
    if (!vad.recorder) return;
    const recorder = vad.recorder;
    vad.recorder = null;
    vad.chunks = [];
    isRecording = false;
    try { recorder.stop(); } catch (_) {}
}

function stopVAD() {
    if (vad.rafId) cancelAnimationFrame(vad.rafId);
    vad.rafId = null;
    if (vad.recorder) {
        try { vad.recorder.stop(); } catch (_) {}
        vad.recorder = null;
    }
    if (vad.audioCtx) {
        try { vad.audioCtx.close(); } catch (_) {}
    }
    vad.audioCtx = null;
    vad.analyser = null;
    vad.sourceNode = null;
    if (audioStream) {
        audioStream.getTracks().forEach(t => t.stop());
        audioStream = null;
    }
    vad.speaking = false;
    vad.processing = false;
    vad.interviewerSpeaking = false;
    isRecording = false;
}

async function sendAudioAsFile(blob) {
    if (!sessionId || !blob || blob.size < 2000) return; // guard empty/tiny blobs
    vad.processing = true;
    setMicState('processing');
    try {
        const formData = new FormData();
        formData.append('audio', blob, 'recording.webm');
        const res = await fetch(`${API}/api/session/${sessionId}/audio-turn`, { method: 'POST', body: formData });
        if (!res.ok) {
            const detail = await res.text();
            throw new Error(`${res.status}: ${detail}`);
        }
        const data = await res.json();
        addMessage('user', '[voice input]');
        updateStatus(data.stage, data.total_turns, null);
        addMessage('assistant', data.reply, data.audio_url);
        try {
            const evalData = await apiGet(`/api/session/${sessionId}/evaluations`);
            avgScore.textContent = evalData.avg_score != null ? evalData.avg_score.toFixed(1) : '--';
        } catch (_) {}
        if (data.is_finished) { showResults(); return; }
    } catch (err) {
        addMessage('assistant', 'Error: ' + err.message);
    } finally {
        vad.processing = false;
        if (vad.audioCtx && !vad.muted) setMicState('listening');
        else setMicState('idle');
    }
}

// --- Jobs ---
async function loadJobs() {
    const list = document.getElementById('jobs-list');
    if (!list) return;
    try {
        const jobs = await apiGet('/api/jobs');
        if (jobs.length === 0) {
            list.innerHTML = '<p class="text-muted">No open positions yet. Companies can create jobs from the Company tab.</p>';
            return;
        }
        list.innerHTML = jobs.map(j => `
            <div class="job-card">
                <div class="job-title">${j.title}</div>
                <div class="job-company">${j.company_name}</div>
                <div class="job-skills">${j.required_skills || 'No specific skills listed'}</div>
                <button class="btn btn-primary" style="margin-top:0.75rem;padding:0.5rem 1rem;font-size:0.85rem" onclick="showApplyScreen('${j.id}','${j.title.replace(/'/g, "\\'")}')">Apply</button>
            </div>
        `).join('');
    } catch (err) {
        list.innerHTML = '<p class="text-muted">Failed to load jobs.</p>';
    }
}

window.showApplyScreen = function(jid, title) {
    document.getElementById('apply-job-title').textContent = title;
    applyScreen.dataset.jobId = jid;
    showScreen(applyScreen);
};

const applySubmitBtn = document.getElementById('apply-submit-btn');
if (applySubmitBtn) {
    applySubmitBtn.addEventListener('click', async () => {
        const jid = applyScreen.dataset.jobId;
        const name = document.getElementById('apply-name').value.trim();
        const email = document.getElementById('apply-email').value.trim();
        const file = document.getElementById('apply-resume').files[0];
        const resultDiv = document.getElementById('apply-result');
        if (!name || !email || !file) {
            resultDiv.textContent = 'Please fill all fields and upload your resume.';
            resultDiv.className = 'upload-status error';
            return;
        }
        applySubmitBtn.disabled = true;
        resultDiv.textContent = 'Submitting application...';
        resultDiv.className = 'upload-status processing';
        try {
            const formData = new FormData();
            formData.append('candidate_name', name);
            formData.append('candidate_email', email);
            formData.append('resume', file);
            const res = await fetch(`${API}/api/jobs/${jid}/apply`, { method: 'POST', body: formData });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            resultDiv.innerHTML = `Application submitted! Your skills: <strong>${data.skills.join(', ') || 'analyzing...'}</strong><br>
                <button class="btn btn-primary" style="margin-top:1rem;padding:0.5rem 1rem;font-size:0.85rem" onclick="startFromInvite('${data.invite_token}','${name}','${data.resume_id}','${jid}')">Start Interview Now</button>`;
            resultDiv.className = 'upload-status success';
        } catch (err) {
            resultDiv.textContent = 'Failed: ' + err.message;
            resultDiv.className = 'upload-status error';
        } finally {
            applySubmitBtn.disabled = false;
        }
    });
}

window.startFromInvite = function(token, name, rid, jid) {
    candidateName.value = name;
    resumeId = rid;
    jobId = jid;
    showScreen(setupScreen);
    startSession();
};

// --- Company (with auth) ---
const registerCompanyBtn = document.getElementById('register-company-btn');
const loginCompanyBtn = document.getElementById('login-company-btn');

if (registerCompanyBtn) {
    registerCompanyBtn.addEventListener('click', async () => {
        const name = document.getElementById('company-name').value.trim();
        const email = document.getElementById('company-email').value.trim();
        const pass = document.getElementById('company-password').value;
        if (!name || !pass) return alert('Enter company name and password');
        try {
            const data = await apiPost('/api/company', { name, email, password: pass });
            companyId = data.company_id;
            companyToken = data.auth_token;
            document.getElementById('company-auth').style.display = 'none';
            document.getElementById('company-panel').style.display = 'block';
            document.getElementById('company-welcome').textContent = `Logged in as: ${name}`;
            loadCompanyData();
        } catch (err) {
            alert('Failed: ' + err.message);
        }
    });
}

if (loginCompanyBtn) {
    loginCompanyBtn.addEventListener('click', async () => {
        const name = document.getElementById('company-name').value.trim();
        const pass = document.getElementById('company-password').value;
        if (!name || !pass) return alert('Enter company name and password');
        try {
            const data = await apiPost('/api/company/login', { name, password: pass });
            companyId = data.company_id;
            companyToken = data.auth_token;
            document.getElementById('company-auth').style.display = 'none';
            document.getElementById('company-panel').style.display = 'block';
            document.getElementById('company-welcome').textContent = `Logged in as: ${name}`;
            loadCompanyData();
        } catch (err) {
            alert('Login failed: ' + err.message);
        }
    });
}

const createJobBtn = document.getElementById('create-job-btn');
if (createJobBtn) {
    createJobBtn.addEventListener('click', async () => {
        if (!companyId || !companyToken) return;
        const title = document.getElementById('job-title').value.trim();
        const desc = document.getElementById('job-desc').value.trim();
        const skills = document.getElementById('job-skills').value.trim();
        if (!title) return alert('Enter job title');
        try {
            await apiPost(`/api/company/${companyId}/jobs`, { title, description: desc, required_skills: skills }, companyToken);
            document.getElementById('job-title').value = '';
            document.getElementById('job-desc').value = '';
            document.getElementById('job-skills').value = '';
            loadCompanyData();
        } catch (err) {
            alert('Failed: ' + err.message);
        }
    });
}

async function loadCompanyData() {
    if (!companyId || !companyToken) return;
    try {
        const apps = await apiGet(`/api/company/${companyId}/applications`, companyToken);
        const appsDiv = document.getElementById('company-apps');
        if (apps.length === 0) {
            appsDiv.innerHTML = '<p class="text-muted">No applications yet.</p>';
        } else {
            appsDiv.innerHTML = apps.map(a => `
                <div class="job-card">
                    <div class="job-title">${a.name} - ${a.title}</div>
                    <div class="job-skills">Status: ${a.status} | Email: ${a.email}</div>
                    ${a.status === 'applied' ? `<button class="btn btn-send" style="margin-top:0.5rem;font-size:0.8rem" onclick="sendInvite('${a.id}')">Send Invite</button>` : ''}
                </div>
            `).join('');
        }
    } catch (_) {}
}

window.sendInvite = async function(appId) {
    try {
        const result = await apiPost('/api/invite/send', { application_id: appId }, companyToken);
        alert(`Invite sent! Interview URL: ${result.url}`);
        loadCompanyData();
    } catch (err) {
        alert('Failed to send invite: ' + err.message);
    }
};

// --- Check for invite token in URL ---
(function checkInviteToken() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) return;
    apiGet(`/api/invite/${token}`).then(data => {
        if (data.valid) {
            candidateName.value = data.candidate_name || '';
            resumeId = data.resume_id;
            jobId = data.job_id;
            document.querySelector('#setup-screen .card h2').textContent = `Interview: ${data.job_title || 'Technical Interview'}`;
            document.querySelector('#setup-screen .card p').textContent = `Welcome ${data.candidate_name}! Click Start to begin your interview.`;
        }
    }).catch(() => {});
})();

// --- Event listeners ---
startBtn.addEventListener('click', startSession);

// Mic button = mute/unmute toggle (no push-to-talk; VAD does the work).
micBtn.addEventListener('click', () => {
    if (!sessionId) return;
    vad.muted = !vad.muted;
    if (vad.muted) {
        if (vad.recorder) discardUtteranceRecording();
        setMicState('muted');
    } else {
        if (!vad.audioCtx) startVAD();
        else setMicState('listening');
    }
});
cameraBtn.addEventListener('click', () => {
    // Camera is mandatory during an active interview session.
    if (sessionId) {
        if (antiCheat) antiCheat._record?.('camera_off_attempt', {});
        const banner = document.getElementById('anticheat-warning') || (() => {
            const b = document.createElement('div');
            b.id = 'anticheat-warning';
            b.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:8px 16px;background:#ef4444;color:white;text-align:center;font-size:0.85rem;z-index:9999;transition:opacity 0.3s;';
            document.body.appendChild(b);
            return b;
        })();
        banner.textContent = 'Camera must stay on throughout the interview.';
        banner.style.opacity = '1';
        setTimeout(() => { banner.style.opacity = '0'; }, 4000);
        if (!isCameraOn) startCamera();
        return;
    }
    isCameraOn ? stopCamera() : startCamera();
});

speakerBtn.addEventListener('click', () => {
    isSpeakerOn = !isSpeakerOn;
    speakerBtn.classList.toggle('active', isSpeakerOn);
    if (!isSpeakerOn && window.speechSynthesis) window.speechSynthesis.cancel();
});

sendBtn.addEventListener('click', () => sendTextTurn(textInput.value));

textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTextTurn(textInput.value);
    }
});

restartBtn.addEventListener('click', () => {
    sessionId = null;
    resumeId = null;
    jobId = null;
    conversation.innerHTML = '';
    stopVAD();
    stopCamera();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (currentTypingAnimation) { clearInterval(currentTypingAnimation); currentTypingAnimation = null; }
    showScreen(setupScreen);
    if (navTabs) navTabs.style.display = 'flex';
});

// Spacebar toggles mute during an active interview.
document.addEventListener('keydown', (e) => {
    if (!sessionId) return;
    if (e.code === 'Space' && document.activeElement !== textInput && document.activeElement !== candidateName
        && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        micBtn.click();
    }
});
