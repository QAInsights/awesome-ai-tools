import { AUTH_SESSION_TTL_MS } from '../auth-session.js';
import type { BoundStatement, Database } from './db';

export const SESSION_COOKIE_NAME = 'aat_session';

export interface IdentityProfile {
    provider: 'google' | 'github' | 'email';
    providerUserId: string;
    name: string;
    email: string | null;
    picture: string | null;
    githubUsername: string | null;
    emailVerified: boolean;
}

export interface SessionUser {
    id: string;
    provider: IdentityProfile['provider'];
    providerUserId: string;
    name: string;
    email: string | null;
    picture: string | null;
    githubUsername: string | null;
    emailVerified: boolean;
}

interface SessionUserRow {
    id: string;
    provider: IdentityProfile['provider'];
    provider_user_id: string;
    display_name: string;
    email: string | null;
    avatar_url: string | null;
    github_username: string | null;
    email_verified: number;
    last_seen_at: number | null;
}

interface CreatedUserRow {
    created_at: number;
}

function defaultTokenFactory(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashSessionToken(token: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function toSessionUser(profile: IdentityProfile): SessionUser {
    return {
        id: `${profile.provider}:${profile.providerUserId}`,
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        name: profile.name,
        email: profile.email,
        picture: profile.picture,
        githubUsername: profile.githubUsername,
        emailVerified: profile.emailVerified,
    };
}

function sessionUserFromRow(row: SessionUserRow): SessionUser {
    return {
        id: row.id,
        provider: row.provider,
        providerUserId: row.provider_user_id,
        name: row.display_name,
        email: row.email,
        picture: row.avatar_url,
        githubUsername: row.github_username,
        emailVerified: Boolean(row.email_verified),
    };
}

export async function createUserSession(
    db: Database,
    profile: IdentityProfile,
    now = Date.now(),
    tokenFactory: () => string = defaultTokenFactory,
): Promise<{ token: string; user: SessionUser; isNewUser: boolean }> {
    const user = toSessionUser(profile);
    const token = tokenFactory();
    const tokenHash = await hashSessionToken(token);
    const expiresAt = now + AUTH_SESSION_TTL_MS;
    const statements: BoundStatement[] = [
        db.prepare(`
            INSERT INTO users (
                id, provider, provider_user_id, display_name, email, avatar_url,
                github_username, email_verified, created_at, updated_at, last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(provider, provider_user_id) DO UPDATE SET
                display_name = excluded.display_name,
                email = excluded.email,
                avatar_url = excluded.avatar_url,
                github_username = excluded.github_username,
                email_verified = excluded.email_verified,
                updated_at = excluded.updated_at,
                last_seen_at = excluded.last_seen_at
            RETURNING created_at
        `).bind(
            user.id,
            user.provider,
            user.providerUserId,
            user.name,
            user.email,
            user.picture,
            user.githubUsername,
            user.emailVerified ? 1 : 0,
            now,
            now,
            now,
        ),
        db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
        db.prepare(`
            INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
            VALUES (?, ?, ?, ?)
        `).bind(tokenHash, user.id, now, expiresAt),
    ];

    const results = await db.batch<CreatedUserRow>(statements);
    const createdAt = results[0]?.results?.[0]?.created_at;
    return { token, user, isNewUser: createdAt === now };
}

export async function createSessionForUser(
    db: Database,
    userId: string,
    now = Date.now(),
    tokenFactory: () => string = defaultTokenFactory,
): Promise<{ token: string; user: SessionUser; isNewUser: false }> {
    const row = await db.prepare(`
        SELECT
            id,
            provider,
            provider_user_id,
            display_name,
            email,
            avatar_url,
            github_username,
            email_verified,
            last_seen_at
        FROM users
        WHERE id = ?
        LIMIT 1
    `).bind(userId).first<SessionUserRow>();
    if (!row) throw new Error('User not found');

    const token = tokenFactory();
    const tokenHash = await hashSessionToken(token);
    await db.batch([
        db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(now, userId),
        db.prepare(`
            INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
            VALUES (?, ?, ?, ?)
        `).bind(tokenHash, userId, now, now + AUTH_SESSION_TTL_MS),
    ]);
    return { token, user: sessionUserFromRow(row), isNewUser: false };
}

export async function getSessionUser(
    db: Database,
    token: string,
    now = Date.now(),
): Promise<SessionUser | null> {
    if (!token) return null;
    const tokenHash = await hashSessionToken(token);
    const row = await db.prepare(`
        SELECT
            u.id,
            u.provider,
            u.provider_user_id,
            u.display_name,
            u.email,
            u.avatar_url,
            u.github_username,
            u.email_verified,
            u.last_seen_at
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?
        LIMIT 1
    `).bind(tokenHash, now).first<SessionUserRow>();

    if (!row) return null;
    const utcDay = Math.floor(now / 86_400_000);
    if (!row.last_seen_at || Math.floor(row.last_seen_at / 86_400_000) < utcDay) {
        await db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(now, row.id).run();
    }
    return sessionUserFromRow(row);
}

export async function deleteUserSession(db: Database, token: string): Promise<void> {
    if (!token) return;
    const tokenHash = await hashSessionToken(token);
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}

export function sessionCookieOptions(url: URL) {
    return {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: url.protocol === 'https:',
        path: '/',
        maxAge: Math.floor(AUTH_SESSION_TTL_MS / 1000),
    };
}
