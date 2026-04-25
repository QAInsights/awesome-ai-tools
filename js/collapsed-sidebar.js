/**
 * Collapsed Sidebar Component
 * Icon-only view shown when sidebar is collapsed on desktop
 */

export class CollapsedSidebar {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.onExpand = options.onExpand || (() => {});
        this.onSearchClick = options.onSearchClick || (() => {});
        this.onSignInClick = options.onSignInClick || (() => {});
        this.onUserClick = options.onUserClick || (() => {});
        this.isAuthenticated = false;
        this.userAvatar = null;

        if (this.container) {
            this.render();
            this.attachListeners();
        }
    }

    render() {
        const icons = [
            { id: 'expandBtn', title: 'Open sidebar', svg: this.svgs.expand },
            { id: 'submitBtn', title: 'Submit a Tool', svg: this.svgs.plus, href: 'https://github.com/QAInsights/awesome-ai-tools/issues/new?template=submit-tool.yml' },
            { id: 'supportBtn', title: 'Support Project', svg: this.svgs.coffee, href: 'https://buymeacoffee.com/qainsights' },
            { id: 'searchBtn', title: 'Search', svg: this.svgs.search },
        ];

        this.container.innerHTML = `
            ${icons.map(icon => icon.href
                ? `<a href="${icon.href}" target="_blank" rel="noopener noreferrer" class="cs-icon" title="${icon.title}">${icon.svg}</a>`
                : `<button id="${icon.id}" class="cs-icon" title="${icon.title}">${icon.svg}</button>`
            ).join('')}
        `;
    }

    attachListeners() {
        this.container.querySelector('#expandBtn')?.addEventListener('click', () => this.onExpand());
        this.container.querySelector('#searchBtn')?.addEventListener('click', () => this.onSearchClick());
        this.container.querySelector('#signInBtn')?.addEventListener('click', () => this.onSignInClick());
        this.container.querySelector('#userBtn')?.addEventListener('click', () => this.onUserClick());
    }

    setAuthState(isAuth, avatarUrl = null) {
        this.isAuthenticated = isAuth;
        this.userAvatar = avatarUrl;
    }

    get svgs() {
        return {
            expand: `<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>`,
            plus: `<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`,
            coffee: `<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>`,
            search: `<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
            signIn: `<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>`,
        };
    }
}
