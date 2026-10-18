/**
 * Directional migration guides data layer (/switch/<from>-to-<to>).
 *
 * Reads data/switch-guides.json (curated "switch from A to B" pairs) and
 * resolves each guide against the build-time tool data. Unlike /compare
 * pairs, guides are directional: "Switch from A to B" is a different page
 * than "Switch from B to A". Everything runs at build time - no client-side
 * fetch - so crawlers see the full checklist, config mapping and cost delta.
 */

import switchGuidesJson from '../../data/switch-guides.json';
import { getToolBySlug, type Tool } from './tools';
import { getResolvedComparisons, humanizePricing, truncate } from './compare';
import { buildCalculatorToolCatalog } from './cost-calculator';
import { addOutboundUtmParams } from './outbound-utm.js';
import { ORGANIZATION } from './site';

export type TransitionType =
    | 'ide-to-ide' | 'ide-to-cli' | 'cli-to-ide' | 'cli-to-cli'
    | 'plugin-to-ide' | 'plugin-to-cli' | 'plugin-to-plugin'
    | 'saas-to-byok' | 'workflow-shift';

export interface SwitchGuide {
    slug: string;
    from: string;
    to: string;
    group: string;
    transitionType: TransitionType;
    primaryReason: string;
}

export type RulesFormatId = 'claude-md' | 'cursor-mdc' | 'cursorrules' | 'agents-md' | 'windsurfrules' | 'copilot' | 'clinerules';

export interface ToolRulesProfile {
    format: RulesFormatId;
    path: string;
    note?: string;
    installHint?: string;
}

/** Repo-level rules/config file each tool reads, keyed by tool slug. */
export const TOOL_RULES_PROFILE: Record<string, ToolRulesProfile> = {
    cursor: { format: 'cursor-mdc', path: '.cursor/rules/*.mdc' },
    'claude-code': { format: 'claude-md', path: 'CLAUDE.md', installHint: 'npm install -g @anthropic-ai/claude-code' },
    'github-copilot': { format: 'copilot', path: '.github/copilot-instructions.md' },
    devin: { format: 'windsurfrules', path: '.windsurfrules', note: 'Devin Desktop (formerly Windsurf) reads Windsurf rules files.' },
    cline: { format: 'clinerules', path: '.clinerules' },
    'roo-code': { format: 'clinerules', path: '.clinerules' },
    'codex-cli': { format: 'agents-md', path: 'AGENTS.md', installHint: 'npm install -g @openai/codex' },
    opencode: { format: 'agents-md', path: 'AGENTS.md', installHint: 'npm install -g opencode-ai' },
    aider: { format: 'agents-md', path: 'CONVENTIONS.md', note: 'Aider loads conventions with `aider --read CONVENTIONS.md` (or `read:` in .aider.conf.yml).', installHint: 'python -m pip install aider-install && aider-install' },
    zed: { format: 'agents-md', path: 'AGENTS.md', installHint: 'curl -f https://zed.dev/install.sh | sh' },
    trae: { format: 'agents-md', path: '.trae/rules/project_rules.md', note: 'Trae reads plain-Markdown project rules; paste the AGENTS.md output into this file.' },
    antigravity: { format: 'agents-md', path: 'AGENTS.md' },
};

export interface CostDelta {
    fromMonthlyPerSeat: number;
    toMonthlyPerSeat: number;
    fromPlanName: string | null;
    toPlanName: string | null;
    /** Optional paid plan of a BYOK destination (e.g. OpenCode Go) - not counted in the delta. */
    toOptionalPlan: { name: string; monthly: number } | null;
    monthlyDeltaPerSeat: number;
    annualDeltaTeam10: number;
    kind: 'cheaper' | 'pricier' | 'same' | 'byok' | 'unlisted';
    summary: string;
    /** Short badge, e.g. "−$12/seat", "BYOK", "See pricing". */
    label: string;
    calculatorHref: string;
    calculatorLabel: string;
}

export interface MigrationStep {
    name: string;
    text: string;
    url?: string;
}

