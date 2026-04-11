/**
 * Authentication Module — Multi-provider (Google + GitHub)
 * Handles user authentication, session management, and profile data.
 *
 * Providers:
 *   - Google: via Google Identity Services (GIS), fully client-side JWT
 *   - GitHub: via OAuth Authorization Code flow w/ Vercel serverless callback
 */

class AuthManager {
    constructor() {
        this.user = null;
        this.isInitialized = false;
        this.authListeners = [];
        this.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
        this.GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
        // OAuth scopes: read public profile + email address
        this.GITHUB_SCOPE = 'read:user user:email';
    }

    // ─── Google OAuth ──────────────────────────────────────────────────────────

    /**
     * Initialize Google OAuth (loads GIS SDK, restores session).
     */
    async initialize() {
        if (this.isInitialized) return;

        // Handle any pending GitHub callback FIRST before rendering UI
        const githubHandled = this.handleGitHubCallback();
        if (githubHandled) {
            this.isInitialized = true;
            return;
        }

        try {
            await this._loadGoogleScript();

            window.google.accounts.id.initialize({
                client_id: this.GOOGLE_CLIENT_ID,
                callback: this._handleGoogleCredential.bind(this),
                auto_select: false,
                cancel_on_tap_outside: true,
            });

            this.isInitialized = true;
            console.log('[Auth] Google OAuth initialized');

            this._checkExistingSession();
        } catch (error) {
            console.error('[Auth] Failed to initialize Google OAuth:', error);
        }
    }

    /**
     * Load Google Identity Services script dynamically.
     * @returns {Promise<void>}
     */
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

    /**
     * Render the Google Sign-In button into the given container element.
     * @param {string} containerId
     * @param {object} [options]
     */
    renderSignInButton(containerId, options = {}) {
        if (!this.isInitialized || !window.google?.accounts?.id) {
            console.warn('[Auth] Google not initialized. Call initialize() first.');
            return;
        }

        const defaults = {
            theme: 'filled_black',
            size: 'large',
            text: 'signin_with',
            shape: 'rectangular',
            logo_alignment: 'left',
            width: 280,
        };

        window.google.accounts.id.renderButton(
            document.getElementById(containerId),
            { ...defaults, ...options }
        );
    }

    /**
     * Handle incoming Google credential (JWT) from GIS.
     * @param {{ credential: string }} response
     */
    async _handleGoogleCredential(response) {
        try {
            const payload = this._parseJWT(response.credential);

            this.user = {
                provider: 'google',
                id: payload.sub,
                name: payload.name,
                email: payload.email,
                picture: payload.picture,
                emailVerified: payload.email_verified,
                githubUsername: null,
            };

            this._storeSession(response.credential);
            this._notifyAuthChange('signin');
            console.log('[Auth] Google sign-in:', this.user.name);
        } catch (error) {
            console.error('[Auth] Error handling Google credential:', error);
            this._notifyAuthChange('error', error);
        }
    }

    /**
     * Decode a JWT payload (client-side only — not a security verification).
     * @param {string} token
     */
    _parseJWT(token) {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split('')
                .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        return JSON.parse(jsonPayload);
    }

    // ─── GitHub OAuth ──────────────────────────────────────────────────────────

    /**
     * Render a styled "Sign in with GitHub" button into the given container.
     * @param {string} containerId
     */
    renderGitHubSignInButton(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <button id="githubSignInBtnEl" class="github-signin-btn" aria-label="Sign in with GitHub">
                <svg viewBox="0 0 98 96" width="18" height="18" fill="currentColor" aria-hidden="true">
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"/>
                </svg>
                Sign in with GitHub
            </button>
        `;

        container.querySelector('#githubSignInBtnEl').addEventListener('click', () => {
            this.initiateGitHubSignIn();
        });
    }

    /**
     * Generate a cryptographic state nonce for CSRF protection.
     * @returns {string}
     */
    _generateState() {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Build the current origin path to redirect back to after GitHub auth.
     * @returns {string}
     */
    _getCurrentOriginPath() {
        const allowed = [
            '/', '/settings.html', '/zap.html', '/help.html',
            '/tools/token-counter.html', '/tools/hallucination-scorer.html',
        ];
        const path = window.location.pathname;
        return allowed.includes(path) ? path : '/';
    }

    /**
     * Redirect the user to GitHub's authorization page.
     * Stores the CSRF state nonce in sessionStorage.
     */
    initiateGitHubSignIn() {
        if (!this.GITHUB_CLIENT_ID) {
            console.error('[Auth] GITHUB_CLIENT_ID is not configured.');
            return;
        }

        const state = this._generateState();
        sessionStorage.setItem('github_oauth_state', state);
        
        // Save origin path locally because GitHub strips custom query params
        sessionStorage.setItem('github_auth_origin', this._getCurrentOriginPath());

        const redirectUri = `${window.location.origin}/api/auth/github`;

        const params = new URLSearchParams({
            client_id: this.GITHUB_CLIENT_ID,
            redirect_uri: redirectUri,
            scope: this.GITHUB_SCOPE,
            state,
        });

        window.location.href = `https://github.com/login/oauth/authorize?${params}`;
    }

