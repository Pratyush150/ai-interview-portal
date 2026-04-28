// AI Interview Portal — Full Frontend
const API = (window.location.protocol === 'file:') ? 'http://localhost:8000' : window.location.origin;

// --- Secure-context detection ------------------------------------------
// Chrome, Firefox, and Safari only permit microphone access and full
// speechSynthesis behaviour on "secure contexts": https://..., or the
// special localhost/127.0.0.1 origins. A plain-HTTP LAN address like
// http://192.168.x.x:8000 is NOT a secure context, and the browser will
// silently block both mic capture and (on some builds) speech output,
// producing exactly the "not audible" + "mic not working" symptoms.
//
// We detect the bad case on load and show a prominent banner with the
// two fixes the user can apply: open http://localhost:8000 instead, or
// enable HTTPS on the server.
(function checkSecureContext() {
    if (window.isSecureContext) return;
    const wire = () => {
        const host = window.location.host;
        const banner = document.createElement('div');
        banner.className = 'insecure-banner';
        banner.innerHTML = `
            <div class="insecure-banner-inner">
                <strong>Audio &amp; microphone are blocked by your browser</strong>
                <div style="margin-top:4px">
                    This page is served from an <em>insecure origin</em>
                    (<code>${host}</code>). Browsers only allow mic capture
                    and reliable speech synthesis on <code>https://</code>,
                    <code>http://localhost</code>, or
                    <code>http://127.0.0.1</code>.
                </div>
                <div style="margin-top:8px">
                    <strong>Fix:</strong> open
                    <a href="http://localhost:8000${window.location.pathname}${window.location.search}"
                       style="color:inherit;text-decoration:underline">http://localhost:8000</a>
                    in this browser instead, or serve the site over HTTPS.
                </div>
            </div>
            <button class="insecure-banner-close" aria-label="Dismiss">×</button>
        `;
        banner.querySelector('.insecure-banner-close').addEventListener('click', () => banner.remove());
        document.body.prepend(banner);
    };
    if (document.body) wire();
    else document.addEventListener('DOMContentLoaded', wire);
})();

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
const headerStatus    = document.getElementById('header-status');
const headerScore     = document.getElementById('header-score');
const elapsedTimer    = document.getElementById('elapsed-timer');
const pipAvatar       = document.getElementById('pip-avatar');
const micWave         = document.getElementById('mic-wave');
const micHeroHint     = document.getElementById('mic-hero-hint');
const transcriptToggle = document.getElementById('transcript-toggle');
const transcriptClose = document.getElementById('transcript-close');
const transcriptPanel = document.getElementById('transcript-panel');
const captionQuestion = document.getElementById('caption-question');
const captionAnswer   = document.getElementById('caption-answer');

function setCaptionQuestion(text) {
    if (!captionQuestion) return;
    captionQuestion.textContent = text || '';
    captionQuestion.classList.toggle('show', !!text);
}
function setCaptionAnswer(text) {
    if (!captionAnswer) return;
    captionAnswer.textContent = text || '';
    captionAnswer.classList.toggle('show', !!(text && text.trim()));
}

// Render the full caption upfront as per-character spans with cumulative
// animation delays. The browser cascades them on its own timeline, so there's
// no stutter from JS timing.
//
// We SCALE the per-char stagger to match the expected speech duration —
// that way a 20-word question and a 200-word question both finish revealing
// *with* the interviewer's voice. At ~160 WPM and ~5 chars/word, that's
// ~30ms per char maximum; we clamp a bit tighter than that so the caption
// is always fully visible when the voice ends.
const CAPTION_STAGGER_MIN = 15;
const CAPTION_STAGGER_MAX = 32;
function computeCharStagger(text) {
    // ~160 WPM speech → 60000 / (160 * 5) = 75ms per char. But we want the
    // caption to finish slightly AHEAD of the voice (so users have read the
    // sentence before the final syllable), so target 40-50% of wall-clock.
    const est = 60000 / (160 * 5) * 0.45;
    return Math.max(CAPTION_STAGGER_MIN, Math.min(CAPTION_STAGGER_MAX, est));
}
function setCaptionStreamText(text) {
    if (!captionQuestion) return;
    captionQuestion.innerHTML = '';
    captionQuestion.classList.add('show');
    if (!text) return;
    const stagger = computeCharStagger(text);
    const words = text.split(' ');
    let idx = 0;
    const addChar = (ch) => {
        const s = document.createElement('span');
        s.className = 'char-in';
        if (ch === ' ') s.innerHTML = '&nbsp;';
        else s.textContent = ch;
        s.style.animationDelay = `${idx * stagger}ms`;
        return s;
    };
    for (let w = 0; w < words.length; w++) {
        if (w > 0) {
            captionQuestion.appendChild(addChar(' '));
            idx++;
        }
        const wordSpan = document.createElement('span');
        wordSpan.className = 'word-in';
        for (let c = 0; c < words[w].length; c++) {
            wordSpan.appendChild(addChar(words[w][c]));
            idx++;
        }
        captionQuestion.appendChild(wordSpan);
    }
}

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

// --- Mic state (click-to-finish model) ---
// After the interviewer finishes speaking the mic auto-arms and starts
// recording. The candidate speaks for as long as they need and clicks
// the mic button to end the turn — no silence-based auto-submit.
let vad = {
    muted: false,              // user toggled the mic off
    recorder: null,            // active MediaRecorder (truthy while recording)
    chunks: [],
    recordingStartAt: 0,
    processing: false,         // we're uploading / waiting for a reply
    interviewerSpeaking: false,// paused while the interviewer talks
    armTimer: null,            // pending auto-start timer
    streamReady: false,        // audioStream has been obtained
};
const AUTO_LISTEN_DELAY_MS = 1400; // gap between interviewer end and mic arm
const MIN_UTTERANCE_MS = 500;      // discard fat-finger taps shorter than this

// Track the most recent interviewer message + when TTS ended, so we can
// strip echo of the interviewer's final words that the laptop mic picks
// up through the speakers (speechSynthesis audio bypasses our stream's
// echoCancellation, since the browser SpeechRecognition reads the raw
// system mic directly).
let lastAssistantText = '';
let ttsEndedAt = 0;
let hasStrippedEcho = false;

function stripTTSEchoTail(liveText) {
    if (!liveText || !lastAssistantText) return liveText;
    if (hasStrippedEcho) return liveText;
    if (Date.now() - ttsEndedAt > 2800) return liveText;  // only the immediate echo window

    const norm = (w) => w.toLowerCase().replace(/[.,!?;:()"'—–]/g, '');
    const liveWords = liveText.trim().split(/\s+/);
    const interviewerWords = lastAssistantText.trim().split(/\s+/).map(norm).filter(Boolean);
    const liveLower = liveWords.map(norm);

    for (let n = Math.min(8, liveWords.length, interviewerWords.length); n >= 2; n--) {
        const interviewerTail = interviewerWords.slice(-n).join(' ');
        const liveHead = liveLower.slice(0, n).join(' ');
        if (interviewerTail === liveHead) {
            hasStrippedEcho = true;
            return liveWords.slice(n).join(' ').replace(/^[.,!?;:\s]+/, '');
        }
    }
    return liveText;
}

// --- Live transcription via Web Speech API ----------------------------------
// Chrome/Edge/Safari ship SpeechRecognition; Firefox doesn't. When available
// we start it in parallel with the MediaRecorder so the candidate sees their
// words in the transcript as they speak. When the server's Deepgram
// transcript comes back it overwrites the interim text with the canonical
// version and the bubble loses its "live" styling.
const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
let liveRecog = null;
let liveUserContent = null;    // DOM text node of the currently-live user bubble
let liveFinalText = '';

function createLiveUserBubble() {
    const div = document.createElement('div');
    div.className = 'message user live';
    const sender = document.createElement('div');
    sender.className = 'sender';
    sender.textContent = 'You';
    div.appendChild(sender);
    const content = document.createElement('div');
    content.textContent = '';
    div.appendChild(content);
    conversation.appendChild(div);
    conversation.scrollTop = conversation.scrollHeight;
    return content;
}

// Chrome's SpeechRecognition fires `onend` on its own schedule — typically
// after ~60s of continuous use, after a few seconds of silence, or on some
// network hiccups. That makes the live caption "stop writing mid-sentence".
// We fix this by tracking "we want this active" state and auto-restarting
// while the MediaRecorder is still running.
let liveRecogShouldRun = false;
let liveRecogRestartTimer = null;

function startLiveRecognition() {
    if (!SpeechRecognitionCtor) return;
    liveRecogShouldRun = true;
    if (!liveUserContent) {
        liveFinalText = '';
        liveUserContent = createLiveUserBubble();
    }
    _spawnLiveRecognizer();
}

function _spawnLiveRecognizer() {
    if (!liveRecogShouldRun || liveRecog) return;
    try {
        liveRecog = new SpeechRecognitionCtor();
    } catch (_) { liveRecog = null; return; }
    liveRecog.continuous = true;
    liveRecog.interimResults = true;
    liveRecog.lang = 'en-US';

    liveRecog.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) liveFinalText += r[0].transcript;
            else interim += r[0].transcript;
        }
        if (liveUserContent) {
            const raw = (liveFinalText + ' ' + interim).trim();
            const clean = stripTTSEchoTail(raw);
            liveUserContent.textContent = clean;
            setCaptionAnswer(clean);
            conversation.scrollTop = conversation.scrollHeight;
        }
    };

    liveRecog.onerror = (e) => {
        // 'no-speech', 'aborted', 'audio-capture', 'network', 'not-allowed'
        // 'not-allowed' is fatal — user or policy denied mic for SR. Stop.
        if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
            console.warn('[liveRecog] permanently stopping —', e.error);
            liveRecogShouldRun = false;
        } else {
            console.log('[liveRecog] recoverable error:', e?.error);
        }
    };

    liveRecog.onend = () => {
        liveRecog = null;
        // Auto-restart if we still want live transcription AND the
        // MediaRecorder is actually still recording. The browser-initiated
        // onend can come during a long silence or a 60s internal cap; we
        // just spin up a fresh recognizer so the caption keeps flowing.
        if (liveRecogShouldRun && vad.recorder) {
            if (liveRecogRestartTimer) clearTimeout(liveRecogRestartTimer);
            liveRecogRestartTimer = setTimeout(_spawnLiveRecognizer, 150);
        }
    };

    try { liveRecog.start(); }
    catch (e) {
        console.log('[liveRecog] start threw — retrying in 300ms:', e);
        liveRecog = null;
        if (liveRecogShouldRun) setTimeout(_spawnLiveRecognizer, 300);
    }
}