export interface Tradeoffs {
    gain: string[];
    giveUp: string[];
    together: string;
}

export interface ResolvedSwitchGuide extends SwitchGuide {
    fromTool: Tool;
    toTool: Tool;
    lastUpdated: string | null;
    fromProfile: ToolRulesProfile | null;
    toProfile: ToolRulesProfile | null;
    converterHref: string | null;
    costDelta: CostDelta;
}

const SITE = 'https://ai.dosa.dev';
const money = (n: number) => `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)}`;
const oneLine = (s?: string) => (s ?? '').replace(/\s+/g, ' ').trim();
const BYOK = /\bBYOK\b|bring (?:their|your) own|own API keys?|user-provided API keys?/i;
const firstSentence = (s: string | undefined, max: number) => truncate(oneLine(s).split(/[.;](?=\s|$)/)[0] ?? '', max);
const cents = (n: number) => Math.round(n * 100) / 100;
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const asSentence = (s: string) => (/[.!?…]$/.test(s) ? s : s + '.');
const fingerprint = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();

let _guides: SwitchGuide[] | null = null;

/** All curated switch guides from data/switch-guides.json (cached). */
export function getSwitchGuides(): SwitchGuide[] {
    if (_guides) return _guides;
    _guides = switchGuidesJson as SwitchGuide[];
    return _guides!;
}

/** Resolve a guide against the tool catalog; null when either slug is unknown or self-referential. */
export function resolveSwitchGuide(g: SwitchGuide): ResolvedSwitchGuide | null {
    const fromTool = getToolBySlug(g.from);
    const toTool = getToolBySlug(g.to);
    if (!fromTool || !toTool || fromTool.slug === toTool.slug) return null;

    const latest = [fromTool.enriched?.lastUpdated, toTool.enriched?.lastUpdated]
        .filter((d): d is string => Boolean(d))
        .map(d => ({ raw: d, time: new Date(d).getTime() }))
        .filter(d => !isNaN(d.time))
        .sort((a, b) => a.time - b.time)
        .at(-1);

    const fromProfile = TOOL_RULES_PROFILE[g.from] ?? null;
    const toProfile = TOOL_RULES_PROFILE[g.to] ?? null;
    const converterHref = fromProfile && toProfile && fromProfile.format !== toProfile.format
        ? `/tools/rules-converter?from=${fromProfile.format}&to=${toProfile.format}`
        : null;
    return { ...g, fromTool, toTool, lastUpdated: latest?.raw ?? null, fromProfile, toProfile, converterHref, costDelta: computeCostDelta(fromTool, toTool) };
}

/** Every guide with both tools resolved, in data-file order. */
export function getResolvedSwitchGuides(): ResolvedSwitchGuide[] {
    return getSwitchGuides()
        .map(resolveSwitchGuide)
        .filter((g): g is ResolvedSwitchGuide => g !== null);
}

/** All guides that touch the given tool slug in either direction. */
export function getSwitchGuidesForTool(slug: string): ResolvedSwitchGuide[] {
    return getResolvedSwitchGuides().filter(g => g.from === slug || g.to === slug);
}

/** Guides between two tools in either direction (a pair can have both A→B and B→A). */
export function getSwitchGuidesBetween(a: string, b: string): ResolvedSwitchGuide[] {
    return getResolvedSwitchGuides().filter(g => (g.from === a && g.to === b) || (g.from === b && g.to === a));
}

/** The reverse guide (B→A) for a resolved A→B guide, if it exists. */
export function getReverseGuide(g: ResolvedSwitchGuide): ResolvedSwitchGuide | null {
    return getResolvedSwitchGuides().find(o => o.from === g.to && o.to === g.from) ?? null;
}

/**
 * Per-seat entry-price delta derived from the cost calculator catalog.
 * Open-source destinations are priced on their free BYOK path (optional paid
 * plans are mentioned, not counted); destinations without a parseable seat
 * price quote their own pricing sentence instead of claiming a saving.
 */
