import type { Database } from './db';
import type { EmailSendResult, OutboundEmail } from './email';
import type { NewsPost } from './news-source';
import { renderNewsEmail } from './email-templates/news';

export interface NewsRunOptions {
    db: Database;
    post: NewsPost;
    sendEmail: (message: OutboundEmail) => Promise<EmailSendResult>;
    siteOrigin: string;
    now?: number;
    maxUsers?: number;
    throttleMs?: number;
}

export interface NewsRunSummary {
    candidates: number;
    sent: number;
    skippedAlreadySent: number;
    failed: number;
    dryRun: boolean;
    errors: string[];
}

interface CandidateRow {
    id: string;
    display_name: string;
    email: string;
    unsubscribe_token: string;
}

function safeErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]');
}

export async function runNewsSend(opts: NewsRunOptions): Promise<NewsRunSummary> {
    const candidatesResult = await opts.db.prepare(`
        SELECT u.id, u.display_name, u.email, p.unsubscribe_token
        FROM users u JOIN notification_prefs p ON p.user_id = u.id
        WHERE u.email IS NOT NULL AND u.email_verified = 1 AND p.news_enabled = 1
          AND NOT EXISTS (
              SELECT 1
              FROM email_log l
              WHERE l.user_id = u.id AND l.kind = 'news' AND l.tool_slugs = ?
          )
        ORDER BY u.created_at LIMIT ?
    `).bind(opts.post.id, opts.maxUsers ?? 90).all<CandidateRow>();
    const candidates = candidatesResult.results ?? [];
    const summary: NewsRunSummary = {
        candidates: candidates.length,
        sent: 0,
        skippedAlreadySent: 0,
        failed: 0,
        dryRun: true,
        errors: [],
    };
    const now = opts.now ?? Date.now();
    let sentRealEmail = false;

    for (const candidate of candidates) {
        try {
            const log = await opts.db.prepare(`
                SELECT 1 AS sent
                FROM email_log
                WHERE user_id = ? AND kind = 'news' AND tool_slugs = ?
                LIMIT 1
            `).bind(candidate.id, opts.post.id).first();
            if (log) {
                summary.skippedAlreadySent += 1;
                continue;
            }
            if (sentRealEmail && (opts.throttleMs ?? 600) > 0) {
                await new Promise(resolve => setTimeout(resolve, opts.throttleMs ?? 600));
            }
            const unsubscribeUrl = `${opts.siteOrigin}/unsubscribe?token=${encodeURIComponent(candidate.unsubscribe_token)}&kind=news`;
            const rendered = renderNewsEmail({
                userName: candidate.display_name,
                post: opts.post,
                postUrl: `${opts.siteOrigin}/blog/${opts.post.id}`,
                unsubscribeUrl,
                siteOrigin: opts.siteOrigin,
            });
            const result = await opts.sendEmail({
                to: candidate.email,
                subject: rendered.subject,
                html: rendered.html,
                text: rendered.text,
                unsubscribeUrl,
            });
            if (!result.dryRun) {
                sentRealEmail = true;
                await opts.db.prepare(`
                    INSERT INTO email_log (user_id, kind, tool_slugs, message_id, sent_at)
                    VALUES (?, 'news', ?, ?, ?)
                `).bind(candidate.id, opts.post.id, result.messageId, now).run();
            }
            summary.sent += 1;
            summary.dryRun = summary.dryRun && result.dryRun;
        } catch (error) {
            summary.failed += 1;
            summary.errors.push(`${candidate.id}: ${safeErrorMessage(error)}`);
        }
    }
    return summary;
}
