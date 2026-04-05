import fpPromise from '@fingerprintjs/fingerprintjs';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8080';

const zapCounts = {};
let localVisitorId = "loading...";

fpPromise.load()
    .then(fp => fp.get())
    .then(result => {
        localVisitorId = result.visitorId;
    });

export function getVoteCount(toolId) {
    return zapCounts[toolId] || 0;
}

/**
 * Initialize zap button click handler
 */
export function initVoting() {
    // Fetch server counts dynamically
    fetch(`${API_BASE_URL}/api/v1/count`)
        .then(res => res.json())
        .then(data => {
            for (const [key, val] of Object.entries(data)) {
                // Remove "votes:" prefix from the Spring Boot Redis key
                const id = key.replace('votes:', '');
                zapCounts[id] = val;
            }
            // Rapid patch any buttons that were rendered immediately
            document.querySelectorAll('.zap-btn').forEach(btn => {
                const id = btn.dataset.toolId;
                if (zapCounts[id]) {
                    btn.querySelector('.zap-count').textContent = zapCounts[id].toLocaleString();
                }
            });
        })
        .catch(err => console.error("Could not fetch votes:", err));

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.zap-btn');
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();

        const toolId = btn.dataset.toolId;
        const toolName = btn.dataset.toolName;
        
        // Prevent multiple rapid api calls
        if (btn.classList.contains('zapped')) return;

        // Once confirmed not clicked, cast the vote securely
        castVote(toolId, toolName, localVisitorId);

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

async function castVote(toolId, toolName, visitorId) {
    const turnstileInput = document.querySelector('[name="cf-turnstile-response"]');

    const payload = {
        tool_id: toolId,
        tool_name: toolName,
        visitor_id: visitorId,
        cf_token: turnstileInput ? turnstileInput.value : ""
    };

    const response = await fetch(`${API_BASE_URL}/api/v1/vote`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    // new token for the next vote
    if (window.turnstile) {
        window.turnstile.reset();
    }

    console.log(response);

    if (!response.ok) {
        console.error('Failed to cast vote');
    }
}
