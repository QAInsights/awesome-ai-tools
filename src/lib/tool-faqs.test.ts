import { describe, expect, test } from 'bun:test';

import { buildToolFaqs, isKnownFree, isOpenSource } from './tool-faqs';
import type { EnrichedTool, Tool } from './tools';

function makeTool(enriched: Partial<EnrichedTool> | null, overrides: Partial<Tool> = {}): Tool {
    return {
        slug: 'widget',
        name: 'Widget',
        company: 'Widget Co',
        category: 'AI',
        categoryClean: 'AI Coding',
        categoryShort: 'AI',
        notes: 'Widget notes',
        url: 'https://widget.example',
        enriched: enriched ? { slug: 'widget', ...enriched } : null,
        ...overrides,
    };
}

describe('isKnownFree', () => {
    test('recognizes free and open-source pricing values', () => {
        expect(isKnownFree('free')).toBe(true);
        expect(isKnownFree('open-source')).toBe(true);
        expect(isKnownFree('open_source')).toBe(true);
        expect(isKnownFree('oss')).toBe(true);
        expect(isKnownFree('freemium')).toBe(false);
        expect(isKnownFree(undefined)).toBe(false);
    });
});

describe('buildToolFaqs', () => {
    test('omits every enriched-data question when enriched is null', () => {
        const faqs = buildToolFaqs(makeTool(null), []);
        const questions = faqs.map(f => f.q);

        expect(questions).toEqual(['Who makes Widget?']);
    });

    test('open-source tool answers free=Yes, open source=Yes, and skips the cost question', () => {
        const faqs = buildToolFaqs(makeTool({
            pricing: 'open-source',
            pricingDetail: 'MIT licensed, self-hostable.',
        }), []);
        const byQuestion = new Map(faqs.map(f => [f.q, f.a]));

        expect(byQuestion.get('Is Widget free?')).toBe('Yes - Widget is Open Source. MIT licensed, self-hostable.');
        expect(byQuestion.get('Is Widget open source?')).toBe('Yes - Widget is open source. MIT licensed, self-hostable.');
        expect(byQuestion.has('How much does Widget cost?')).toBe(false);
    });

    test('freemium tool with pricingDetail gets a cost answer and a non-committal open-source answer', () => {
        const faqs = buildToolFaqs(makeTool({
            pricing: 'freemium',
            pricingDetail: 'Free tier up to 5 seats; Pro at $20/mo.',
        }), []);
        const byQuestion = new Map(faqs.map(f => [f.q, f.a]));

        expect(byQuestion.get('Is Widget free?')).toBe('Widget is Freemium. Free tier up to 5 seats; Pro at $20/mo. Check the official site for current plans.');
        expect(byQuestion.get('Is Widget open source?')).toBe('Widget is not listed as open source on ai.dosa.dev - it is Freemium.');
        expect(byQuestion.get('How much does Widget cost?')).toBe('Free tier up to 5 seats; Pro at $20/mo. Pricing changes often - verify on the official site.');
    });

    test('isOpenSource is true when tags say Open Source even with free pricing', () => {
        const enriched = { slug: 'widget', pricing: 'free', tags: ['AI', 'Open Source'] };
        expect(isOpenSource(enriched)).toBe(true);

        const faqs = buildToolFaqs(makeTool(enriched), []);
        expect(faqs.find(f => f.q === 'Is Widget open source?')?.a).toBe('Yes - Widget is open source.');
    });

    test('alternatives question lists enriched alternatives first and is absent with none', () => {
        const enrichedAlt = makeTool({ slug: 'alt-enriched', name: 'Alt Enriched' }, { slug: 'alt-enriched', name: 'Alt Enriched' });
        const plainAlt = makeTool(null, { slug: 'alt-plain', name: 'Alt Plain' });

        const faqs = buildToolFaqs(makeTool({ pricing: 'paid' }), [enrichedAlt, plainAlt]);
        const answer = faqs.find(f => f.q === 'What are the best Widget alternatives?');

        expect(answer?.a).toContain('are Alt Enriched -');
        expect(answer?.a).toContain('all listed under AI Coding.');

        const noAlts = buildToolFaqs(makeTool({ pricing: 'paid' }), []);
        expect(noAlts.some(f => f.q === 'What are the best Widget alternatives?')).toBe(false);
    });
});
