import { completeBadgeStep } from './onboarding.js';

const BADGE_URL = 'https://ai.dosa.dev/badge/featured.svg';
const SITE_URL = 'https://ai.dosa.dev';

export function buildSnippets(slug) {
    const link = slug ? `${SITE_URL}/tools/${slug}?ref=badge` : `${SITE_URL}/?ref=badge`;
    return {
        markdown: `[![Featured on ai.dosa.dev](${BADGE_URL})](${link})`,
        html: `<a href="${link}" target="_blank" rel="noopener"><img src="${BADGE_URL}" alt="Featured on ai.dosa.dev" width="212" height="44"></a>`,
    };
}

function initializeBadgePage() {
    const toolSelect = document.getElementById('badgeTool');
    const markdown = document.getElementById('badgeMd');
    const html = document.getElementById('badgeHtml');

    const updateSnippets = () => {
        const snippets = buildSnippets(toolSelect?.value ?? '');
        if (markdown) markdown.textContent = snippets.markdown;
        if (html) html.textContent = snippets.html;
    };

    toolSelect?.addEventListener('change', updateSnippets);
    updateSnippets();

    document.querySelectorAll('[data-copy-target]').forEach(button => {
        button.addEventListener('click', async () => {
            const target = document.getElementById(button.dataset.copyTarget);
            if (!target) return;
            await navigator.clipboard.writeText(target.textContent ?? '');
            // Copying a snippet is the "get your badge" onboarding step's
            // completion signal; a no-op for signed-out visitors (401).
            void completeBadgeStep();
            button.textContent = 'Copied';
            setTimeout(() => {
                button.textContent = 'Copy';
            }, 1500);
        });
    });
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', initializeBadgePage);
}
