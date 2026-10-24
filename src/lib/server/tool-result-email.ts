import type { ToolResultKind } from './email-templates/tool-result';

export const TOOL_EMAIL_KINDS: readonly ToolResultKind[] = Object.freeze(['cost-calculator', 'rules-converter']);
export const TOOL_EMAIL_MAX_CONTENT = 50_000;
const MAX_SEARCH = 2_000;

export interface ToolEmailInput {
    kind: ToolResultKind;
    search: string;
    content: string;
}

export type ToolEmailValidation = { ok: true; value: ToolEmailInput } | { ok: false; error: string };

export function normalizeToolSearch(search: string): string {
    const query = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).toString();
    return query ? `?${query}` : '';
}

export function validateToolEmailInput(body: unknown): ToolEmailValidation {
    if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request body' };
    const { kind, search = '', content } = body as Record<string, unknown>;
    if (typeof kind !== 'string' || !TOOL_EMAIL_KINDS.includes(kind as ToolResultKind)) {
        return { ok: false, error: 'Unknown tool' };
    }
    if (typeof search !== 'string' || search.length > MAX_SEARCH) return { ok: false, error: 'Invalid link' };
    if (typeof content !== 'string' || !content.trim()) return { ok: false, error: 'Nothing to send' };
    if (content.length > TOOL_EMAIL_MAX_CONTENT) return { ok: false, error: 'Result is too large to email' };
    return { ok: true, value: { kind: kind as ToolResultKind, search: normalizeToolSearch(search), content } };
}
