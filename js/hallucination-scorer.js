/**
 * hallucination-scorer.js
 * Heuristic-based hallucination risk scorer for LLM prompts.
 *
 * Analyses user prompts for patterns known to increase hallucination risk:
 *  - Lack of grounding context
 *  - Forced formatting without examples
 *  - Ambiguous negations
 *  - High fact-density requests
 *  - Temporal references without anchoring
 *  - Authority appeals / "always correct" pressure
 *  - Multi-step reasoning chains
 *  - Numeric precision demands
 */

// ---------------------------------------------------------------------------
// URL State
// ---------------------------------------------------------------------------

const URL_PARAM     = 'text';
const MAX_URL_CHARS = 2000;

export function getTextFromURL() {
    try {
        const p = new URLSearchParams(window.location.search);
        return p.get(URL_PARAM) ?? '';
    } catch { return ''; }
}

export function syncTextToURL(text) {
    const url = new URL(window.location);
    if (text) {
        url.searchParams.set(URL_PARAM, text.slice(0, MAX_URL_CHARS));
    } else {
        url.searchParams.delete(URL_PARAM);
    }
    window.history.replaceState({}, '', url);
}

// ---------------------------------------------------------------------------
// Risk flag definitions
// ---------------------------------------------------------------------------

/**
 * Each checker receives the raw text and returns either null (no issue)
 * or a { flag, description, weight } object.
 *
 * weight: 0–30 contribution to final score; flags are additive.
 */