    /**
     * Check whether the current URL contains a ?github_auth= param (i.e. we
     * just returned from the Vercel OAuth callback). If so, parse, validate,
     * and store the session, then clean the URL.
     *
     * @returns {boolean} true if a GitHub callback was handled
     */
    handleGitHubCallback() {
        const params = new URLSearchParams(window.location.search);

        // Handle auth errors from the callback
        const authError = params.get('auth_error');
        if (authError) {
            console.error('[Auth] GitHub auth error:', decodeURIComponent(authError));
            // Clean the URL, then notify (no user set)
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, '', cleanUrl);
            this._notifyAuthChange('error', new Error(decodeURIComponent(authError)));
            return true;
        }

        const githubAuth = params.get('github_auth');
        const returnedState = params.get('state');
        if (!githubAuth) return false;

        // CSRF: verify the returned state matches what we stored
        const storedState = sessionStorage.getItem('github_oauth_state');
        sessionStorage.removeItem('github_oauth_state');

        if (!storedState || storedState !== returnedState) {
            console.error('[Auth] GitHub OAuth state mismatch — possible CSRF attack, aborting.');
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, '', cleanUrl);
            this._notifyAuthChange('error', new Error('OAuth state mismatch'));
            return true;
        }

        try {
            const decoded = JSON.parse(atob(githubAuth.replace(/-/g, '+').replace(/_/g, '/')));

            this.user = {
                provider: 'github',
                id: decoded.id,
                name: decoded.name,
                email: decoded.email,
                picture: decoded.picture,
                emailVerified: decoded.emailVerified,
                githubUsername: decoded.githubUsername,
            };

            // Store session using the encoded payload as the "credential"
            this._storeSession(githubAuth);

            // Clean the URL so the token isn't left in the address bar
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, '', cleanUrl);

            this._notifyAuthChange('signin');
            console.log('[Auth] GitHub sign-in:', this.user.name, `(@${this.user.githubUsername})`);
            return true;
        } catch (error) {
            console.error('[Auth] Failed to parse GitHub auth payload:', error);
            this._notifyAuthChange('error', error);
            return true;
        }
    }

    // ─── Session Management ────────────────────────────────────────────────────

    /**
     * Persist session to localStorage (24-hour TTL).
     * @param {string} credential - JWT (Google) or base64url user blob (GitHub)
     */
    _storeSession(credential) {
        const sessionData = {
            credential,
            user: this.user,
            timestamp: Date.now(),
        };
        localStorage.setItem('auth_session', JSON.stringify(sessionData));
    }

    /**
     * Restore session from localStorage if still valid.
     */
    _checkExistingSession() {
        const sessionData = localStorage.getItem('auth_session');
        if (!sessionData) return;

        try {
            const session = JSON.parse(sessionData);
            const isExpired = Date.now() - session.timestamp > 24 * 60 * 60 * 1000;

            if (!isExpired && session.user) {
                this.user = session.user;
                // Back-fill githubUsername for sessions saved before this field existed
                if (!('githubUsername' in this.user)) {
                    this.user.githubUsername = null;
                }
                this._notifyAuthChange('session_restored');
                console.log('[Auth] Session restored for:', this.user.name);
            } else {
                this._clearSession();
            }
        } catch (error) {
            console.error('[Auth] Error parsing session:', error);
            this._clearSession();
        }
    }

    /**
     * Sign out the current user, regardless of provider.
     */
    signOut() {
        if (this.user?.provider === 'google' && window.google?.accounts?.id) {
            window.google.accounts.id.disableAutoSelect();
        }

        this._clearSession();
        this.user = null;
        this._notifyAuthChange('signout');
        console.log('[Auth] User signed out');
    }

    /**
     * Remove the stored session from localStorage.
     */
    _clearSession() {
        localStorage.removeItem('auth_session');
    }

    // ─── Public API ────────────────────────────────────────────────────────────

    /** @returns {object|null} The current user, or null if not authenticated. */
    getCurrentUser() {
        return this.user;
    }

    /** @returns {boolean} */
    isAuthenticated() {
        return this.user !== null;
    }

    /**
     * Register a callback for auth state changes.
     * @param {Function} callback - Receives `{ event, user, error }`
     */
    onAuthChange(callback) {
        this.authListeners.push(callback);
    }

    /**
     * Unregister an auth state callback.
     * @param {Function} callback
     */
    offAuthChange(callback) {
        this.authListeners = this.authListeners.filter(l => l !== callback);
    }

    /**
     * Fire all registered auth listeners.
     * @param {string} event
     * @param {Error|null} [error]
     */
    _notifyAuthChange(event, error = null) {
        this.authListeners.forEach(callback => {
            try {
                callback({ event, user: this.user, error });
            } catch (err) {
                console.error('[Auth] Error in auth listener:', err);
            }
        });
    }

    /**
     * Show Google One Tap prompt (optional, only when not authenticated).
     */
    showOneTap() {
        if (!this.isInitialized || this.user) return;

        window.google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                console.log('[Auth] One Tap not displayed or skipped');
            }
        });
    }
}

// Export singleton instance
export const auth = new AuthManager();