function stopLiveRecognition() {
    liveRecogShouldRun = false;
    if (liveRecogRestartTimer) { clearTimeout(liveRecogRestartTimer); liveRecogRestartTimer = null; }
    if (liveRecog) {
        try { liveRecog.stop(); } catch (_) {}
    }
}

function finalizeLiveBubble(canonicalText) {
    if (!liveUserContent) return false;
    const bubble = liveUserContent.parentElement;
    if (canonicalText && canonicalText.trim()) {
        liveUserContent.textContent = canonicalText.trim();
    } else if (!liveUserContent.textContent.trim()) {
        liveUserContent.textContent = '[voice input]';
    }
    if (bubble) bubble.classList.remove('live');
    liveUserContent = null;
    liveFinalText = '';
    return true;
}

function discardLiveBubble() {
    if (liveUserContent) {
        const bubble = liveUserContent.parentElement;
        if (bubble && bubble.parentElement) bubble.parentElement.removeChild(bubble);
    }
    liveUserContent = null;
    liveFinalText = '';
    setCaptionAnswer('');
}
const VAD_RMS_THRESHOLD = 0.022;   // energy above this = probable speech
const VAD_SILENCE_MS = 1400;       // end-of-utterance after this much silence
const VAD_MIN_UTTERANCE_MS = 700;  // discard blips shorter than this

// --- Screen management ---
function showScreen(screen) {
    [setupScreen, interviewScreen, resultsScreen, jobsScreen, applyScreen, companyScreen].forEach(s => {
        if (s) s.classList.remove('active');
    });
    screen.classList.add('active');
    const inInterview = (screen === interviewScreen || screen === resultsScreen);
    if (navTabs) navTabs.style.display = inInterview ? 'none' : 'inline-flex';
    if (headerStatus) headerStatus.style.display = (screen === interviewScreen) ? 'flex' : 'none';
    if (headerScore) headerScore.style.display = inInterview ? 'flex' : 'none';
}

