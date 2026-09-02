import enrichedTools from '../../../public/data/enriched-tools.json';
import { sendEmail } from './email';
import { runDigest, type DigestRunSummary } from './digest';
import { getSiteOrigin, requireDatabase } from './runtime-env';

export async function runScheduledDigest(trigger: string): Promise<DigestRunSummary> {
    try {
        return await runDigest({
            db: requireDatabase(),
            tools: enrichedTools,
            sendEmail,
            siteOrigin: getSiteOrigin(),
        });
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
