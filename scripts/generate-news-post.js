#!/usr/bin/env node
/**
 * Generate the daily "Today in AI" news post.
 *
 * Network-free fixtures can be supplied with:
 *   node scripts/generate-news-post.js --dry-run --fixture=path/to/fixture.json
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extractNewsCitations } from '../src/lib/news-citations.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BLOG_DIR = join(ROOT, 'src', 'content', 'blog');

const EXA_API_KEY = process.env.EXA_API_KEY;
const LLM_API_KEY = process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY;
const LLM_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-v4-flash';
const EXA_NUM_RESULTS = parseInt(process.env.EXA_NUM_RESULTS || '6', 10);
const MAX_RESULT_TEXT = 2200;
const RECENT_BRIEF_LOOKBACK_DAYS = 3;

const SEARCH_BEATS = [
    'AI frontier labs model releases and product launches for developers',
    'AI funding acquisitions partnerships earnings and business moves',
    'AI policy regulation copyright antitrust and legal decisions affecting builders',
    'AI developer tooling coding agents infrastructure chips and research milestones',
];

const LLM_SYSTEM_PROMPT = `You are the news editor for "Today in AI", a daily brief on the ai.dosa.dev developer-tools site. You write short, punchy, tabloid-energy copy that is still factually strict.

You will be given a list of search results (title, URL, published date, page text) about artificial intelligence from the last 24 hours. Write a daily brief from ONLY those results.

HARD RULES
1. Every factual claim must be traceable to the supplied search results. Never add background knowledge, numbers, dates, names, or context that is not present in the supplied text. If you are unsure, leave it out.
2. Never invent or guess a URL. Every sourceUrl you output must be copied character-for-character from a supplied result.
3. Discard any result that is not genuinely news from the last 24 hours: marketing pages, "best tools" listicles, undated evergreen docs, pricing pages, tutorials, and pure opinion columns.
4. Discard duplicates. If several results cover the same story, pick one, following SOURCE SELECTION below.

SOURCE SELECTION
Always prefer the primary source: the company's own announcement or engineering blog, the release notes, the paper, the filing, the regulator's own statement. Cite an outlet only when it is doing the original reporting, or when no primary source is among the supplied results.

When the same story appears from several sources, rank them: primary/official announcement first, then established trade press doing original reporting, then anything else. Avoid rewrite-and-repost sites, SEO content farms, and newsletter or blog roundups that merely summarize other people's coverage; if such a result is the only one for a story, prefer to drop the story unless it is significant enough that the day would be worse without it. Name the source as readers know it (for example "NVIDIA" or "Reuters"), not the blog's tagline.

ALREADY COVERED
You will be given a list of stories this brief already published on earlier days. Never publish one of them again. This applies to the story, not just the link: if a listed story is the same event, the same announcement, the same funding round or the same release, skip it even when today's result comes from a different outlet, carries a different URL, or adds a small extra detail. Cover it again only if today's results report a genuinely new development in it, and in that case lead with what changed rather than restating the original news.

Never reuse an earlier day's story as today's lead. If the biggest item in today's results is already covered, lead with the strongest item that is not.

EDITORIAL SCOPE, INCLUDE
AI model and product launches, capability and benchmark results, developer tooling and coding agents, funding rounds, acquisitions, partnerships, earnings and business moves, infrastructure and chips, research milestones, open-weight releases, notable outages and security incidents, regulation and policy that directly affects builders, and significant hiring or org changes at AI labs.

EDITORIAL SCOPE, EXCLUDE
Skip a story entirely, rather than softening it, if covering it would require you to take a side on a contested political, electoral, religious, ethnic, or nationalist dispute; on war, armed conflict, or geopolitical hostility; on abortion, gender identity, immigration, gun policy, or similar culture-war subjects; on the guilt or innocence of a named person in an ongoing legal, criminal, or misconduct matter; or on individual health, medical, or legal advice. Skip celebrity and personal gossip, deaths and tragedies, unverified rumor and leaks, and speculation about anyone's private life. Never speculate about, mock, or pass moral judgment on any named individual or company.

Where AI policy or litigation IS the story (an AI regulation passing, an AI copyright ruling, an antitrust filing against an AI company), report it, but restrict yourself to what verifiably happened: who did what, when, and what it means for people building with AI. State the procedural facts and the stated positions of the parties. Do not editorialize about whether it is good or bad, and do not predict outcomes.

TIME FRAME
This is a daily brief, not a weekly roundup. Write about today only. Never frame the day as "this week", "in recent days", "lately", or "the past few weeks", and never claim a trend spanning more than the day's stories. If a supplied result is itself a weekly roundup, take the individual story from it, not the week's framing.

TONE
Write like a person who follows this field and is telling a colleague what happened: energetic, plain-spoken, concrete. Strong verbs, short sentences, no corporate filler, no hedging mush. It does NOT mean sensational, snide, or moralizing. No clickbait that the body does not deliver. No exclamation marks. No emoji.

Never use em dashes or en dashes. Use a comma, a full stop, or a colon instead.

Avoid the phrasings that make copy read as machine-written. Do not use: "in a move that", "underscores", "highlights the growing", "is poised to", "marks a significant", "the landscape", "the space", "signals a shift", "paving the way", "as the industry continues to", "double down", "game-changer", "a flood of", "heats up". Do not open consecutive items with the same construction, do not start a sentence with a company name every single time, and do not end "why it matters" with a vague gesture at the future. Say the specific consequence for someone building software, or say nothing.

OUTPUT
Respond with a single JSON object and nothing else, matching exactly this shape:

{
  "title": "string, 50-65 chars, specific to today's biggest story, must NOT start with 'Today in AI'",
  "description": "string, 120-155 chars, meta description summarizing the day, no clickbait",
  "leadIn": "string, one sentence, max 200 chars, sets up today's stories without claiming a weekly or longer trend",
  "items": [
    {
      "headline": "string, max 70 chars, concrete and specific, no colon-subtitle pattern",
      "whatHappened": "string, 1-2 sentences, max 320 chars, only facts from the source",
      "whyItMatters": "string, 1 sentence, max 220 chars, practical consequence for developers and builders",
      "sourceUrl": "string, copied verbatim from a supplied result",
      "sourceName": "string, publication or company name, max 40 chars"
    }
  ],
  "tags": ["array of 3-6 lowercase topical slugs, e.g. openai, funding, agents, chips"]
}

Order items by significance, biggest story first. Include between 3 and 7 items. If fewer than 3 supplied results survive the rules above, return {"items": []} and nothing else, so the pipeline can abort rather than publish a thin post.`;

const LLM_USER_PROMPT_TEMPLATE = `Date (UTC): {{DATE}}

{{COVERED}}

Search results from the last 24 hours:

{{RESULTS}}

Write today's brief as a single JSON object following the schema and all rules. Use only the results above.
`;

function setOutput(name, value) {
    if (process.env.GITHUB_OUTPUT) {
        writeFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, { flag: 'a' });
    }
}

export function todayUTC(now = new Date()) {
    return now.toISOString().slice(0, 10);
}

function resultText(result) {
    return String(result.text || result.content || '').slice(0, MAX_RESULT_TEXT);
}

function normalizedTitle(title) {
    return String(title || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

function titleSimilarity(a, b) {
    const left = new Set(normalizedTitle(a).split(/\s+/).filter(Boolean));
    const right = new Set(normalizedTitle(b).split(/\s+/).filter(Boolean));
    if (!left.size || !right.size) return 0;
    const intersection = [...left].filter((token) => right.has(token)).length;
    return intersection / (left.size + right.size - intersection);
}

export function normalizeNewsUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
        const parsed = new URL(value);
        if (!['http:', 'https:'].includes(parsed.protocol.toLowerCase())) return null;
        parsed.protocol = parsed.protocol.toLowerCase();
        parsed.hostname = parsed.hostname.toLowerCase();
        parsed.pathname = parsed.pathname.replace(/\/+$/, '');
        return parsed.toString().replace(/\/(?=[?#]|$)/, '');
    } catch {
        return null;
    }
}

function previousUtcDate(now, daysAgo) {
    const date = new Date(now);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - daysAgo);
    return todayUTC(date);
}

export function readRecentBriefs(outputDir, now = new Date()) {
    const briefTitles = [];
    const storyHeadings = [];
    const sourceUrls = new Set();

    for (let daysAgo = 1; daysAgo <= RECENT_BRIEF_LOOKBACK_DAYS; daysAgo++) {
        const date = previousUtcDate(now, daysAgo);
        const path = join(outputDir, `${slugForDate(date)}.mdx`);
        if (!existsSync(path)) continue;

        const body = readFileSync(path, 'utf-8');
        try {
            const frontmatter = parseFrontmatter(body);
            if (frontmatter.title) briefTitles.push({ date, title: frontmatter.title });
        } catch {}

        let inSources = false;
        for (const line of body.split('\n')) {
            const heading = line.match(/^## (.+)$/)?.[1]?.trim();
            if (!heading) continue;
            if (heading === 'Sources') {
                inSources = true;
                continue;
            }
            if (!inSources) storyHeadings.push({ date, heading });
        }
        for (const url of extractNewsCitations(body)) {
            const normalized = normalizeNewsUrl(url);
            if (normalized) sourceUrls.add(normalized);
        }
    }

    return { briefTitles, storyHeadings, sourceUrls };
}

export function filterRecentResults(results, coveredData) {
    const coveredUrls = coveredData?.sourceUrls || new Set();
    const coveredHeadings = coveredData?.storyHeadings || [];
    return results.filter((result) => {
        const normalizedUrl = normalizeNewsUrl(result.url);
        if (normalizedUrl && coveredUrls.has(normalizedUrl)) return false;
        return !coveredHeadings.some(({ heading }) => titleSimilarity(result.title, heading) >= 0.82);
    });
}

export function formatCoveredStories(coveredData) {
    const stories = coveredData?.storyHeadings || [];
    if (!stories.length) {
        return 'Stories already published in earlier briefs, do not repeat them: none yet.';
    }
    return [
        'Stories already published in earlier briefs, do not repeat them:',
        ...stories.map(({ date, heading }) => `- ${date}: ${heading}`),
    ].join('\n');
}

export function dedupeResults(results) {
    const seenUrls = new Set();
    const kept = [];
    for (const result of results) {
        const url = String(result.url || '').trim();
        if (!url || seenUrls.has(url)) continue;
        const host = (() => {
            try {
                return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
            } catch {
                return '';
            }
        })();
        const duplicate = kept.some((prior) => {
            if (!host || prior.host !== host) return false;
            const left = normalizedTitle(result.title).split(/\s+/).filter(Boolean);
            const right = normalizedTitle(prior.title).split(/\s+/).filter(Boolean);
            const shared = new Set(left.filter((token) => right.includes(token))).size;
            const contained = Math.min(left.length, right.length) >= 3 &&
                shared / Math.min(left.length, right.length) >= 0.9;
            return titleSimilarity(result.title, prior.title) >= 0.82 || contained;
        });
        if (duplicate) continue;
        seenUrls.add(url);
        kept.push({ ...result, host });
    }
    return kept.map(({ host, ...result }) => result);
}

export function formatResults(results) {
    return results.map((result, index) => {
        const date = result.publishedDate
            ? new Date(result.publishedDate).toISOString()
            : 'N/A';
        return `Result ${index + 1}:\nTitle: ${result.title || 'N/A'}\nURL: ${result.url || 'N/A'}\nDate: ${date}\nContent: ${resultText(result)}`;
    }).join('\n\n---\n\n');
}

export function isQuietDayOutput(output) {
    return Boolean(
        output &&
        typeof output === 'object' &&
        Array.isArray(output.items) &&
        output.items.length === 0 &&
        Object.keys(output).length === 1
    );
}

function parseLLMJson(content) {
    try {
        return JSON.parse(content);
    } catch {
        const match = String(content).match(/```(?:json)?\n([\s\S]*?)\n```/);
        if (match) return JSON.parse(match[1]);
        throw new Error('LLM output is not valid JSON');
    }
}

async function exaSearch(query, { fetchImpl = fetch, now = new Date() } = {}) {
    const startPublishedDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const response = await fetchImpl('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${EXA_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            query,
            numResults: EXA_NUM_RESULTS,
            startPublishedDate,
            contents: { text: true, title: true },
        }),
    });
    if (!response.ok) {
        throw new Error(`Exa API ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    return data.results || [];
}

async function callLLM(messages, { fetchImpl = fetch } = {}) {
    const response = await fetchImpl(`${LLM_BASE_URL}/chat/completions`, {
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
    if (!response.ok) {
        throw new Error(`LLM API ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM returned empty response');
    return parseLLMJson(content);
}

function requiredString(value, field, errors) {
    if (typeof value !== 'string' || !value.trim()) errors.push(`${field} must be non-empty`);
}

export function inspectNewsOutput(output, exaResults, coveredData = null) {
    const hardErrors = [];
    const softWarnings = [];
    if (!output || typeof output !== 'object') {
        return { hardErrors: ['output must be an object'], softWarnings };
    }
    requiredString(output.title, 'title', hardErrors);
    requiredString(output.description, 'description', hardErrors);
    requiredString(output.leadIn, 'leadIn', hardErrors);
    for (const [field, value] of [
        ['title', output.title],
        ['description', output.description],
        ['leadIn', output.leadIn],
    ]) {
        if (typeof value === 'string' && /[\u2013\u2014]/.test(value)) {
            softWarnings.push(`${field} contains an em dash or en dash`);
        }
    }
    if (typeof output.title === 'string' && output.title.length > 70) {
        softWarnings.push('title exceeds soft target of 70 characters');
    }
    if (typeof output.title === 'string' && output.title.length > 200) {
        hardErrors.push('title exceeds hard ceiling of 200 characters');
    }
    if (typeof output.title === 'string' && /^today in ai\b/i.test(output.title)) {
        hardErrors.push("title must not start with 'Today in AI'");
    }
    if (typeof output.description === 'string' && output.description.length > 160) {
        softWarnings.push('description exceeds soft target of 160 characters');
    }
    if (typeof output.description === 'string' && output.description.length > 320) {
        hardErrors.push('description exceeds hard ceiling of 320 characters');
    }
    if (typeof output.leadIn === 'string' && output.leadIn.length > 200) {
        softWarnings.push('leadIn exceeds soft target of 200 characters');
    }
    if (typeof output.leadIn === 'string' && output.leadIn.length > 400) {
        hardErrors.push('leadIn exceeds hard ceiling of 400 characters');
    }
    if (!Array.isArray(output.items) || output.items.length < 3 || output.items.length > 7) {
        hardErrors.push('items must contain between 3 and 7 stories');
    }
    const sourceUrls = new Set((exaResults || []).map((result) => result.url));
    const coveredUrls = coveredData?.sourceUrls || new Set();
    for (const [index, item] of (output.items || []).entries()) {
        for (const field of ['headline', 'whatHappened', 'whyItMatters', 'sourceUrl', 'sourceName']) {
            requiredString(item?.[field], `items[${index}].${field}`, hardErrors);
        }
        for (const field of ['headline', 'whatHappened', 'whyItMatters', 'sourceName']) {
            if (typeof item?.[field] === 'string' && /[\u2013\u2014]/.test(item[field])) {
                softWarnings.push(`items[${index}].${field} contains an em dash or en dash`);
            }
        }
        if (item?.headline?.length > 70) {
            softWarnings.push(`items[${index}].headline exceeds soft target of 70 characters`);
        }
        if (item?.headline?.length > 200) {
            hardErrors.push(`items[${index}].headline exceeds hard ceiling of 200 characters`);
        }
        if (item?.whatHappened?.length > 320) {
            softWarnings.push(`items[${index}].whatHappened exceeds soft target of 320 characters`);
        }
        if (item?.whatHappened?.length > 640) {
            hardErrors.push(`items[${index}].whatHappened exceeds hard ceiling of 640 characters`);
        }
        if (item?.whyItMatters?.length > 220) {
            softWarnings.push(`items[${index}].whyItMatters exceeds soft target of 220 characters`);
        }
        if (item?.whyItMatters?.length > 440) {
            hardErrors.push(`items[${index}].whyItMatters exceeds hard ceiling of 440 characters`);
        }
        if (item?.sourceName?.length > 40) {
            softWarnings.push(`items[${index}].sourceName exceeds soft target of 40 characters`);
        }
        if (item?.sourceName?.length > 120) {
            hardErrors.push(`items[${index}].sourceName exceeds hard ceiling of 120 characters`);
        }
        if (item?.sourceUrl && !sourceUrls.has(item.sourceUrl)) {
            hardErrors.push(`items[${index}].sourceUrl is not present in Exa results: ${item.sourceUrl}`);
        }
        if (item?.sourceUrl && coveredUrls.has(normalizeNewsUrl(item.sourceUrl))) {
            hardErrors.push(`items[${index}].sourceUrl was already cited in a recent brief: ${item.sourceUrl}`);
        }
    }
    if (typeof output.title === 'string') {
        for (const { title } of coveredData?.briefTitles || []) {
            if (normalizedTitle(output.title) === normalizedTitle(title) || titleSimilarity(output.title, title) >= 0.9) {
                hardErrors.push(`title duplicates a recent brief title: ${title}`);
                break;
            }
        }
    }
    if (!Array.isArray(output.tags) || output.tags.length < 3 || output.tags.length > 6) {
        hardErrors.push('tags must contain between 3 and 6 slugs');
    } else if (output.tags.some((tag) => typeof tag !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag))) {
        hardErrors.push('tags must be lowercase topical slugs');
    }
    return { hardErrors, softWarnings };
}

function createHardValidationError(hardErrors) {
    const error = new Error(`News output HARD validation failed:\n- ${hardErrors.join('\n- ')}`);
    error.tier = 'hard';
    error.validationErrors = hardErrors;
    return error;
}

export function validateNewsOutput(output, exaResults, coveredData = null) {
    const { hardErrors } = inspectNewsOutput(output, exaResults, coveredData);
    if (hardErrors.length) {
        throw createHardValidationError(hardErrors);
    }
    return output;
}

function logSoftWarnings(softWarnings) {
    if (softWarnings.length) {
        console.warn(`[news] SOFT validation warnings; publishing anyway:\n- ${softWarnings.join('\n- ')}`);
    }
}

function validationFeedback({ hardErrors, softWarnings }) {
    return [
        ...hardErrors.map((message) => `HARD: ${message}`),
        ...softWarnings.map((message) => `SOFT: ${message}`),
    ];
}

function validateForGeneration(output, exaResults, coveredData = null) {
    const validation = inspectNewsOutput(output, exaResults, coveredData);
    if (validation.hardErrors.length) {
        throw createHardValidationError(validation.hardErrors);
    }
    return validation;
}

function parseAndValidateFrontmatter(post) {
    try {
        parseFrontmatter(post);
    } catch (error) {
        throw createHardValidationError([`frontmatter could not be parsed: ${error.message}`]);
    }
}

export function escapeMdxText(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\{/g, '&#123;')
        .replace(/\}/g, '&#125;');
}

export function sanitizeNewsText(value) {
    return String(value)
        .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, '$1 to $2')
        .replace(/[\u2013\u2014]/g, ',')
        .replace(/([.!?])\s*,/g, '$1')
        .replace(/,\s*([.!?])/g, '$1')
        .replace(/,{2,}/g, ',')
        .replace(/,\s*,+/g, ',')
        .replace(/\s*,\s*/g, ', ')
        .replace(/[ \t]+([.!?])/g, '$1')
        .replace(/([.!?])\s*\1+/g, '$1')
        .replace(/[ \t]{2,}/g, ' ');
}