// --- Elapsed timer in the top bar ---
let elapsedStartAt = 0;
let elapsedIntervalId = null;
function startElapsedTimer() {
    stopElapsedTimer();
    elapsedStartAt = Date.now();
    const tick = () => {
        if (!elapsedTimer) return;
        const s = Math.max(0, Math.floor((Date.now() - elapsedStartAt) / 1000));
        const mm = String(Math.floor(s / 60)).padStart(2, '0');
        const ss = String(s % 60).padStart(2, '0');
        elapsedTimer.textContent = `${mm}:${ss}`;
    };
    tick();
    elapsedIntervalId = setInterval(tick, 1000);
}
function stopElapsedTimer() {
    if (elapsedIntervalId) { clearInterval(elapsedIntervalId); elapsedIntervalId = null; }
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
let speechSafetyTimer = null;

// Priority-ordered patterns for picking a voice that actually plays.
//
// We explicitly prefer LOCAL voices first. The Microsoft "Online Natural"
// voices (Aria, Jenny, Sonia, Libby, Natasha, Guy, Davis) are Azure-streamed
// cloud voices that advertise themselves via getVoices() but silently fail
// in Chromium — speak() completes, onend fires, but no audio reaches the
// output. This is an observed, reproducible bug, which is why we keep them
// OUT of the preference list entirely.
const VOICE_PREFERENCE = [
    // Chrome's built-in voices — always reliable, available cross-platform
    /^Google US English/i,
    /^Google UK English Female/i,
    /^Google UK English Male/i,
    /^Google/i,
    // macOS premium / enhanced (need to be downloaded in System Settings)
    /\(Premium\)/i,
    /\(Enhanced\)/i,
    // Warm named macOS voices
    /^Samantha/i, /^Ava/i, /^Allison/i, /^Serena/i, /^Karen/i,
    /^Tessa/i, /^Moira/i, /^Fiona/i, /^Daniel/i,
    // Local Windows SAPI voices — install via Settings → Time & Language
    // → Speech. Robotic but 100% reliable because they run on-device.
    /^Microsoft Zira Desktop/i,
    /^Microsoft David Desktop/i,
    /^Microsoft Hazel Desktop/i,
    /^Microsoft Mark/i,
    /^Microsoft Zira/i,
    /^Microsoft David/i,
];

// Voices we've observed to silently fail. We add to this set at runtime
// when a chosen voice's utterance.onstart never fires. Subsequent calls
// to pickBestVoice skip them.
const BLACKLISTED_VOICES = new Set();

// Known-broken patterns we NEVER pick, even if listed by the browser.
// These are the Microsoft Azure-streamed voices that silently fail.
const BROKEN_VOICE_PATTERNS = [
    /Online.*Natural/i,        // Microsoft Aria / Jenny / Sonia / etc. Online (Natural)
];
function isBrokenVoice(v) {
    if (!v?.name) return false;
    if (BLACKLISTED_VOICES.has(v.name)) return true;
    return BROKEN_VOICE_PATTERNS.some(p => p.test(v.name));
}

let cachedVoice = null;
function pickBestVoice() {
    // If a previously-cached voice got blacklisted mid-session, drop it.
    if (cachedVoice && isBrokenVoice(cachedVoice)) cachedVoice = null;
    if (cachedVoice) return cachedVoice;

    const voices = window.speechSynthesis.getVoices().filter(v => !isBrokenVoice(v));
    if (!voices.length) return null;
    const en = voices.filter(v => v.lang && v.lang.startsWith('en'));
    const pool = en.length ? en : voices;
    for (const pattern of VOICE_PREFERENCE) {
        const match = pool.find(v => pattern.test(v.name));
        if (match) {
            console.log('[tts] voice picked:', match.name, '(' + match.lang + ')');
            cachedVoice = match;
            return match;
        }
    }
    if (pool[0]) {
        cachedVoice = pool[0];
        console.log('[tts] voice (fallback):', cachedVoice.name, '(' + cachedVoice.lang + ')');
    }
    return cachedVoice;
}

// Called when a voice was attempted but produced no audio (onstart never
// fired within a reasonable window). Blacklist it and reset the cache so
// the next speak() picks a different one.
function blacklistCurrentVoice(reason) {
    if (cachedVoice?.name) {
        console.warn('[tts] blacklisting voice', cachedVoice.name, 'reason:', reason);
        BLACKLISTED_VOICES.add(cachedVoice.name);
    }
    cachedVoice = null;
}

// Tracks attempts across silent-failure retries within a single speakText
// call — we blacklist and retry at most twice before giving up.
const MAX_VOICE_RETRIES = 2;

function speakText(text, contentEl, _attempt = 0) {
    if (!isSpeakerOn || !('speechSynthesis' in window)) {
        if (contentEl) contentEl.textContent = text;
        onSpeechFinished();
        return;
    }
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 0.96;
    utterance.volume = 1.0;
    utterance.lang = 'en-US';

    const preferred = pickBestVoice();
    if (preferred) utterance.voice = preferred;
    console.log('[tts] speak attempt', _attempt, 'voice=',
                preferred?.name || '(browser default)', 'chars=', text.length);

    speakingIndicator.classList.add('active');

    simulateOrbEnvelope();
    utterance.onboundary = (e) => { if (e.name === 'word') bumpOrbForWord(); };

    const words = text.split(' ');
    // Caption cascade is driven by setCaptionStreamText(); the conversation
    // log just needs a simple word-by-word typing at speech cadence.
    const msPerWord = Math.max(180, (60000 / (160 * utterance.rate)) * 0.9);
    if (contentEl) contentEl.textContent = '';
    let wordIndex = 0;
    if (currentTypingAnimation) clearInterval(currentTypingAnimation);
    currentTypingAnimation = setInterval(() => {
        if (wordIndex < words.length) {
            if (contentEl) contentEl.textContent += (wordIndex > 0 ? ' ' : '') + words[wordIndex];
            wordIndex++;
            conversation.scrollTop = conversation.scrollHeight;
        } else {
            clearInterval(currentTypingAnimation);
            currentTypingAnimation = null;
        }
    }, msPerWord);

    let finished = false;
    let startedAt = 0;
    // Forward declaration so `finish` can reference startDetectTimer for
    // cleanup. The real value is assigned below, after the onstart/onend
    // handlers are wired.
    let startDetectTimer = null;
    const finish = (cause) => {
        if (finished) return;
        finished = true;
        console.log('[tts] finish  cause=', cause,
                    'started=', !!startedAt,
                    'elapsed=', startedAt ? (performance.now() - startedAt).toFixed(0) + 'ms' : 'never');
        if (speechSafetyTimer) { clearTimeout(speechSafetyTimer); speechSafetyTimer = null; }
        if (startDetectTimer) { clearTimeout(startDetectTimer); startDetectTimer = null; }
        speakingIndicator.classList.remove('active');
        if (currentTypingAnimation) {
            clearInterval(currentTypingAnimation);
            currentTypingAnimation = null;
        }
        if (contentEl) contentEl.textContent = text;
        onSpeechFinished();
    };

    utterance.onstart = () => {
        startedAt = performance.now();
        console.log('[tts] onstart fired');
    };
    utterance.onend = () => { stopTTSKeepAlive(); finish('onend'); };
    utterance.onerror = (e) => {
        console.warn('[tts] onerror:', e?.error || e);
        if (e?.error === 'not-allowed' || e?.error === 'audio-busy') {
            showAudioUnlockBanner();
        }
        stopTTSKeepAlive();
        finish('onerror:' + (e?.error || 'unknown'));
    };

    // Silent-failure detection. Some voices (notably Microsoft Online
    // Natural) accept speak(), fire onend, but never actually produce
    // audio and never fire onstart. If onstart hasn't fired within
    // 900ms, blacklist this voice and retry with the next-best pick.
    startDetectTimer = setTimeout(() => {
        if (startedAt || finished) return;
        const engineIsProbablyProducingSound =
            ('speechSynthesis' in window) && window.speechSynthesis.speaking;
        if (engineIsProbablyProducingSound) {
            // Chromium sometimes delays onstart even when audio plays.
            // If the engine claims speaking===true, trust it.
            console.log('[tts] onstart late but engine.speaking=true, trusting it');
            return;
        }
        if (_attempt >= MAX_VOICE_RETRIES) {
            console.warn('[tts] all voice retries exhausted — giving up on audio for this turn');
            return;
        }
        console.warn('[tts] silent failure detected — retrying with next voice');
        blacklistCurrentVoice('onstart-never-fired');
        try { window.speechSynthesis.cancel(); } catch (_) {}
        stopTTSKeepAlive();
        // Reset state so the retry gets a clean slate.
        speakingIndicator.classList.remove('active');
        if (currentTypingAnimation) { clearInterval(currentTypingAnimation); currentTypingAnimation = null; }
        if (speechSafetyTimer) { clearTimeout(speechSafetyTimer); speechSafetyTimer = null; }
        // Retry in a microtask gap so the cancel settles first.
        setTimeout(() => speakText(text, contentEl, _attempt + 1), 50);
    }, 900);

    const expectedMs = words.length * msPerWord + 2000;
    if (speechSafetyTimer) clearTimeout(speechSafetyTimer);
    speechSafetyTimer = setTimeout(() => finish('safety-timer'), Math.max(expectedMs, 3000));

    window.speechSynthesis.speak(utterance);
    startTTSKeepAlive();
}

// Called when the interviewer's TTS finishes (or the safety timeout fires).
// Schedules the auto-arm: after AUTO_LISTEN_DELAY_MS the mic begins
// recording the candidate's answer. The recording stops only when the
// candidate clicks the mic button.
function onSpeechFinished() {
    vad.interviewerSpeaking = false;
    setInterviewerSpeaking(false);
    ttsEndedAt = Date.now();
    hasStrippedEcho = false;
    if (!sessionId) return;
    if (!vad.muted && !vad.processing) {
        setMicState('idle');
        scheduleAutoListen();
    }
}

// --- speechSynthesis lifecycle ------------------------------------------
// Browser SpeechSynthesis has three well-known quirks we need to defeat:
//   1) Chrome silently blocks the very first speak() if no user gesture has
//      touched the synthesis API yet. We "prime" it on the Start button
//      click (see primeSpeechSynthesis) so the session's first utterance
//      actually comes out of the speakers.
//   2) Voices load asynchronously. The first getVoices() may be empty.
//      We resolve voicesReady once the list is populated so pickBestVoice
//      has something to choose from.
//   3) Chrome pauses synthesis internally after ~15s of continuous audio.
//      A lightweight pause/resume heartbeat keeps it awake.
let voicesReady = false;
let voicesReadyPromise = null;
let ttsPrimed = false;

function ensureVoicesLoaded() {
    if (voicesReadyPromise) return voicesReadyPromise;
    voicesReadyPromise = new Promise((resolve) => {
        const check = () => {
            if (window.speechSynthesis.getVoices().length > 0) {
                voicesReady = true;
                resolve();
                return true;
            }
            return false;
        };
        if (check()) return;
        window.speechSynthesis.onvoiceschanged = () => check();
        // Poll as a backup — some browsers never fire onvoiceschanged.
        const iv = setInterval(() => {
            if (check()) clearInterval(iv);
        }, 200);
        setTimeout(() => { clearInterval(iv); resolve(); }, 3000);
    });
    return voicesReadyPromise;
}

function primeSpeechSynthesis() {
    // Must run inside a real user-gesture handler (e.g. a click) for the
    // browser's autoplay policy to treat SpeechSynthesis as "allowed"
    // for the rest of the session.
    //
    // IMPORTANT lessons from the community about what *reliably* unlocks:
    //   - volume MUST be > 0. volume=0 is treated by Chrome as "muted",
    //     which does NOT count as an audio unlock on many versions.
    //   - Do NOT call cancel() immediately after speak(). Cancelling before
    //     the utterance is processed can invalidate the user-gesture unlock.
    //     Let the tiny "." utterance play out — it takes <100ms and is
    //     effectively silent, and the engine stays unlocked afterwards.
    //   - Do NOT set .voice explicitly — we may be calling this before
    //     getVoices() populates, and an invalid/undefined voice reference
    //     makes Chrome silently drop the utterance.
    if (ttsPrimed || !('speechSynthesis' in window)) return;
    try {
        const u = new SpeechSynthesisUtterance('.');
        u.volume = 1.0;
        u.rate = 1.25;
        u.pitch = 1.0;
        u.lang = 'en-US';
        window.speechSynthesis.speak(u);
        ttsPrimed = true;
        console.log('[tts] primed from user gesture');
    } catch (e) {
        console.warn('[tts] prime failed:', e);
    }
}

// Chrome stalls speechSynthesis after ~15s. Ping it while we're speaking.
let ttsKeepAliveId = null;
function startTTSKeepAlive() {
    stopTTSKeepAlive();
    ttsKeepAliveId = setInterval(() => {
        if (!window.speechSynthesis.speaking) return;
        // pause()+resume() is a no-op that nonetheless resets Chrome's
        // internal timeout. Do NOT replace with a longer interval — the
        // stall kicks in deterministically around 14-15 seconds.
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
    }, 10000);
}
function stopTTSKeepAlive() {
    if (ttsKeepAliveId) { clearInterval(ttsKeepAliveId); ttsKeepAliveId = null; }
}

if ('speechSynthesis' in window) {
    ensureVoicesLoaded();
}

// --- Audio unlock banner -------------------------------------------------
// Shown when TTS/audio is blocked by the browser's autoplay policy. Clicking
// "Enable audio" gives us a fresh user gesture which unblocks speak() for
// the rest of the session. The banner is a zero-cost no-op when audio works.
let audioUnlockBanner = null;
function showAudioUnlockBanner() {
    if (audioUnlockBanner) return;
    audioUnlockBanner = document.createElement('div');
    audioUnlockBanner.className = 'audio-unlock-banner';
    audioUnlockBanner.innerHTML = `
        <span>🔈 Audio is blocked by your browser. Click to enable the interviewer's voice.</span>
        <button class="btn btn-primary" type="button">Enable audio</button>
    `;
    audioUnlockBanner.querySelector('button').addEventListener('click', () => {
        // Re-prime from the fresh click and replay the current interviewer
        // text if we have it — so the candidate doesn't miss the question.
        ttsPrimed = false;
        primeSpeechSynthesis();
        if (lastAssistantText) speakText(lastAssistantText, null);
        audioUnlockBanner?.remove();
        audioUnlockBanner = null;
    });
    document.body.appendChild(audioUnlockBanner);
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
        setInterviewerSpeaking(true);
        setMicState('interviewer');
        // Record the text for later echo-stripping
        lastAssistantText = text;
        hasStrippedEcho = false;
        // On-screen caption: render all chars upfront with cascading CSS
        // animation. The hidden conversation log gets its own word-paced
        // typing below so the log reads naturally if reviewed later.
        setCaptionStreamText(text);
        setCaptionAnswer('');
        if (audioUrl) {
            // Server TTS available — play it hidden, type along
            const audio = new Audio(audioUrl.startsWith('blob:') ? audioUrl : `${API}${audioUrl}`);
            audio.crossOrigin = 'anonymous';
            // If the user picked a specific output device, route there.
            // Safe no-op when the browser doesn't support setSinkId or
            // the user kept "System default".
            applySelectedOutput(audio);
            driveOrbFromAudio(audio);
            // audio.play() returns a Promise that REJECTS when the browser's
            // autoplay policy blocks us. If that happens, fall back to browser
            // SpeechSynthesis (which we've already primed on Start click) so
            // the candidate still hears the interviewer.
            audio.play().catch((err) => {
                console.warn('[tts] audio.play() rejected, falling back to browser TTS:', err?.name || err);
                showAudioUnlockBanner();
                speakText(text, content);
            });
            const words = text.split(' ');
            const msPerWord = 220;   // tuned to ElevenLabs average cadence
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
            let audioFinished = false;
            const finishAudio = () => {
                if (audioFinished) return;
                audioFinished = true;
                speakingIndicator.classList.remove('active');
                if (currentTypingAnimation) {
                    clearInterval(currentTypingAnimation);
                    currentTypingAnimation = null;
                }
                content.textContent = text;
                onSpeechFinished();
            };
            audio.onended = finishAudio;
            audio.onerror = finishAudio;
            // Safety net in case the audio element never fires 'ended'
            setTimeout(finishAudio, words.length * msPerWord + 3000);
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

function setInterviewerChip(stateKey, label) {
    const chip = document.getElementById('interviewer-chip');
    const txt = document.getElementById('interviewer-chip-state');
    if (!chip || !txt) return;
    chip.dataset.state = stateKey;
    txt.textContent = label;
}

function setMicState(state) {
    micBtn.classList.remove('recording', 'processing', 'muted');
    if (micText) micText.classList.remove('listening', 'processing');
    if (micWave) micWave.classList.remove('active');
    switch (state) {
        case 'idle':
            micText.textContent = vad.muted ? 'Mic muted' : 'Waiting for you…';
            if (micHeroHint) micHeroHint.textContent = vad.muted ? 'click mic to unmute' : '';
            setInterviewerChip('idle', 'Ready');
            break;
        case 'listening':
            micText.textContent = 'Your turn';
            micText.classList.add('listening');
            micBtn.classList.add('recording');
            if (micHeroHint) micHeroHint.textContent = 'click when finished';
            if (micWave) micWave.classList.add('active');
            setInterviewerChip('listening', 'Listening');
            break;
        case 'processing':
            micText.textContent = 'Thinking…';
            micText.classList.add('processing');
            micBtn.classList.add('processing');
            if (micHeroHint) micHeroHint.textContent = '';
            setInterviewerChip('idle', 'Thinking…');
            break;
        case 'muted':
            micText.textContent = 'Mic muted';
            micBtn.classList.add('muted');
            if (micHeroHint) micHeroHint.textContent = 'click mic to unmute';
            setInterviewerChip('idle', 'Paused');
            break;
        case 'interviewer':
            micText.textContent = 'Interviewer is speaking';
            micBtn.classList.add('muted');
            if (micHeroHint) micHeroHint.textContent = '';
            setInterviewerChip('speaking', 'Speaking');
            break;
    }
}

function setInterviewerSpeaking(on) {
    if (!pipAvatar) return;
    pipAvatar.classList.toggle('speaking', !!on);
    if (!on) setOrbTarget(0.08);  // drop to idle-breath amplitude
    if (on) setInterviewerChip('speaking', 'Speaking');
}

// --- Audio-reactive orb amplitude driver ------------------------------------
// The orb reads a single CSS variable `--amp` (0..1). JS sets a *target*
// amplitude; a rAF loop lerps toward it so the orb never jumps jaggedly.
// Data sources for the target:
//   - ElevenLabs server TTS: real RMS via AudioContext + AnalyserNode.
//   - Browser TTS: pseudo-envelope driven by `onboundary` word events
//     (we can't tap speechSynthesis' output stream).
let orbAmp = 0.08;
let orbTarget = 0.08;
let orbLoopStarted = false;
const ORB_LERP = 0.22;
function setOrbTarget(t) {
    orbTarget = Math.max(0, Math.min(1, t));
    // Also feed the 3D avatar if loaded.
    if (window.avatar && window.avatar.setAmp) window.avatar.setAmp(orbTarget);
}
// --- 3D avatar integration ----------------------------------------------
// The avatar module (avatar.js) loaded via ESM import-map exposes
// window.avatar = { init(container), setAmp(0..1), teardown(), isReady, hasFailed }.
// We init it once when the interview screen opens, forward the amplitude
// from the orb loop (above), and tear it down on session end to free GPU
// resources. If WebGL or the GLB fails, the fallback orb stays visible.
let avatarInitPending = false;
function initAvatar() {
    if (avatarInitPending) return;
    avatarInitPending = true;
    // Allow up to 3 seconds for the ESM module to finish executing and
    // register window.avatar. If it's still missing after that, we just
    // keep the orb — no UI regression.
    const tryInit = (remainingTries) => {
        const canvasHost = document.getElementById('avatar-canvas');
        const tile = document.getElementById('interviewer-tile');
        if (!canvasHost || !tile) return;
        if (window.avatar && typeof window.avatar.init === 'function') {
            // avatar.js adds `.avatar-loaded` to the container on success
            // and `.avatar-failed` on error. We mirror those onto the
            // parent tile so our orb fade CSS keys off the tile class.
            window.avatar.init(canvasHost).finally(() => {
                if (canvasHost.classList.contains('avatar-loaded')) {
                    tile.classList.add('avatar-loaded');
                } else if (canvasHost.classList.contains('avatar-failed')) {
                    tile.classList.add('avatar-failed');
                }
            });
            return;
        }
        if (remainingTries > 0) {
            setTimeout(() => tryInit(remainingTries - 1), 300);
        } else {
            console.warn('[avatar] module never registered — sticking with orb');
            tile.classList.add('avatar-failed');
        }
    };
    tryInit(10);
}
function teardownAvatar() {
    avatarInitPending = false;
    try {
        if (window.avatar && typeof window.avatar.teardown === 'function') {
            window.avatar.teardown();
        }
    } catch (e) { console.warn('[avatar] teardown error:', e); }
    const canvasHost = document.getElementById('avatar-canvas');
    const tile = document.getElementById('interviewer-tile');
    if (canvasHost) canvasHost.classList.remove('avatar-loaded', 'avatar-failed');
    if (tile) tile.classList.remove('avatar-loaded', 'avatar-failed');
}

function startOrbLoop() {
    if (orbLoopStarted) return;
    orbLoopStarted = true;
    const tick = () => {
        orbAmp += (orbTarget - orbAmp) * ORB_LERP;
        if (pipAvatar) pipAvatar.style.setProperty('--amp', orbAmp.toFixed(3));
        // Drive the 3D avatar's lip-sync amplitude from the same signal
        // that drives the orb, so both fallback and GLB react together.
        if (window.avatar && typeof window.avatar.setAmp === 'function') {
            window.avatar.setAmp(orbAmp);
        }
        drawVoiceWave();
        requestAnimationFrame(tick);
    };
    tick();
}

// --- Editorial voice-wave canvas ----------------------------------------
// Renders a smooth horizontal wave driven by `orbAmp`. The shape is a
// bezier curve through N sample points whose vertical displacement is
// amp-scaled mixed sines — feels like an oscilloscope reading real voice.
let voiceCanvas = null, voiceCtx = null, voiceDpr = 1;
function ensureVoiceCanvas() {
    if (voiceCanvas) return;
    voiceCanvas = document.getElementById('voice-wave');
    if (!voiceCanvas) return;
    voiceCtx = voiceCanvas.getContext('2d');
    voiceDpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
        const r = voiceCanvas.getBoundingClientRect();
        voiceCanvas.width = r.width * voiceDpr;
        voiceCanvas.height = r.height * voiceDpr;
    };
    resize();
    window.addEventListener('resize', resize);
}
function drawVoiceWave() {
    ensureVoiceCanvas();
    if (!voiceCtx || !voiceCanvas) return;
    const w = voiceCanvas.width, h = voiceCanvas.height;
    const ctx = voiceCtx;
    ctx.clearRect(0, 0, w, h);

    const t = performance.now();
    const amp = orbAmp;
    const speaking = amp > 0.15;

    // Toggle .is-speaking on the tile so CSS can respond (subtle emphasis
    // shifts on the serif mark, etc.)
    const tile = voiceCanvas.closest('.interviewer-tile');
    if (tile) tile.classList.toggle('is-speaking', speaking);

    const midY = h / 2;
    const N = 56;
    const stepX = w / (N - 1);
    const maxDisp = h * 0.42;
    const idleFloor = h * 0.012;

    // Colour: warm cream at rest → slightly brighter amber-cream when speaking
    const alpha = 0.78 + amp * 0.22;
    ctx.strokeStyle = `rgba(245, 242, 236, ${alpha})`;
    ctx.lineWidth = Math.max(1.5, voiceDpr * 1.75);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Compute sample points
    const pts = [];
    for (let i = 0; i < N; i++) {
        const x = i * stepX;
        // Window function so the wave tapers at both ends (cleaner look)
        const taper = Math.sin((i / (N - 1)) * Math.PI);
        // Three overlapping sine waves for organic motion
        const s1 = Math.sin(t * 0.004 + i * 0.28);
        const s2 = Math.sin(t * 0.007 + i * 0.11) * 0.55;
        const s3 = Math.sin(t * 0.012 + i * 0.42) * 0.30;
        const displacement = (s1 + s2 + s3) * taper * (amp * maxDisp + idleFloor);
        pts.push([x, midY + displacement]);
    }

    // Smooth bezier path through the points
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[i + 1];
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        ctx.quadraticCurveTo(x0, y0, cx, cy);
    }
    const [lx, ly] = pts[pts.length - 1];
    ctx.lineTo(lx, ly);
    ctx.stroke();

    // A perfectly flat baseline underneath — adds audio-software precision
    ctx.strokeStyle = 'rgba(245, 242, 236, 0.08)';
    ctx.lineWidth = Math.max(1, voiceDpr);
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();
}

// Drive the orb from an <audio> element (server TTS path) via WebAudio.
// Creates one shared AudioContext — first call lazily.
let sharedOrbCtx = null;
function driveOrbFromAudio(audio) {
    try {
        if (!sharedOrbCtx) {
            sharedOrbCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        const ctx = sharedOrbCtx;
        if (ctx.state === 'suspended') ctx.resume();
        const src = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.75;
        src.connect(analyser);
        analyser.connect(ctx.destination);
        const buf = new Uint8Array(analyser.fftSize);
        const loop = () => {
            if (audio.ended || audio.paused) { setOrbTarget(0.08); return; }
            analyser.getByteTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) {
                const v = (buf[i] - 128) / 128;
                sum += v * v;
            }
            const rms = Math.sqrt(sum / buf.length);
            setOrbTarget(Math.min(1, 0.15 + rms * 3.5));
            requestAnimationFrame(loop);
        };
        audio.addEventListener('playing', loop, { once: true });
    } catch (_) {
        // fall back to pseudo-envelope if WebAudio is blocked
        simulateOrbEnvelope();
    }
}

// Pseudo-envelope for browser TTS: baseline wobble + spike on each word.
// Good-enough approximation of a speaking voice envelope.
let simInterval = null;
function simulateOrbEnvelope() {
    const start = performance.now();
    if (simInterval) clearInterval(simInterval);
    simInterval = setInterval(() => {
        if (!vad.interviewerSpeaking) {
            clearInterval(simInterval); simInterval = null;
            setOrbTarget(0.08);
            return;
        }
        const t = (performance.now() - start) / 1000;
        // Two mixed sine waves + a tiny floor. Feels like breath.
        const base = 0.32 + 0.16 * Math.sin(t * 6.7) + 0.10 * Math.sin(t * 13.1);
        setOrbTarget(Math.max(0.18, base));
    }, 55);
}
function bumpOrbForWord() {
    setOrbTarget(0.88);
    setTimeout(() => { if (vad.interviewerSpeaking) setOrbTarget(0.38); }, 110);
}

startOrbLoop();

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
        if (cameraBtn) cameraBtn.classList.add('active');
        if (antiCheat && sessionId) {
            antiCheat.attachCamera(cameraFeed, cameraStream, onCameraLost);
        }
    } catch (err) {
        cameraFeed.classList.add('hidden');
        cameraPlaceholder.classList.remove('hidden');
        cameraPlaceholder.querySelector('span').textContent = 'Camera denied';
        isCameraOn = false;
        if (cameraBtn) cameraBtn.classList.remove('active');
    }
}

