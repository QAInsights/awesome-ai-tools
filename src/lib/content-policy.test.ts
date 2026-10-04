import { describe, expect, test } from 'bun:test';
import {
    brandTokens,
    checkUsernamePolicy,
    containsProfanity,
    findPublicTextViolation,
    impersonatesBrand,
    joinSpelledOutLetters,
    publicTextViolationMessage,
} from './content-policy';

describe('content policy', () => {
    test('detects profanity across common evasion forms', () => {
        for (const text of ['shit', 'sh1t', '$hit', 'fuuuck', 'ｆｕｃｋ', 'f-u-c-k', 's h i t', 'n1gger', 'b1tch']) {
            expect(containsProfanity(text)).toBe(true);
        }
    });

    test('avoids false positives for benign words and hyphenated phrases', () => {
        for (const text of [
            'scunthorpe',
            'assessment',
            'classic',
            'analytics',
            'shitake-farm',
            'this-hit',
            'pen-island',
            'hello-world',
            'bassist',
            'sussex',
        ]) {
            expect(containsProfanity(text)).toBe(false);
        }
    });

    test('joins spelled-out letters without altering partial words', () => {
        expect(joinSpelledOutLetters('f-u-c-k')).toBe('fuck');
        expect(joinSpelledOutLetters('s h i t')).toBe('shit');
        expect(joinSpelledOutLetters('a-s-s')).toBe('ass');
        expect(joinSpelledOutLetters('F-U_c.K')).toBe('FUcK');
        expect(joinSpelledOutLetters('ab-cd')).toBe('ab-cd');
        expect(joinSpelledOutLetters('x-ray')).toBe('x-ray');
        expect(joinSpelledOutLetters('pen-island')).toBe('pen-island');
    });

    test('normalizes tool names and companies into brand tokens', () => {
        const tokens = brandTokens([
            { slug: 'cursor', name: 'Cursor', company: 'Anysphere (a division of SpaceX)' },
            { slug: 'claude-code', name: 'Claude Code', company: 'Anthropic' },
            { slug: 'v0', name: 'v0', company: 'Vercel' },
        ]);

        for (const token of ['cursor', 'anysphere', 'claude-code', 'anthropic', 'vercel']) {
            expect(tokens.has(token)).toBe(true);
        }
        expect(tokens.has('v0')).toBe(false);
        expect(tokens.has('anysphere-a-division-of-spacex')).toBe(false);
    });

    test('matches only exact brand names with a staff affix', () => {
        const brands = new Set(['cursor', 'anthropic', 'claude-code']);

        for (const username of ['cursor', 'anthropic', 'cursor-official', 'team-anthropic', 'claude-code-support']) {
            expect(impersonatesBrand(username, brands)).toBe(true);
        }
        for (const username of ['cursor-fan-42', 'cursorfan', 'my-claude-code-notes', 'ada']) {
            expect(impersonatesBrand(username, brands)).toBe(false);
        }
    });

    test('reports offensive usernames before brand impersonation', () => {
        expect(checkUsernamePolicy('fuck-official', new Set(['fuck'])))
            .toEqual({ ok: false, reason: 'offensive' });
        expect(checkUsernamePolicy('cursor-official', new Set(['cursor'])))
            .toEqual({ ok: false, reason: 'impersonation' });
        expect(checkUsernamePolicy('ada-lovelace', new Set(['cursor']))).toEqual({ ok: true });
    });

    test('finds public-text violations in field order and skips disabled items', () => {
        expect(findPublicTextViolation(
            { title: 'sh1t title', description: 'fuuuck description' },
            [{ slug: 'cursor', purpose: 'b1tch purpose', usageNotes: 'n1gger notes' }],
        )).toEqual({ field: 'title' });
        expect(findPublicTextViolation(
            { title: 'Good title', description: 'fuuuck description' },
            [{ slug: 'cursor', purpose: 'b1tch purpose', usageNotes: 'n1gger notes' }],
        )).toEqual({ field: 'description' });
        expect(findPublicTextViolation(
            null,
            [
                { slug: 'cursor', purpose: 'b1tch purpose', usageNotes: 'n1gger notes' },
                { slug: 'claude-code', purpose: 'fuuuck purpose', usageNotes: null },
            ],
        )).toEqual({ field: 'purpose', toolSlug: 'cursor' });
        expect(findPublicTextViolation(
            null,
            [{ slug: 'cursor', purpose: 'Good purpose', usageNotes: 'n1gger notes' }],
        )).toEqual({ field: 'usageNotes', toolSlug: 'cursor' });
        expect(findPublicTextViolation(
            null,
            [{ slug: 'cursor', purpose: 'sh1t purpose', usageNotes: 'n1gger notes', enabled: false }],
        )).toBeNull();
        expect(findPublicTextViolation(null, [])).toBeNull();
    });

    test('formats each public-text rejection message', () => {
        expect(publicTextViolationMessage({ field: 'title' }))
            .toBe("This stack title isn't allowed on public stacks.");
        expect(publicTextViolationMessage({ field: 'description' }))
            .toBe("This description isn't allowed on public stacks.");
        expect(publicTextViolationMessage({ field: 'purpose', toolSlug: 'cursor' }))
            .toBe("The purpose for cursor isn't allowed on public stacks.");
        expect(publicTextViolationMessage({ field: 'usageNotes', toolSlug: 'cursor' }))
            .toBe("The usage notes for cursor aren't allowed on public stacks.");
    });
});
