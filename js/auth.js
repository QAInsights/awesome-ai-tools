/**
 * Google OAuth Authentication Module
 * Handles user authentication, session management, and profile data
 */

class AuthManager {
    constructor() {
        this.user = null;
        this.isInitialized = false;
        this.authListeners = [];
        this.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
    }

    /**
     * Initialize Google OAuth
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            // Load Google Identity Services
            await this.loadGoogleScript();
            
            // Initialize Google Identity
            window.google.accounts.id.initialize({
                client_id: this.GOOGLE_CLIENT_ID,
                callback: this.handleCredentialResponse.bind(this),
                auto_select: false,
                cancel_on_tap_outside: true
            });

            this.isInitialized = true;
            console.log('Google OAuth initialized');
            
            // Check for existing session
            this.checkExistingSession();
        } catch (error) {
            console.error('Failed to initialize Google OAuth:', error);
        }
    }

    /**
     * Load Google Identity Services script
     */
    loadGoogleScript() {
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
     * Render Google Sign-In button
     */
    renderSignInButton(containerId, options = {}) {
        if (!this.isInitialized) {
            console.warn('Auth not initialized. Call initialize() first.');
            return;
        }

        const defaultOptions = {
            theme: 'filled_black',
            size: 'large',
            text: 'signin_with',
            shape: 'rectangular',
            logo_alignment: 'left',
            width: 300
        };

        const buttonOptions = { ...defaultOptions, ...options };
        
        window.google.accounts.id.renderButton(
            document.getElementById(containerId),
            buttonOptions
        );
    }

    /**
     * Handle Google credential response
     */
    async handleCredentialResponse(response) {
        try {
            const payload = this.parseJWT(response.credential);
            
            this.user = {
                id: payload.sub,
                email: payload.email,
                name: payload.name,
                picture: payload.picture,
                emailVerified: payload.email_verified
            };

            // Store session
            this.storeSession(response.credential);
            
            // Notify listeners
            this.notifyAuthChange('signin');
            
            console.log('User signed in:', this.user.name);
        } catch (error) {
            console.error('Error handling credential response:', error);
            this.notifyAuthChange('error', error);
        }
    }

    /**
     * Parse JWT token (client-side only for basic info)
     */
    parseJWT(token) {
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

    /**
     * Store session in localStorage
     */
    storeSession(credential) {
        const sessionData = {
            credential,
            user: this.user,
            timestamp: Date.now()
        };
        localStorage.setItem('auth_session', JSON.stringify(sessionData));
    }

    /**
     * Check for existing session
     */
    checkExistingSession() {
        const sessionData = localStorage.getItem('auth_session');
        if (!sessionData) return;

        try {
            const session = JSON.parse(sessionData);
            
            // Check if session is still valid (24 hours)
            const isExpired = Date.now() - session.timestamp > 24 * 60 * 60 * 1000;
            
            if (!isExpired) {
                this.user = session.user;
                this.notifyAuthChange('session_restored');
                console.log('Session restored for:', this.user.name);
            } else {
                this.clearSession();
            }
        } catch (error) {
            console.error('Error parsing session:', error);
            this.clearSession();
        }
    }

    /**
     * Sign out user
     */
    signOut() {
        if (window.google?.accounts?.id) {
            window.google.accounts.id.disableAutoSelect();
        }
        
        this.clearSession();
        this.user = null;
        this.notifyAuthChange('signout');
        
        console.log('User signed out');
    }

    /**
     * Clear stored session
     */
    clearSession() {
        localStorage.removeItem('auth_session');
    }

    /**
     * Get current user
     */
    getCurrentUser() {
        return this.user;
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return this.user !== null;
    }

    /**
     * Add authentication state listener
     */
    onAuthChange(callback) {
        this.authListeners.push(callback);
    }

    /**
     * Remove authentication state listener
     */
    offAuthChange(callback) {
        this.authListeners = this.authListeners.filter(listener => listener !== callback);
    }

    /**
     * Notify all listeners of auth state change
     */
    notifyAuthChange(event, error = null) {
        this.authListeners.forEach(callback => {
            try {
                callback({ event, user: this.user, error });
            } catch (err) {
                console.error('Error in auth listener:', err);
            }
        });
    }

    /**
     * Show Google One Tap (optional)
     */
    showOneTap() {
        if (!this.isInitialized || this.user) return;
        
        window.google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                console.log('One Tap not displayed or skipped');
            }
        });
    }
}

// Export singleton instance
export const auth = new AuthManager();
