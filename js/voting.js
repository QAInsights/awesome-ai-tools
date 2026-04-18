import { auth } from './auth.js';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8080';
let zapCounts = {};
let isVoting = false;

export function getVoteCount(toolId) {
    return zapCounts[toolId] || 0;
}

/**
 * Initialize zap button click handler
 */
export async function initVoting() {
    try {
        console.log('Initializing voting from:', API_BASE_URL);
        const response = await fetch(`${API_BASE_URL}/api/v1/count`);
        if (!response.ok) {
            throw new Error(`Failed to fetch votes: ${response.status}`);
        }
        const data = await response.json();
        for (const [key, val] of Object.entries(data)) {
            // Remove "votes:" prefix from the Spring Boot Redis key
            const id = key.replace('votes:', '');
            zapCounts[id] = val;
        }
        console.log('Votes loaded:', Object.keys(zapCounts).length, 'tools have votes');
    } catch (error) {
        console.error('[ERROR] Could not fetch votes:', error);
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
        const toolName = btn.dataset.toolName;
        
        // Prevent multiple rapid api calls
        if (btn.classList.contains('zapped')) return;

        // Require authentication to vote
        if (!auth.isAuthenticated()) {
            const countEl = btn.querySelector('.zap-count');
            const originalTip = btn.dataset.tip;
            btn.dataset.tip = "Sign in to vote!";
            countEl.textContent = "Login";
            countEl.style.color = "#a78bfa";
            setTimeout(() => {
                countEl.textContent = zapCounts[toolId]?.toLocaleString() || '0';
                countEl.style.color = "";
                btn.dataset.tip = originalTip;
            }, 2000);
            return;
        }

        const user = auth.getCurrentUser();
        const voterId = `${user.provider}:${user.id}`;

        // Once confirmed not clicked, cast the vote securely
        castVote(toolId, toolName, voterId, btn);

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

async function castVote(toolId, toolName, voterId, btn) {
    const cfToken = await waitForTurnstileToken();

    const payload = {
        tool_id: toolId,
        tool_name: toolName,
        visitor_id: voterId,
        cf_token: cfToken
    };

    const response = await fetch(`${API_BASE_URL}/api/v1/vote`, {
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
        if (response.status === 429) {
            // Rollback optimistic UI changes smoothly
            if (btn) {
                btn.classList.remove('zapped');
                zapCounts[toolId]--;
                
                const countEl = btn.querySelector('.zap-count');
                const originalTip = btn.dataset.tip;
                
                // Show user-friendly error directly on the button
                btn.dataset.tip = "You are voting too fast! Please slow down.";
                countEl.textContent = "Wait";
                countEl.style.color = "#ef4444"; // Tailwind's red-500
                
                // Revert to normal state after 3 seconds
                setTimeout(() => {
                    countEl.textContent = zapCounts[toolId].toLocaleString();
                    countEl.style.color = "";
                    btn.dataset.tip = originalTip;
                }, 3000);
            }
        } else if (response.status === 400) {
            // Rollback for duplicate votes
            if (btn) {
                btn.classList.remove('zapped');
                zapCounts[toolId]--;
                
                const countEl = btn.querySelector('.zap-count');
                const originalTip = btn.dataset.tip;
                
                btn.dataset.tip = "You have already zapped this tool!";
                countEl.textContent = "Zap'd";
                countEl.style.color = "#a3a3a3"; // A softer grey for already clicked
                
                setTimeout(() => {
                    countEl.textContent = zapCounts[toolId].toLocaleString();
                    countEl.style.color = "";
                    btn.dataset.tip = originalTip;
                }, 3000);
            }
        } else {
            // Rollback for general server errors
            if (btn) {
                btn.classList.remove('zapped');
                zapCounts[toolId]--;
                
                const countEl = btn.querySelector('.zap-count');
                const originalTip = btn.dataset.tip;
                
                btn.dataset.tip = "Security check failed. Please refresh and try again.";
                countEl.textContent = "Failed";
                countEl.style.color = "#ef4444";
                
                setTimeout(() => {
                    countEl.textContent = zapCounts[toolId].toLocaleString();
                    countEl.style.color = "";
                    btn.dataset.tip = originalTip;
                }, 3000);
            }
        }
        console.error('Failed to cast vote', response.status);
    }
}
