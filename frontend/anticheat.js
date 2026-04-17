/**
 * Anti-Cheat Monitor for AI Interview Portal
 * Detects: tab switching, copy/paste, devtools, extensions, suspicious shortcuts
 */
class AntiCheatMonitor {
    constructor(sessionId, apiBase) {
        this.sessionId = sessionId;
        this.apiBase = apiBase;
        this.violations = [];
        this.tabSwitchCount = 0;
        this.copyPasteCount = 0;
        this.motionWarnCount = 0;
        this.phoneWarnCount = 0;
        this.active = false;
        this._handlers = {};
        this._intervals = [];
        this._videoEl = null;
        this._motionCanvas = null;
        this._motionCtx = null;
        this._prevFrame = null;
        this._highMotionStreak = 0;
        this._phoneStreak = 0;
        this._darkStreak = 0;
        this._lastMotionWarnAt = 0;
        this._lastPhoneWarnAt = 0;
        this._lastDarkWarnAt = 0;
        this._cameraWatchdogCb = null;
    }

    start() {
        this.active = true;
        this._watchTabSwitch();
        this._watchCopyPaste();
        this._watchDevTools();
        this._watchExtensions();
        this._watchRightClick();
        this._watchKeyboardShortcuts();
        // Batch-report every 30 seconds
        this._intervals.push(setInterval(() => this._flush(), 30000));
    }

    // Called by app.js once the camera stream is running. Enables motion
    // detection and watches for the user killing the camera mid-interview.
    attachCamera(videoEl, stream, onCameraLost) {
        this._videoEl = videoEl;
        this._cameraWatchdogCb = onCameraLost || null;
        if (stream) {
            stream.getVideoTracks().forEach((t) => {
                t.addEventListener('ended', () => {
                    if (!this.active) return;
                    this._record('camera_stopped', { reason: 'track_ended' });
                    this._showWarning('Camera was turned off — it must stay on for the entire interview.');
                    if (this._cameraWatchdogCb) this._cameraWatchdogCb();
                });
            });
        }
        this._watchMotion();
    }

    _watchMotion() {
        if (!this._videoEl) return;
        const W = 64, H = 48;
        this._motionCanvas = document.createElement('canvas');
        this._motionCanvas.width = W;
        this._motionCanvas.height = H;
        this._motionCtx = this._motionCanvas.getContext('2d', { willReadFrequently: true });

        const interval = setInterval(() => {
            if (!this.active) return;
            const v = this._videoEl;
            if (!v || v.readyState < 2 || v.videoWidth === 0) return;
            try {
                this._motionCtx.drawImage(v, 0, 0, W, H);
                const frame = this._motionCtx.getImageData(0, 0, W, H);
                const stats = this._frameStats(frame.data, W, H);
                if (this._prevFrame) {
                    const diff = this._frameDiff(this._prevFrame.data, frame.data);
                    this._handleMotion(diff);
                }
                this._handlePhoneDetection(stats);
                this._handleDarkFrame(stats);
                this._prevFrame = frame;
            } catch (_) {}
        }, 600);
        this._intervals.push(interval);
    }

    _handleMotion(diff) {
        // diff is 0..1; empirically >0.08 is significant movement
        if (diff > 0.08) {
            this._highMotionStreak++;
            if (this._highMotionStreak >= 3) {
                this.motionWarnCount++;
                this._record('excessive_motion', {
                    diff: Number(diff.toFixed(3)),
                    streak: this._highMotionStreak,
                    count: this.motionWarnCount,
                });
                const now = Date.now();
                if (now - this._lastMotionWarnAt > 8000) {
                    this._lastMotionWarnAt = now;
                    this._showWarning('Please stay still and keep your face in view. Excessive movement is flagged.');
                }
                this._highMotionStreak = 0;
            }
        } else {
            this._highMotionStreak = Math.max(0, this._highMotionStreak - 1);
        }
    }

