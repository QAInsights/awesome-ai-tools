#!/usr/bin/env node
/**
 * enrich-with-exa.js
 *
 * Fetches recent web content about a tool via Exa search, then uses an LLM
 * to produce structured enriched data, merging it into
 * public/data/enriched-tools.json.
 *
 * Modes:
 *   --single              Enrich one newly-approved tool. Reads issue data
 *                         from the ISSUE_DATA env var (JSON string produced
 *                         by .github/scripts/parse_issue.py). The slug is
 *                         resolved from data/slugs.json.
 *
 *   --bulk [--refresh-days=N]
 *                         Enrich all tools missing from enriched-tools.json.
 *                         When --refresh-days=N is given, also refresh tools
 *                         whose lastUpdated is older than N days.
 *
 * Environment:
 *   EXA_API_KEY           — Exa search API key (required)
 *   OPENAI_API_KEY        — LLM API key (required)
 *   OPENAI_BASE_URL       — LLM endpoint (default: https://api.deepseek.com/v1)
 *   LLM_MODEL             — model name (default: deepseek-v4-flash)
 *   EXA_NUM_RESULTS       — Exa results per search (default: 10)
 *   ENRICH_DELAY_MS       — delay between enrichments in bulk mode (default: 1000)
 */

import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { slugify } from '../js/parser.js';
import { stripEnrichedCitations } from '../src/lib/enrichment-citations.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const ENRICHED_PATH = join(ROOT, 'public', 'data', 'enriched-tools.json');
const SLUGS_PATH = join(ROOT, 'data', 'slugs.json');

const EXA_API_KEY = process.env.EXA_API_KEY;
const LLM_API_KEY = process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_API_KEY;
const LLM_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-v4-flash';
const EXA_NUM_RESULTS = parseInt(process.env.EXA_NUM_RESULTS || '10', 10);
const ENRICH_DELAY_MS = parseInt(process.env.ENRICH_DELAY_MS || '1000', 10);

// ── helpers ────────────────────────────────────────────────────────────────

function setOutput(name, value) {
    const outputPath = process.env.GITHUB_OUTPUT;
    if (outputPath) {
        appendFileSync(outputPath, `${name}=${value}\n`);
    }
}

function todayUTC() {
    return new Date().toISOString().slice(0, 10);
}

function isStale(lastUpdated, maxAgeDays) {
    if (!lastUpdated) return true;
    const d = new Date(lastUpdated);
    if (isNaN(d.getTime())) return true;
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - maxAgeDays);
    return d < cutoff;
}

function normalizePricing(value) {
    const v = String(value || '').toLowerCase().trim();
    if (v.includes('open source') || v.includes('open-source') || v === 'oss') return 'open-source';
    if (v === 'free') return 'free';
    if (v === 'freemium') return 'freemium';
    if (v === 'paid') return 'paid';
    return v || null;
}

function loadEnriched() {
    try {
        return JSON.parse(readFileSync(ENRICHED_PATH, 'utf-8'));
    } catch {
        return [];
    }
}

function loadSlugs() {
    try {
        return JSON.parse(readFileSync(SLUGS_PATH, 'utf-8'));
    } catch {
        return [];
    }
}

function saveEnriched(arr) {
    const slugs = loadSlugs();
    const order = new Map(slugs.map((t, i) => [t.slug, i]));
    arr.sort((a, b) => {
        const ia = order.get(a.slug) ?? Number.MAX_SAFE_INTEGER;
        const ib = order.get(b.slug) ?? Number.MAX_SAFE_INTEGER;
        return ia - ib;
    });
    writeFileSync(ENRICHED_PATH, JSON.stringify(arr, null, 2) + '\n', 'utf-8');
}

function resolveSlug(name, slugs) {
    const exact = slugs.find(t => t.name.toLowerCase().trim() === name.toLowerCase().trim());
    if (exact) return exact.slug;
    return slugify(name);
}

