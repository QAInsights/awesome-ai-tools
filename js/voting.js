import { EVENTS } from '../src/lib/analytics-events.js';
import { analytics } from './analytics-client.js';
import { authAttribution } from './auth-attribution.js';
import { auth } from './auth.js';

let zapCounts = {};

export function getVoteCount(toolId) {
    return zapCounts[toolId] || 0;
}

/**
 * Initialize zap button click handler
 */
export async function initVoting() {
    try {
        // Abort the request if the backend is unresponsive so a dead/cold API
        // doesn't leave the voting UI in limbo for minutes.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        let response;
        try {
            response = await fetch('/api/v1/count', { signal: controller.signal });
        } finally {
            clearTimeout(timeoutId);
        }
        if (!response.ok) {
            throw new Error(`Failed to fetch votes: ${response.status}`);
        }
        const data = await response.json();
        for (const [key, val] of Object.entries(data)) {
            zapCounts[key.replace('votes:', '')] = Number(val) || 0;
        }
        console.log('Votes loaded:', Object.keys(zapCounts).length, 'tools have votes');
    } catch (error) {
        if (error?.name === 'AbortError') {
            console.warn('[voting] /api/v1/count timed out after 5s - rendering with zero counts');
        } else {
            console.error('[ERROR] Could not fetch votes:', error);
        }
    }

    // Rapid patch any buttons that were rendered immediately
    document.querySelectorAll('.zap-btn').forEach(btn => {
        const id = btn.dataset.toolId;
        if (zapCounts[id]) {
            btn.querySelector('.zap-count').textContent = zapCounts[id].toLocaleString();
        }
    });

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.zap-btn');
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();

        const toolId = btn.dataset.toolId;
        
        // Prevent multiple rapid api calls
        if (btn.classList.contains('zapped')) return;

        // Require authentication to vote
        if (!auth.isAuthenticated()) {
            analytics.track(EVENTS.GATE_BLOCKED, { trigger: 'zap_btn', subject: toolId });
            authAttribution.open('zap_btn');
            return;
        }

        // Once confirmed not clicked, cast the vote securely
        castVote(toolId, btn);

        if (!zapCounts[toolId]) {
            zapCounts[toolId] = parseInt(btn.querySelector('.zap-count').textContent.replace(/,/g, '')) || 0;
        }
        zapCounts[toolId]++;

        btn.classList.add('firing');
        btn.classList.add('zapped');

        const countEl = btn.querySelector('.zap-count');
        countEl.textContent = zapCounts[toolId].toLocaleString();

        setTimeout(() => btn.classList.remove('firing'), 500);
    });
}

async function waitForTurnstileToken(timeoutMs = 3000) {
    // If token already available, return immediately
    const turnstileInput = document.querySelector('[name="cf-turnstile-response"]');
    if (window.cfTokenValue || (turnstileInput && turnstileInput.value)) {
        return window.cfTokenValue || turnstileInput.value;
    }

    // Wait for Turnstile callback to populate window.cfTokenValue
    return new Promise((resolve) => {
        const start = Date.now();
        const interval = setInterval(() => {
            if (window.cfTokenValue) {
                clearInterval(interval);
                resolve(window.cfTokenValue);
            } else if (Date.now() - start > timeoutMs) {
                clearInterval(interval);
                console.warn('[Voting] Turnstile token timed out, sending without cf_token');
                resolve("");
            }
        }, 100);
    });
}

const ZAP_ERROR_MESSAGES = {
    400: { tip: "You have already zapped this tool!", label: "Zap'd", color: "#a3a3a3" },
    401: { tip: "Sign in free to zap", label: null, color: "" },
    429: { tip: "You are voting too fast! Please slow down.", label: "Wait", color: "#ef4444" },
};
const ZAP_ERROR_DEFAULT = { tip: "Security check failed. Please refresh and try again.", label: "Failed", color: "#ef4444" };

function rollbackZap(btn, toolId, { tip, label, color }) {
    if (!btn) return;
    btn.classList.remove('zapped');
    zapCounts[toolId]--;

    const countEl = btn.querySelector('.zap-count');
    const originalTip = btn.dataset.tip;

    btn.dataset.tip = tip;
    countEl.textContent = label ?? zapCounts[toolId].toLocaleString();
    countEl.style.color = color;

    setTimeout(() => {
        countEl.textContent = zapCounts[toolId].toLocaleString();
        countEl.style.color = "";
        btn.dataset.tip = originalTip;
    }, 3000);
}

async function castVote(toolId, btn) {
    const cfToken = await waitForTurnstileToken();

    const payload = {
        tool_id: toolId,
        cf_token: cfToken
    };

    const response = await fetch('/api/v1/vote', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    // Reset Turnstile for the next vote
    if (window.turnstile && window.turnstileWidgetId !== undefined) {
        window.turnstile.reset(window.turnstileWidgetId);
        window.cfTokenValue = "";
    } else if (window.turnstile) {
        window.turnstile.reset();
        window.cfTokenValue = "";
    }

    if (!response.ok) {
        rollbackZap(btn, toolId, ZAP_ERROR_MESSAGES[response.status] ?? ZAP_ERROR_DEFAULT);
        if (response.status === 401) authAttribution.open('zap_btn');
        console.error('Failed to cast vote', response.status);
        return;
    }

    analytics.track(EVENTS.ZAP_CAST, { trigger: 'zap_btn', subject: toolId });
}
