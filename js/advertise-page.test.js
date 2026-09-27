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
            textContent: '—',
            title: '',
        };
        const note = { textContent: 'Live stats' };
        const root = {
            querySelectorAll: () => [stars],
            querySelector: selector => selector === '[data-stat-note]' ? note : null,
        };
        const fetchImpl = async () => Response.json({
            traffic: null,
            github: { stars: 24, forks: 32 },
        });

        await loadAdvertiseStats(root, fetchImpl);

        expect(stars.textContent).toBe('24');
        expect(stars.title).toBe('24');
        expect(note.textContent).toBe('Traffic figures are shared on request.');
    });
});
