import { auth } from './auth.js';
import { bindAuthSession } from './auth-session-binding.js';

const defaultNotificationsApi = {
    async getPrefs() {
        const response = await fetch('/api/notifications/prefs');
        if (!response.ok) {
            const error = new Error('Unable to load notification preferences');
            error.status = response.status;
            throw error;
        }
        return response.json();
    },
    async setEmailEnabled(emailEnabled) {
        const response = await fetch('/api/notifications/prefs', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emailEnabled }),
        });
        if (!response.ok) {
            const error = new Error('Unable to save notification preferences');
            error.status = response.status;
            throw error;
        }
        return response.json();
    },
};

export async function initializeSettingsPage({
    authManager = auth,
    notificationsApi = defaultNotificationsApi,
    root = document,
} = {}) {
    const loading = root.getElementById('settingsLoading');
    const signedOut = root.getElementById('settingsSignedOut');
    const errorState = root.getElementById('settingsError');
    const card = root.getElementById('notificationsCard');
    const toggle = root.getElementById('notificationEmailToggle');
    const email = root.getElementById('notificationEmail');
    const warning = root.getElementById('notificationEmailWarning');

    function hideStates() {
        [loading, signedOut, errorState, card].forEach(element => element?.classList.add('hidden'));
    }

    function renderPrefs(prefs) {
        hideStates();
        card?.classList.remove('hidden');
        toggle?.setAttribute('aria-checked', prefs.emailEnabled ? 'true' : 'false');
        toggle?.classList.toggle('bg-[#c9aa6e]', prefs.emailEnabled);
        toggle?.classList.toggle('bg-[#333]', !prefs.emailEnabled);
        toggle?.querySelector('span')?.classList.toggle('translate-x-5', prefs.emailEnabled);
        toggle?.querySelector('span')?.classList.toggle('translate-x-0', !prefs.emailEnabled);
        email.textContent = prefs.email || 'No email on file';
        warning?.classList.toggle('hidden', Boolean(prefs.emailVerified));
    }

    function showSignedOut() {
        hideStates();
        signedOut?.classList.remove('hidden');
    }

    function showError() {
        hideStates();
        errorState?.classList.remove('hidden');
    }

    async function load() {
        if (!authManager.isAuthenticated()) {
            showSignedOut();
            return;
        }
        try {
            renderPrefs(await notificationsApi.getPrefs());
        } catch {
            showError();
        }
    }

    toggle?.addEventListener('click', async () => {
        if (!authManager.isAuthenticated() || toggle.disabled) return;
        const nextValue = toggle.getAttribute('aria-checked') !== 'true';
        toggle.disabled = true;
        try {
            renderPrefs(await notificationsApi.setEmailEnabled(nextValue));
        } catch {
            showError();
        } finally {
            toggle.disabled = false;
        }
    });

    try {
        const session = await bindAuthSession({ authManager, root });
        session.subscribe(() => {
            void load();
        }, { emitCurrent: false });
        await load();
    } catch {
        showError();
    }
}

document.addEventListener('DOMContentLoaded', () => initializeSettingsPage());
