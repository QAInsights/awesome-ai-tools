import { describe, expect, test } from 'bun:test';
import {
    MAX_ITEMS_PER_STACK,
    MAX_STACK_DESCRIPTION_LENGTH,
    MAX_STACK_TITLE_LENGTH,
    USERNAME_PATTERN,
    isValidStackSlug,
    newStackId,
    slugifyStackName,
    suggestUsername,
    validateItems,
    validateStackInput,
    validateUsername,
} from './stacks';

describe('stack validation', () => {
    test('accepts valid usernames and normalizes case', () => {
        expect(USERNAME_PATTERN.test('ada-42')).toBe(true);
        expect(validateUsername('Ada-42')).toEqual({ ok: true, value: 'ada-42' });
        expect(validateUsername('ab')).toMatchObject({ ok: false });
        expect(validateUsername('a'.repeat(31))).toMatchObject({ ok: false });
    });

    test('rejects reserved usernames and consecutive hyphens', () => {
        expect(validateUsername('settings')).toMatchObject({ ok: false, error: 'That username is reserved.' });
        expect(validateUsername('qainsights')).toMatchObject({ ok: false, error: 'That username is reserved.' });
        expect(validateUsername('official')).toMatchObject({ ok: false, error: 'That username is reserved.' });
        expect(validateUsername('devin')).toMatchObject({ ok: false, error: 'That username is reserved.' });
        expect(validateUsername('privacy')).toMatchObject({ ok: false, error: 'That username is reserved.' });
        expect(validateUsername('ada--dev')).toMatchObject({ ok: false });
        expect(validateUsername('-ada')).toMatchObject({ ok: false });
    });

    test('suggests usernames from GitHub, email, and display name in order', () => {
        expect(suggestUsername('Ada_Lovelace', 'other@example.com', 'Ada Lovelace')).toBe('ada-lovelace');
        expect(suggestUsername(null, 'ada.lovelace@example.com', 'Other Name')).toBe('ada-lovelace');
        expect(suggestUsername('', '', 'Ada Lovelace')).toBe('ada-lovelace');
        expect(suggestUsername('admin', '', '')).toBe('admin-dev');
    });

    test('creates and validates stack slugs', () => {
        expect(slugifyStackName('My Useful Stack!')).toBe('my-useful-stack');
        expect(slugifyStackName('---')).toBe('stack');
        expect(slugifyStackName('a'.repeat(80))).toBe('a'.repeat(60));
        expect(isValidStackSlug('my-stack-2')).toBe(true);
        expect(isValidStackSlug('My-Stack')).toBe(false);
        expect(isValidStackSlug('two--hyphens')).toBe(false);
        expect(isValidStackSlug(`a${'b'.repeat(60)}`)).toBe(false);
    });

    test('normalizes stack text, preserves allowed newlines, and rejects over-limit input', () => {
        expect(validateStackInput({
            title: '  My\u0000\u200B stack\u202E\n ',
            description: ' One\u2066\nTw\uFEFFo\u2069\u0001 ',
        })).toEqual({
            ok: true,
            value: { title: 'My stack', description: 'One\nTwo' },
        });
        expect(validateStackInput({ title: 'ab' })).toMatchObject({ ok: false });
        expect(validateStackInput({ title: 'x'.repeat(MAX_STACK_TITLE_LENGTH + 1) })).toMatchObject({ ok: false });
        expect(validateStackInput({
            title: 'Good title',
            description: 'x'.repeat(MAX_STACK_DESCRIPTION_LENGTH + 1),
        })).toMatchObject({ ok: false });
        expect(validateStackInput({ title: 'Good title', slug: 'Mixed-Case' })).toMatchObject({ ok: false });
    });

    test('validates catalog items, duplicates, limits, lengths, and ordering', () => {
        const valid = validateItems([
            { slug: 'cursor', purpose: 'Plan code', usageNotes: 'First\nSecond' },
            { slug: 'zed', purpose: 'Review\u200F code', usageNotes: 'How\u202E it works', enabled: false },
        ], new Set(['cursor', 'zed']));
        expect(valid).toEqual({
            ok: true,
            value: [
                { slug: 'cursor', purpose: 'Plan code', usageNotes: 'First\nSecond', enabled: true, position: 0 },
                { slug: 'zed', purpose: 'Review code', usageNotes: 'How it works', enabled: false, position: 1 },
            ],
        });
        expect(validateItems([{ slug: 'unknown', purpose: 'Try it' }], new Set(['cursor'])))
            .toMatchObject({ ok: false });
        expect(validateItems([
            { slug: 'cursor', purpose: 'Try it' },
            { slug: 'cursor', purpose: 'Try it twice' },
        ], new Set(['cursor']))).toMatchObject({ ok: false });
        expect(validateItems([{ slug: 'cursor', purpose: 'x'.repeat(61) }], new Set(['cursor'])))
            .toMatchObject({ ok: false });
        expect(validateItems(
            Array.from({ length: MAX_ITEMS_PER_STACK + 1 }, (_, index) => ({
                slug: `tool-${index}`,
                purpose: 'Use it',
            })),
            new Set(Array.from({ length: MAX_ITEMS_PER_STACK + 1 }, (_, index) => `tool-${index}`)),
        )).toMatchObject({ ok: false });
    });

    test('generates ten-character stack IDs from the allowed alphabet', () => {
        expect(newStackId()).toMatch(/^[a-z0-9]{10}$/);
    });
});
