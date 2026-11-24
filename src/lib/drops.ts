/**
 * Fresh drops: the catalog's daily additions, grouped for /new pages.
 *
 * Dates come from `addedAt` on each entry of data/slugs.json, stamped by
 * scripts/generate-tool-pages.js the day a slug first enters the catalog.
 * Tools without a stamp (backfilled before the field existed is not possible
 * today, but defensive anyway) are excluded rather than guessed.
 */

import slugsJson from '../../data/slugs.json';
import { getAllTools, type Tool } from './tools';

export interface SlugEntry {
    slug: string;
    name: string;
    company: string;
    category: string;
    addedAt: string;
}

export interface DropDay {
    /** "2026-11-24" */
    date: string;
    tools: Tool[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

let _days: DropDay[] | null = null;

/** Every drop day, newest first. */
export function getDropDays(): DropDay[] {
    if (_days) return _days;
    const bySlug = new Map(getAllTools().map(t => [t.slug, t]));
    const grouped = new Map<string, Tool[]>();
    for (const entry of slugsJson as SlugEntry[]) {
        if (!DATE_RE.test(entry.addedAt ?? '')) continue;
        const tool = bySlug.get(entry.slug);
        if (!tool) continue;
        const list = grouped.get(entry.addedAt) ?? [];
        list.push(tool);
        grouped.set(entry.addedAt, list);
    }
    _days = [...grouped.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, tools]) => ({ date, tools }));
    return _days;
}

/** The most recent drop day, or null when the catalog carries no dates. */
export function getLatestDropDay(): DropDay | null {
    return getDropDays()[0] ?? null;
}

/** "Nov 24, 2026" rendered in UTC so date-only strings never shift back a day. */
export function formatDropDate(date: string): string {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return date;
    return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "Nov 24" for compact labels. */
export function formatDropDateShort(date: string): string {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return date;
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
