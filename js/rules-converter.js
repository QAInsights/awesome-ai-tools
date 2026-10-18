/**
 * Agent Rules & Config Converter Engine.
 *
 * Normalizes and converts AI coding instructions between:
 * - CLAUDE.md (Claude Code)
 * - .cursor/rules/*.mdc (Cursor Modern)
 * - .cursorrules (Cursor Legacy)
 * - AGENTS.md (Codex / OpenCode / Universal)
 * - .windsurfrules (Windsurf Cascade)
 * - .github/copilot-instructions.md (GitHub Copilot)
 * - .clinerules (Cline / Roo Code)
 */

export const RULE_FORMATS = [
  {
    id: 'claude-md',
    label: 'CLAUDE.md',
    targetFile: 'CLAUDE.md',
    toolName: 'Claude Code',
    toolSlug: 'claude-code',
    badge: 'CLI Agent',
    description: 'Concise imperative commands & architecture rules for Anthropic Claude Code.',
  },
  {
    id: 'cursor-mdc',
    label: 'Cursor Rules (.mdc)',
    targetFile: '.cursor/rules/project.mdc',
    toolName: 'Cursor',
    toolSlug: 'cursor',
    badge: 'AI IDE',
    description: 'Modern Cursor format with YAML frontmatter (description, globs, alwaysApply).',
  },
  {
    id: 'cursorrules',
    label: '.cursorrules (Legacy)',
    targetFile: '.cursorrules',
    toolName: 'Cursor',
    toolSlug: 'cursor',
    badge: 'AI IDE',
    description: 'Single-file workspace rules for Cursor versions prior to .mdc rulebooks.',
  },
  {
    id: 'agents-md',
    label: 'AGENTS.md',
    targetFile: 'AGENTS.md',
    toolName: 'Codex / Universal',
    toolSlug: 'codex',
    badge: 'Open Standard',
    description: 'Cross-agent standard adopted by Codex, OpenCode, and multi-agent frameworks.',
  },
  {
    id: 'windsurfrules',
    label: '.windsurfrules',
    targetFile: '.windsurfrules',
    toolName: 'Windsurf',
    toolSlug: 'windsurf',
    badge: 'AI IDE',
    description: 'Workspace context, behavioral rules, and memory for Windsurf Cascade.',
  },
  {
    id: 'copilot',
    label: 'Copilot Instructions',
    targetFile: '.github/copilot-instructions.md',
    toolName: 'GitHub Copilot',
    toolSlug: 'github-copilot',
    badge: 'Extension',
    description: 'Repository-level custom instructions for GitHub Copilot Chat & PR review.',
  },
  {
    id: 'clinerules',
    label: '.clinerules',
    targetFile: '.clinerules',
    toolName: 'Cline / Roo Code',
    toolSlug: 'cline',
    badge: 'Autonomous',
    description: 'Execution boundaries, tool authorizations, and workflows for Cline & Roo Code.',
  },
];

export const STARTER_TEMPLATES = {
  'astro-cf': {
    name: 'Astro + Cloudflare Workers',
    format: 'claude-md',
    content: `# Project Context: Astro + Cloudflare Web App
High-performance content-driven directory built with Astro 6, Cloudflare Workers, and Tailwind CSS.

## Build, Test & Dev Commands
- Run dev server: \`bun run dev\` (or \`bunx astro dev --port 4321\`)
- Build styles: \`bun run css:build\` (Tailwind CSS v4)
- Build client JS: \`bun run js:build\` (bundles to public/dist/)
- Run all unit tests: \`bun test\`
- Typecheck: \`bun run lint\` (or \`bunx astro check\`)

## Code Style & Architecture Boundaries
- Maximum 500 lines per file (hard stop at 550). Decompose proactively.
- Respect separation of concerns: pure logic in src/lib/, DOM controllers in js/, templates in src/pages/.
- Modern Java/TypeScript idiomatic conventions: explicit imports, records/interfaces for immutable models.
- Never commit secrets or hardcode API credentials.
- Do NOT commit or push to git without explicit user instruction.

## Verification Checklist
1. Verify with \`bun test\` before declaring any refactor complete.
2. Ensure no layout shake or hydration mismatches on client controls.
`,
  },
  'next-ts': {
    name: 'Next.js 15 + TypeScript',
    format: 'cursor-mdc',
    content: `---
description: Next.js 15 App Router TypeScript guidelines & architecture
globs: "**/*.{ts,tsx}"
alwaysApply: true
---

# Next.js 15 App Router Guidelines

## Core Tech Stack
- Next.js 15 (App Router, React Server Components by default)
- TypeScript in strict mode
- Tailwind CSS v4 + Shadcn UI primitives

## Architecture & Conventions
- Server Components by default. Add \`'use client'\` only when using React hooks or browser APIs.
- Data fetching: Fetch directly in async Server Components; handle error boundaries with \`error.tsx\`.
- Keep components focused and under 250 lines. Extract hooks for complex client state.
- Validate all incoming API request payloads with Zod schemas.

## Commands
- Dev: \`pnpm dev\`
- Lint: \`pnpm lint\`
- Typecheck: \`pnpm typecheck\`
- Test: \`pnpm test\`
`,
  },
  'python-fastapi': {
    name: 'Python + FastAPI',
    format: 'agents-md',
    content: `# AGENTS.md — FastAPI Microservice

## Project Overview
High-throughput REST API service built with FastAPI, Pydantic v2, and SQLAlchemy async engine.

## Environment & Run Commands
- Activate venv: \`source .venv/bin/activate\`
- Run service: \`uvicorn app.main:app --reload --port 8000\`
- Run tests: \`pytest -v --cov=app\`
- Format & lint: \`ruff check . && ruff format .\`
- Database migrations: \`alembic upgrade head\`

## Coding Standards & Rules
- Type annotations required on all function arguments and return signatures.
- Use Pydantic v2 \`BaseModel\` with strict validation for request/response payloads.
- All database queries must be async via SQLAlchemy 2.0 select statements.
- Return HTTP 404/422 with structured RFC 7807 problem details.
- Never write credentials into source files. Use pydantic-settings with .env.
`,
  },
  'clean-code': {
    name: 'Strict Clean Code Universal',
    format: 'windsurfrules',
    content: `# Workspace Context & Developer Guardrails

## Core Principles
- Single-responsibility units: functions under 30 lines, files under 400 lines.
- Prefer composition over inheritance. Minimize blast radius of changes.
- Surgical edits: change only what is requested; never rewrite adjacent working code.
- No dead code: remove unused imports and variables introduced by new edits.

## Testing & Quality Gates
- Write reproduction tests before patching bugs.
- Verify tests pass before and after refactoring.
- Maintain documentation integrity: do not delete existing comments or docstrings.
`,
  },
};

