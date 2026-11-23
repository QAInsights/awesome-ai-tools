import { sanitizeAuthTrigger } from '../src/lib/analytics-events.js';
import { ensureSessionId, getSessionId } from './posthog.js';

const PENDING_KEY = 'aat_auth_trigger_pending';
const ACTIVE_KEY = 'aat_auth_trigger_active';
const PENDING_SUBJECT_KEY = 'aat_auth_subject_pending';
const ACTIVE_SUBJECT_KEY = 'aat_auth_subject_active';
const COOKIE_NAME = 'aat_auth_trigger';

export function createAuthAttribution({
    storage = globalThis.sessionStorage,
    documentRef = globalThis.document,
    locationRef = globalThis.location,
    sessionId = getSessionId,
} = {}) {
    let active = '';

    function read(key) {
        try {
            return storage?.getItem(key) ?? '';
        } catch {
            return '';
        }
    }

    function write(key, value) {
        try {
            if (value) storage?.setItem(key, value);
            else storage?.removeItem(key);
        } catch {}
    }

    let activeSubject = '';
    let context = null;

    function writeContext() {
        if (!documentRef || !context) return;
        const secure = locationRef?.protocol === 'https:' ? '; Secure' : '';
        documentRef.cookie = `aat_auth_context=${encodeURIComponent(JSON.stringify(context))}; Max-Age=600; Path=/; SameSite=Lax${secure}`;
    }

    async function prepare() {
        if (!context) context = { url: locationRef?.href || '', sessionId: sessionId() };
        context.sessionId = context.sessionId || await ensureSessionId();
        writeContext();
    }

    function setPending(trigger, subject = '') {
        write(PENDING_KEY, sanitizeAuthTrigger(trigger));
        write(PENDING_SUBJECT_KEY, typeof subject === 'string' ? subject.slice(0, 128) : '');
    }

    function begin(fallback = 'sidebar') {
        active = sanitizeAuthTrigger(read(PENDING_KEY) || fallback);
        activeSubject = read(PENDING_SUBJECT_KEY);
        write(PENDING_KEY, '');
        write(PENDING_SUBJECT_KEY, '');
        write(ACTIVE_KEY, active);
        write(ACTIVE_SUBJECT_KEY, activeSubject);
        const secure = locationRef?.protocol === 'https:' ? '; Secure' : '';
        if (documentRef) {
            context = { url: locationRef?.href || '', sessionId: sessionId() };
            writeContext();
            documentRef.cookie = `${COOKIE_NAME}=${encodeURIComponent(active)}; Max-Age=600; Path=/; SameSite=Lax${secure}`;
        }
        return active;
    }

    function current() {
        return sanitizeAuthTrigger(active || read(ACTIVE_KEY) || read(PENDING_KEY));
    }

    function subject() {
        return activeSubject || read(ACTIVE_SUBJECT_KEY) || read(PENDING_SUBJECT_KEY);
    }

    function clear() {
        context = null;
        active = '';
        activeSubject = '';
        write(PENDING_KEY, '');
        write(ACTIVE_KEY, '');
        write(PENDING_SUBJECT_KEY, '');
        write(ACTIVE_SUBJECT_KEY, '');
        const secure = locationRef?.protocol === 'https:' ? '; Secure' : '';
        if (documentRef) {
            documentRef.cookie = `aat_auth_context=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
            documentRef.cookie = `${COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
        }
    }

    function open(trigger, subjectValue = '') {
        const normalizedTrigger = sanitizeAuthTrigger(trigger);
        const pendingSubject = read(PENDING_KEY) === normalizedTrigger ? read(PENDING_SUBJECT_KEY) : '';
        setPending(normalizedTrigger, subjectValue || pendingSubject);
        const button = documentRef?.getElementById?.('signInTriggerBtn');
        const modal = documentRef?.getElementById?.('signInModal');
        if (button && modal) button.click();
        else if (locationRef) locationRef.href = '/?signin=1';
    }

    return { begin, clear, current, open, prepare, setPending, subject };
}

export const authAttribution = createAuthAttribution();