// Called by AntiCheatMonitor when the camera track ends unexpectedly (user
// stopped it from the browser UI, unplugged the device, revoked permission).
async function onCameraLost() {
    if (!sessionId) return;
    isCameraOn = false;
    if (cameraBtn) cameraBtn.classList.remove('active');
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
    if (cameraBtn) cameraBtn.classList.remove('active');
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
        startElapsedTimer();
        startCamera();
        initAvatar();
        antiCheat = new AntiCheatMonitor(sessionId, API);
        antiCheat.start();
        questionShownAt = Date.now();
        // Request mic permission and open the audio stream BEFORE sending
        // the greeting — otherwise the greeting's TTS can finish before
        // audioStream is ready, and the auto-arm would silently bail.
        await startVAD();
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
    if (textInput) textInput.value = '';
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
    stopElapsedTimer();
    teardownAvatar();
    setInterviewerSpeaking(false);
    if (transcriptPanel) transcriptPanel.classList.remove('open');
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

// --- Click-to-finish mic ---
//
// Interviewer finishes speaking → after AUTO_LISTEN_DELAY_MS the mic
// auto-arms and a MediaRecorder starts capturing. The candidate speaks
// as long as they need — the system never cuts them off on silence.
// They click the mic button to end the turn, which stops the recorder
// and submits the blob.

async function startVAD() {
    if (vad.streamReady) return;
    try {
        // Mic device: honour the user's explicit choice from the setup
        // screen's Microphone dropdown if they made one, otherwise prefer
        // the OS default. Passing `{ ideal: 'default' }` keeps us off any
        // stale "last-used" device the browser permissions state might
        // remember from another session.
        const selectedIn = (() => {
            try { return localStorage.getItem(AUDIO_IN_KEY); } catch (_) { return null; }
        })();
        const deviceIdConstraint =
            selectedIn && selectedIn !== 'default'
                ? { exact: selectedIn }
                : { ideal: 'default' };
        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: deviceIdConstraint,
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            }
        });
        try {
            const t = audioStream.getAudioTracks()[0];
            const s = t?.getSettings?.() || {};
            console.log('[mic] using:', t?.label || '(unnamed)', 'deviceId=', s.deviceId);
        } catch (_) {}
        // Permission has been granted → enumerateDevices() now returns
        // real labels. Re-populate the dropdowns so the user sees proper
        // device names instead of masked deviceIds.
        populateAudioDevices();
        vad.streamReady = true;
    } catch (err) {
        alert('Microphone access denied. Please allow mic access to continue.');
        return;
    }
    setMicState('idle');
}

