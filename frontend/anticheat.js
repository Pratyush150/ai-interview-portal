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
        this.active = false;
        this._handlers = {};
        this._intervals = [];
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
        };
    }

    async stop() {
        this.active = false;
        await this._flush();
        this._intervals.forEach(clearInterval);
    }
}