    // Phone / tablet / second-screen heuristic. A phone screen pointed at
    // the webcam typically produces a concentrated rectangular bright region
    // with many near-white pixels. We look for:
    //   - high brightFraction (pixels with luminance > 220)
    //   - that bright region clusters into a tight bounding box (< 55% of frame)
    //   - sustained across multiple consecutive samples
    _handlePhoneDetection(stats) {
        const looksLikeScreen = (
            stats.brightFraction > 0.10 &&
            stats.brightFraction < 0.55 &&
            stats.brightBoxCoverage < 0.55 &&
            stats.brightBoxFillRatio > 0.35
        );
        if (looksLikeScreen) {
            this._phoneStreak++;
            if (this._phoneStreak >= 3) {
                this.phoneWarnCount++;
                this._record('phone_suspected', {
                    bright_fraction: Number(stats.brightFraction.toFixed(3)),
                    box_coverage: Number(stats.brightBoxCoverage.toFixed(3)),
                    box_fill: Number(stats.brightBoxFillRatio.toFixed(3)),
                    streak: this._phoneStreak,
                    count: this.phoneWarnCount,
                });
                const now = Date.now();
                if (now - this._lastPhoneWarnAt > 6000) {
                    this._lastPhoneWarnAt = now;
                    this._showWarning('A phone or second screen appears to be visible. Please remove any other devices from the frame.');
                }
                this._phoneStreak = 0;
            }
        } else {
            this._phoneStreak = Math.max(0, this._phoneStreak - 1);
        }
    }

    // Camera blocked / covered / dark room heuristic.
    _handleDarkFrame(stats) {
        if (stats.avgBrightness < 18) {
            this._darkStreak++;
            if (this._darkStreak >= 4) {
                this._record('camera_blocked', {
                    avg_brightness: Number(stats.avgBrightness.toFixed(1)),
                });
                const now = Date.now();
                if (now - this._lastDarkWarnAt > 8000) {
                    this._lastDarkWarnAt = now;
                    this._showWarning('Your camera looks dark or blocked. Please ensure your face is well-lit and visible.');
                }
                this._darkStreak = 0;
            }
        } else {
            this._darkStreak = Math.max(0, this._darkStreak - 1);
        }
    }