function escapeMdxUrl(value) {
    return String(value).replace(/[<>]/g, (character) => character === '<' ? '%3C' : '%3E');
}

export function createFrontmatter(output, date) {
    const modelTags = output.tags.map((tag) => tag.toLowerCase().trim()).filter(Boolean);
    const tags = [...new Set(['news', 'today-in-ai', ...modelTags])];
    return [
        '---',
        `title: ${JSON.stringify(sanitizeNewsText(output.title))}`,
        `description: ${JSON.stringify(sanitizeNewsText(output.description))}`,
        `pubDate: ${date}`,
        `tags: ${JSON.stringify(tags)}`,
        'draft: false',
        'featured: false',
        '---',
    ].join('\n');
}

export function parseFrontmatter(post) {
    const match = String(post).match(/^---\n([\s\S]*?)\n---\n/);
    if (!match) throw new Error('Generated post frontmatter could not be parsed');
    const values = {};
    for (const line of match[1].split('\n')) {
        const separator = line.indexOf(':');
        if (separator < 1) throw new Error(`Invalid frontmatter line: ${line}`);
        const key = line.slice(0, separator);
        const raw = line.slice(separator + 1).trim();
        try {
            values[key] = key === 'pubDate' || key === 'tags' ? (key === 'tags' ? JSON.parse(raw) : new Date(raw)) : JSON.parse(raw);
        } catch {
            throw new Error(`Invalid frontmatter value for ${key}`);
        }
    }
    if (!values.title || !values.description || !(values.pubDate instanceof Date) || isNaN(values.pubDate.getTime())) {
        throw new Error('Generated post frontmatter is missing required fields');
    }
    return values;
}

