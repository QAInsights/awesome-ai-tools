import { EVENTS } from '../src/lib/analytics-events.js';
import { resolveAuthReturnPath } from '../src/lib/auth-session.js';
import { analytics } from './analytics-client.js';
import { authAttribution } from './auth-attribution.js';
import { sessionClient } from './session-client.js';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export class AuthManager {
    constructor(sessions = sessionClient) {
        this.sessions = sessions;
        this.user = null;
        this.isInitialized = false;
        this.isGoogleInitialized = false;
        this.authListeners = [];
        this.initializationPromise = null;
        this.sessionMutation = Promise.resolve();
        this.GOOGLE_CLIENT_ID = '';
        this.GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
        this.GITHUB_SCOPE = 'read:user user:email';
    }

    async initialize() {
        if (this.isInitialized) return;
        if (!this.initializationPromise) {
            this.initializationPromise = (async () => {
                const callback = this.handleGitHubCallback();
                await this._restoreSession(callback);
                await this._loadProviderConfig();
                await this._initializeGoogle();
                this.isInitialized = true;
            })();
        }
        await this.initializationPromise;
    }

    async _restoreSession(callbackStatus) {
        try {
            this.user = await this.sessions.get();
            if (this.user) {
                this._notifyAuthChange(callbackStatus === 'success' ? 'signin' : 'session_restored');
            } else if (callbackStatus === 'success') {
                this._notifyAuthChange('error', new Error('GitHub session was not created'));
            }
            return this.user;
        } catch (error) {
            this.user = null;
            console.error('[Auth] Session restore failed:', error);
            this._notifyAuthChange('error', error);
            return null;
        }
    }

    _queueSessionMutation(operation) {
        const result = this.sessionMutation.then(operation);
        this.sessionMutation = result.catch(() => {});
        return result;
    }

    async _loadProviderConfig() {
        try {
            const config = await this.sessions.getConfig();
            this.GOOGLE_CLIENT_ID = config.googleClientId || '';
        } catch (error) {
            this.GOOGLE_CLIENT_ID = '';
            console.error('[Auth] Provider configuration failed:', error);
        }
    }

    async _initializeGoogle() {
        if (!this.GOOGLE_CLIENT_ID) return;

        try {
            await this._loadGoogleScript();
            window.google.accounts.id.initialize({
                client_id: this.GOOGLE_CLIENT_ID,
                callback: this._handleGoogleCredential.bind(this),
                auto_select: false,
                cancel_on_tap_outside: true,
            });
            this.isGoogleInitialized = true;
        } catch (error) {
            console.error('[Auth] Google OAuth unavailable:', error);
        }
    }

    _loadGoogleScript() {
        return new Promise((resolve, reject) => {
            if (window.google?.accounts?.id) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
            document.head.appendChild(script);
        });
    }

    renderSignInButton(containerId, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!this.isGoogleInitialized) {
            container.replaceChildren();
            return;
        }

        window.google.accounts.id.renderButton(container, {
            theme: 'filled_black',
            size: 'large',
            text: 'signin_with',
            shape: 'rectangular',
            logo_alignment: 'left',
            width: 280,
            ...options,
        });
    }

    async _handleGoogleCredential(response) {
        analytics.track(EVENTS.SIGNIN_STARTED, { provider: 'google', trigger: authAttribution.current() });
        try {
            return await this._queueSessionMutation(async () => {
                this.user = await this.sessions.createGoogle(response.credential);
                this._notifyAuthChange('signin');
                return this.user;
            });
        } catch (error) {
            console.error('[Auth] Google sign-in failed:', error);
            this._notifyAuthChange('error', error);
            return null;
        }
    }

    async _postEmailAuth(path, payload, operation) {
        const response = await fetch(path, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        let data = {};
        try {
            data = await response.json();
        } catch {}
        if (!response.ok) {
            const error = new Error(typeof data.error === 'string' ? data.error : `${operation} failed`);
            error.status = response.status;
            throw error;
        }
        return data;
    }

    async requestEmailCode(email, { resend = false } = {}) {
        if (!resend) {
            analytics.track(EVENTS.SIGNIN_STARTED, { provider: 'email', trigger: authAttribution.current() });
        }
        return this._postEmailAuth('/api/auth/email/start', { email }, 'Email code request');
    }

    async verifyEmailCode(email, code) {
        return this._queueSessionMutation(async () => {
            const result = await this._postEmailAuth(
                '/api/auth/email/verify',
                { email, code },
                'Email sign-in',
            );
            if (!result.user) throw new Error('Email sign-in did not return a user');
            this.user = result.user;
            this._notifyAuthChange('signin');
            return this.user;
        });
    }

    renderGitHubSignInButton(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!this.GITHUB_CLIENT_ID) {
            container.replaceChildren();
            return;
        }

        container.innerHTML = `
            <button id="githubSignInBtnEl" class="github-signin-btn" type="button" aria-label="Sign in with GitHub">
                <svg viewBox="0 0 98 96" width="18" height="18" fill="currentColor" aria-hidden="true">
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"/>
                </svg>
                Sign in with GitHub
            </button>
        `;
        container.querySelector('#githubSignInBtnEl').addEventListener('click', () => this.initiateGitHubSignIn());
    }

    renderDevSignInButton(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!LOOPBACK_HOSTS.has(window.location.hostname)) {
            container.replaceChildren();
            return;
        }

        container.innerHTML = `
            <button id="devSignInBtnEl" class="dev-signin-btn" type="button" aria-label="Use local staging test account">
                Use local staging test account
            </button>
        `;
        container.querySelector('#devSignInBtnEl').addEventListener('click', async event => {
            const button = event.currentTarget;
            button.disabled = true;
            analytics.track(EVENTS.SIGNIN_STARTED, { provider: 'dev', trigger: authAttribution.current() });
            try {
                await this._queueSessionMutation(async () => {
                    this.user = await this.sessions.createDev();
                    this._notifyAuthChange('signin');
                });
            } catch (error) {
                console.error('[Auth] Development login failed:', error);
                this._notifyAuthChange('error', error);
            } finally {
                button.disabled = false;
            }
        });
    }

    _generateState() {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async initiateGitHubSignIn() {
        if (!this.GITHUB_CLIENT_ID) return;
        await this.sessionMutation;

        analytics.track(EVENTS.SIGNIN_STARTED, { provider: 'github', trigger: authAttribution.current() });
        const state = this._generateState();
        const originPath = resolveAuthReturnPath(window.location.pathname);
        const secureCookie = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `github_oauth_state=${state}; Path=/; SameSite=Lax${secureCookie}`;
        document.cookie = `github_auth_origin=${encodeURIComponent(originPath)}; Path=/; SameSite=Lax${secureCookie}`;

        const params = new URLSearchParams({
            client_id: this.GITHUB_CLIENT_ID,
            redirect_uri: `${window.location.origin}/api/auth/github`,
            scope: this.GITHUB_SCOPE,
            state,
        });
        window.location.href = `https://github.com/login/oauth/authorize?${params}`;
    }

    handleGitHubCallback() {
        const params = new URLSearchParams(window.location.search);
        const authError = params.get('auth_error');
        const githubAuth = params.get('github_auth');
        if (!authError && !githubAuth) return null;

        window.history.replaceState({}, '', window.location.pathname);
        if (authError) {
            const error = new Error(decodeURIComponent(authError));
            console.error('[Auth] GitHub auth error:', error.message);
            this._notifyAuthChange('error', error);
            return 'error';
        }
        return 'success';
    }

    async signOut() {
        return this._queueSessionMutation(async () => {
            try {
                await this.sessions.delete();
            } catch (error) {
                console.error('[Auth] Sign-out failed:', error);
                this._notifyAuthChange('error', error);
                return false;
            }
            if (this.user?.provider === 'google' && window.google?.accounts?.id) {
                window.google.accounts.id.disableAutoSelect();
            }
            this.user = null;
            this._notifyAuthChange('signout');
            return true;
        });
    }

    getCurrentUser() {
        return this.user;
    }

    isAuthenticated() {
        return this.user !== null;
    }

    onAuthChange(callback) {
        this.authListeners.push(callback);
    }

    offAuthChange(callback) {
        this.authListeners = this.authListeners.filter(listener => listener !== callback);
    }

    _notifyAuthChange(event, error = null) {
        this.authListeners.forEach(callback => {
            try {
                callback({ event, user: this.user, error });
            } catch (listenerError) {
                console.error('[Auth] Error in auth listener:', listenerError);
            }
        });
        if (event === 'signin') authAttribution.clear();
    }

    showOneTap() {
        if (!this.isGoogleInitialized || this.user) return;
        window.google.accounts.id.prompt();
    }
}

export const auth = new AuthManager();
