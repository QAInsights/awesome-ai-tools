import { describe, expect, test } from 'bun:test';
import enrichedTools from '../../public/data/enriched-tools.json';
import { stripCitations, stripEnrichedCitations } from './enrichment-citations.js';

describe('stripCitations', () => {
    test('removes stacked markers and the space before them', () => {
        expect(stripCitations('Devin plans and tests complex tasks [5][2][4][6]. It returns PRs [5][2].'))
            .toBe('Devin plans and tests complex tasks. It returns PRs.');
    });

    test('removes list and range markers', () => {
        expect(stripCitations('Pro is $20/month [1, 3] or more [2-4]')).toBe('Pro is $20/month or more');
    });

    test('keeps non-citation brackets and non-string values', () => {
        expect(stripCitations('Supports [beta] mode')).toBe('Supports [beta] mode');
        expect(stripCitations(null)).toBeNull();
    });

    test('cleans every field of an entry, including arrays', () => {
        expect(stripEnrichedCitations({
            slug: 'devin',
            description: 'Autonomous engineer [5][2].',
            keyFeatures: ['Cloud sandbox [5]', 'PR generation [4][6]'],
            tags: ['AI Agent'],
        })).toEqual({
            slug: 'devin',
            description: 'Autonomous engineer.',
            keyFeatures: ['Cloud sandbox', 'PR generation'],
            tags: ['AI Agent'],
        });
    });
});

test('committed enriched data has no citation markers', () => {
    const marked = enrichedTools
        .filter(tool => JSON.stringify(stripEnrichedCitations(tool)) !== JSON.stringify(tool))
        .map(tool => tool.slug);
    expect(marked).toEqual([]);
});
