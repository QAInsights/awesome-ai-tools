import type { Database } from './db';
import { getOrCreatePrefs } from './notification-prefs-repository';
import { renderDigest } from './email-templates/digest';
import type { EmailSendResult, OutboundEmail } from './email';

const DAY_MS = 86_400_000;

export interface DigestToolSource {
    slug: string;
    name?: string;
    description?: string;
    recentUpdates?: string;
    lastUpdated?: string;
}

export interface DigestRunOptions {
    db: Database;
    tools: DigestToolSource[];
    sendEmail: (m: OutboundEmail) => Promise<EmailSendResult>;
    siteOrigin: string;
    now?: number;
    maxUsers?: number;
    minIntervalDays?: number;
}

export interface DigestRunSummary {
    candidates: number;
    sent: number;
    skippedNoChanges: number;
    skippedTooSoon: number;
    failed: number;
    dryRun: boolean;
    errors: string[];
}

interface CandidateRow {
    id: string;
    display_name: string;
    email: string | null;
    email_enabled: number | null;
    unsubscribe_token: string | null;
    last_digest_sent_at: number | null;
}

interface FollowRow {
    tool_slug: string;
    created_at: number;
}

interface DigestLogRow {
    tool_slugs: string | null;
}

interface ChangedTool {
    source: DigestToolSource;
    lastUpdated: string;
}

function utcDay(milliseconds: number): number {
    return Math.floor(milliseconds / DAY_MS);
}

function parsePreviousDigest(value: string | null | undefined): Set<string> {
    if (!value) return new Set();
    try {
        const parsed: unknown = JSON.parse(value);
        if (!Array.isArray(parsed)) return new Set();
        return new Set(parsed.filter((item): item is string => {
            if (typeof item !== 'string') return false;
            const separator = item.indexOf('@');
            return separator > 0
                && separator < item.length - 1
                && item.indexOf('@', separator + 1) === -1
                && Number.isFinite(Date.parse(item.slice(separator + 1)));
        }));
    } catch {
        return new Set();
    }
}

function safeErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]');
}

function maskEmail(value: string): string {
    const [local, domain] = value.split('@');
    if (!local || !domain) return '***';
    return `${local.slice(0, 1)}***@${domain}`;
}

function emptySummary(): DigestRunSummary {
    return {
        candidates: 0,
        sent: 0,
        skippedNoChanges: 0,
        skippedTooSoon: 0,
        failed: 0,
        dryRun: true,
        errors: [],
    };
}

