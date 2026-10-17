import { EVENTS } from '../../src/lib/analytics-events.js';
import { analytics } from '../analytics-client.js';
import { authAttribution } from '../auth-attribution.js';
import { auth } from '../auth.js';
import { bindAuthSession } from '../auth-session-binding.js';
import { clearPendingNewsSubscribe, syncNewsSubscribe } from '../news-subscribe.js';

export function initAuthManager(callbacks) {
    const { onStateChange, collapsedSidebar } = callbacks;
    let newsSubscribeGeneration = 0;

    async function initializeAuth() {
        try {
            const session = await bindAuthSession();

            // Modal logic
            const signInTriggerBtn = document.getElementById('signInTriggerBtn');
            const signInModal = document.getElementById('signInModal');
            const closeSignInModal = document.getElementById('closeSignInModal');
            const signInModalOverlay = document.getElementById('signInModalOverlay');

            if (signInTriggerBtn && signInModal) {
                signInTriggerBtn.addEventListener('click', () => {
                    const trigger = authAttribution.begin();
                    if (trigger !== 'news_cta') {
                        clearPendingNewsSubscribe();
                    }
                    analytics.track(EVENTS.SIGNIN_MODAL_SHOWN, { trigger });
                    signInModal.classList.remove('hidden');
                    // Render buttons only when modal opens to ensure container is ready
                    renderSignInButtons();
                });

                const closeModal = () => {
                    signInModal.classList.add('hidden');
                    if (!auth.isAuthenticated()) {
                        clearPendingNewsSubscribe();
                    }
                };
                closeSignInModal?.addEventListener('click', closeModal);
                signInModalOverlay?.addEventListener('click', closeModal);
            }

            // Set up sign out button
            const signOutBtn = document.getElementById('signOutBtn');
            if (signOutBtn) {
                signOutBtn.addEventListener('click', () => {
                    auth.signOut();
                    const userMenuPopup = document.getElementById('userMenuPopup');
                    if (userMenuPopup) userMenuPopup.classList.add('hidden');
                });
            }

            // Set up user profile popup toggling
            const userProfileBtn = document.getElementById('userProfileBtn');
            const userMenuPopup = document.getElementById('userMenuPopup');
            if (userProfileBtn && userMenuPopup) {
                userProfileBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    userMenuPopup.classList.toggle('hidden');
                });
                
                document.addEventListener('click', (e) => {
                    if (!userProfileBtn.contains(e.target) && !userMenuPopup.contains(e.target)) {
                        userMenuPopup.classList.add('hidden');
                    }
                });
            }

            // Initial UI update
            session.subscribe(handleAuthStateChange);
        } catch (error) {
            console.error('Auth initialization failed:', error);
        }
    }

    function renderSignInButtons() {
        auth.renderDevSignInButton('devSignInBtn');
        auth.renderSignInButton('googleSignInBtn', {
            theme: 'filled_black',
            size: 'large',
            text: 'signin_with',
            shape: 'pill',
            width: 320 // Wider for the modal
        });
        auth.renderGitHubSignInButton('githubSignInBtn');
    }

    function handleAuthStateChange({ user }) {
        updateAuthUI(user);
        const generation = ++newsSubscribeGeneration;
        void syncNewsSubscribe(user, {
            isCurrent: () => generation === newsSubscribeGeneration,
        });
        if (onStateChange) onStateChange(user);
        
        // Close modal if user just signed in
        if (user) {
            document.getElementById('signInModal')?.classList.add('hidden');
        }
    }

    function updateAuthUI(user) {
        const userProfile = document.getElementById('userProfile');
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');
        const userEmail = document.getElementById('userEmail');
        const signInTriggerBtn = document.getElementById('signInTriggerBtn');

        if (user) {
            // Show user profile
            if (userProfile) {
                userProfile.classList.remove('hidden');
                if (userAvatar) userAvatar.src = user.picture;
                if (userName) {
                    userName.textContent = user.githubUsername
                        ? `${user.name} (@${user.githubUsername})`
                        : user.name;
                }
                if (userEmail) userEmail.textContent = user.email || '';
            }

            // Hide sign-in trigger
            if (signInTriggerBtn) signInTriggerBtn.classList.add('hidden');

            // Update collapsed sidebar
            collapsedSidebar?.setAuthState(true, user.picture);
        } else {
            // Show Sign-in trigger
            if (signInTriggerBtn) {
                signInTriggerBtn.classList.remove('hidden');
            }

            // Hide user profile
            if (userProfile) {
                userProfile.classList.add('hidden');
            }

            // Update collapsed sidebar
            collapsedSidebar?.setAuthState(false);
        }
    }

    return { initializeAuth };
}
