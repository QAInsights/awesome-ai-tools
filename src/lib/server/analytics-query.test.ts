import { afterAll, describe, expect, mock, test } from 'bun:test';

mock.module('cloudflare:workers', () => ({ env: {} }));
const { buildFunnelViewModel, buildGrowthViewModel, formatDelta, formatPointDelta, formatRate, growthCountsQuery, referrerGroup, visitorDaysQuery } = await import(`./analytics-query.ts?test=${Date.now()}`);
afterAll(() => mock.restore());

describe('funnel view model', () => {
    test('folds analytics rows in one pass into dashboard metrics', () => {
        const model = buildFunnelViewModel([
            { event: 'signin_modal_shown', trigger: 'zap_btn', subject: '', provider: '', n: 10 },
            { event: 'signin_started', trigger: 'zap_btn', subject: '', provider: 'github', n: 6 },
            { event: 'signin_completed', trigger: 'zap_btn', subject: '', provider: 'github', n: 4 },
            { event: 'gate_blocked', trigger: 'zap_btn', subject: 'cursor', provider: '', n: 8 },
            { event: 'outbound_click', trigger: 'tool_card', subject: 'cursor', provider: '', n: 5 },
            { event: 'outbound_click', trigger: 'tool_detail', subject: 'cursor', provider: '', n: 2 },
            { event: 'badge_referral', trigger: 'tool_page', subject: 'cursor', provider: '', n: 3 },
            { event: 'badge_referral', trigger: 'home', subject: '', provider: '', n: 1 },
            { event: 'ad_closed', trigger: 'stickybox', subject: '', provider: '', n: 9 },
            { event: 'ad_closed', trigger: 'fixedfooter', subject: '', provider: '', n: 3 },
            { event: 'ad_prompt_shown', trigger: 'fixedfooter', subject: '', provider: '', n: 7 },
            { event: 'signin_modal_shown', trigger: 'ad_close', subject: '', provider: '', n: 2 },
            { event: 'signin_completed', trigger: 'ad_close', subject: '', provider: 'google', n: 1 },
        ]);

        expect(model.shown).toBe(12);
        expect(model.started).toBe(6);
        expect(model.completed).toBe(5);
        expect(model.providers[0]).toEqual({ provider: 'github', started: 6, completed: 4 });
        expect(model.triggers).toContainEqual({ trigger: 'zap_btn', blocked: 8, completed: 4 });
        expect(model.outbound[0]).toEqual(['cursor', 7]);
        expect(model.badgeReferrals).toEqual([['cursor', 3], ['(home)', 1]]);
        expect(model.adPrompt).toEqual({ closed: 12, shown: 7, opened: 2, completed: 1 });
    });
});