function scheduleAutoListen(delay = AUTO_LISTEN_DELAY_MS) {
    if (vad.armTimer) { clearTimeout(vad.armTimer); vad.armTimer = null; }
    console.log('[mic] scheduleAutoListen delay=', delay, 'ms');
    const ttsStillSpeaking = () =>
        (('speechSynthesis' in window) && window.speechSynthesis.speaking) ||
        (orbAmp !== undefined && orbAmp > 0.12);

    const tryArm = (elapsed) => {
        vad.armTimer = null;
        if (!sessionId || vad.muted || vad.processing || vad.interviewerSpeaking) {
            console.log('[mic] tryArm aborted — state guard',
                        {muted: vad.muted, proc: vad.processing, speaking: vad.interviewerSpeaking});
            return;
        }
        if (vad.recorder) {
            console.log('[mic] tryArm aborted — already recording');
            return;
        }
        if (ttsStillSpeaking() && elapsed < 4000) {
            // Log only the first detection to avoid spamming every 250ms.
            if (elapsed === 0) console.log('[mic] waiting for speechSynthesis to go silent…');
            vad.armTimer = setTimeout(() => tryArm(elapsed + 250), 250);
            return;
        }
        console.log('[mic] arming recorder (waited', elapsed, 'ms for TTS silence)');
        startRecordingTurn();
    };
    vad.armTimer = setTimeout(() => tryArm(0), delay);
}

function startRecordingTurn() {
    if (!audioStream || vad.recorder) return;
    try {
        vad.chunks = [];
        vad.recorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm;codecs=opus' });
        vad.recorder.ondataavailable = (e) => { if (e.data.size > 0) vad.chunks.push(e.data); };
        vad.recordingStartAt = performance.now();
        vad.recorder.start();
        isRecording = true;
        setMicState('listening');
        // Live transcript while speaking — interim words stream into the
        // user bubble. Deepgram's server-side transcript overrides it later.
        startLiveRecognition();
    } catch (_) {
        vad.recorder = null;
    }
}

