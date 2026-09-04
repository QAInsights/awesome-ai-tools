import enrichedTools from '../../../public/data/enriched-tools.json';
import { sendEmail } from './email';
import { runDigest, type DigestRunSummary } from './digest';
import { getNewsPostForDate, utcDateString } from './news-source';
import { runNewsSend, type NewsRunSummary } from './news';
import { getSiteOrigin, isEmailDryRun, requireDatabase } from './runtime-env';

export async function runScheduledDigest(trigger: string): Promise<DigestRunSummary> {
    try {
        const summary = await runDigest({
            db: requireDatabase(),
            tools: enrichedTools,
            sendEmail,
            siteOrigin: getSiteOrigin(),
        });
        if (summary.dryRun && summary.sent > 0 && !isEmailDryRun()) {
            console.warn('[Digest] sends were dry-run because RESEND_API_KEY is unset; nothing persisted');
        }
        return summary;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[Digest] ${trigger} run failed: ${message}`);
        return {
            candidates: 0,
            sent: 0,
            skippedNoChanges: 0,
            skippedTooSoon: 0,
            failed: 1,
            dryRun: true,
            errors: [`${trigger}: ${message}`],
        };
    }
}

export type ScheduledNewsSummary = NewsRunSummary & { skippedNoPost: boolean };

export async function runScheduledNews(trigger: string, now = Date.now()): Promise<ScheduledNewsSummary> {
    const post = getNewsPostForDate(utcDateString(now));
    if (!post) {
        return {
            candidates: 0,
            sent: 0,
            skippedAlreadySent: 0,
            failed: 0,
            dryRun: true,
            errors: [],
            skippedNoPost: true,
        };
    }
    try {
        const summary = await runNewsSend({
            db: requireDatabase(),
            post,
            sendEmail,
            siteOrigin: getSiteOrigin(),
        });
        if (summary.dryRun && summary.sent > 0 && !isEmailDryRun()) {
            console.warn('[News] sends were dry-run because RESEND_API_KEY is unset; nothing persisted');
        }
        return { ...summary, skippedNoPost: false };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[News] ${trigger} run failed: ${message}`);
        return {
            candidates: 0,
            sent: 0,
            skippedAlreadySent: 0,
            failed: 1,
            dryRun: true,
            errors: [`${trigger}: ${message}`],
            skippedNoPost: false,
        };
    }
}
