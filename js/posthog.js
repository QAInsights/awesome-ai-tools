const MAX_QUEUE_SIZE = 50;
const ENABLED_HOSTNAMES = new Set(['ai.dosa.dev', 'www.ai.dosa.dev']);

function defaultScheduleIdle(callback, windowLike) {
    const idleCallback = windowLike?.requestIdleCallback?.bind(windowLike)
        ?? globalThis.requestIdleCallback;
    if (typeof idleCallback === 'function') idleCallback(callback);
    else globalThis.setTimeout(callback, 0);
}

export function createPostHogClient({
    hostname = globalThis.location?.hostname ?? globalThis.window?.location?.hostname ?? '',
    key = process.env.POSTHOG_KEY || '',
    loadSdk = () => import('posthog-js'),
    posthogInstance = null,
    windowLike = globalThis.window,
    scheduleIdle = callback => defaultScheduleIdle(callback, windowLike),
} = {}) {
    const enabled = ENABLED_HOSTNAMES.has(hostname) && typeof key === 'string' && key.trim() !== '';
    let posthog = null;
    let initialized = false;
    let initializationRequested = false;
    let initializationScheduled = false;
    let ready = false;
    let queue = [];

    function invoke(method, args) {
        try {
            posthog?.[method]?.(...args);
        } catch {}
    }

    function markReady(instance) {
        if (instance) posthog = instance;
        if (!posthog || ready) return;
        ready = true;
        const pending = queue;
        queue = [];
        for (const { method, args } of pending) invoke(method, args);
    }

    function enqueue(method, args) {
        if (!enabled) return;
        if (ready) {
            invoke(method, args);
            return;
        }
        queue.push({ method, args });
        if (queue.length > MAX_QUEUE_SIZE) queue.shift();
    }

    async function initialize() {
        if (!enabled || initialized) return;
        initialized = true;
        try {
            const sdk = posthogInstance ? null : await loadSdk();
            posthog = posthogInstance ?? sdk?.default ?? sdk?.posthog ?? sdk;
            if (!posthog || typeof posthog.init !== 'function') return;
            posthog.init(key, {
                api_host: '/ingest',
                ui_host: 'https://us.posthog.com',
                defaults: '2025-05-24',
                person_profiles: 'identified_only',
                respect_dnt: true,
                session_recording: {
                    maskAllInputs: true,
                    maskTextSelector: '[data-ph-mask]',
                },
                capture_exceptions: true,
                loaded: instance => markReady(instance),
            });
        } catch {}
    }

    function scheduleInitialization() {
        if (!enabled || initializationScheduled || initialized) return;
        initializationScheduled = true;
        try {
            scheduleIdle(() => {
                initializationScheduled = false;
                void initialize();
            });
        } catch {
            initializationScheduled = false;
        }
    }

    function initPostHog() {
        if (!enabled || initializationRequested) return;
        initializationRequested = true;
        try {
            if (windowLike?.document?.readyState === 'complete') {
                scheduleInitialization();
            } else {
                windowLike?.addEventListener?.('load', scheduleInitialization, { once: true });
            }
        } catch {}
    }

    function capture(event, props = {}) {
        try {
            enqueue('capture', [event, props]);
        } catch {}
    }

    function identifyUser(user) {
        try {
            if (!user?.id) return;
            enqueue('identify', [user.id, { provider: user.provider }]);
        } catch {}
    }

    function resetUser() {
        try {
            enqueue('reset', []);
        } catch {}
    }

    return { initPostHog, capture, identifyUser, resetUser };
}

const posthogClient = createPostHogClient();

export const initPostHog = posthogClient.initPostHog;
export const capture = posthogClient.capture;
export const identifyUser = posthogClient.identifyUser;
export const resetUser = posthogClient.resetUser;
