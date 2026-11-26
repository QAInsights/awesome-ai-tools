import { EVENTS } from '../src/lib/analytics-events.js';
import { analytics } from './analytics-client.js';

export function initializeDirectoryShare({
    root = document,
    clipboard = globalThis.navigator?.clipboard,
    track = analytics.track,
} = {}) {
    const openPanels = () => [...root.querySelectorAll('[data-directory-share][open]')];
    root.addEventListener?.('click', event => {
        for (const panel of openPanels()) if (!panel.contains(event.target)) panel.open = false;
    });
    root.addEventListener?.('keydown', event => {
        if (event.key !== 'Escape') return;
        for (const panel of openPanels()) {
            panel.open = false;
            panel.querySelector('summary')?.focus();
        }
    });
    for (const panel of root.querySelectorAll('[data-directory-share]')) {
        const button = panel.querySelector('[data-share-copy]');
        const field = panel.querySelector('[data-share-url]');
        const status = panel.querySelector('[data-share-status]');
        if (!button || !field || !status) continue;

        button.hidden = false;
        button.addEventListener('click', async () => {
            status.textContent = '';
            try {
                await clipboard.writeText(field.value);
            } catch {
                field.focus();
                field.select();
                status.textContent = 'Copy isn’t available here. Copy the selected link manually.';
                return;
            }
            status.textContent = 'Link copied.';
            track(EVENTS.DIRECTORY_LINK_COPIED, {
                trigger: panel.dataset.directoryShare,
                subject: panel.dataset.shareSlug,
            });
        });
    }
}