const CHECKERS = [
    // 1. Lack of grounding context
    {
        id: 'no-context',
        check(text) {
            const words = text.trim().split(/\s+/).length;
            const hasContext = /(?:context|background|given that|based on|according to|here is|the following|below is|source:|reference:)/i.test(text);
            const hasCodeBlock = /```[\s\S]*?```/.test(text);
            const hasQuote = /"[^"]{20,}"/.test(text) || /> .{20,}/.test(text);

            if (words > 15 && !hasContext && !hasCodeBlock && !hasQuote) {
                return {
                    flag: 'No Grounding Context',
                    description: 'The prompt asks for information without providing reference material, context, or source data. LLMs may fabricate details to fill the gap.',
                    weight: 18,
                };
            }
            return null;
        },
    },

    // 2. Forced formatting without examples
    {
        id: 'forced-format',
        check(text) {
            const forcesFormat = /(?:format (?:as|it as|the output as|your (?:response|answer) as)|in (?:JSON|CSV|XML|YAML|table|markdown table) format|output (?:as|in)|respond (?:only )?(?:with|in)|use (?:this|the following) format)/i.test(text);
            const hasExample = /(?:example|e\.g\.|for instance|like this|sample|here'?s? (?:a|an|the) )/i.test(text);
            const hasTemplate = /```[\s\S]*?```/.test(text) || /\{[\s\S]*?\}/.test(text);

            if (forcesFormat && !hasExample && !hasTemplate) {
                return {
                    flag: 'Forced Format Without Examples',
                    description: 'Requesting a specific output format without showing an example increases the chance of malformed or hallucinated structure.',
                    weight: 14,
                };
            }
            return null;
        },
    },

    // 3. Ambiguous negations
    {
        id: 'ambiguous-negation',
        check(text) {
            const negations = text.match(/(?:don'?t|do not|never|avoid|without|exclude|not (?:include|mention|use|add|provide))\b/gi) || [];
            if (negations.length >= 2) {
                return {
                    flag: 'Multiple Negation Constraints',
                    description: `Found ${negations.length} negation instructions. LLMs often struggle with "don\'t" directives, sometimes producing the exact content they\'re told to avoid.`,
                    weight: Math.min(20, 8 + negations.length * 3),
                };
            }
            return null;
        },
    },

    // 4. High fact-density requests
    {
        id: 'fact-density',
        check(text) {
            const factIndicators = [
                /(?:list|name|enumerate|give me|provide|tell me)\s+(?:all|every|each|\d+)/i,
                /(?:specific|exact|precise)\s+(?:numbers?|figures?|statistics?|data|dates?|facts?)/i,
                /(?:how many|what percentage|what year|who (?:invented|discovered|founded|created))/i,
                /(?:compare|rank|order|sort)\s+(?:all|these|the)\b/i,
            ];
            const matches = factIndicators.filter(p => p.test(text));
            if (matches.length >= 2) {
                return {
                    flag: 'High Fact-Density Request',
                    description: 'Asking for multiple specific facts, numbers, or data points in one prompt increases hallucination risk since each claim is a potential fabrication point.',
                    weight: 20,
                };
            }
            if (matches.length === 1) {
                return {
                    flag: 'Fact Recall Request',
                    description: 'Requesting specific factual data (dates, numbers, names) from memory. LLMs may confidently state plausible but incorrect facts.',
                    weight: 10,
                };
            }
            return null;
        },
    },

    // 5. Temporal references without anchoring
    {
        id: 'temporal-drift',
        check(text) {
            const temporalWords = /(?:latest|newest|most recent|current|today|now|up.to.date|this year|this month|real.time|live data)/i;
            const hasDate = /\b20[12]\d\b/.test(text) || /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20[12]\d/i.test(text);
            const hasAsOf = /(?:as of|since|after|before|until)\s+\w/i.test(text);

            if (temporalWords.test(text) && !hasDate && !hasAsOf) {
                return {
                    flag: 'Unanchored Temporal Reference',
                    description: 'References to "latest" or "current" data without a specific date. LLMs have knowledge cutoffs and may present outdated information as current.',
                    weight: 16,
                };
            }
            return null;
        },
    },

    // 6. Authority pressure / confidence forcing
    {
        id: 'authority-pressure',
        check(text) {
            const pressurePatterns = /(?:you must be (?:correct|accurate|right)|make sure (?:it'?s?|this is) (?:correct|accurate|right|true)|do not (?:guess|make (?:anything )?up|hallucinate|fabricate)|be 100% (?:sure|certain|accurate)|only (?:state|provide|give) (?:verified|confirmed|true|accurate) (?:facts?|information|data))/i;

            if (pressurePatterns.test(text)) {
                return {
                    flag: 'Authority Pressure',
                    description: 'Instructing an LLM to "be correct" or "not hallucinate" does not reduce hallucinations — it may actually increase confident-sounding fabrications.',
                    weight: 12,
                };
            }
            return null;
        },
    },

    // 7. Multi-step reasoning chains
    {
        id: 'reasoning-chain',
        check(text) {
            const stepIndicators = [
                /(?:first|step 1|1[\.\)]\s)/i,
                /(?:then|next|step 2|2[\.\)]\s|after that)/i,
                /(?:finally|lastly|step [3-9]|[3-9][\.\)]\s)/i,
            ];
            const multiStep = stepIndicators.filter(p => p.test(text)).length;
            const hasNumberedStep = /(?:step [1-9]|\b[1-9][\.\)]\s)/i.test(text);
            const chainWords = /(?:therefore|hence|thus|because of this|as a result|consequently|it follows that)/i;

            if ((multiStep >= 3 && hasNumberedStep) || (multiStep >= 2 && chainWords.test(text) && hasNumberedStep)) {
                return {
                    flag: 'Long Reasoning Chain',
                    description: 'Multi-step reasoning prompts accumulate errors at each step. The LLM may produce a plausible-looking chain with a flawed intermediate step.',
                    weight: 14,
                };
            }
            return null;
        },
    },

    // 8. Numeric precision demands
    {
        id: 'numeric-precision',
        check(text) {
            const numericDemands = /(?:exact (?:number|count|figure|amount|value|percentage|price|cost)|how (?:much|many) exactly|precise (?:figure|number|count|value)|to the (?:nearest|exact)|decimal (?:places?|points?))/i;
            if (numericDemands.test(text)) {
                return {
                    flag: 'Numeric Precision Demand',
                    description: 'Requesting exact numbers or precise calculations. LLMs perform approximate reasoning and frequently produce plausible but incorrect numeric outputs.',
                    weight: 16,
                };
            }
            return null;
        },
    },

    // 9. Persona / role-play that implies domain expertise
    {
        id: 'expert-persona',
        check(text) {
            const personaPattern = /(?:you are (?:a|an|the)|act as (?:a|an|the)|pretend (?:to be|you'?re)|role.?play as)\s+(?:\w+\s+){0,3}(?:expert|professor|doctor|lawyer|scientist|engineer|analyst|specialist|consultant|advisor)/i;
            if (personaPattern.test(text)) {
                return {
                    flag: 'Expert Persona Assignment',
                    description: 'Assigning a domain-expert persona can make the LLM produce more authoritative-sounding responses without improving factual accuracy.',
                    weight: 10,
                };
            }
            return null;
        },
    },

    // 10. Prompt length vs specificity
    {
        id: 'vague-prompt',
        check(text) {
            const words = text.trim().split(/\s+/).length;
            const hasQuestion = /\?/.test(text);
            const isVague = words <= 8 && hasQuestion;
            const broadTopics = /(?:explain|describe|tell me about|what is|how does|overview of)\s+\w+/i;

            if (isVague && broadTopics.test(text)) {
                return {
                    flag: 'Vague Open-Ended Query',
                    description: 'Very short, broad questions give the LLM maximum room to fill in details, increasing the chance of plausible-sounding but inaccurate responses.',
                    weight: 12,
                };
            }
            return null;
        },
    },
];

// ---------------------------------------------------------------------------
// Main scoring function
// ---------------------------------------------------------------------------

/**
 * Analyse a prompt for hallucination risk patterns.
 *
 * @param {string} text — the user prompt to analyse
 * @returns {{ score: number, level: 'Safe'|'Medium'|'High', flags: Array<{flag: string, description: string, weight: number}> }}
 */
export function scoreHallucinationRisk(text) {
    if (!text || text.trim().length === 0) {
        return { score: 0, level: 'Safe', flags: [] };
    }

    const flags = [];
    for (const checker of CHECKERS) {
        const result = checker.check(text);
        if (result) flags.push(result);
    }

    const rawScore = flags.reduce((sum, f) => sum + f.weight, 0);
    const score = Math.min(100, rawScore);

    let level = 'Safe';
    if (score >= 60) level = 'High';
    else if (score >= 30) level = 'Medium';

    // Sort flags by weight descending
    flags.sort((a, b) => b.weight - a.weight);

    return { score, level, flags };
}

// ---------------------------------------------------------------------------
// Summary builder
// ---------------------------------------------------------------------------

export function buildSummaryText(text, result) {
    const lines = [
        `Hallucination Risk Analysis — ai.dosa.dev/tools/hallucination-scorer`,
        `Prompt: ${text.length} chars, ~${text.trim().split(/\s+/).length} words`,
        `Risk Score: ${result.score}/100 (${result.level})`,
        '',
    ];

    if (result.flags.length > 0) {
        lines.push('Risk Flags:');
        for (const f of result.flags) {
            lines.push(`  [${f.weight}] ${f.flag}`);
            lines.push(`       ${f.description}`);
        }
    } else {
        lines.push('No significant risk flags detected.');
    }

    return lines.join('\n');
}
