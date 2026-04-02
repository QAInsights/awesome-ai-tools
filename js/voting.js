/**
 * Voting module for zap button functionality
 */

const zapCounts = {};

/**
 * Initialize zap button click handler
 */
export function initVoting() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.zap-btn');
        if (!btn) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const toolId = btn.dataset.toolId;
        if (btn.classList.contains('zapped')) return;

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