function coerceFields(obj) {
    const arrays = ['keyFeatures', 'tags'];
    for (const k of arrays) {
        if (obj[k] && typeof obj[k] === 'string') {
            obj[k] = obj[k].split(/\n|,(?=\s*)/).map(s => s.trim()).filter(Boolean);
        }
        if (!Array.isArray(obj[k])) obj[k] = [];
    }
    const validPricing = ['free', 'freemium', 'paid', 'open-source'];
    if (obj.pricing && !validPricing.includes(String(obj.pricing).toLowerCase().trim())) {
        obj.pricing = null;
    }
    // Ensure known fields are strings
    const strings = ['pricingDetail', 'description', 'bestFor', 'notIdealFor', 'recentUpdates', 'verdict'];
    for (const k of strings) {
        if (obj[k] !== null && typeof obj[k] !== 'string') {
            obj[k] = String(obj[k] || '');
        }
    }
    return stripEnrichedCitations(obj);
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ── Exa search ─────────────────────────────────────────────────────────────

async function exaSearch(query) {
    const resp = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${EXA_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            query,
            numResults: EXA_NUM_RESULTS,
            contents: { text: true, title: true },
        }),
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Exa API ${resp.status}: ${text}`);
    }

    const data = await resp.json();
    return data.results || [];
}

// ── LLM enrichment ─────────────────────────────────────────────────────────

const LLM_SYSTEM_PROMPT = `You are a data extraction assistant for AI coding tools. Analyze the search results and produce structured JSON.

Schema (return ONLY valid JSON, no markdown, no extra text):
{
  "pricing": "free" | "freemium" | "paid" | "open-source",
  "pricingDetail": string(1-2 sentences),
  "description": string(1-2 sentences),
  "keyFeatures": [3-7 strings],
  "bestFor": string(1 sentence),
  "notIdealFor": string(1 sentence),
  "recentUpdates": string(recent news/launches with dates if available),
  "verdict": string(1-2 sentences, balanced),
  "tags": [2-5 strings]
}

Rules:
- Only use information from the provided search results. Do not invent.
- If a field cannot be determined, return null.
- pricingDetail: describe tiers, costs, credit models.
- description: what the tool does.
- bestFor: who benefits most.
- notIdealFor: limitations or who should look elsewhere.
- recentUpdates: recent launches, versions, feature drops with dates.
- verdict: balanced strengths + weaknesses assessment.
- tags: relevant keywords.
- Do not add citation markers such as [1] or [2][3]; the text is shown directly to readers.
- lastUpdated will be set automatically by the pipeline.`;

function formatResults(results) {
    return results.map((r, i) => {
        const d = r.publishedDate ? new Date(r.publishedDate).toISOString().slice(0, 10) : 'N/A';
        const content = (r.content || r.text || '').slice(0, 3000);
        return `Result ${i + 1}:\nTitle: ${r.title || 'N/A'}\nURL: ${r.url || 'N/A'}\nDate: ${d}\nContent: ${content}`;
    }).join('\n\n---\n\n');
}

async function callLLM(messages) {
    const resp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${LLM_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: LLM_MODEL,
            messages,
            response_format: { type: 'json_object' },
            temperature: 0.3,
        }),
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`LLM API ${resp.status}: ${text}`);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM returned empty response');

    let parsed;
    try {
        parsed = JSON.parse(content);
    } catch {
        const match = content.match(/```(?:json)?\n([\s\S]*?)\n```/);
        if (match) parsed = JSON.parse(match[1]);
        else throw new Error('LLM output is not valid JSON');
    }

    return coerceFields(parsed);
}

async function enrichTool(tool) {
    const pricingHint = normalizePricing(tool.pricing);
    const year = new Date().getFullYear();
    const query = `${tool.name} ${tool.company || ''} AI coding tool features pricing ${year}`;

    console.log(`  Exa search: "${query}"`);
    const results = await exaSearch(query);
    if (!results.length) throw new Error('No search results from Exa');
    console.log(`  Got ${results.length} Exa results`);

    const contextLines = [
        `Tool: ${tool.name}`,
        tool.company ? `Company: ${tool.company}` : '',
        tool.url ? `URL: ${tool.url}` : '',
        tool.category ? `Category: ${tool.category}` : '',
        pricingHint ? `Pricing (from submission): ${pricingHint}` : '',
        tool.description ? `Submitter's notes: ${tool.description}` : '',
    ].filter(Boolean).join('\n');

    const userPrompt = `${contextLines}

Exa search results:

${formatResults(results)}

Extract structured JSON matching the schema. Use the submitter's pricing hint but verify with search results. If results contradict the hint, trust the results.`;

    console.log(`  Calling LLM (${LLM_MODEL})...`);
    const enriched = await callLLM([
        { role: 'system', content: LLM_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
    ]);

    return {
        slug: tool.slug,
        name: tool.name,
        company: tool.company,
        ...enriched,
        lastUpdated: todayUTC(),
    };
}