export function computeCostDelta(fromTool: Tool, toTool: Tool): CostDelta {
    const fromItem = buildCalculatorToolCatalog([fromTool])[0];
    const toItem = buildCalculatorToolCatalog([toTool])[0];
    const detail = toTool.enriched?.pricingDetail ?? '';
    const fromMonthly = fromItem?.entryMonthly ?? 0;
    const fromPlanName = fromItem?.plans[0]?.name ?? null;
    const byok = Boolean(toItem && (toItem.openSource || (toItem.entryMonthly === 0 && BYOK.test(detail))));
    const optional = byok && toItem?.plans[0] ? { name: toItem.plans[0].name, monthly: toItem.plans[0].monthlyAmount } : null;
    const toMonthly = byok ? 0 : toItem?.entryMonthly ?? 0;
    const toPlanName = byok ? null : toItem?.plans[0]?.name ?? null;
    const delta = cents(toMonthly - fromMonthly);
    const fromSeat = fromPlanName ? `${fromTool.slug}:${encodeURIComponent(fromPlanName)}` : null;

    let kind: CostDelta['kind'];
    let summary: string;
    let calculatorHref: string;
    let calculatorLabel: string;
    if (byok) {
        kind = 'byok';
        const opt = optional ? ` (${optional.name} is an optional ${money(optional.monthly)}/mo plan.)` : '';
        summary = fromMonthly > 0
            ? `Shifts from a fixed ${money(fromMonthly)}/mo seat to pay-as-you-go API tokens.${opt}`
            : `Both are free or open-source at the entry tier; costs come from API token usage.${opt}`;
        calculatorHref = '/tools/cost-calculator?team=10&seats=none&preset=daily';
        calculatorLabel = 'Model API token spend for 10 devs';
    } else if (toMonthly === 0) {
        kind = 'unlisted';
        const first = firstSentence(detail, 140);
        summary = `${toTool.name} has no fixed per-seat price listed${first ? ` — ${asSentence(first)}` : '.'}${fromMonthly > 0 ? ` Compare it against ${fromTool.name}'s ${money(fromMonthly)}/mo seat before switching.` : ''}`;
        calculatorHref = `/tools/cost-calculator?team=10&seats=${fromSeat ?? 'none'}`;
        calculatorLabel = fromSeat ? `Model your current ${fromTool.name} seats` : 'Open the cost calculator';
    } else {
        calculatorHref = `/tools/cost-calculator?team=10&seats=${toTool.slug}:${encodeURIComponent(toPlanName!)}`;
        calculatorLabel = 'Simulate 10-dev cost delta';
        if (Math.abs(delta) < 1) {
            kind = 'same';
            summary = delta === 0
                ? `Same entry price (${money(toMonthly)}/mo per seat).`
                : `Effectively the same entry price (${money(fromMonthly)} vs ${money(toMonthly)} per seat/mo).`;
        } else if (delta < 0) {
            kind = 'cheaper';
            summary = `Saves ${money(-delta)}/seat/mo (${money(cents(-delta * 120))}/yr for a 10-dev team).`;
        } else {
            kind = 'pricier';
            summary = `Costs ${money(delta)}/seat/mo more (+${money(cents(delta * 120))}/yr for a 10-dev team).`;
        }
    }
    const label = { cheaper: `−${money(-delta)}/seat`, pricier: `+${money(delta)}/seat`, same: 'Same price', byok: 'BYOK', unlisted: 'See pricing' }[kind];
    return { fromMonthlyPerSeat: fromMonthly, toMonthlyPerSeat: toMonthly, fromPlanName, toPlanName, toOptionalPlan: optional, monthlyDeltaPerSeat: delta, annualDeltaTeam10: cents(delta * 120), kind, summary, label, calculatorHref, calculatorLabel };
}

