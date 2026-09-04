const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const subjectPolicies = {
    none: () => '',
    slug(value) {
        const subject = typeof value === 'string' ? value.slice(0, 128) : '';
        return slugPattern.test(subject) ? subject : '';
    },
    comparison(value) {
        const subject = typeof value === 'string' ? value.slice(0, 128) : '';
        const parts = subject.split(',');
        return parts.length > 0 && parts.length <= 3 && parts.every(part => slugPattern.test(part))
            ? parts.join(',')
            : '';
    },
    onboardingStep(value) {
        return ONBOARDING_STEP_SUBJECTS.includes(value) ? value : '';
    },
};

export const AUTH_TRIGGERS = Object.freeze(['sidebar', 'favorite_heart', 'follow_bell', 'zap_btn']);
export const OUTBOUND_TRIGGERS = Object.freeze(['tool_card', 'tool_detail', 'comparison', 'category', 'unknown']);
export const ONBOARDING_TRIGGERS = Object.freeze(['inline', 'float', 'unknown']);
export const ONBOARDING_STEP_SUBJECTS = Object.freeze(['favorites', 'follows', 'badge']);
export const ANALYTICS_PROVIDERS = Object.freeze(['github', 'google', 'dev']);

export const EVENTS = Object.freeze({
    SIGNIN_COMPLETED: 'signin_completed',
    SIGNOUT: 'signout',
    FAVORITE_ADDED: 'favorite_added',
    FAVORITE_REMOVED: 'favorite_removed',
    FOLLOW_ADDED: 'follow_added',
    FOLLOW_REMOVED: 'follow_removed',
    AUTH_ERROR: 'auth_error',
    SIGNIN_MODAL_SHOWN: 'signin_modal_shown',
    SIGNIN_STARTED: 'signin_started',
    GATE_BLOCKED: 'gate_blocked',
    ZAP_CAST: 'zap_cast',
    OUTBOUND_CLICK: 'outbound_click',
    COMPARE_BUILT: 'compare_built',
    ONBOARDING_SHOWN: 'onboarding_shown',
    ONBOARDING_DISMISSED: 'onboarding_dismissed',
    ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
});

export const EVENT_CATALOG = Object.freeze({
    [EVENTS.SIGNIN_COMPLETED]: { client: false, triggers: AUTH_TRIGGERS, subject: subjectPolicies.none },
    [EVENTS.SIGNOUT]: { client: false, triggers: [], subject: subjectPolicies.none },
    [EVENTS.FAVORITE_ADDED]: { client: false, triggers: ['favorite_heart'], subject: subjectPolicies.slug },
    [EVENTS.FAVORITE_REMOVED]: { client: false, triggers: ['favorite_heart'], subject: subjectPolicies.slug },
    [EVENTS.FOLLOW_ADDED]: { client: false, triggers: ['follow_bell'], subject: subjectPolicies.slug },
    [EVENTS.FOLLOW_REMOVED]: { client: false, triggers: ['follow_bell'], subject: subjectPolicies.slug },
    [EVENTS.AUTH_ERROR]: { client: false, triggers: AUTH_TRIGGERS, subject: value => typeof value === 'string' ? value.slice(0, 128) : '' },
    [EVENTS.SIGNIN_MODAL_SHOWN]: { client: true, triggers: AUTH_TRIGGERS, subject: subjectPolicies.none },
    [EVENTS.SIGNIN_STARTED]: { client: true, triggers: AUTH_TRIGGERS, subject: subjectPolicies.none },
    [EVENTS.GATE_BLOCKED]: { client: true, triggers: ['favorite_heart', 'follow_bell', 'zap_btn'], subject: subjectPolicies.slug },
    [EVENTS.ZAP_CAST]: { client: true, triggers: ['zap_btn'], subject: subjectPolicies.slug },
    [EVENTS.OUTBOUND_CLICK]: { client: true, triggers: OUTBOUND_TRIGGERS, subject: subjectPolicies.slug },
    [EVENTS.COMPARE_BUILT]: { client: true, triggers: ['comparison'], subject: subjectPolicies.comparison },
    [EVENTS.ONBOARDING_SHOWN]: { client: true, triggers: ONBOARDING_TRIGGERS, subject: subjectPolicies.none },
    [EVENTS.ONBOARDING_DISMISSED]: { client: true, triggers: ONBOARDING_TRIGGERS, subject: subjectPolicies.none },
    [EVENTS.ONBOARDING_STEP_COMPLETED]: { client: true, triggers: ONBOARDING_TRIGGERS, subject: subjectPolicies.onboardingStep },
});

export function sanitizeAuthTrigger(value) {
    return AUTH_TRIGGERS.includes(value) ? value : 'sidebar';
}

export function normalizeEventFields(event, input = {}) {
    const definition = EVENT_CATALOG[event];
    if (!definition) return null;
    const finite = value => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : undefined;
    return {
        ...input,
        trigger: definition.triggers.includes(input.trigger) ? input.trigger : '',
        subject: definition.subject(input.subject),
        provider: ANALYTICS_PROVIDERS.includes(input.provider) ? input.provider : '',
        value: finite(input.value),
        durationMs: finite(input.durationMs),
    };
}

export function normalizeClientEvent(input) {
    if (!input || typeof input !== 'object' || !EVENT_CATALOG[input.event]?.client) return null;
    const fields = normalizeEventFields(input.event, input);
    return {
        event: input.event,
        anonId: typeof input.anonId === 'string' ? input.anonId.slice(0, 128) : '',
        trigger: fields.trigger,
        subject: fields.subject,
        provider: fields.provider,
        variant: typeof input.variant === 'string' ? input.variant.slice(0, 64) : '',
        value: fields.value,
        durationMs: fields.durationMs,
    };
}
