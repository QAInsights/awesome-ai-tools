export const AUTH_SESSION_KEY = 'auth_session';
export const AUTH_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function isValidAuthSession(session, now = Date.now()) {
    return Boolean(session?.user)
        && typeof session.timestamp === 'number'
        && now - session.timestamp <= AUTH_SESSION_TTL_MS;
}