/** Entry-plan cell label for spec sheets: "BYOK (optional X $10/mo)" for BYOK destinations. */
export function entryPlanLabel(d: CostDelta, side: 'from' | 'to'): string {
    if (side === 'to' && d.toOptionalPlan) return `BYOK (optional ${d.toOptionalPlan.name} ${money(d.toOptionalPlan.monthly)}/mo)`;
    const monthly = side === 'from' ? d.fromMonthlyPerSeat : d.toMonthlyPerSeat;
    const plan = side === 'from' ? d.fromPlanName : d.toPlanName;
    return plan ? `${plan} (${money(monthly)}/mo)` : monthly > 0 ? `${money(monthly)}/mo` : '—';
}

const TRANSITION_SENTENCE: Record<TransitionType, string> = {
    'ide-to-ide': 'You stay inside a full editor, but the agent surface moves — expect a short relearning curve for where edits, diffs and chat live.',
    'ide-to-cli': "You'll drive edits from the terminal instead of an editor panel; keep your editor for review and let the agent own multi-file changes.",
    'cli-to-ide': 'You move from a terminal workflow to a visual editor with diffs and inline agent edits — keep your prompt habits, drop the command memorization.',
    'cli-to-cli': 'You stay in the terminal; mostly the flags, config files and model defaults change — your repo habits carry over.',
    'plugin-to-ide': 'Your assistant moves from an inline plugin to a full agent-first editor — expect multi-file edits with repo-wide context instead of autocomplete.',
    'plugin-to-cli': 'Your assistant moves from inline suggestions to a terminal agent that plans, edits files and runs commands across the repo.',
    'plugin-to-plugin': 'You stay in your editor with a different plugin — mostly new keybindings, approval flow and pricing model.',
    'saas-to-byok': 'You trade a managed subscription for a bring-your-own-key setup — configure provider credentials and watch token spend instead of seat count.',
    'workflow-shift': 'The workflow itself changes — map your current process onto the new tool\'s model before rolling it out to the whole team.',
};