export function renderNewsPost(output, date) {
    const frontmatter = createFrontmatter(output, date);
    const sources = [];
    const seenSourceUrls = new Set();
    for (const item of output.items) {
        if (seenSourceUrls.has(item.sourceUrl)) continue;
        seenSourceUrls.add(item.sourceUrl);
        sources.push(`- [${escapeMdxText(sanitizeNewsText(item.sourceName))}](<${escapeMdxUrl(item.sourceUrl)}>)`);
    }
    const body = [
        `This brief covers AI news from ${date} UTC.`,
        '',
        escapeMdxText(sanitizeNewsText(output.leadIn)),
        '',
        ...output.items.flatMap((item) => [
            `## ${escapeMdxText(sanitizeNewsText(item.headline))}`,
            '',
            `**What happened:** ${escapeMdxText(sanitizeNewsText(item.whatHappened))}`,
            '',
            `**Why it matters:** ${escapeMdxText(sanitizeNewsText(item.whyItMatters))}`,
            '',
            `[Source: ${escapeMdxText(sanitizeNewsText(item.sourceName))}](<${escapeMdxUrl(item.sourceUrl)}>)`,
            '',
        ]),
        '## Sources',
        '',
        ...sources,
    ].join('\n').trimEnd();
    const post = `${frontmatter}\n\n${body}\n`;
    parseAndValidateFrontmatter(post);
    return post;
}