function mergeEnriched(slug, entry) {
    const arr = loadEnriched();
    const idx = arr.findIndex(e => e.slug === slug);
    if (idx >= 0) arr[idx] = entry;
    else arr.push(entry);
    saveEnriched(arr);
    console.log(`  ✓ Merged enriched entry for slug: ${slug}`);
}

// ── modes ───────────────────────────────────────────────────────────────────

async function runSingle() {
    const raw = process.env.ISSUE_DATA;
    if (!raw) {
        console.error('ERROR: ISSUE_DATA env var not set.');
        process.exit(1);
    }

    const data = JSON.parse(raw);
    const slugs = loadSlugs();

    const name = (data['tool-name'] || data.name || '').trim();
    const company = (data.company || '').trim();
    const url = (data.url || '').trim();
    const category = (data.category || '').trim();
    const description = (data.description || '').trim();
    const pricing = (data.pricing || '').trim();

    if (!name || !url) {
        console.error('ERROR: ISSUE_DATA missing required fields (tool-name, url).');
        process.exit(1);
    }

    const slug = resolveSlug(name, slugs);
    console.log(`[single] ${name} → slug: ${slug}`);

    const entry = await enrichTool({ name, company, url, category, description, pricing, slug });
    mergeEnriched(slug, entry);
    setOutput('enriched', 'true');
    console.log(`[single] Done.`);
}

async function runBulk(refreshDays) {
    const slugs = loadSlugs();
    const enriched = loadEnriched();
    const existingMap = new Map(enriched.map(e => [e.slug, e]));

    const targets = [];
    for (const tool of slugs) {
        const existing = existingMap.get(tool.slug);
        if (!existing) {
            targets.push(tool);
        } else if (refreshDays > 0 && isStale(existing.lastUpdated, refreshDays)) {
            targets.push(tool);
        }
    }

    if (!targets.length) {
        console.log('[bulk] All tools are up to date.');
        return;
    }

    console.log(`[bulk] ${targets.length} tools to enrich.`);

    let ok = 0;
    for (const tool of targets) {
        try {
            const entry = await enrichTool(tool);
            mergeEnriched(tool.slug, entry);
            ok++;
        } catch (err) {
            console.error(`  ✗ ${tool.slug}: ${err.message}`);
        }
        if (ENRICH_DELAY_MS > 0) await sleep(ENRICH_DELAY_MS);
    }

    console.log(`[bulk] Done. Enriched ${ok}/${targets.length} tools.`);
    setOutput('enriched', ok > 0 ? 'true' : 'false');
    setOutput('enriched_count', String(ok));
}

// ── entry point ─────────────────────────────────────────────────────────────

function main() {
    if (!EXA_API_KEY) {
        console.log('EXA_API_KEY not set — enrichment skipped.');
        setOutput('enriched', 'false');
        process.exit(0);
    }
    if (!LLM_API_KEY) {
        console.log('OPENAI_API_KEY not set — enrichment skipped.');
        setOutput('enriched', 'false');
        process.exit(0);
    }

    const args = process.argv.slice(2);

    if (args.includes('--single')) {
        runSingle().catch(err => {
            console.error(`Enrichment failed: ${err.message}`);
            setOutput('enriched', 'false');
            process.exit(0);
        });
    } else if (args.includes('--bulk')) {
        const refreshMatch = args.find(a => a.startsWith('--refresh-days'));
        const refreshDays = refreshMatch
            ? parseInt(refreshMatch.split('=')[1], 10)
            : 0;
        runBulk(refreshDays).catch(err => {
            console.error(`Bulk enrichment failed: ${err.message}`);
            setOutput('enriched', 'false');
            process.exit(0);
        });
    } else {
        console.error('Usage: node scripts/enrich-with-exa.js --single | --bulk [--refresh-days=N]');
        process.exit(1);
    }
}

main();