// Candidate clicked mic to end the turn.
function stopAndSubmitTurn() {
    if (!vad.recorder) return;
    const recorder = vad.recorder;
    vad.recorder = null;
    const duration = performance.now() - vad.recordingStartAt;
    isRecording = false;
    stopLiveRecognition();
    recorder.onstop = async () => {
        const blob = new Blob(vad.chunks, { type: 'audio/webm' });
        vad.chunks = [];
        if (duration < MIN_UTTERANCE_MS || blob.size < 3000) {
            // Accidental tap / nothing recorded — re-arm instead of submitting.
            discardLiveBubble();
            setMicState('idle');
            scheduleAutoListen();
            return;
        }
        await sendAudioAsFile(blob);
    };
    try { recorder.stop(); } catch (_) {}
}

function stopVAD() {
    if (vad.armTimer) { clearTimeout(vad.armTimer); vad.armTimer = null; }
    if (vad.recorder) {
        try { vad.recorder.stop(); } catch (_) {}
        vad.recorder = null;
    }
    if (audioStream) {
        audioStream.getTracks().forEach(t => t.stop());
        audioStream = null;
    }
    vad.streamReady = false;
    vad.processing = false;
    vad.interviewerSpeaking = false;
    isRecording = false;
}

function showTurnHint(text) {
    let el = document.getElementById('turn-hint');
    if (!el) {
        el = document.createElement('div');
        el.id = 'turn-hint';
        el.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);padding:8px 16px;background:#f59e0b;color:white;border-radius:8px;font-size:0.9rem;z-index:9999;transition:opacity 0.4s;box-shadow:0 2px 8px rgba(0,0,0,0.2)';
        document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => { el.style.opacity = '0'; }, 3000);
}

async function sendAudioAsFile(blob) {
    if (!sessionId || !blob || blob.size < 2000) {
        showTurnHint("I didn't hear anything — please speak up and try again.");
        setMicState('idle');
        scheduleAutoListen();
        return;
    }
    // Stop the live Web Speech transcript now — we don't need more interim
    // results while we're uploading, and leaving it alive holds the mic.
    stopLiveRecognition();
    vad.processing = true;
    setMicState('processing');
    // The blob is the candidate's answer — keep it across retries so a
    // Deepgram timeout doesn't force them to re-speak 30 seconds of work.
    const MAX_UPLOAD_ATTEMPTS = 3;
    let attempt = 0;
    let data = null;
    try {
        while (attempt < MAX_UPLOAD_ATTEMPTS) {
            attempt++;
            try {
                const formData = new FormData();
                formData.append('audio', blob, 'recording.webm');
                const res = await fetch(`${API}/api/session/${sessionId}/audio-turn`, {
                    method: 'POST',
                    body: formData,
                });
                if (res.status === 400) {
                    // Real "no speech detected" — nothing to retry.
                    discardLiveBubble();
                    showTurnHint("I didn't catch that — please try again.");
                    vad.processing = false;
                    setMicState('idle');
                    scheduleAutoListen();
                    return;
                }
                if (res.status === 503 || res.status === 502) {
                    // Backend STT service timed out or errored transiently.
                    // Retry the same blob.
                    console.warn('[audio-turn] transient', res.status, '— retrying upload, attempt', attempt);
                    if (attempt < MAX_UPLOAD_ATTEMPTS) {
                        showTurnHint(`Still processing… retrying (${attempt}/${MAX_UPLOAD_ATTEMPTS - 1})`);
                        await new Promise(r => setTimeout(r, 1000 * attempt));
                        continue;
                    }
                    // All retries exhausted — fall through to the catch block.
                    throw new Error(`STT service unavailable after ${MAX_UPLOAD_ATTEMPTS} attempts`);
                }
                if (!res.ok) {
                    const detail = await res.text();
                    throw new Error(`${res.status}: ${detail}`);
                }
                data = await res.json();
                break;  // success
            } catch (netErr) {
                // Actual network error (connection dropped, DNS, etc).
                console.warn('[audio-turn] network error on attempt', attempt, netErr);
                if (attempt < MAX_UPLOAD_ATTEMPTS) {
                    showTurnHint(`Connection glitch — retrying (${attempt}/${MAX_UPLOAD_ATTEMPTS - 1})`);
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                    continue;
                }
                throw netErr;
            }
        }

        // --- success path ---
        if (!finalizeLiveBubble(data.transcript)) {
            addMessage('user', data.transcript || '[voice input]');
        }
        updateStatus(data.stage, data.total_turns, null);
        addMessage('assistant', data.reply, data.audio_url);
        try {
            const evalData = await apiGet(`/api/session/${sessionId}/evaluations`);
            avgScore.textContent = evalData.avg_score != null ? evalData.avg_score.toFixed(1) : '--';
        } catch (_) {}
        if (data.is_finished) { showResults(); return; }
    } catch (err) {
        console.warn('[audio-turn] final failure:', err);
        // Keep the live bubble showing what the candidate said — so they
        // know their answer wasn't lost. Just surface a clear retry hint.
        showTurnHint("Network is slow — please try answering again.");
        setMicState('idle');
        scheduleAutoListen();
    } finally {
        vad.processing = false;
    }
}

// --- Jobs ---
// Role catalog is fetched once and cached. It feeds every dropdown
// (filter panel + company post-job form).
let rolesCatalog = null;
async function loadRolesCatalog() {
    if (rolesCatalog) return rolesCatalog;
    try {
        rolesCatalog = await apiGet('/api/roles');
    } catch (_) {
        rolesCatalog = { role_families: [], seniority_tiers: [] };
    }
    return rolesCatalog;
}

function populateRoleSelect(selectEl, { includeAny = false } = {}) {
    if (!selectEl || !rolesCatalog) return;
    const opts = [];
    if (includeAny) opts.push('<option value="">Any role</option>');
    for (const r of rolesCatalog.role_families) {
        opts.push(`<option value="${r.role_family}">${r.display_name}</option>`);
    }
    selectEl.innerHTML = opts.join('');
}

function populateSeniority(selectEl) {
    if (!selectEl || !rolesCatalog) return;
    const label = {
        intern: 'Intern (0y)',
        entry: 'Entry (0–2y)',
        mid: 'Mid (2–5y)',
        senior: 'Senior (5–9y)',
        lead: 'Lead (9–14y)',
        principal: 'Principal (14y+)',
    };
    selectEl.innerHTML = rolesCatalog.seniority_tiers
        .map(t => `<option value="${t}" ${t === 'mid' ? 'selected' : ''}>${label[t] || t}</option>`)
        .join('');
}

function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

async function loadJobs() {
    const list = document.getElementById('jobs-list');
    if (!list) return;
    await loadRolesCatalog();
    // First time only: fill the filter dropdown.
    const filterRole = document.getElementById('filter-role-family');
    if (filterRole && !filterRole.dataset.filled) {
        populateRoleSelect(filterRole, { includeAny: true });
        filterRole.dataset.filled = '1';
    }

    // Build query from filter controls.
    const params = new URLSearchParams();
    const rf = document.getElementById('filter-role-family')?.value;
    if (rf) params.append('role_family', rf);
    const expRaw = document.getElementById('filter-experience')?.value;
    const exp = expRaw === '' ? null : Number(expRaw);
    if (exp !== null && !Number.isNaN(exp)) {
        // Candidate's own YoE — used as a point probe against each job's range.
        params.append('min_experience_years', exp);
        params.append('max_experience_years', exp);
    }
    const skill = document.getElementById('filter-skill')?.value?.trim();
    if (skill) params.append('skill', skill);
    const qs = params.toString();
    const path = qs ? `/api/jobs?${qs}` : '/api/jobs';

    try {
        const jobs = await apiGet(path);
        if (jobs.length === 0) {
            list.innerHTML = '<p class="text-muted">No positions match those filters. Try widening your search.</p>';
            return;
        }
        const roleDisplay = Object.fromEntries(
            (rolesCatalog.role_families || []).map(r => [r.role_family, r.display_name])
        );
        list.innerHTML = jobs.map(j => {
            const role = roleDisplay[j.role_family] || j.role_family || '';
            const senior = j.seniority ? j.seniority.charAt(0).toUpperCase() + j.seniority.slice(1) : '';
            const expRange = (j.min_experience_years != null && j.max_experience_years != null)
                ? `${j.min_experience_years}–${j.max_experience_years} yrs`
                : '';
            const badges = [
                role ? `<span class="badge badge-role">${escapeHtml(role)}</span>` : '',
                senior ? `<span class="badge badge-seniority">${escapeHtml(senior)}</span>` : '',
                expRange ? `<span class="badge badge-experience">${expRange}</span>` : '',
            ].filter(Boolean).join('');
            return `
            <div class="job-card">
                <div class="job-card-head">
                    <div class="job-card-head-left">
                        <div class="job-title">${escapeHtml(j.title)}</div>
                        <div class="job-company">${escapeHtml(j.company_name)}${j.department ? ' · ' + escapeHtml(j.department) : ''}</div>
                        <div class="job-badges">${badges}</div>
                    </div>
                </div>
                <div class="job-skills">${escapeHtml(j.required_skills || 'No specific skills listed')}</div>
                ${j.description ? `
                    <div class="job-desc-toggle" data-desc-toggle>
                        <span data-desc-show>Show full description ↓</span>
                        <span data-desc-hide style="display:none">Hide description ↑</span>
                    </div>
                    <div class="job-desc-body" data-desc-body style="display:none">${escapeHtml(j.description)}</div>
                ` : ''}
                <button class="btn btn-primary job-action" onclick="showApplyScreen('${j.id}','${(j.title || '').replace(/'/g, "\\'")}')">Apply</button>
            </div>`;
        }).join('');

        // Wire the show/hide description toggles.
        list.querySelectorAll('[data-desc-toggle]').forEach(t => {
            t.addEventListener('click', () => {
                const body = t.parentElement.querySelector('[data-desc-body]');
                const show = t.querySelector('[data-desc-show]');
                const hide = t.querySelector('[data-desc-hide]');
                const open = body.style.display !== 'none';
                body.style.display = open ? 'none' : 'block';
                show.style.display = open ? '' : 'none';
                hide.style.display = open ? 'none' : '';
            });
        });
    } catch (err) {
        list.innerHTML = '<p class="text-muted">Failed to load jobs.</p>';
    }
}