/**
 * Detects rule format from text content and frontmatter heuristics.
 *
 * @param {string} text
 * @returns {string} One of RULE_FORMATS ids
 */
export function detectRuleFormat(text) {
  if (!text || typeof text !== 'string') return 'claude-md';
  const trimmed = text.trim();

  // 1. Modern Cursor .mdc YAML frontmatter: --- with description/globs/alwaysApply
  if (/^---\r?\n[\s\S]*?(?:alwaysApply|globs|description):[\s\S]*?\r?\n---/i.test(trimmed)) {
    return 'cursor-mdc';
  }

  // 2. Windsurf Cascade: # Workspace Context, Cascade, or XML-like windsurf directives
  if (/workspace context|cascade rules|rules & constraints/i.test(trimmed) && /windsurf/i.test(trimmed)) {
    return 'windsurfrules';
  }

  // 3. AGENTS.md format
  if (/^#\s*AGENTS\.md/i.test(trimmed) || (/agent\s+guidelines/i.test(trimmed) && /setup & commands/i.test(trimmed))) {
    return 'agents-md';
  }

  // 4. GitHub Copilot instructions
  if (/copilot-instructions/i.test(trimmed) || /github copilot instructions/i.test(trimmed)) {
    return 'copilot';
  }

  // 5. Cline / Roo Code rules
  if (/clinerules/i.test(trimmed) || /cline workflow|tool execution boundaries/i.test(trimmed)) {
    return 'clinerules';
  }

  // 6. CLAUDE.md standard
  if (/^#\s*CLAUDE\.md/i.test(trimmed) || (/build.*commands/i.test(trimmed) && /architecture/i.test(trimmed))) {
    return 'claude-md';
  }

  // 7. Cursorrules legacy
  if (/cursorrules/i.test(trimmed) || /you are an expert/i.test(trimmed)) {
    return 'cursorrules';
  }

  return 'claude-md';
}

/**
 * Parses raw rule text into an Intermediate Representation (RulesIR).
 */