/** The 4-step migration checklist rendered on every switch guide. */
export function buildMigrationSteps(g: ResolvedSwitchGuide): MigrationStep[] {
    const from = g.fromTool.name;
    const to = g.toTool.name;

    let audit: MigrationStep;
    if (g.fromProfile && g.converterHref && g.toProfile) {
        audit = { name: `Audit & export your ${from} rules`, text: `${from} reads repo-level rules from ${g.fromProfile.path}. Convert them to ${g.toProfile.path} with the Rules Converter, then review the output before committing.`, url: g.converterHref };
    } else if (g.fromProfile && g.toProfile) {
        audit = { name: `Audit & export your ${from} rules`, text: `${from} reads repo-level rules from ${g.fromProfile.path}; ${to} reads the same format, so copy the file as-is to ${g.toProfile.path}.` };
    } else if (g.fromProfile) {
        audit = { name: `Audit & export your ${from} rules`, text: `${from} reads repo-level rules from ${g.fromProfile.path}. ${to} isn't covered by the Rules Converter — check its own project-config docs and keep these notes as team docs.` };
    } else {
        audit = { name: `Audit & export your ${from} rules`, text: `List the prompts, snippets and settings you rely on in ${from}; ${to} ${g.toProfile ? `reads ${g.toProfile.path} — port the ones that still apply` : `isn't covered by the Rules Converter — keep this list as team docs and check ${to}'s own project-config docs`}.` };
    }

    const siteUrl = /^https?:\/\//i.test(g.toTool.url ?? '') ? addOutboundUtmParams(g.toTool.url) : undefined;
    const install: MigrationStep = {
        name: `Install & configure ${to}`,
        text: `${g.toProfile?.installHint ? `Install ${to} with \`${g.toProfile.installHint}\`.` : `Download ${to} from the official site.`}${g.toProfile?.note ? ` ${g.toProfile.note}` : ''} Pricing: ${humanizePricing(g.toTool.enriched?.pricing)}${g.costDelta.toPlanName ? ` — entry plan ${g.costDelta.toPlanName} at ${money(g.costDelta.toMonthlyPerSeat)}/mo` : ''}.`,
        url: siteUrl,
    };

    const bestFor = g.toTool.enriched?.bestFor;
    const workflow: MigrationStep = {
        name: `Adapt your daily workflow (${g.fromTool.categoryShort} → ${g.toTool.categoryShort})`,
        text: `${TRANSITION_SENTENCE[g.transitionType]}${bestFor ? ` ${asSentence(`${to} is best for ${lowerFirst(truncate(bestFor, 200))}`)}` : ''}`,
    };

    const pilot: MigrationStep = {
        name: 'Run a one-week parallel pilot, then reallocate seats',
        text: `${g.costDelta.summary} Keep ${from} active for one sprint while ${to} handles new tasks; cancel seats only after velocity holds.`,
        url: g.costDelta.calculatorHref,
    };

    return [audit, install, workflow, pilot];
}

/** What the switch buys and what it costs, derived from enriched data only. */
export function buildTradeoffs(g: ResolvedSwitchGuide): Tradeoffs {
    const from = g.fromTool.name;
    const to = g.toTool.name;
    const gain: string[] = [];
    if (g.toTool.enriched?.bestFor) gain.push(asSentence(`${to} is best for ${lowerFirst(truncate(g.toTool.enriched.bestFor, 200))}`));
    const fromFingerprints = new Set((g.fromTool.enriched?.keyFeatures ?? []).map(fingerprint));
    for (const feature of g.toTool.enriched?.keyFeatures ?? []) {
        if (gain.length >= 4) break;
        if (!fromFingerprints.has(fingerprint(feature))) gain.push(asSentence(truncate(feature, 160)));
    }
    const giveUp: string[] = [];
    if (g.fromTool.enriched?.bestFor) giveUp.push(asSentence(`${from} is positioned for ${lowerFirst(truncate(g.fromTool.enriched.bestFor, 200))} — confirm ${to} covers that before cancelling seats`));
    if (g.toTool.enriched?.notIdealFor) giveUp.push(asSentence(`${to} is not ideal for ${lowerFirst(truncate(g.toTool.enriched.notIdealFor, 200))}`));
    const together = g.fromTool.categoryShort === g.toTool.categoryShort
        ? `Running both is mostly redundant — pilot ${to} on one repo for a sprint, then pick one.`
        : `Many teams run both: keep ${from} for ${g.fromTool.categoryShort.toLowerCase()} work and use ${to} for ${g.toTool.categoryShort.toLowerCase()} tasks during the transition.`;
    return { gain, giveUp, together };
}

/** AEO FAQs for the switch guide - every answer comes from resolved data. */
export function buildSwitchFaqs(g: ResolvedSwitchGuide): { q: string; a: string }[] {
    const from = g.fromTool.name;
    const to = g.toTool.name;
    const { giveUp, together } = buildTradeoffs(g);

    let rules: string;
    if (g.converterHref && g.fromProfile && g.toProfile) {
        rules = `${from} reads ${g.fromProfile.path} and ${to} reads ${g.toProfile.path}. Run them through the Rules Converter (${SITE}${g.converterHref}) and review the output before committing.`;
    } else if (g.fromProfile && g.toProfile) {
        rules = `Both tools use the same rules format — copy ${g.fromProfile.path} to ${g.toProfile.path} as-is.`;
    } else if (g.fromProfile) {
        rules = `${to} isn't covered by the Rules Converter — check its own project-config docs and keep your ${g.fromProfile.path} contents as team docs.`;
    } else if (g.toProfile) {
        rules = `${from} isn't covered by the Rules Converter — recreate your saved prompts and settings in ${g.toProfile.path}.`;
    } else {
        rules = 'Neither tool is covered by the Rules Converter — carry prompts and settings over manually as team docs, and check each tool\'s own config docs.';
    }

    const seat = (name: string, monthly: number, plan: string | null) =>
        plan ? `${name} starts at ${plan} (${money(monthly)}/mo)` : monthly > 0 ? `${name} starts at ${money(monthly)}/mo` : `${name} has no listed per-seat plan`;

    return [
        { q: `How do I convert my ${from} rules to ${to}?`, a: rules },
        { q: `Is ${to} cheaper than ${from}?`, a: `${seat(from, g.costDelta.fromMonthlyPerSeat, g.costDelta.fromPlanName)}; ${seat(to, g.costDelta.toMonthlyPerSeat, g.costDelta.toPlanName)}. ${g.costDelta.summary}` },
        { q: `What do I lose when switching from ${from} to ${to}?`, a: giveUp.length ? giveUp.join(' ') : `Nothing major on paper — ${to} covers the same ground, but pilot it on one repo before cancelling seats.` },
        { q: `Can I use ${from} and ${to} together?`, a: together },
    ];
}