document.getElementById('apply-filter-btn')?.addEventListener('click', loadJobs);
document.getElementById('reset-filter-btn')?.addEventListener('click', () => {
    const r = document.getElementById('filter-role-family');
    const e = document.getElementById('filter-experience');
    const s = document.getElementById('filter-skill');
    if (r) r.value = '';
    if (e) e.value = '';
    if (s) s.value = '';
    loadJobs();
});

// Auth tab + SSO wiring ----------------------------------------------------
// The company portal supports both sign-in and register via the same form.
// We toggle the visible primary button and the "Contact email" field based
// on the selected tab, so only one primary CTA is active at a time.
function setAuthMode(mode) {
    document.querySelectorAll('.auth-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.authMode === mode);
    });
    document.querySelectorAll('[data-auth-mode]').forEach(btn => {
        if (btn.classList.contains('auth-tab')) return;
        btn.style.display = (btn.dataset.authMode === mode) ? '' : 'none';
    });
    document.querySelectorAll('[data-auth-field]').forEach(el => {
        el.style.display = (el.dataset.authField === mode) ? '' : 'none';
    });
}
document.querySelectorAll('.auth-tab').forEach(t => {
    t.addEventListener('click', () => setAuthMode(t.dataset.authMode));
});
// Initialize to sign-in so the seeded demo account is the default path.
setAuthMode('signin');

function ssoNotConfigured(provider) {
    alert(
        `${provider} SSO isn't configured on this server yet.\n\n` +
        `For a fully-wired SSO you'd register an OAuth client with ${provider}, ` +
        `expose a /api/auth/${provider.toLowerCase()}/callback endpoint, and exchange the ` +
        `code for the company's email + name.\n\n` +
        `For now, please sign in with email/password. ` +
        `You can use the demo account: DemoCorp / demo1234.`
    );
}
document.getElementById('sso-google-btn')?.addEventListener('click', () => ssoNotConfigured('Google'));
document.getElementById('sso-microsoft-btn')?.addEventListener('click', () => ssoNotConfigured('Microsoft'));

// --- Theme toggle (light default, dark on opt-in) ------------------------
// The inline <script> in index.html has already applied the stored theme
// to <html data-theme="..."> before paint. Here we just wire the toggle
// and persist new choices.
const THEME_KEY = 'ai_portal_theme';
const THEME_META_COLORS = { light: '#fafaf8', dark: '#0a0a0b' };
function applyTheme(theme) {
    const t = (theme === 'dark') ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    const meta = document.getElementById('meta-theme-color');
    if (meta) meta.setAttribute('content', THEME_META_COLORS[t]);
    try { localStorage.setItem(THEME_KEY, t); } catch (_) {}
}
document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
});


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
    // This runs inside a click handler (the "Start Interview Now" button),
    // so we speak an audible unlock utterance here too — same pattern as
    // the Start button. See the comment above startBtn's listener.
    if ('speechSynthesis' in window) {
        try {
            const u = new SpeechSynthesisUtterance('Starting your interview.');
            u.volume = 1.0; u.rate = 1.0; u.pitch = 0.96; u.lang = 'en-US';
            const best = pickBestVoice();
            if (best) u.voice = best;
            window.speechSynthesis.speak(u);
            ttsPrimed = true;
            startTTSKeepAlive();
        } catch (_) {}
    }
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
            ensureCompanyJobDropdowns();
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
            ensureCompanyJobDropdowns();
            loadCompanyData();
        } catch (err) {
            alert('Login failed: ' + err.message);
        }
    });
}

async function ensureCompanyJobDropdowns() {
    await loadRolesCatalog();
    const roleSel = document.getElementById('job-role-family');
    const seniSel = document.getElementById('job-seniority');
    if (roleSel && !roleSel.dataset.filled) {
        populateRoleSelect(roleSel);
        roleSel.dataset.filled = '1';
    }
    if (seniSel && !seniSel.dataset.filled) {
        populateSeniority(seniSel);
        seniSel.dataset.filled = '1';
    }
}