export function parseRulesDocument(rawText) {
  const text = String(rawText ?? '').trim();
  const ir = {
    frontmatter: {
      description: '',
      globs: '*',
      alwaysApply: true,
    },
    title: '',
    sections: [],
    rawBody: '',
  };

  if (!text) return ir;

  let body = text;
  // Parse frontmatter if present
  const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (fmMatch) {
    const yamlBlock = fmMatch[1];
    body = fmMatch[2].trim();

    const descM = yamlBlock.match(/description:\s*(?:"([^"]*)"|'([^']*)'|([^\r\n]+))/i);
    if (descM) ir.frontmatter.description = (descM[1] ?? descM[2] ?? descM[3] ?? '').trim();

    const globsM = yamlBlock.match(/globs:\s*(?:"([^"]*)"|'([^']*)'|([^\r\n]+))/i);
    if (globsM) ir.frontmatter.globs = (globsM[1] ?? globsM[2] ?? globsM[3] ?? '').trim();

    const alwaysM = yamlBlock.match(/alwaysApply:\s*(true|false)/i);
    if (alwaysM) ir.frontmatter.alwaysApply = alwaysM[1].toLowerCase() === 'true';
  }

  ir.rawBody = body;

  // Extract primary title if first line is # Heading
  const lines = body.split(/\r?\n/);
  if (lines.length > 0 && lines[0].startsWith('# ')) {
    ir.title = lines[0].replace(/^#\s+/, '').trim();
  }

  // If no description in frontmatter, derive from title or first non-heading sentence
  if (!ir.frontmatter.description) {
    const firstNonHeading = lines.find(l => l.trim() && !l.startsWith('#'));
    ir.frontmatter.description = ir.title || (firstNonHeading ? firstNonHeading.slice(0, 80).trim() : 'Project coding rules and AI guidelines');
  }

  // Segment sections by # or ## headings
  const sectionRegex = /(?:^|\n)(#{1,3})\s+([^\n]+)\n([\s\S]*?)(?=(?:\n#{1,3}\s+[^\n]+)|$)/g;
  let match;
  while ((match = sectionRegex.exec(body)) !== null) {
    ir.sections.push({
      level: match[1].length,
      heading: match[2].trim(),
      content: match[3].trim(),
    });
  }

  return ir;
}

/**
 * Converts a RulesIR into the requested target format string.
 *
 * @param {string} rawText
 * @param {string} targetFormat
 * @param {object} [options]
 * @returns {string}
 */
export function convertRules(rawText, targetFormat, options = {}) {
  const ir = parseRulesDocument(rawText);
  const opts = { ...ir.frontmatter, ...options };
  const target = RULE_FORMATS.find(f => f.id === targetFormat) ?? RULE_FORMATS[0];

  switch (target.id) {
    case 'cursor-mdc': {
      const desc = opts.description || ir.title || 'Project rules and AI instructions';
      const globs = opts.globs || '*';
      const alwaysApply = opts.alwaysApply !== false;
      const cleanBody = ir.rawBody.replace(/^#\s+[^\n]+\n+/, '');
      return `---
description: ${desc}
globs: "${globs}"
alwaysApply: ${alwaysApply}
---

# ${ir.title || 'Project Rules'}

${cleanBody}`.trim() + '\n';
    }

    case 'claude-md': {
      const title = ir.title ? `# ${ir.title}` : '# Project Guidelines & Commands';
      const cleanBody = ir.rawBody.replace(/^#\s+[^\n]+\n+/, '');
      return `${title}\n\n${cleanBody}`.trim() + '\n';
    }

    case 'agents-md': {
      const title = ir.title ? `# AGENTS.md — ${ir.title}` : '# AGENTS.md';
      const cleanBody = ir.rawBody.replace(/^#\s+[^\n]+\n+/, '');
      return `${title}\n\n${cleanBody}`.trim() + '\n';
    }

    case 'windsurfrules': {
      const title = ir.title ? `# ${ir.title}` : '# Workspace Context & Rules';
      const cleanBody = ir.rawBody.replace(/^#\s+[^\n]+\n+/, '');
      return `${title}\n\n${cleanBody}`.trim() + '\n';
    }

    case 'copilot': {
      const title = ir.title ? `# Copilot Instructions: ${ir.title}` : '# GitHub Copilot Custom Instructions';
      const cleanBody = ir.rawBody.replace(/^#\s+[^\n]+\n+/, '');
      return `${title}\n\n${cleanBody}`.trim() + '\n';
    }

    case 'clinerules': {
      const title = ir.title ? `# .clinerules — ${ir.title}` : '# .clinerules — Execution Guidelines';
      const cleanBody = ir.rawBody.replace(/^#\s+[^\n]+\n+/, '');
      return `${title}\n\n${cleanBody}`.trim() + '\n';
    }

    case 'cursorrules':
    default: {
      const title = ir.title ? `# ${ir.title}` : '# Project Rules';
      const cleanBody = ir.rawBody.replace(/^#\s+[^\n]+\n+/, '');
      return `${title}\n\n${cleanBody}`.trim() + '\n';
    }
  }
}

/**
 * Estimates token count from character length (~4 chars per token).
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Parses converter state from URL search params.
 */
export function parseConverterUrlState(search) {
  const params = new URLSearchParams(search || '');
  const from = params.get('from') || 'claude-md';
  const to = params.get('to') || 'cursor-mdc';
  const tpl = params.get('tpl') || '';
  return {
    fromFormat: RULE_FORMATS.some(f => f.id === from) ? from : 'claude-md',
    toFormat: RULE_FORMATS.some(f => f.id === to) ? to : 'cursor-mdc',
    templateKey: STARTER_TEMPLATES[tpl] ? tpl : '',
  };
}

/**
 * Serializes converter state into URL search params.
 */
export function buildConverterUrlSearch(state) {
  const params = new URLSearchParams();
  if (state.fromFormat && state.fromFormat !== 'claude-md') params.set('from', state.fromFormat);
  if (state.toFormat && state.toFormat !== 'cursor-mdc') params.set('to', state.toFormat);
  if (state.templateKey) params.set('tpl', state.templateKey);
  const q = params.toString();
  return q ? `?${q}` : '';
}

export { initRulesConverterUI as default, initRulesConverterUI } from './rules-converter-ui.js';
