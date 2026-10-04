import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';
import { normalizeUsernameToken } from './stacks';

const matcher = new RegExpMatcher({
    ...englishDataset.build(),
    ...englishRecommendedTransformers,
});

const STAFF_AFFIXES = ['official', 'team', 'support', 'staff', 'admin', 'hq', 'help'];

export function joinSpelledOutLetters(text: string): string {
    return text.replace(
        /(?<![a-z0-9])([a-z0-9](?:[-_.\s]+[a-z0-9]){2,})(?![a-z0-9])/gi,
        letters => letters.replace(/[-_.\s]+/g, ''),
    );
}

export function containsProfanity(text: string): boolean {
    return matcher.hasMatch(text) || matcher.hasMatch(joinSpelledOutLetters(text));
}

export function brandTokens(tools: ReadonlyArray<{ slug: string; name: string; company: string }>): Set<string> {
    const tokens = new Set<string>();
    for (const tool of tools) {
        const candidates = [
            tool.slug,
            normalizeUsernameToken(tool.name),
            normalizeUsernameToken(tool.company.replace(/\s*\([^)]*\)/g, '')),
        ];
        for (const token of candidates) {
            if (token.length >= 3) tokens.add(token);
        }
    }
    return tokens;
}

export function impersonatesBrand(username: string, brands: Set<string>): boolean {
    if (brands.has(username)) return true;

    for (const affix of STAFF_AFFIXES) {
        const prefix = `${affix}-`;
        if (username.startsWith(prefix) && brands.has(username.slice(prefix.length))) return true;

        const suffix = `-${affix}`;
        if (username.endsWith(suffix) && brands.has(username.slice(0, -suffix.length))) return true;
    }

    return false;
}

export type UsernamePolicyResult =
    | { ok: true }
    | { ok: false; reason: 'offensive' | 'impersonation' };

export function checkUsernamePolicy(username: string, brands: Set<string>): UsernamePolicyResult {
    if (containsProfanity(username)) return { ok: false, reason: 'offensive' };
    if (impersonatesBrand(username, brands)) return { ok: false, reason: 'impersonation' };
    return { ok: true };
}

export const USERNAME_UNAVAILABLE_MESSAGE = "This username isn't available.";

export type PublicTextViolation = {
    field: 'title' | 'description' | 'purpose' | 'usageNotes';
    toolSlug?: string;
};

export function findPublicTextViolation(
    stack: { title: string; description: string | null } | null,
    items: ReadonlyArray<{ slug: string; purpose: string; usageNotes: string | null; enabled?: boolean }>,
): PublicTextViolation | null {
    if (stack && containsProfanity(stack.title)) return { field: 'title' };
    if (stack?.description && containsProfanity(stack.description)) return { field: 'description' };

    for (const item of items) {
        if (item.enabled === false) continue;
        if (containsProfanity(item.purpose)) return { field: 'purpose', toolSlug: item.slug };
        if (item.usageNotes && containsProfanity(item.usageNotes)) {
            return { field: 'usageNotes', toolSlug: item.slug };
        }
    }

    return null;
}

export function publicTextViolationMessage(violation: PublicTextViolation): string {
    if (violation.field === 'title') return "This stack title isn't allowed on public stacks.";
    if (violation.field === 'description') return "This description isn't allowed on public stacks.";
    if (violation.field === 'purpose') return `The purpose for ${violation.toolSlug} isn't allowed on public stacks.`;
    return `The usage notes for ${violation.toolSlug} aren't allowed on public stacks.`;
}