/** One-paragraph "should I switch" answer: the curated reason plus the cost delta. */
export function switchQuickAnswer(g: ResolvedSwitchGuide): string {
    return `${g.primaryReason} ${g.costDelta.summary}`;
}

/** JSON-LD @graph for a switch page: WebPage + HowTo + FAQPage + BreadcrumbList. */
export function switchGuideJsonLd(g: ResolvedSwitchGuide): Record<string, unknown> {
    const from = g.fromTool.name;
    const to = g.toTool.name;
    const pageUrl = `${SITE}/switch/${g.slug}`;
    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebPage",
                "@id": `${pageUrl}#page`,
                "url": pageUrl,
                "name": `Switch from ${from} to ${to}`,
                "description": `Step-by-step migration guide from ${from} to ${to}: config file mapping, 4-step checklist, seat cost delta and trade-offs.`,
                "inLanguage": "en",
                ...(g.lastUpdated ? { "dateModified": g.lastUpdated } : {}),
                "isPartOf": { "@type": "WebSite", "@id": `${SITE}/#website`, "url": SITE, "name": "ai.dosa.dev - Awesome AI Tools" },
                "publisher": ORGANIZATION,
                "author": { "@id": ORGANIZATION["@id"] },
                "primaryImageOfPage": { "@type": "ImageObject", "url": `${SITE}/images/og/switch/${g.slug}.png`, "width": 1200, "height": 630 },
                "speakable": { "@type": "SpeakableSpecification", "cssSelector": ["h1", ".sw-intro", ".sw-answer"] },
                "about": [g.fromTool, g.toTool].map(t => ({
                    "@type": "SoftwareApplication",
                    "name": t.name,
                    "url": t.url || `${SITE}/tools/${t.slug}`,
                    "applicationCategory": "DeveloperApplication",
                })),
            },
            {
                "@type": "HowTo",
                "name": `How to switch from ${from} to ${to}`,
                "totalTime": "P7D",
                "step": buildMigrationSteps(g).map((s, i) => ({
                    "@type": "HowToStep",
                    "position": i + 1,
                    "name": s.name,
                    "text": s.text,
                    ...(s.url ? { "url": s.url.startsWith('http') ? s.url : `${SITE}${s.url}` } : {}),
                })),
            },
            {
                "@type": "FAQPage",
                "mainEntity": buildSwitchFaqs(g).map(f => ({
                    "@type": "Question",
                    "name": f.q,
                    "acceptedAnswer": { "@type": "Answer", "text": f.a },
                })),
            },
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    { "@type": "ListItem", "position": 1, "name": "Home", "item": SITE },
                    { "@type": "ListItem", "position": 2, "name": "Switch", "item": `${SITE}/switch` },
                    { "@type": "ListItem", "position": 3, "name": `${from} → ${to}`, "item": pageUrl },
                ],
            },
        ],
    };
}

