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
    async setNewsEnabled(newsEnabled) {
        const response = await fetch('/api/notifications/prefs', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newsEnabled }),
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
    const newsToggle = root.getElementById('notificationNewsToggle');
    const email = root.getElementById('notificationEmail');
    const warning = root.getElementById('notificationEmailWarning');
    const profileCard = root.getElementById('publicProfileCard');
    const profileSignedOut = root.getElementById('publicProfileSignedOut');
    const profileForm = root.getElementById('publicProfileForm');
    const profileInput = root.getElementById('publicUsername');
    const profileSave = root.getElementById('savePublicUsername');
    const profileStatus = root.getElementById('publicProfileStatus');
    const profileLink = root.getElementById('publicProfileLink');

    function hideStates() {
        [loading, signedOut, errorState, card].forEach(element => element?.classList.add('hidden'));
    }

    function renderPrefs(prefs) {
        hideStates();
        card?.classList.remove('hidden');
        renderToggle(toggle, prefs.emailEnabled);
        renderToggle(newsToggle, prefs.newsEnabled);
        email.textContent = prefs.email || 'No email on file';
        warning?.classList.toggle('hidden', Boolean(prefs.emailVerified));
    }

    function renderToggle(element, enabled) {
        element?.setAttribute('aria-checked', enabled ? 'true' : 'false');
        element?.classList.toggle('bg-[#c9aa6e]', enabled);
        element?.classList.toggle('bg-[#333]', !enabled);
        element?.querySelector('span')?.classList.toggle('translate-x-5', enabled);
        element?.querySelector('span')?.classList.toggle('translate-x-0', !enabled);
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

    async function loadPublicProfile() {
        if (!profileCard) return;
        profileCard.classList.remove('hidden');
        if (!authManager.isAuthenticated()) {
            profileSignedOut?.classList.remove('hidden');
            profileForm?.classList.add('hidden');
            return;
        }
        profileSignedOut?.classList.add('hidden');
        try {
            const response = await fetch('/api/account/username');
            const profile = await response.json();
            if (!response.ok) throw new Error(profile.message || profile.error || 'Could not load your username.');
            profileForm?.classList.remove('hidden');
            profileInput.value = profile.username || profile.suggestion || '';
            profileStatus.textContent = profile.username
                ? `Your public profile is @${profile.username}.`
                : 'Choose a username to publish your first stack.';
            profileStatus.classList.remove('text-red-200');
            if (profile.username) {
                profileLink.href = `/u/${encodeURIComponent(profile.username)}`;
                profileLink.classList.remove('hidden');
            } else {
                profileLink.classList.add('hidden');
            }
        } catch (error) {
            profileForm?.classList.remove('hidden');
            profileStatus.textContent = error.message || 'Could not load your username.';
            profileStatus.classList.add('text-red-200');
        }
    }

    profileForm?.addEventListener('submit', async event => {
        event.preventDefault();
        if (!authManager.isAuthenticated() || profileSave.disabled) return;
        profileSave.disabled = true;
        profileStatus.textContent = 'Saving…';
        profileStatus.classList.remove('text-red-200');
        try {
            const response = await fetch('/api/account/username', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: profileInput.value }),
            });
            const profile = await response.json();
            if (!response.ok) {
                const message = profile.error === 'username_change_limit'
                    ? 'You have reached the limit of five username changes. You can still reclaim a previous username.'
                    : profile.message || profile.error || 'Could not save your username.';
                throw new Error(message);
            }
            profileInput.value = profile.username;
            profileStatus.textContent = `Username saved as @${profile.username}. Previous profile and stack links redirect here.`;
            profileLink.href = `/u/${encodeURIComponent(profile.username)}`;
            profileLink.classList.remove('hidden');
        } catch (error) {
            profileStatus.textContent = error.message || 'Could not save your username.';
            profileStatus.classList.add('text-red-200');
        } finally {
            profileSave.disabled = false;
        }
    });

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

    newsToggle?.addEventListener('click', async () => {
        if (!authManager.isAuthenticated() || newsToggle.disabled) return;
        const nextValue = newsToggle.getAttribute('aria-checked') !== 'true';
        newsToggle.disabled = true;
        try {
            renderPrefs(await notificationsApi.setNewsEnabled(nextValue));
        } catch {
            showError();
        } finally {
            newsToggle.disabled = false;
        }
    });

    try {
        const session = await bindAuthSession({ authManager, root });
        session.subscribe(() => {
            void load();
            void loadPublicProfile();
        }, { emitCurrent: false });
        await Promise.all([load(), loadPublicProfile()]);
    } catch {
        showError();
    }
}

document.addEventListener('DOMContentLoaded', () => initializeSettingsPage());