    _frameStats(data, W, H) {
        // One pass: mean luminance + bright-pixel bounding box
        let sumLum = 0;
        let brightCount = 0;
        let minX = W, minY = H, maxX = -1, maxY = -1;
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const i = (y * W + x) * 4;
                const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                sumLum += lum;
                if (lum > 220) {
                    brightCount++;
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                }
            }
        }
        const total = W * H;
        const avgBrightness = sumLum / total;
        const brightFraction = brightCount / total;
        let brightBoxCoverage = 0;
        let brightBoxFillRatio = 0;
        if (maxX >= 0) {
            const boxArea = (maxX - minX + 1) * (maxY - minY + 1);
            brightBoxCoverage = boxArea / total;
            brightBoxFillRatio = brightCount / boxArea; // how packed the box is
        }
        return { avgBrightness, brightFraction, brightBoxCoverage, brightBoxFillRatio };
    }

    _frameDiff(a, b) {
        // Average absolute luminance difference, normalized to 0..1.
        // Sample every 4th pixel (step 16 in RGBA array) for speed.
        let sum = 0;
        let count = 0;
        for (let i = 0; i < a.length; i += 16) {
            const la = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
            const lb = 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];
            sum += Math.abs(la - lb);
            count++;
        }
        return (sum / count) / 255;
    }

    _watchTabSwitch() {
        const handler = () => {
            if (!this.active) return;
            if (document.hidden) {
                this.tabSwitchCount++;
                this._record('tab_switch', { count: this.tabSwitchCount });
                if (this.tabSwitchCount === 1) {
                    this._showWarning('Tab switching is monitored during the interview.');
                } else if (this.tabSwitchCount >= 3) {
                    this._showWarning('Multiple tab switches detected. This will affect your score.');
                }
            }
        };
        document.addEventListener('visibilitychange', handler);
        this._handlers['visibilitychange'] = handler;

        const blurHandler = () => {
            if (!this.active) return;
            this._record('window_blur', {});
        };
        window.addEventListener('blur', blurHandler);
        this._handlers['blur'] = blurHandler;
    }

    _watchCopyPaste() {
        const pasteHandler = (e) => {
            if (!this.active) return;
            this.copyPasteCount++;
            const text = (e.clipboardData || window.clipboardData || {}).getData('text') || '';
            this._record('paste_detected', {
                length: text.length,
                preview: text.substring(0, 50),
                count: this.copyPasteCount,
            });
            this._showWarning('Pasting text is monitored and may affect your evaluation.');
        };
        document.addEventListener('paste', pasteHandler);
        this._handlers['paste'] = pasteHandler;

        const copyHandler = () => {
            if (!this.active) return;
            this._record('copy_detected', {});
        };
        document.addEventListener('copy', copyHandler);
        this._handlers['copy'] = copyHandler;
    }

    _watchDevTools() {
        const checkSize = () => {
            if (!this.active) return;
            const widthDiff = window.outerWidth - window.innerWidth > 200;
            const heightDiff = window.outerHeight - window.innerHeight > 200;
            if (widthDiff || heightDiff) {
                this._record('devtools_suspected', {});
            }
        };
        window.addEventListener('resize', checkSize);
        this._handlers['resize'] = checkSize;
    }

    _watchExtensions() {
        const selectors = [
            '[data-grammarly-shadow-root]',
            '#chatgpt-assistant',
            '.copilot-overlay',
            '[class*="chatgpt"]',
            '[class*="ai-assist"]',
            '[id*="grammarly"]',
            '[class*="grammarly"]',
        ];
        const interval = setInterval(() => {
            if (!this.active) return;
            for (const sel of selectors) {
                try {
                    if (document.querySelector(sel)) {
                        this._record('extension_detected', { selector: sel });
                        this._showWarning('AI assistant extensions detected. Please disable them.');
                    }
                } catch (_) {}
            }
        }, 10000);
        this._intervals.push(interval);
    }

    _watchRightClick() {
        const handler = (e) => {
            if (!this.active) return;
            this._record('right_click', {});
            e.preventDefault();
        };
        document.addEventListener('contextmenu', handler);
        this._handlers['contextmenu'] = handler;
    }

    _watchKeyboardShortcuts() {
        const handler = (e) => {
            if (!this.active) return;
            if (
                e.key === 'F12' ||
                (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
                (e.ctrlKey && e.key === 'u')
            ) {
                this._record('suspicious_shortcut', { key: e.key, ctrl: e.ctrlKey, shift: e.shiftKey });
                e.preventDefault();
            }
        };
        document.addEventListener('keydown', handler);
        this._handlers['keydown_anticheat'] = handler;
    }

    _record(type, data) {
        this.violations.push({
            type,
            timestamp: Date.now(),
            ...data,
        });
    }

    _showWarning(msg) {
        // Show a non-intrusive warning banner
        let banner = document.getElementById('anticheat-warning');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'anticheat-warning';
            banner.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:8px 16px;background:#ef4444;color:white;text-align:center;font-size:0.85rem;z-index:9999;transition:opacity 0.3s;';
            document.body.appendChild(banner);
        }
        banner.textContent = msg;
        banner.style.opacity = '1';
        setTimeout(() => { banner.style.opacity = '0'; }, 5000);
    }

    async _flush() {
        if (this.violations.length === 0) return;
        const toSend = [...this.violations];
        this.violations = [];
        try {
            await fetch(`${this.apiBase}/api/session/${this.sessionId}/cheating-report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ violations: toSend }),
            });
        } catch (_) {
            // Re-add if send failed
            this.violations = toSend.concat(this.violations);
        }
    }

    getSummary() {
        return {
            totalViolations: this.violations.length,
            tabSwitches: this.tabSwitchCount,
            copyPastes: this.copyPasteCount,
            motionWarnings: this.motionWarnCount,
            phoneWarnings: this.phoneWarnCount,
        };
    }

    async stop() {
        this.active = false;
        await this._flush();
        this._intervals.forEach(clearInterval);
        this._prevFrame = null;
        this._motionCanvas = null;
        this._motionCtx = null;
    }
}