export function slugForDate(date) {
    return `today-in-ai-${date}`;
}

export async function generateNewsPost({
    now = new Date(),
    dryRun = false,
    fixture,
    outputDir = BLOG_DIR,
    fetchImpl = fetch,
    searchImpl = null,
    llmImpl = null,
} = {}) {
    const date = todayUTC(now);
    const filename = `${slugForDate(date)}.mdx`;
    const outputPath = join(outputDir, filename);
    if (!dryRun && existsSync(outputPath)) {
        return { created: false, filename, post: null };
    }

    let results;
    let output;
    const coveredData = readRecentBriefs(outputDir, now);
    if (fixture) {
        results = filterRecentResults(dedupeResults(fixture.results || []), coveredData);
        if (results.length < 3) {
            console.log('[news] Quiet day: fewer than three usable stories remained after recent-brief filtering; no post produced.');
            return { created: false, filename, post: null, quiet: true };
        }
        output = fixture.output;
        if (isQuietDayOutput(output)) {
            console.log('[news] Quiet day: fewer than three stories survived the editorial rules; no post produced.');
            return { created: false, filename, post: null, quiet: true };
        }
        const validation = validateForGeneration(output, results, coveredData);
        logSoftWarnings(validation.softWarnings);
    } else {
        if (!EXA_API_KEY && !searchImpl) throw new Error('EXA_API_KEY is required');
        if (!LLM_API_KEY && !llmImpl) throw new Error('OPENAI_API_KEY is required');
        const search = searchImpl || ((query, options) => exaSearch(query, options));
        const call = llmImpl || ((messages, options) => callLLM(messages, options));
        const searched = [];
        for (const beat of SEARCH_BEATS) searched.push(...await search(beat, { fetchImpl, now }));
        results = filterRecentResults(dedupeResults(searched), coveredData);
        if (results.length < 3) {
            console.log('[news] Quiet day: fewer than three usable stories remained after recent-brief filtering; no post produced.');
            return { created: false, filename, post: null, quiet: true };
        }
        const prompt = LLM_USER_PROMPT_TEMPLATE
            .replace('{{DATE}}', date)
            .replace('{{COVERED}}', formatCoveredStories(coveredData))
            .replace('{{RESULTS}}', formatResults(results));
        const messages = [
            { role: 'system', content: LLM_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
        ];
        output = await call(messages, { fetchImpl });
        if (isQuietDayOutput(output)) {
            console.log('[news] Quiet day: fewer than three stories survived the editorial rules; no post produced.');
            return { created: false, filename, post: null, quiet: true };
        }
        let validation = inspectNewsOutput(output, results, coveredData);
        if (validation.hardErrors.length || validation.softWarnings.length) {
            if (dryRun) {
                if (validation.hardErrors.length) throw createHardValidationError(validation.hardErrors);
                logSoftWarnings(validation.softWarnings);
            } else {
                output = await call([
                    ...messages,
                    { role: 'assistant', content: JSON.stringify(output) },
                    {
                        role: 'user',
                        content: [
                            'Your first response failed validation for these specific reasons:',
                            ...validationFeedback(validation).map((message) => `- ${message}`),
                            'Return one corrected JSON object only. Keep all unchanged fields and sourceUrl values grounded in the supplied results.',
                        ].join('\n'),
                    },
                ], { fetchImpl });
                if (isQuietDayOutput(output)) {
                    console.log('[news] Quiet day: fewer than three stories survived the editorial rules; no post produced.');
                    return { created: false, filename, post: null, quiet: true };
                }
                validation = validateForGeneration(output, results, coveredData);
                logSoftWarnings(validation.softWarnings);
            }
        }
    }

    const post = renderNewsPost(output, date);
    if (dryRun) {
        console.log(post);
    } else {
        writeFileSync(outputPath, post, 'utf-8');
    }
    return { created: !dryRun, filename, post, outputPath };
}

function parseArgs(args) {
    const fixtureIndex = args.indexOf('--fixture');
    const fixtureArg = args.find((arg) => arg.startsWith('--fixture='));
    return {
        dryRun: args.includes('--dry-run'),
        fixturePath: fixtureArg?.slice('--fixture='.length) || (fixtureIndex >= 0 ? args[fixtureIndex + 1] : null),
    };
}

async function main() {
    const { dryRun, fixturePath } = parseArgs(process.argv.slice(2));
    const fixture = fixturePath ? JSON.parse(readFileSync(fixturePath, 'utf-8')) : null;
    const result = await generateNewsPost({ dryRun, fixture });
    setOutput('file_created', result.created ? 'true' : 'false');
    setOutput('filename', result.filename);
    if (!result.created && !dryRun) console.log(`[news] ${result.filename} already exists; nothing to do.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(`[news] ${error.message}`);
        process.exitCode = 1;
    });
}
