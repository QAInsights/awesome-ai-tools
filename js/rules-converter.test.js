import { describe, expect, test } from 'bun:test';
import {
  RULE_FORMATS,
  STARTER_TEMPLATES,
  buildConverterUrlSearch,
  convertRules,
  detectRuleFormat,
  estimateTokens,
  parseConverterUrlState,
  parseRulesDocument,
} from './rules-converter.js';

describe('rules-converter engine', () => {
  test('RULE_FORMATS exposes all 7 major AI coding formats with tool links', () => {
    expect(RULE_FORMATS.length).toBe(7);
    const ids = RULE_FORMATS.map(f => f.id);
    expect(ids).toContain('claude-md');
    expect(ids).toContain('cursor-mdc');
    expect(ids).toContain('cursorrules');
    expect(ids).toContain('agents-md');
    expect(ids).toContain('windsurfrules');
    expect(ids).toContain('copilot');
    expect(ids).toContain('clinerules');
  });

  test('STARTER_TEMPLATES has valid presets', () => {
    expect(STARTER_TEMPLATES['astro-cf']).toBeDefined();
    expect(STARTER_TEMPLATES['next-ts']).toBeDefined();
    expect(STARTER_TEMPLATES['python-fastapi']).toBeDefined();
    expect(STARTER_TEMPLATES['clean-code']).toBeDefined();
    expect(STARTER_TEMPLATES['astro-cf'].content.length).toBeGreaterThan(100);
  });

  test('detectRuleFormat identifies .mdc with YAML frontmatter', () => {
    const mdcSample = `---
description: React TypeScript rules
globs: "**/*.tsx"
alwaysApply: true
---
# React Rules`;
    expect(detectRuleFormat(mdcSample)).toBe('cursor-mdc');
  });

  test('detectRuleFormat identifies CLAUDE.md and AGENTS.md', () => {
    expect(detectRuleFormat('# CLAUDE.md\n## Build & Test Commands\n- npm test')).toBe('claude-md');
    expect(detectRuleFormat('# AGENTS.md\n## Setup & Commands\n- make build')).toBe('agents-md');
  });

  test('parseRulesDocument parses YAML frontmatter and sections', () => {
    const input = `---
description: Custom project instructions
globs: "src/**/*.{ts,js}"
alwaysApply: false
---

# My App Guidelines

## Build Commands
- bun run build

## Code Style
- Single responsibility modules
`;
    const ir = parseRulesDocument(input);
    expect(ir.frontmatter.description).toBe('Custom project instructions');
    expect(ir.frontmatter.globs).toBe('src/**/*.{ts,js}');
    expect(ir.frontmatter.alwaysApply).toBe(false);
    expect(ir.title).toBe('My App Guidelines');
    expect(ir.sections.length).toBeGreaterThanOrEqual(2);
  });

  test('convertRules adds YAML frontmatter when targeting cursor-mdc', () => {
    const claudeMd = `# Project Rules
## Build Commands
- bun test
`;
    const converted = convertRules(claudeMd, 'cursor-mdc', {
      description: 'Test rulebook',
      globs: '*.ts',
      alwaysApply: true,
    });
    expect(converted).toContain('---');
    expect(converted).toContain('description: "Test rulebook"');
    expect(converted).toContain('globs: "*.ts"');
    expect(converted).toContain('alwaysApply: true');
    expect(converted).toContain('# Project Rules');
  });

  test('convertRules emits valid YAML scalars for cursor-mdc frontmatter', () => {
    const converted = convertRules('# API: coding conventions\n- be nice\n', 'cursor-mdc');
    expect(converted).toContain('description: "API: coding conventions"');
    const withQuotes = convertRules('# Rules "v2"\n- be nice\n', 'cursor-mdc');
    expect(withQuotes).toContain('description: "Rules \\"v2\\""');
  });

  test('convertRules does not duplicate a single-line title', () => {
    const converted = convertRules('# Only title', 'claude-md');
    expect(converted).toBe('# Only title\n');
    const agents = convertRules('# Only title', 'agents-md');
    expect(agents).toBe('# AGENTS.md — Only title\n');
  });

  test('convertRules does not double-prefix existing format titles', () => {
    const converted = convertRules(STARTER_TEMPLATES['python-fastapi'].content, 'agents-md');
    expect(converted).toContain('# AGENTS.md — FastAPI Microservice');
    expect(converted).not.toContain('AGENTS.md — AGENTS.md');
    const copilot = convertRules('# Copilot Instructions: Web App\n- rule\n', 'copilot');
    expect(copilot).toContain('# Copilot Instructions: Web App');
    expect(copilot).not.toContain('Instructions: Copilot');
  });

  test('convertRules strips frontmatter and formats for CLAUDE.md', () => {
    const mdc = `---
description: Frontmatter to remove
globs: "*.ts"
alwaysApply: true
---

# Core Guidelines
## Commands
- bun dev
`;
    const converted = convertRules(mdc, 'claude-md');
    expect(converted).not.toContain('---');
    expect(converted).not.toContain('alwaysApply:');
    expect(converted).toContain('# Core Guidelines');
    expect(converted).toContain('## Commands');
  });

  test('convertRules formats for AGENTS.md, windsurfrules, and copilot', () => {
    const raw = `# Web Service
## Endpoints
- GET /health
`;
    const agents = convertRules(raw, 'agents-md');
    expect(agents).toContain('# AGENTS.md — Web Service');

    const copilot = convertRules(raw, 'copilot');
    expect(copilot).toContain('# Copilot Instructions: Web Service');

    const windsurf = convertRules(raw, 'windsurfrules');
    expect(windsurf).toContain('# Web Service');
  });

  test('estimateTokens calculates approximate token counts', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('Hello world')).toBe(3); // 11 chars / 4 rounded up
  });

  test('parseConverterUrlState and buildConverterUrlSearch round-trip state', () => {
    const query = '?from=agents-md&to=claude-md&tpl=astro-cf';
    const state = parseConverterUrlState(query);
    expect(state.fromFormat).toBe('agents-md');
    expect(state.toFormat).toBe('claude-md');
    expect(state.templateKey).toBe('astro-cf');

    const serialized = buildConverterUrlSearch(state);
    expect(serialized).toBe(query);
  });
});
