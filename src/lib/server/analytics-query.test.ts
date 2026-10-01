import { afterAll, describe, expect, mock, test } from 'bun:test';

mock.module('cloudflare:workers', () => ({ env: {} }));
const { buildFunnelViewModel } = await import(`./analytics-query.ts?test=${Date.now()}`);
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
