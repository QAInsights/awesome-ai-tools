export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;

export const RESERVED_USERNAMES = new Set([
    'admin', 'api', 'settings', 'stacks', 'stack', 'new', 'edit', 'help', 'login', 'signin',
    'signout', 'logout', 'me', 'u', 'user', 'users', 'root', 'support', 'about', 'www', 'ai',
    'dosa', 'null', 'undefined', 'favorites', 'zap', 'tools', 'best', 'compare', 'blog', 'news',
    'trending', 'qainsights', 'staff', 'moderator', 'mod', 'official', 'security', 'team',
    'system', 'sitemap', 'robots', 'llms', 'owner', 'anonymous', 'devin', 'privacy', 'terms',
    'contact',
]);

export const MAX_STACKS_PER_USER = 20;
export const MAX_ITEMS_PER_STACK = 30;
export const MAX_STACK_TITLE_LENGTH = 80;
export const MAX_STACK_DESCRIPTION_LENGTH = 280;
export const MAX_ITEM_PURPOSE_LENGTH = 60;
export const MAX_ITEM_USAGE_NOTES_LENGTH = 500;
export const MAX_STACK_SLUG_LENGTH = 60;

export type ValidationResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: string };

export interface StackInput {
    title: string;
    description: string | null;
    slug?: string;
}

export interface StackItemInput {
    slug: string;
    purpose: string;
    usageNotes: string | null;
    enabled: boolean;
    position: number;
}

function stripControls(value: string, allowNewline = false): string {
    return value
        .replace(allowNewline
            ? /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g
            : /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, '')
        .trim();
}

function characterLength(value: string): number {
    return Array.from(value).length;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function normalizedSlug(value: string): string {
    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, MAX_STACK_SLUG_LENGTH)
        .replace(/-+$/g, '');
}

export function validateUsername(value: unknown): ValidationResult<string> {
    if (typeof value !== 'string') {
        return { ok: false, error: 'Enter a username.' };
    }

    const username = value.trim().toLowerCase();
    if (username.length < 3 || username.length > 30 || !USERNAME_PATTERN.test(username) || username.includes('--')) {
        return {
            ok: false,
            error: 'Usernames must be 3–30 characters and use lowercase letters, numbers, and single hyphens.',
        };
    }
    if (RESERVED_USERNAMES.has(username)) {
        return { ok: false, error: 'That username is reserved.' };
    }
    return { ok: true, value: username };
}

export function suggestUsername(
    githubUsername?: string | null,
    email?: string | null,
    displayName?: string | null,
): string {
    const sources = [
        githubUsername,
        typeof email === 'string' ? email.split('@', 1)[0] : '',
        displayName,
    ];

    for (const source of sources) {
        if (typeof source !== 'string' || !source.trim()) continue;
        let suggestion = source
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 30)
            .replace(/-+$/g, '');

        if (suggestion.length < 3) suggestion = suggestion.padEnd(3, '0');
        if (RESERVED_USERNAMES.has(suggestion)) suggestion += '-dev';
        const validated = validateUsername(suggestion);
        if (validated.ok) return validated.value;
    }

    return 'user-dev';
}

export function slugifyStackName(title: string): string {
    const slug = normalizedSlug(typeof title === 'string' ? title : '');
    return slug || 'stack';
}

export function isValidStackSlug(value: unknown): value is string {
    return typeof value === 'string'
        && value.length <= MAX_STACK_SLUG_LENGTH
        && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function validateStackInput(value: unknown): ValidationResult<StackInput> {
    const input = asRecord(value);
    if (!input) return { ok: false, error: 'Stack details must be an object.' };

    const title = stripControls(typeof input.title === 'string' ? input.title : '');
    if (characterLength(title) < 3) return { ok: false, error: 'Title must be at least 3 characters.' };
    if (characterLength(title) > MAX_STACK_TITLE_LENGTH) return { ok: false, error: 'Title must be 80 characters or fewer.' };

    let description: string | null = null;
    if (input.description !== undefined && input.description !== null) {
        if (typeof input.description !== 'string') return { ok: false, error: 'Description must be text.' };
        description = stripControls(input.description, true) || null;
        if (description && characterLength(description) > MAX_STACK_DESCRIPTION_LENGTH) {
            return { ok: false, error: 'Description must be 280 characters or fewer.' };
        }
    }

    const result: StackInput = { title, description };
    if (input.slug !== undefined) {
        if (typeof input.slug !== 'string' || !isValidStackSlug(input.slug)) {
            return { ok: false, error: 'Stack names may use lowercase letters, numbers, and single hyphens.' };
        }
        result.slug = input.slug;
    }

    return { ok: true, value: result };
}

export function validateItems(items: unknown, knownSlugs: Set<string>): ValidationResult<StackItemInput[]> {
    if (!Array.isArray(items)) return { ok: false, error: 'Items must be a list.' };
    if (items.length > MAX_ITEMS_PER_STACK) {
        return { ok: false, error: `A stack can contain at most ${MAX_ITEMS_PER_STACK} tools.` };
    }

    const seen = new Set<string>();
    const normalized: StackItemInput[] = [];
    for (const [position, itemValue] of items.entries()) {
        const item = asRecord(itemValue);
        if (!item || typeof item.slug !== 'string') return { ok: false, error: 'Each item must include a tool slug.' };

        const slug = item.slug.trim();
        if (!knownSlugs.has(slug)) return { ok: false, error: `Unknown tool: ${slug || 'missing slug'}.` };
        if (seen.has(slug)) return { ok: false, error: `The tool ${slug} appears more than once.` };
        seen.add(slug);

        if (typeof item.purpose !== 'string') return { ok: false, error: `Add a purpose for ${slug}.` };
        const purpose = stripControls(item.purpose);
        if (!purpose) return { ok: false, error: `Add a purpose for ${slug}.` };
        if (characterLength(purpose) > MAX_ITEM_PURPOSE_LENGTH) {
            return { ok: false, error: `Purpose must be 60 characters or fewer for ${slug}.` };
        }

        let usageNotes: string | null = null;
        if (item.usageNotes !== undefined && item.usageNotes !== null) {
            if (typeof item.usageNotes !== 'string') return { ok: false, error: `Usage notes for ${slug} must be text.` };
            usageNotes = stripControls(item.usageNotes, true) || null;
            if (usageNotes && characterLength(usageNotes) > MAX_ITEM_USAGE_NOTES_LENGTH) {
                return { ok: false, error: `Usage notes must be 500 characters or fewer for ${slug}.` };
            }
        }

        if (item.enabled !== undefined && typeof item.enabled !== 'boolean') {
            return { ok: false, error: `Visibility for ${slug} must be true or false.` };
        }

        normalized.push({
            slug,
            purpose,
            usageNotes,
            enabled: item.enabled !== false,
            position,
        });
    }

    return { ok: true, value: normalized };
}

export function newStackId(): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const id: string[] = [];
    const bytes = new Uint8Array(16);

    while (id.length < 10) {
        crypto.getRandomValues(bytes);
        for (const byte of bytes) {
            if (byte >= 252) continue;
            id.push(alphabet[byte % alphabet.length]!);
            if (id.length === 10) break;
        }
    }

    return id.join('');
}
