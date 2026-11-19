import { expect, mock, test } from 'bun:test';
import { initializeDirectoryShare } from './directory-share.js';

function setup(clipboard, directoryShare = 'tool_share', shareSlug = 'cursor') {
    const track = mock();
    const status = { textContent: '' };
    const field = {
        value: `https://ai.dosa.dev/${directoryShare === 'tool_share' ? 'tools' : 'category'}/${shareSlug}?ref=${directoryShare}`,
        focus: mock(),
        select: mock(),
    };
    let click;
    const button = { hidden: true, addEventListener: (type, handler) => { click = handler; } };
    const panel = {
        dataset: { directoryShare, shareSlug },
        querySelector: selector => ({
            '[data-share-copy]': button,
            '[data-share-url]': field,
            '[data-share-status]': status,
        })[selector],
    };
    initializeDirectoryShare({ clipboard, track, root: { querySelectorAll: () => [panel] } });
    return { button, click, field, status, track };
}

test('copies the tagged link and measures the successful copy', async () => {
    const writeText = mock(async () => {});
    const { button, click, status, track } = setup({ writeText });
    expect(button.hidden).toBe(false);
    await click();
    expect(writeText).toHaveBeenCalledWith('https://ai.dosa.dev/tools/cursor?ref=tool_share');
    expect(status.textContent).toBe('Link copied.');
    expect(track).toHaveBeenCalledWith('directory_link_copied', { trigger: 'tool_share', subject: 'cursor' });
});

test('selects the link for manual copying when clipboard permission is denied or unavailable', async () => {
    for (const clipboard of [null, { writeText: async () => { throw new Error('Not allowed'); } }]) {
        const { click, field, status, track } = setup(clipboard, 'category_share', 'ai-ides');
        await click();
        expect(field.value).toBe('https://ai.dosa.dev/category/ai-ides?ref=category_share');
        expect(field.focus).toHaveBeenCalledTimes(1);
        expect(field.select).toHaveBeenCalledTimes(1);
        expect(status.textContent).toContain('Copy the selected link manually.');
        expect(track).not.toHaveBeenCalled();
    }
});

function dismissSetup() {
    const handlers = {};
    const summary = { focus: mock() };
    const inside = {};
    const panel = { open: true, contains: node => node === inside, querySelector: sel => (sel === 'summary' ? summary : null) };
    const root = {
        addEventListener: (type, handler) => { handlers[type] = handler; },
        querySelectorAll: selector => (selector.includes('[open]') ? [panel].filter(p => p.open) : []),
    };
    initializeDirectoryShare({ clipboard: null, track: mock(), root });
    return { handlers, inside, panel, summary };
}

test('closes the share panel on an outside click but not on a click inside it', () => {
    const { handlers, inside, panel } = dismissSetup();
    handlers.click({ target: inside });
    expect(panel.open).toBe(true);
    handlers.click({ target: {} });
    expect(panel.open).toBe(false);
});

test('closes the share panel on Escape and returns focus to its summary', () => {
    const { handlers, panel, summary } = dismissSetup();
    handlers.keydown({ key: 'Enter' });
    expect(panel.open).toBe(true);
    handlers.keydown({ key: 'Escape' });
    expect(panel.open).toBe(false);
    expect(summary.focus).toHaveBeenCalledTimes(1);
});