/** Markdown mirror of a switch guide (/switch/<slug>.md) for LLM and answer-engine consumers. */
export function switchGuideMarkdown(g: ResolvedSwitchGuide): string {
    const from = g.fromTool.name;
    const to = g.toTool.name;
    const cell = (s?: string) => oneLine(s).replace(/\|/g, '\\|') || '-';
    const row = (label: string, pick: (t: Tool, profile: ToolRulesProfile | null) => string | undefined) =>
        `| ${label} | ${cell(pick(g.fromTool, g.fromProfile))} | ${cell(pick(g.toTool, g.toProfile))} |`;
    const entry = (side: 'from' | 'to') => entryPlanLabel(g.costDelta, side);
    const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${money(Math.abs(n))}`;
    const compare = getResolvedComparisons().find(c => (c.a === g.from && c.b === g.to) || (c.a === g.to && c.b === g.from));
    const reverse = getReverseGuide(g);
    const { gain, giveUp, together } = buildTradeoffs(g);

    const lines = [
        `# Switch from ${from} to ${to}`,
        '',
        `> ${g.primaryReason}`,
        '',
        `Source: ${SITE}/switch/${g.slug} · ${g.group}${g.lastUpdated ? ` · Updated ${g.lastUpdated}` : ''} · Published by dosa.dev`,
        '',
        '## Why switch',
        '',
        switchQuickAnswer(g),
        '',
        '## Cost delta',
        '',
        `| | ${cell(from)} | ${cell(to)} |`,
        '|---|---|---|',
        `| Entry paid plan | ${entry('from')} | ${entry('to')} |`,
        `| Per-seat monthly delta | ${signed(g.costDelta.monthlyDeltaPerSeat)} | |`,
        `| 10-dev team annual delta | ${signed(g.costDelta.annualDeltaTeam10)} | |`,
        '',
        `${g.costDelta.summary} Model it: ${SITE}${g.costDelta.calculatorHref}`,
        '',
        '## Config migration',
        '',
        `- ${from} rules: ${g.fromProfile ? `\`${g.fromProfile.path}\`` : 'not covered by the Rules Converter — check its own project-config docs'}`,
        `- ${to} rules: ${g.toProfile ? `\`${g.toProfile.path}\`` : 'not covered by the Rules Converter — check its own project-config docs'}`,
    ];
    if (g.converterHref) lines.push(`- Convert with the Rules Converter: ${SITE}${g.converterHref}`);
    lines.push('', '## 4-step checklist', '');
    buildMigrationSteps(g).forEach((s, i) => lines.push(`${i + 1}. **${s.name}** — ${oneLine(s.text)}${s.url ? ` (${s.url.startsWith('http') ? s.url : `${SITE}${s.url}`})` : ''}`));
    lines.push(
        '',
        '## What you gain',
        '',
        ...(gain.length ? gain.map(s => `- ${s}`) : ['- See the spec sheet below.']),
        '',
        '## What you give up',
        '',
        ...(giveUp.length ? giveUp.map(s => `- ${s}`) : ['- Nothing major on paper.']),
        '',
        `Running both: ${together}`,
        '',
        '## Spec sheet',
        '',
        `| | [${cell(from)}](${SITE}/tools/${g.fromTool.slug}) | [${cell(to)}](${SITE}/tools/${g.toTool.slug}) |`,
        '|---|---|---|',
        row('Company', t => t.company),
        row('Category', t => t.categoryClean),
        row('Pricing', t => humanizePricing(t.enriched?.pricing)),
        `| Entry paid plan | ${entry('from')} | ${entry('to')} |`,
        row('Rules file', (_t, p) => p?.path),
        '',
        '## FAQ',
        '',
    );
    for (const f of buildSwitchFaqs(g)) lines.push(`### ${f.q}`, '', f.a, '');
    lines.push('## Links', '');
    for (const t of [g.fromTool, g.toTool]) lines.push(`- ${t.name} review: ${SITE}/tools/${t.slug}`);
    if (compare) lines.push(`- ${compare.toolA.name} vs ${compare.toolB.name}: ${SITE}/compare/${compare.slug}`);
    if (reverse) lines.push(`- Switch back (${reverse.fromTool.name} ← ${reverse.toTool.name}): ${SITE}/switch/${reverse.slug}`);
    if (g.converterHref) lines.push(`- Rules Converter: ${SITE}${g.converterHref}`);
    lines.push(`- Cost calculator: ${SITE}${g.costDelta.calculatorHref}`, '');
    return lines.join('\n');
}