const createJobBtn = document.getElementById('create-job-btn');
if (createJobBtn) {
    createJobBtn.addEventListener('click', async () => {
        if (!companyId || !companyToken) return;
        const title = document.getElementById('job-title').value.trim();
        const desc = document.getElementById('job-desc').value.trim();
        const skills = document.getElementById('job-skills').value.trim();
        const roleFamily = document.getElementById('job-role-family').value;
        const seniority = document.getElementById('job-seniority').value;
        const minExp = parseFloat(document.getElementById('job-min-exp').value);
        const maxExp = parseFloat(document.getElementById('job-max-exp').value);
        const department = document.getElementById('job-department').value.trim();
        if (!title) return alert('Enter job title');
        if (!roleFamily) return alert('Select a role family');
        const payload = {
            title,
            description: desc,
            required_skills: skills,
            role_family: roleFamily,
            seniority: seniority || 'mid',
            min_experience_years: Number.isFinite(minExp) ? minExp : 0,
            max_experience_years: Number.isFinite(maxExp) ? maxExp : 40,
            department,
        };
        try {
            await apiPost(`/api/company/${companyId}/jobs`, payload, companyToken);
            document.getElementById('job-title').value = '';
            document.getElementById('job-desc').value = '';
            document.getElementById('job-skills').value = '';
            document.getElementById('job-min-exp').value = '';
            document.getElementById('job-max-exp').value = '';
            document.getElementById('job-department').value = '';
            loadCompanyData();
            alert('Job posted.');
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
// --- Pre-flight voice test (setup screen) --------------------------------
// Users report silent TTS even at full volume; browser autoplay policy can
// block synthesis until a real click invokes speak(). This button runs a
// full speak() cycle inside a click handler, measures whether the browser
// actually produced audio, and surfaces clear feedback. Once it passes,
// the Start button knows audio is unblocked.
let ttsVerified = false;
// NOT async — must run synchronously inside the click handler so Chrome's
// autoplay policy treats speak() as user-initiated. Any `await` before
// speak() releases the user-gesture chain and Chrome silently blocks audio.
function runVoiceTest() {
    const statusEl = document.getElementById('voice-test-status');
    const btn = document.getElementById('test-voice-btn');
    if (!statusEl) return;
    if (!('speechSynthesis' in window)) {
        statusEl.textContent = 'Your browser does not support speech synthesis.';
        statusEl.className = 'voice-test-status err';
        return;
    }
    statusEl.textContent = 'Playing test sentence…';
    statusEl.className = 'voice-test-status';
    if (btn) btn.disabled = true;

    try { window.speechSynthesis.cancel(); } catch (_) {}

    const u = new SpeechSynthesisUtterance(
        "Hi, this is your interviewer. If you can hear this, audio is working."
    );
    u.volume = 1.0;
    u.rate = 1.0;
    u.pitch = 0.96;
    u.lang = 'en-US';
    // Use whatever voice is already loaded. Do NOT await voice loading —
    // that would break the user-gesture chain. The browser's default voice
    // is fine if no preferred one is available yet.
    const best = pickBestVoice();
    if (best) u.voice = best;

    u.onstart = () => console.log('[tts] test utterance started');
    u.onerror = (e) => {
        console.warn('[tts] test utterance error:', e?.error || e);
        statusEl.textContent =
            e?.error === 'not-allowed'
                ? 'Browser blocked audio (autoplay policy). Try reloading and clicking Test voice before anything else.'
                : `Speech synthesis error: ${e?.error || 'unknown'}.`;
        statusEl.className = 'voice-test-status err';
        if (btn) btn.disabled = false;
        stopTTSKeepAlive();
    };
    u.onend = () => {
        stopTTSKeepAlive();
        // We can't reliably detect from JS whether audio actually hit the
        // speakers — onend fires even if Chrome silently suppressed audio.
        // Ask the human instead.
        statusEl.innerHTML =
            'Did you hear the voice? ' +
            '<a href="#" id="voice-heard-yes">Yes</a> · ' +
            '<a href="#" id="voice-heard-no">No, help</a>';
        statusEl.className = 'voice-test-status';
        if (btn) btn.disabled = false;
        document.getElementById('voice-heard-yes')?.addEventListener('click', (ev) => {
            ev.preventDefault();
            ttsVerified = true;
            statusEl.textContent = '✓ Voice works. You can start the interview.';
            statusEl.className = 'voice-test-status ok';
        });
        document.getElementById('voice-heard-no')?.addEventListener('click', (ev) => {
            ev.preventDefault();
            statusEl.innerHTML =
                'Things to check, in order: ' +
                '(1) click <strong>Test tone</strong> — if you don\'t hear the beep, change your <em>Output device</em> dropdown above or fix your system default output. ' +
                '(2) Right-click the browser tab and make sure it isn\'t muted. ' +
                '(3) On Windows, open Settings → System → Sound → App volume and make sure the browser isn\'t muted there. ' +
                '(4) Try Chrome or Edge if you\'re on Firefox — Firefox\'s speechSynthesis support is unreliable.';
            statusEl.className = 'voice-test-status warn';
        });
    };

    // IMPORTANT: speak() must be the first audio API call inside this
    // click handler — no awaits, no async helpers before this line.
    window.speechSynthesis.speak(u);
    startTTSKeepAlive();
}
document.getElementById('test-voice-btn')?.addEventListener('click', runVoiceTest);

// --- System output tone test --------------------------------------------
// Plays a 440 Hz sine for 600ms via WebAudio. This goes through the HTML
// media pipeline (same path as server-TTS audio elements), so it proves
// the OS output, device selection, and browser sound permission are all
// working — independent of speechSynthesis. If this tone is audible but
// Test voice is not, the issue is narrowed to browser speech synthesis
// (autoplay policy, missing voices, etc).
async function runToneTest() {
    const statusEl = document.getElementById('voice-test-status');
    const btn = document.getElementById('test-tone-btn');
    if (statusEl) { statusEl.textContent = 'Playing test tone…'; statusEl.className = 'voice-test-status'; }
    if (btn) btn.disabled = true;
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) throw new Error('WebAudio not supported in this browser');
        const ctx = new Ctx();
        // If the context is suspended (autoplay policy), resume from the
        // user gesture first. This almost always unlocks audio output.
        if (ctx.state === 'suspended') await ctx.resume();

        // Try to route through the selected output device. On Chrome/Edge,
        // AudioContext.setSinkId() (experimental) lets us pick; otherwise
        // we go through the default.
        const sinkId = document.getElementById('audio-output-select')?.value;
        if (sinkId && sinkId !== 'default' && typeof ctx.setSinkId === 'function') {
            try { await ctx.setSinkId(sinkId); } catch (e) {
                console.warn('[audio] setSinkId failed, using default:', e);
            }
        }

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 440;
        // Ramp up/down to avoid click-pops on start/end.
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.25, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.65);

        osc.onended = () => {
            if (statusEl) {
                statusEl.textContent = '✓ Tone played. If you heard it, your system audio is fine.';
                statusEl.className = 'voice-test-status ok';
            }
            if (btn) btn.disabled = false;
            try { ctx.close(); } catch (_) {}
        };
    } catch (e) {
        console.warn('[audio] tone test failed:', e);
        if (statusEl) {
            statusEl.textContent = 'Tone test failed: ' + (e.message || e);
            statusEl.className = 'voice-test-status err';
        }
        if (btn) btn.disabled = false;
    }
}
document.getElementById('test-tone-btn')?.addEventListener('click', runToneTest);

// --- Populate input/output device dropdowns -----------------------------
// enumerateDevices() returns empty labels until the page has had mic
// permission at least once. We populate once on load (to show at least
// deviceIds) and again after the first Test voice / Start press.
const AUDIO_OUT_KEY = 'ai_portal_audio_out';
const AUDIO_IN_KEY  = 'ai_portal_audio_in';

async function populateAudioDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    let devices = [];
    try { devices = await navigator.mediaDevices.enumerateDevices(); } catch (_) { return; }

    const outSel = document.getElementById('audio-output-select');
    const inSel  = document.getElementById('audio-input-select');
    const fill = (sel, kind, storageKey) => {
        if (!sel) return;
        const saved = (() => { try { return localStorage.getItem(storageKey); } catch (_) { return null; } })();
        const items = devices.filter(d => d.kind === kind);
        sel.innerHTML = '<option value="default">System default</option>' +
            items.map(d => {
                const label = d.label || `${kind} (${d.deviceId.slice(0, 6)})`;
                return `<option value="${d.deviceId}">${label.replace(/</g,'&lt;')}</option>`;
            }).join('');
        if (saved && Array.from(sel.options).some(o => o.value === saved)) sel.value = saved;
    };
    fill(outSel, 'audiooutput', AUDIO_OUT_KEY);
    fill(inSel,  'audioinput',  AUDIO_IN_KEY);

    // Browsers that can't route audio output per-element should hide the picker.
    const audioProbe = new Audio();
    if (typeof audioProbe.setSinkId !== 'function' && outSel) {
        outSel.disabled = true;
        outSel.title = 'This browser does not support per-page output routing. Change your system default to switch devices.';
    }
}
populateAudioDevices();

document.getElementById('audio-output-select')?.addEventListener('change', (e) => {
    try { localStorage.setItem(AUDIO_OUT_KEY, e.target.value); } catch (_) {}
});
document.getElementById('audio-input-select')?.addEventListener('change', (e) => {
    try { localStorage.setItem(AUDIO_IN_KEY, e.target.value); } catch (_) {}
});

// Expose a helper so the server-TTS audio element can route to the
// chosen output device. speechSynthesis can't be routed per-page —
// it always uses the OS default.
async function applySelectedOutput(audioEl) {
    const sinkId = document.getElementById('audio-output-select')?.value;
    if (!sinkId || sinkId === 'default') return;
    if (typeof audioEl.setSinkId !== 'function') return;
    try { await audioEl.setSinkId(sinkId); }
    catch (e) { console.warn('[audio] setSinkId on audio element failed:', e); }
}

// Prime speech synthesis on the Start click. This handler MUST run inside
// the user-gesture chain (no awaits before speak()) or Chrome won't unlock.
// We speak a short audible utterance directly — the later `cancel()` in
// speakText() will flush it cleanly when the real greeting arrives.
startBtn.addEventListener('click', () => {
    if ('speechSynthesis' in window) {
        try {
            const u = new SpeechSynthesisUtterance('Starting your interview.');
            u.volume = 1.0;
            u.rate = 1.0;
            u.pitch = 0.96;
            u.lang = 'en-US';
            const best = pickBestVoice();
            if (best) u.voice = best;
            window.speechSynthesis.speak(u);
            ttsPrimed = true;
            startTTSKeepAlive();
        } catch (e) {
            console.warn('[tts] start-click prime failed:', e);
        }
    }
    startSession();
});

// Mic button:
//   - while recording: stop + submit (end-of-turn).
//   - while waiting / processing: toggle mute.
micBtn.addEventListener('click', () => {
    if (!sessionId) return;
    if (vad.recorder) {
        stopAndSubmitTurn();
        return;
    }
    vad.muted = !vad.muted;
    if (vad.muted) {
        if (vad.armTimer) { clearTimeout(vad.armTimer); vad.armTimer = null; }
        setMicState('muted');
    } else {
        if (!vad.streamReady) startVAD();
        setMicState('idle');
        if (!vad.interviewerSpeaking && !vad.processing) scheduleAutoListen(0);
    }
});
// Camera / speaker / text-compose / transcript-toggle buttons were removed
// from the UI — the interview runs mic-only with an always-visible transcript.
// Their DOM refs may be null and their listeners are intentionally absent.

restartBtn.addEventListener('click', () => {
    sessionId = null;
    resumeId = null;
    jobId = null;
    conversation.innerHTML = '';
    stopVAD();
    stopCamera();
    stopElapsedTimer();
    stopLiveRecognition();
    discardLiveBubble();
    setInterviewerSpeaking(false);
    if (window.avatar && window.avatar.teardown) window.avatar.teardown();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (currentTypingAnimation) { clearInterval(currentTypingAnimation); currentTypingAnimation = null; }
    showScreen(setupScreen);
});


// Spacebar finishes the turn during an active interview (mirrors mic button).
document.addEventListener('keydown', (e) => {
    if (!sessionId) return;
    const el = document.activeElement;
    if (e.code === 'Space' && el !== candidateName
        && (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA'))) {
        e.preventDefault();
        micBtn.click();
    }
});
