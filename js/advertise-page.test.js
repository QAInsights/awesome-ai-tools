import { describe, expect, test } from 'bun:test';
import { formatSince, formatStat, loadAdvertiseStats, resolvePath } from './advertise-page.js';

describe('advertise page stats helpers', () => {
    test('resolves dotted paths without throwing on missing values', () => {
        const stats = { traffic: { last30: { visits: 1_250 } } };

        expect(resolvePath(stats, 'traffic.last30.visits')).toBe(1_250);
        expect(resolvePath(stats, 'traffic.lifetime.visits')).toBeUndefined();
    });

    test('formats finite numbers compactly and rejects missing values', () => {
        expect(formatStat(1_250)).toBe('1.3K');
        expect(formatStat(42)).toBe('42');
        expect(formatStat(null)).toBeNull();
        expect(formatStat(Number.NaN)).toBeNull();
    });

    test('formats the retention start without treating null as the Unix epoch', () => {
        expect(formatSince('2026-08-27T10:00:00Z')).toBe(' (since Aug 2026)');
        expect(formatSince(null)).toBeNull();
        expect(formatSince('not-a-date')).toBeNull();
    });

    test('fills GitHub stars and shows the traffic fallback when traffic is unavailable', async () => {
        const stars = {
            getAttribute: name => name === 'data-stat' ? 'github.stars' : null,
            textContent: 'Loading…',
            title: '',
        };
        const visits = {
            getAttribute: name => name === 'data-stat' ? 'traffic.last30.visits' : null,
            textContent: 'Loading…',
            title: '',
        };
        const note = { textContent: 'Live stats' };
        const root = {
            querySelectorAll: () => [visits, stars],
            querySelector: selector => selector === '[data-stat-note]' ? note : null,
        };
        const fetchImpl = async () => Response.json({
            traffic: null,
            github: { stars: 24, forks: 32 },
        });

        await loadAdvertiseStats(root, fetchImpl);

        expect(stars.textContent).toBe('24');
        expect(stars.title).toBe('24');
        expect(visits.textContent).toBe('—');
        expect(note.textContent).toBe('Traffic figures are shared on request.');
    });

    test('shows loading placeholders until stats arrive, then clears the busy state', async () => {
        const visits = {
            getAttribute: name => name === 'data-stat' ? 'traffic.last30.visits' : null,
            textContent: 'Loading…',
            title: '',
        };
        const loading = { removed: false, remove() { this.removed = true; } };
        const grid = { busy: true, removeAttribute(name) { if (name === 'aria-busy') this.busy = false; } };
        const root = {
            querySelectorAll: () => [visits],
            querySelector: selector => ({ '[data-stat-loading]': loading, '[data-stat-grid]': grid })[selector] ?? null,
        };
        let resolveFetch;
        const pending = loadAdvertiseStats(root, () => new Promise(resolve => { resolveFetch = resolve; }));

        expect(visits.textContent).toBe('Loading…');
        expect(loading.removed).toBe(false);
        expect(grid.busy).toBe(true);

        resolveFetch(Response.json({ traffic: { last30: { visits: 1_250 } }, github: null }));
        await pending;

        expect(visits.textContent).toBe('1.3K');
        expect(visits.title).toBe('1,250');
        expect(loading.removed).toBe(true);
        expect(grid.busy).toBe(false);
    });

    test('clears the loading state and placeholders when the request fails', async () => {
        const visits = {
            getAttribute: name => name === 'data-stat' ? 'traffic.last30.visits' : null,
            textContent: 'Loading…',
            title: '',
        };
        const note = { textContent: 'Loading live reach…' };
        const loading = { removed: false, remove() { this.removed = true; } };
        const grid = { busy: true, removeAttribute(name) { if (name === 'aria-busy') this.busy = false; } };
        const root = {
            querySelectorAll: () => [visits],
            querySelector: selector => ({ '[data-stat-note]': note, '[data-stat-loading]': loading, '[data-stat-grid]': grid })[selector] ?? null,
        };

        await loadAdvertiseStats(root, async () => Response.error());

        expect(visits.textContent).toBe('—');
        expect(note.textContent).toBe('Traffic figures are shared on request.');
        expect(loading.removed).toBe(true);
        expect(grid.busy).toBe(false);
    });
});
