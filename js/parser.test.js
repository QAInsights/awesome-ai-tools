/**
 * Tests for parser.js - Markdown parsing and slug generation
 */

import { describe, test, expect } from 'bun:test';
import { slugify, parseMarkdown, getShortCategory, extractCategories } from './parser.js';

describe('parser', () => {
    describe('slugify', () => {
        test('should convert simple string to kebab-case', () => {
            expect(slugify('Cursor')).toBe('cursor');
            expect(slugify('GitHub Copilot')).toBe('github-copilot');
        });

        test('should lowercase all characters', () => {
            expect(slugify('VSCode')).toBe('vscode');
            expect(slugify('AI Tool')).toBe('ai-tool');
        });

        test('should strip emojis', () => {
            expect(slugify('Cursor IDE')).toBe('cursor-ide');
            expect(slugify('Tool Name Here')).toBe('tool-name-here');
        });

        test('should strip diacritics', () => {
            expect(slugify('café')).toBe('cafe');
            expect(slugify('naïve')).toBe('naive');
        });

        test('should strip punctuation and special characters', () => {
            expect(slugify('Tool!@#$%Name')).toBe('toolname'); // Punctuation stripped, no hyphen added
            expect(slugify('some-tool_name')).toBe('some-toolname'); // Underscore also stripped
        });

        test('should collapse multiple spaces into single hyphen', () => {
            expect(slugify('Tool   Name')).toBe('tool-name');
        });

        test('should collapse multiple hyphens', () => {
            expect(slugify('Tool--Name')).toBe('tool-name');
        });

        test('should trim leading and trailing hyphens', () => {
            expect(slugify('-Tool Name-')).toBe('tool-name');
        });

        test('should return empty string for null/undefined', () => {
            expect(slugify(null)).toBe('');
            expect(slugify(undefined)).toBe('');
            expect(slugify('')).toBe('');
        });

        test('should handle numbers in name', () => {
            expect(slugify('GPT-4')).toBe('gpt-4');
            expect(slugify('Tool 123')).toBe('tool-123');
        });

        test('should convert non-string input to string', () => {
            expect(slugify(123)).toBe('123');
        });
    });

    describe('parseMarkdown', () => {
        test('should parse simple tool table', () => {
            const md = `## AI IDEs

| Tool | Company | Notes |
|------|---------|-------|
| [Cursor](https://cursor.sh) | Cursor Inc | AI-first IDE |
| [GitHub Copilot](https://github.com/features/copilot) | GitHub | Code completion |
`;
            const tools = parseMarkdown(md);
            
            expect(tools.length).toBe(2);
            expect(tools[0].name).toBe('Cursor');
            expect(tools[0].url).toBe('https://cursor.sh');
            expect(tools[0].company).toBe('Cursor Inc');
            expect(tools[0].category).toBe('AI IDEs');
            expect(tools[0].slug).toBe('cursor');
        });

        test('should skip Table of Contents section', () => {
            const md = `## Table of Contents

- [AI IDEs](#ai-ides)

## AI IDEs

| Tool | Company | Notes |
|------|---------|-------|
| [Cursor](https://cursor.sh) | Cursor Inc | AI IDE |
`;
            const tools = parseMarkdown(md);
            expect(tools.length).toBe(1);
            expect(tools[0].name).toBe('Cursor');
        });

        test('should handle tools without links (bold names)', () => {
            const md = `## AI IDEs

| Tool | Company | Notes |
|------|---------|-------|
| **Internal Tool** | Company | Notes here |
`;
            const tools = parseMarkdown(md);
            
            expect(tools.length).toBe(1);
            expect(tools[0].name).toBe('Internal Tool');
            expect(tools[0].url).toBe('#');
        });

        test('should strip bold markers from tool names', () => {
            const md = `## AI IDEs

| Tool | Company | Notes |
|------|---------|-------|
| [**Cursor**](https://cursor.sh) | Cursor Inc | AI IDE |
`;
            const tools = parseMarkdown(md);
            expect(tools[0].name).toBe('Cursor');
        });

        test('should assign unique slugs with collision resolution', () => {
            const md = `## Category A

| Tool | Company | Notes |
|------|---------|-------|
| [Cursor](https://a.com) | Company A | First |
| [Cursor](https://b.com) | Company B | Second |
`;
            const tools = parseMarkdown(md);
            
            expect(tools.length).toBe(2);
            expect(tools[0].slug).toBe('cursor');
            expect(tools[1].slug).toBe('cursor-company-b');
        });

        test('should handle triple collision with numeric suffix', () => {
            const md = `## Category

| Tool | Company | Notes |
|------|---------|-------|
| [Tool](https://a.com) | Company A | First |
| [Tool](https://b.com) | Company B | Second |
| [Tool](https://b.com) | Company B | Third |
`;
            const tools = parseMarkdown(md);
            
            expect(tools.length).toBe(3);
            expect(tools[0].slug).toBe('tool');
            expect(tools[1].slug).toBe('tool-company-b');
            // Third collision gets numeric suffix
            expect(tools[2].slug).toMatch(/tool-company-b-\d+/);
        });

        test('should return empty array for empty markdown', () => {
            expect(parseMarkdown('')).toEqual([]);
        });

        test('should return empty array for markdown without tables', () => {
            const md = `# Title

Some text without tables.
`;
            expect(parseMarkdown(md)).toEqual([]);
        });

        test('should handle multiple categories', () => {
            const md = `## AI IDEs

| Tool | Company | Notes |
|------|---------|-------|
| [Cursor](https://cursor.sh) | Cursor | IDE |

## CLI Agents

| Tool | Company | Notes |
|------|---------|-------|
| [Aider](https://aider.ai) | Aider | CLI |
`;
            const tools = parseMarkdown(md);
            
            expect(tools.length).toBe(2);
            expect(tools[0].category).toBe('AI IDEs');
            expect(tools[1].category).toBe('CLI Agents');
        });

        test('should handle tools with special characters in notes', () => {
            const md = `## AI IDEs

| Tool | Company | Notes |
|------|---------|-------|
| [Cursor](https://cursor.sh) | Cursor | Notes with "quotes" & symbols! |
`;
            const tools = parseMarkdown(md);
            expect(tools[0].notes).toBe('Notes with "quotes" & symbols!');
        });
    });

    describe('getShortCategory', () => {
        test('should return short name for known categories', () => {
            expect(getShortCategory('AI-Native IDEs & Editors')).toBe('AI IDEs');
            expect(getShortCategory('IDE Extensions & Plugins')).toBe('IDE Plugins');
            expect(getShortCategory('Terminal & CLI Agents')).toBe('CLI Agents');
        });

        test('should handle partial category matches', () => {
            expect(getShortCategory('AI-Native IDEs & Editors')).toBe('AI IDEs');
        });

        test('should return cleaned category for unknown categories', () => {
            expect(getShortCategory('Some New Category')).toBe('Some New Category');
        });

        test('should strip emojis from category', () => {
            // The function strips emojis but doesn't change text
            const result = getShortCategory('Custom Category');
            expect(result).not.toMatch(/[\u2700-\u27BF]/);
        });

        test('should trim whitespace', () => {
            expect(getShortCategory('  Custom Category  ')).toBe('Custom Category');
        });
    });

    describe('extractCategories', () => {
        test('should return Set of unique categories', () => {
            const tools = [
                { category: 'AI IDEs', name: 'Tool A' },
                { category: 'CLI Agents', name: 'Tool B' },
                { category: 'AI IDEs', name: 'Tool C' }
            ];
            
            const categories = extractCategories(tools);
            expect(categories).toBeInstanceOf(Set);
            expect(categories.size).toBe(2);
            expect(categories.has('AI IDEs')).toBe(true);
            expect(categories.has('CLI Agents')).toBe(true);
        });

        test('should return empty Set for empty array', () => {
            const categories = extractCategories([]);
            expect(categories.size).toBe(0);
        });
    });
});
