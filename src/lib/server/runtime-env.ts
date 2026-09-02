import { env } from 'cloudflare:workers';
import type { Database } from './db';

const runtimeEnv = env as typeof env & Record<string, unknown>;

function configuredValue(...values: unknown[]): string {
    for (const value of values) {
        if (typeof value === 'string' && value) return value;
    }
    return '';
}

export function getGoogleClientId(): string {
    return configuredValue(env.GOOGLE_CLIENT_ID, import.meta.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_ID);
}

export function getGitHubClientId(): string {
    return configuredValue(env.GITHUB_CLIENT_ID, import.meta.env.GITHUB_CLIENT_ID, process.env.GITHUB_CLIENT_ID);
}

export function getGitHubClientSecret(): string {
    return configuredValue(env.GITHUB_CLIENT_SECRET, import.meta.env.GITHUB_CLIENT_SECRET, process.env.GITHUB_CLIENT_SECRET);
}

export function getCloudflareAccountId(): string {
    return configuredValue(env.CF_ACCOUNT_ID, process.env.CF_ACCOUNT_ID);
}

export function getCloudflareAnalyticsToken(): string {
    return configuredValue(env.CF_ANALYTICS_TOKEN, process.env.CF_ANALYTICS_TOKEN);
}

export function getEmailFrom(): string {
    return configuredValue(runtimeEnv.EMAIL_FROM, import.meta.env.EMAIL_FROM, process.env.EMAIL_FROM) || 'updates@ai.dosa.dev';
}

export function getResendApiKey(): string {
    return configuredValue(runtimeEnv.RESEND_API_KEY, import.meta.env.RESEND_API_KEY, process.env.RESEND_API_KEY);
}

export function isEmailDryRun(): boolean {
    return ['1', 'true', 'yes'].includes(
        configuredValue(runtimeEnv.EMAIL_DRY_RUN, import.meta.env.EMAIL_DRY_RUN, process.env.EMAIL_DRY_RUN).toLowerCase(),
    );
}

export function getSiteOrigin(): string {
    return configuredValue(runtimeEnv.SITE_ORIGIN, import.meta.env.SITE_ORIGIN, process.env.SITE_ORIGIN) || 'https://ai.dosa.dev';
}

export function getAnalyticsDataset(): 'aat_events' | 'aat_events_staging' {
    const value = configuredValue(env.ANALYTICS_DATASET, process.env.ANALYTICS_DATASET);
    if (value === 'aat_events' || value === 'aat_events_staging') return value;
    throw new Error('Analytics dataset is not configured');
}

export function getAdminUserIds(): Set<string> {
    const ids = new Set(configuredValue(env.ADMIN_USER_IDS, process.env.ADMIN_USER_IDS)
        .split(',')
        .map(value => value.trim())
        .filter(Boolean));
    if (import.meta.env.DEV) ids.add('github:local-staging-tester');
    return ids;
}

export function requireDatabase(): Database {
    const db = env.DB;
    if (!db) throw new Error('D1 binding DB is not configured');
    return db;
}
