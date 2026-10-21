import { EVENTS } from '../../src/lib/analytics-events.js';
import { analytics } from '../analytics-client.js';
import { authAttribution } from '../auth-attribution.js';
import { auth } from '../auth.js';
import { bindAuthSession } from '../auth-session-binding.js';
import { clearPendingNewsSubscribe, syncNewsSubscribe } from '../news-subscribe.js';

export function getSignInModalOrder(emailFirst) {
    return emailFirst
        ? ['emailSignInFlow', 'emailOauthDivider', 'oauthSignInGroup']
        : ['oauthSignInGroup', 'emailOauthDivider', 'emailSignInFlow'];
}

export function initAuthManager(callbacks) {
    const { onStateChange, collapsedSidebar } = callbacks;
    let newsSubscribeGeneration = 0;
    let resetSignInModalLayout = () => {};

    async function initializeAuth() {
        try {
            const session = await bindAuthSession();

            // Modal logic
            const signInTriggerBtn = document.getElementById('signInTriggerBtn');
            const signInModal = document.getElementById('signInModal');
            const closeSignInModal = document.getElementById('closeSignInModal');
            const signInModalOverlay = document.getElementById('signInModalOverlay');
            const signInMethods = document.getElementById('signInMethods');
            const oauthGroup = document.getElementById('oauthSignInGroup');
            const emailDivider = document.getElementById('emailOauthDivider');
            const emailFlow = document.getElementById('emailSignInFlow');
            const signInHeadline = document.getElementById('signInHeadline');
            const emailSubcopy = document.getElementById('signInEmailSubcopy');
            const signInBenefits = document.getElementById('signInBenefits');
            const emailStartForm = document.getElementById('emailStartForm');
            const emailInput = document.getElementById('emailAddressInput');
            const emailCodeStep = document.getElementById('emailCodeStep');
            const emailCodePromptAddress = document.getElementById('emailCodePromptAddress');
            const emailCodeInput = document.getElementById('emailCodeInput');
            const verifyEmailForm = document.getElementById('verifyEmailForm');
            const requestCodeButton = document.getElementById('requestEmailCode');
            const verifyCodeButton = document.getElementById('verifyEmailCode');
            const resendCodeButton = document.getElementById('resendEmailCode');
            const differentEmailButton = document.getElementById('useDifferentEmail');
            const emailError = document.getElementById('emailAuthError');
            let activeEmail = '';
            let resendTimer = null;
            let emailFlowGeneration = 0;

            function clearResendTimer() {
                if (resendTimer !== null) clearInterval(resendTimer);
                resendTimer = null;
            }

            function setEmailError(message = '') {
                if (!emailError) return;
                emailError.textContent = message;
            }

            function describeEmailError(error, fallback) {
                if (error?.status === 400) return 'Check the email address and try again.';
                if (error?.status === 401) return 'That code is invalid or expired. Check it and try again.';
                if (error?.status === 429) return 'Too many requests. Wait a moment or request a new code.';
                if (error?.status === 503) return 'Email sign-in is temporarily unavailable. Try again shortly.';
                return fallback;
            }

            function setBusy(button, busy, label, busyLabel) {
                if (!button) return;
                button.disabled = busy;
                button.textContent = busy ? busyLabel : label;
            }

            function startResendCountdown(generation) {
                if (generation !== emailFlowGeneration) return;
                clearResendTimer();
                let remaining = 30;
                resendCodeButton.disabled = true;
                resendCodeButton.textContent = `Resend code in ${remaining}s`;
                resendTimer = setInterval(() => {
                    if (generation !== emailFlowGeneration) {
                        clearResendTimer();
                        return;
                    }
                    remaining -= 1;
                    if (remaining <= 0) {
                        clearResendTimer();
                        resendCodeButton.disabled = false;
                        resendCodeButton.textContent = 'Resend code';
                    } else {
                        resendCodeButton.textContent = `Resend code in ${remaining}s`;
                    }
                }, 1000);
            }

            function resetEmailFlow() {
                emailFlowGeneration += 1;
                clearResendTimer();
                activeEmail = '';
                emailStartForm?.reset();
                if (emailCodePromptAddress) emailCodePromptAddress.textContent = '';
                if (emailInput) emailInput.disabled = false;
                if (emailCodeInput) {
                    emailCodeInput.value = '';
                    emailCodeInput.disabled = false;
                }
                emailStartForm?.classList.remove('hidden');
                emailCodeStep?.classList.add('hidden');
                emailCodeStep?.classList.remove('flex');
                setBusy(requestCodeButton, false, 'Continue with email', 'Sending code...');
                setBusy(verifyCodeButton, false, 'Verify code', 'Checking code...');
                if (resendCodeButton) {
                    resendCodeButton.disabled = true;
                    resendCodeButton.textContent = 'Resend code in 30s';
                }
                if (differentEmailButton) differentEmailButton.disabled = false;
                setEmailError('');
            }

            function resetModalLayout() {
                resetEmailFlow();
                if (signInHeadline) signInHeadline.textContent = 'Track your AI stack';
                emailSubcopy?.classList.add('hidden');
                signInBenefits?.classList.remove('hidden');
                if (signInMethods && oauthGroup && emailDivider && emailFlow) {
                    const elements = {
                        oauthSignInGroup: oauthGroup,
                        emailOauthDivider: emailDivider,
                        emailSignInFlow: emailFlow,
                    };
                    for (const id of getSignInModalOrder(false)) {
                        signInMethods.append(elements[id]);
                    }
                }
            }
            resetSignInModalLayout = resetModalLayout;

            function configureModalForTrigger(trigger) {
                resetEmailFlow();
                const emailFirst = trigger === 'follow_bell' || trigger === 'news_cta';
                if (!emailFirst) {
                    resetModalLayout();
                    return;
                }
                if (signInHeadline) {
                    const subject = trigger === 'follow_bell' ? authAttribution.subject() : '';
                    if (trigger === 'news_cta') {
                        signInHeadline.textContent = 'Get the daily brief by email';
                    } else if (subject) {
                        signInHeadline.textContent = `Get updates about ${subject} by email`;
                    } else {
                        signInHeadline.textContent = 'Get updates by email';
                    }
                }
                emailSubcopy?.classList.remove('hidden');
                signInBenefits?.classList.add('hidden');
                if (signInMethods && oauthGroup && emailFlow && emailDivider) {
                    const elements = {
                        oauthSignInGroup: oauthGroup,
                        emailOauthDivider: emailDivider,
                        emailSignInFlow: emailFlow,
                    };
                    for (const id of getSignInModalOrder(emailFirst)) {
                        signInMethods.append(elements[id]);
                    }
                }
                setTimeout(() => emailInput?.focus(), 0);
            }

            emailStartForm?.addEventListener('submit', async event => {
                event.preventDefault();
                if (!emailInput?.reportValidity()) return;
                activeEmail = emailInput.value.trim();
                setEmailError('');
                setBusy(requestCodeButton, true, 'Continue with email', 'Sending code...');
                const generation = emailFlowGeneration;
                try {
                    await auth.requestEmailCode(activeEmail);
                    if (generation !== emailFlowGeneration) return;
                    if (emailCodePromptAddress) emailCodePromptAddress.textContent = activeEmail;
                    emailStartForm.classList.add('hidden');
                    emailCodeStep.classList.remove('hidden');
                    emailCodeStep.classList.add('flex');
                    startResendCountdown(generation);
                    emailCodeInput.focus();
                } catch (error) {
                    if (generation !== emailFlowGeneration) return;
                    setEmailError(describeEmailError(error, 'Could not send a code. Try again.'));
                } finally {
                    if (generation === emailFlowGeneration && requestCodeButton) {
                        requestCodeButton.disabled = false;
                        requestCodeButton.textContent = 'Continue with email';
                    }
                }
            });

            async function submitEmailCode() {
                if (!activeEmail || !emailCodeInput || verifyCodeButton?.disabled) return;
                setEmailError('');
                setBusy(verifyCodeButton, true, 'Verify code', 'Checking code...');
                emailCodeInput.disabled = true;
                if (differentEmailButton) differentEmailButton.disabled = true;
                const generation = emailFlowGeneration;
                try {
                    await auth.verifyEmailCode(activeEmail, emailCodeInput.value);
                } catch (error) {
                    if (generation !== emailFlowGeneration) return;
                    setEmailError(describeEmailError(error, 'Could not verify the code. Try again.'));
                    emailCodeInput.disabled = false;
                    emailCodeInput.focus();
                } finally {
                    if (generation === emailFlowGeneration && verifyCodeButton) {
                        verifyCodeButton.disabled = false;
                        verifyCodeButton.textContent = 'Verify code';
                    }
                    if (generation === emailFlowGeneration && differentEmailButton) {
                        differentEmailButton.disabled = false;
                    }
                }
            }

            verifyEmailForm?.addEventListener('submit', event => {
                event.preventDefault();
                void submitEmailCode();
            });
            emailCodeInput?.addEventListener('input', () => {
                emailCodeInput.value = emailCodeInput.value.replace(/\D/g, '').slice(0, 6);
                if (emailCodeInput.value.length === 6) void submitEmailCode();
            });
            differentEmailButton?.addEventListener('click', () => {
                if (differentEmailButton.disabled || verifyCodeButton?.disabled) return;
                resetEmailFlow();
                emailInput?.focus();
            });
            resendCodeButton?.addEventListener('click', async () => {
                if (!activeEmail || resendCodeButton.disabled) return;
                setEmailError('');
                resendCodeButton.disabled = true;
                resendCodeButton.textContent = 'Sending code...';
                const generation = emailFlowGeneration;
                try {
                    await auth.requestEmailCode(activeEmail, { resend: true });
                    if (generation !== emailFlowGeneration) return;
                    startResendCountdown(generation);
                } catch (error) {
                    if (generation !== emailFlowGeneration) return;
                    resendCodeButton.disabled = false;
                    resendCodeButton.textContent = 'Resend code';
                    setEmailError(describeEmailError(error, 'Could not resend the code. Try again.'));
                }
            });

            if (signInTriggerBtn && signInModal) {
                signInTriggerBtn.addEventListener('click', () => {
                    const trigger = authAttribution.begin();
                    if (trigger !== 'news_cta') {
                        clearPendingNewsSubscribe();
                    }
                    analytics.track(EVENTS.SIGNIN_MODAL_SHOWN, { trigger });
                    configureModalForTrigger(trigger);
                    signInModal.classList.remove('hidden');
                    // Render buttons only when modal opens to ensure container is ready
                    renderSignInButtons();
                });

                const closeModal = () => {
                    signInModal.classList.add('hidden');
                    resetModalLayout();
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
            resetSignInModalLayout();
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
                if (userAvatar) userAvatar.src = user.picture || fallbackAvatar(user.name);
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
            collapsedSidebar?.setAuthState(true, user.picture || fallbackAvatar(user.name));
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

    function fallbackAvatar(name = '') {
        const initial = (Array.from(String(name).trim())[0]?.toUpperCase() || '?')
            .replace(/[<>&"']/g, character => ({
                '<': '&lt;',
                '>': '&gt;',
                '&': '&amp;',
                '"': '&quot;',
                "'": '&apos;',
            })[character]);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="#27231b"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#d6b77a" font-family="Arial,sans-serif" font-size="30" font-weight="700">${initial}</text></svg>`;
        return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }

    return { initializeAuth };
}
