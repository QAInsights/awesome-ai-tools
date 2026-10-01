import { describe, expect, test } from 'bun:test';
import { MAX_AD_KEYWORDS, adKeywords, ethicalAdsPublisher } from './ethical-ads';

describe('ethicalAdsPublisher', () => {
    test('is disabled when unset or blank', () => {
        expect(ethicalAdsPublisher(undefined)).toBeNull();
        expect(ethicalAdsPublisher(null)).toBeNull();
        expect(ethicalAdsPublisher('   ')).toBeNull();
    });

    test('accepts a trimmed publisher id', () => {
        expect(ethicalAdsPublisher(' dosa-dev ')).toBe('dosa-dev');
        expect(ethicalAdsPublisher('ai_dosa_dev2')).toBe('ai_dosa_dev2');
    });

    test('rejects values that could break out of the attribute', () => {
        expect(ethicalAdsPublisher('dosa" onload="x')).toBeNull();
        expect(ethicalAdsPublisher('dosa dev')).toBeNull();
        expect(ethicalAdsPublisher('-dosa')).toBeNull();
    });
});

describe('adKeywords', () => {
    test('slugifies, dedupes and pipe-joins topics', () => {
        expect(adKeywords(['AI Coding Assistants', 'code review', 'Code Review', 'CLI'])).toBe(
            'ai-coding-assistants|code-review|cli',
        );
    });

    test('drops empty and symbol-only values', () => {
        expect(adKeywords([undefined, null, '', '🤖', '  ', 'MCP'])).toBe('mcp');
        expect(adKeywords([])).toBe('');
    });

    test('never emits pipes or spaces inside a keyword', () => {
        expect(adKeywords(['a|b', ' devops / k8s '])).toBe('a-b|devops-k8s');
    });

    test(`caps the list at ${MAX_AD_KEYWORDS} keywords`, () => {
        const topics = Array.from({ length: 12 }, (_, i) => `topic ${i}`);
        expect(adKeywords(topics).split('|')).toHaveLength(MAX_AD_KEYWORDS);
    });
});
