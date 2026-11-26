import type { AstroCookies } from 'astro';
import type { Database } from './db';
import { getCookieSessionUser } from './route-auth';
import type { SessionUser } from './user-session';

export const SWITCH_VOTER_COOKIE = 'aat_switch_voter';

export async function hashSwitchIdentity(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function getSwitchVoter(cookies: AstroCookies, db: Database, create = false, resolvedUser?: SessionUser | null): Promise<string | null> {
    const user = resolvedUser === undefined ? await getCookieSessionUser(cookies, db) : resolvedUser;
    if (user) return `u:${user.id}`;
    let id = cookies.get(SWITCH_VOTER_COOKIE)?.value ?? '';
    if (!/^[a-f0-9]{64}$/.test(id)) {
        if (!create) return null;
        id = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
        cookies.set(SWITCH_VOTER_COOKIE, id, {
            httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 365 * 24 * 60 * 60,
        });
    }
    return `g:${await hashSwitchIdentity(id)}`;
}
