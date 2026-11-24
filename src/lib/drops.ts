/**
 * Fresh drops: the catalog's daily additions, grouped for /new pages.
 *
 * Dates come from `addedAt` on each entry of data/slugs.json, stamped by
 * scripts/generate-tool-pages.js the day a slug first enters the catalog.
 * Tools without a stamp (backfilled before the field existed is not possible
 * today, but defensive anyway) are excluded rather than guessed.
 */

import slugsJson from '../../data/slugs.json';
import removedSlugsJson from '../../data/removed-slugs.json';
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
    /** Live catalog tools added that day. */
    tools: Tool[];
    /** Tools added that day but later removed from the catalog. */
    removed: SlugEntry[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Strict YYYY-MM-DD calendar date (rejects e.g. 2026-02-30). */
export function isDropDate(date: string): boolean {
    if (!DATE_RE.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

let _days: DropDay[] | null = null;

/** Every drop day, newest first. */
export function getDropDays(): DropDay[] {
    if (_days) return _days;
    const bySlug = new Map(getAllTools().map(t => [t.slug, t]));
    const grouped = new Map<string, Tool[]>();
    const removedGrouped = new Map<string, SlugEntry[]>();
    for (const entry of slugsJson as SlugEntry[]) {
        if (!isDropDate(entry.addedAt ?? '')) continue;
        const tool = bySlug.get(entry.slug);
        if (!tool) continue;
        const list = grouped.get(entry.addedAt) ?? [];
        list.push(tool);
        grouped.set(entry.addedAt, list);
    }
    for (const entry of removedSlugsJson as SlugEntry[]) {
        if (!isDropDate(entry.addedAt ?? '')) continue;
        const list = removedGrouped.get(entry.addedAt) ?? [];
        list.push(entry);
        removedGrouped.set(entry.addedAt, list);
    }
    _days = [...new Set([...grouped.keys(), ...removedGrouped.keys()])]
        .sort((a, b) => b.localeCompare(a))
        .map(date => ({ date, tools: grouped.get(date) ?? [], removed: removedGrouped.get(date) ?? [] }));
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