export async function runDigest(opts: DigestRunOptions): Promise<DigestRunSummary> {
    const now = opts.now ?? Date.now();
    const maxUsers = opts.maxUsers ?? 90;
    const minIntervalDays = opts.minIntervalDays ?? 13;
    const candidatesResult = await opts.db.prepare(`
        SELECT u.id, u.display_name, u.email,
               p.email_enabled, p.unsubscribe_token, p.last_digest_sent_at
        FROM users u
        JOIN (SELECT DISTINCT user_id FROM follows) f ON f.user_id = u.id
        LEFT JOIN notification_prefs p ON p.user_id = u.id
        WHERE u.email IS NOT NULL AND u.email_verified = 1
          AND COALESCE(p.email_enabled, 1) = 1
        ORDER BY u.created_at
        LIMIT ?
    `).bind(maxUsers).all<CandidateRow>();
    const candidates = candidatesResult.results ?? [];
    const summary = emptySummary();
    summary.candidates = candidates.length;
    const successfulSends: EmailSendResult[] = [];
    let throttleBeforeNextSend = false;
    const toolsBySlug = new Map(opts.tools.map(tool => [tool.slug, tool]));

    for (const candidate of candidates) {
        if (!candidate.email) continue;

        try {
            let token = candidate.unsubscribe_token;
            let lastDigestSentAt = candidate.last_digest_sent_at;
            if (!token) {
                const prefs = await getOrCreatePrefs(opts.db, candidate.id);
                token = prefs.unsubscribeToken;
                lastDigestSentAt = prefs.lastDigestSentAt;
            }
            if (lastDigestSentAt != null && now - lastDigestSentAt < minIntervalDays * DAY_MS) {
                summary.skippedTooSoon += 1;
                continue;
            }

            const followsResult = await opts.db.prepare(`
                SELECT tool_slug, created_at
                FROM follows
                WHERE user_id = ?
            `).bind(candidate.id).all<FollowRow>();
            const logResult = await opts.db.prepare(`
                SELECT tool_slugs
                FROM email_log
                WHERE user_id = ? AND kind = 'digest'
                ORDER BY sent_at DESC
                LIMIT 1
            `).bind(candidate.id).first<DigestLogRow>();
            const previousDigest = parsePreviousDigest(logResult?.tool_slugs);
            const changedTools: ChangedTool[] = [];

            for (const follow of followsResult.results ?? []) {
                const source = toolsBySlug.get(follow.tool_slug);
                if (!source?.lastUpdated) continue;
                const updatedAt = Date.parse(source.lastUpdated);
                if (!Number.isFinite(updatedAt)) continue;
                const reference = Math.max(lastDigestSentAt ?? 0, follow.created_at);
                const digestKey = `${source.slug}@${source.lastUpdated}`;
                if (utcDay(updatedAt) >= utcDay(reference) && !previousDigest.has(digestKey)) {
                    changedTools.push({ source, lastUpdated: source.lastUpdated });
                }
            }

            if (!changedTools.length) {
                summary.skippedNoChanges += 1;
                continue;
            }

            changedTools.sort((left, right) => {
                const updatedDifference = Date.parse(right.lastUpdated) - Date.parse(left.lastUpdated);
                return updatedDifference || (left.source.name ?? left.source.slug).localeCompare(right.source.name ?? right.source.slug);
            });
            const digestTools = changedTools.map(({ source, lastUpdated }) => ({
                slug: source.slug,
                name: source.name ?? source.slug,
                description: source.description ?? '',
                recentUpdates: source.recentUpdates ? [source.recentUpdates] : [],
                lastUpdated,
            }));
            const unsubscribeUrl = `${opts.siteOrigin}/unsubscribe?token=${encodeURIComponent(token)}`;
            const rendered = renderDigest({
                userName: candidate.display_name,
                tools: digestTools,
                unsubscribeUrl,
                siteOrigin: opts.siteOrigin,
            });

            if (throttleBeforeNextSend) {
                await new Promise(resolve => setTimeout(resolve, 600));
            }
            const result = await opts.sendEmail({
                to: candidate.email,
                subject: rendered.subject,
                html: rendered.html,
                text: rendered.text,
                unsubscribeUrl,
            });
            successfulSends.push(result);
            throttleBeforeNextSend = !result.dryRun;
            if (!result.dryRun) {
                const toolSlugs = JSON.stringify(changedTools.map(({ source, lastUpdated }) => `${source.slug}@${lastUpdated}`));
                await opts.db.batch([
                    opts.db.prepare(`
                        INSERT INTO email_log (user_id, kind, tool_slugs, message_id, sent_at)
                        VALUES (?, 'digest', ?, ?, ?)
                    `).bind(candidate.id, toolSlugs, result.messageId, now),
                    opts.db.prepare(`
                        UPDATE notification_prefs
                        SET last_digest_sent_at = ?, updated_at = ?
                        WHERE user_id = ?
                    `).bind(now, now, candidate.id),
                ]);
            }
            summary.sent += 1;
        } catch (error) {
            summary.failed += 1;
            const message = safeErrorMessage(error);
            summary.errors.push(`${candidate.id}: ${message}`);
            console.error(`[Digest] ${candidate.id} ${maskEmail(candidate.email)}: ${message}`);
        }
    }

    summary.dryRun = successfulSends.length === 0 || successfulSends.every(result => result.dryRun);
    console.log(`[Digest] candidates=${summary.candidates} sent=${summary.sent} skipped=${summary.skippedNoChanges} tooSoon=${summary.skippedTooSoon} failed=${summary.failed} dryRun=${summary.dryRun}`);
    return summary;
}