describe('growth baseline', () => {
    const today = 20_000;

    test('groups referrer hosts into search, github, social, AI assistants, direct, and other', () => {
        expect(referrerGroup('')).toBe('direct');
        expect(referrerGroup('google.com')).toBe('search');
        expect(referrerGroup('google.co.uk')).toBe('search');
        expect(referrerGroup('bing.com')).toBe('search');
        expect(referrerGroup('gemini.google.com')).toBe('ai');
        expect(referrerGroup('chatgpt.com')).toBe('ai');
        expect(referrerGroup('perplexity.ai')).toBe('ai');
        expect(referrerGroup('claude.ai')).toBe('ai');
        expect(referrerGroup('github.com')).toBe('github');
        expect(referrerGroup('gist.github.com')).toBe('github');
        expect(referrerGroup('old.reddit.com')).toBe('social');
        expect(referrerGroup('t.co')).toBe('social');
        expect(referrerGroup('notgithub.com')).toBe('other');
    });

    test('folds visits into referrer, ref, and weekly panels by UTC-day age', () => {
        const model = buildGrowthViewModel([
            { event: 'visit', trigger: '', subject: 'google.com', day: today, n: 5 },
            { event: 'visit', trigger: '', subject: 'google.com', day: today - 8, n: 4 },
            { event: 'visit', trigger: 'badge', subject: 'github.com', day: today - 2, n: 3 },
            { event: 'visit', trigger: '', subject: '', day: today - 20, n: 7 },
            { event: 'visit', trigger: 'social', subject: 'chatgpt.com', day: today - 30, n: 9 },
            { event: 'signin_completed', trigger: 'sidebar', subject: '', day: today - 1, n: 2 },
            { event: 'signin_completed', trigger: 'zap_btn', subject: '', day: today - 9, n: 4 },
            { event: 'favorite_added', trigger: 'favorite_heart', subject: 'cursor', day: today - 6, n: 3 },
            { event: 'follow_added', trigger: 'follow_bell', subject: 'cursor', day: today - 13, n: 1 },
            { event: 'visit', trigger: '', subject: 'google.com', day: today + 1, n: 99 },
        ], [], today);

        expect(model.visits).toEqual({ last7: 8, prev7: 4, last28: 19 });
        expect(model.referrerGroups.find((g: { group: string }) => g.group === 'search')).toEqual({ group: 'search', last7: 5, prev7: 4, last28: 9 });
        expect(model.referrerGroups.find((g: { group: string }) => g.group === 'direct')).toEqual({ group: 'direct', last7: 0, prev7: 0, last28: 7 });
        expect(model.referrerGroups.find((g: { group: string }) => g.group === 'ai')).toEqual({ group: 'ai', last7: 0, prev7: 0, last28: 0 });
        expect(model.referrerHosts.map((h: { host: string }) => h.host)).toEqual(['google.com', 'github.com']);
        expect(model.refSources).toEqual([{ source: 'badge', last7: 3, prev7: 0, last28: 3 }]);
        expect(model.weekly).toEqual([
            { label: 'Sign-ins', current: 2, previous: 4 },
            { label: 'Favorites', current: 3, previous: 0 },
            { label: 'Follows', current: 0, previous: 1 },
        ]);
        expect(model.truncated).toBe(false);
    });

    test('computes week-over-week and 28-day return rates from anonymous visitor days', () => {
        const model = buildGrowthViewModel([], [
            // Week 2 (14-20 days ago): a, b. Week 1 (7-13): a, c, d. Week 0 (0-6): a, c.
            { anonId: 'a', day: today - 15 }, { anonId: 'b', day: today - 16 },
            { anonId: 'a', day: today - 8 }, { anonId: 'c', day: today - 9 }, { anonId: 'd', day: today - 10 },
            { anonId: 'a', day: today - 1 }, { anonId: 'c', day: today - 2 }, { anonId: 'e', day: today },
            { anonId: 'f', day: today - 40 }, { anonId: 'f', day: today - 41 }, { anonId: 'g', day: today - 45 },
            { anonId: '', day: today },
        ], today);

        expect(model.visitors).toEqual({ last7: 3, prev7: 3 });
        expect(model.weeklyReturn.rate).toBeCloseTo(2 / 3);
        expect(model.weeklyReturn.previous).toBeCloseTo(1 / 2);
        // Last 28 days: a (3 days), b, c (2 days), d, e -> 2 of 5 returned.
        expect(model.monthlyReturn.rate).toBeCloseTo(2 / 5);
        // Days 28-55: f (2 days), g -> 1 of 2.
        expect(model.monthlyReturn.previous).toBeCloseTo(1 / 2);
    });

    test('returns empty rates without data', () => {
        const model = buildGrowthViewModel([], [], today);
        expect(model.weeklyReturn).toEqual({ rate: null, previous: null });
        expect(model.monthlyReturn).toEqual({ rate: null, previous: null });
        expect(model.referrerGroups).toHaveLength(6);
    });

    test('formats week-over-week deltas', () => {
        expect(formatDelta(15, 10)).toBe('+50%');
        expect(formatDelta(5, 10)).toBe('-50%');
        expect(formatDelta(10, 10)).toBe('0%');
        expect(formatDelta(3, 0)).toBe('new');
        expect(formatDelta(0, 0)).toBe('—');
        expect(formatPointDelta(0.25, 0.2)).toBe('+5.0 pts');
        expect(formatPointDelta(0.1, null)).toBe('—');
        expect(formatRate(0.123)).toBe('12.3%');
        expect(formatRate(null)).toBe('—');
    });

    test('queries only growth events from the configured dataset', () => {
        const counts = growthCountsQuery('aat_events_staging');
        expect(counts).toContain('FROM aat_events_staging');
        expect(counts).toContain("blob1 = 'visit'");
        expect(counts).toContain("blob1 = 'follow_added'");
        expect(counts).toContain("INTERVAL '56' DAY");
        expect(visitorDaysQuery('aat_events')).toContain("FROM aat_events\n");
        expect(visitorDaysQuery('aat_events')).toContain('GROUP BY anonId, day');
    });
});
