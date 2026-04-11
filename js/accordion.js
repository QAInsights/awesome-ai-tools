/**
 * Accordion Component
 * Reusable collapsible section with animated height, icon rotation, and optional count badge.
 */

export class Accordion {
    constructor({ toggleId, contentId, iconId, countId } = {}) {
        this.toggle = document.getElementById(toggleId);
        this.content = document.getElementById(contentId);
        this.icon = document.getElementById(iconId);
        this.countEl = countId ? document.getElementById(countId) : null;
        this.expanded = false;
        this._onExpanded = null;
        if (this.content) this.content.style.overflow = 'hidden';

        if (this.toggle) {
            this.toggle.addEventListener('click', () => this.toggleState());
        }
    }

    expand() {
        if (!this.content) return;
        this.expanded = true;
        this.content.style.maxHeight = this.content.scrollHeight + 'px';
        this.content.classList.remove('opacity-0');
        this.content.classList.add('opacity-100');
        if (this.icon) this.icon.style.transform = 'rotate(180deg)';
        if (this.toggle) this.toggle.setAttribute('aria-expanded', 'true');
        if (this._onExpanded) {
            this.content.removeEventListener('transitionend', this._onExpanded);
        }
        this._onExpanded = (e) => {
            if (e.propertyName !== 'max-height') return;
            this.content.removeEventListener('transitionend', this._onExpanded);
            this._onExpanded = null;
            if (this.expanded) {
                this.content.style.maxHeight = 'none';
                this.content.style.overflow = '';
            }
        };
        this.content.addEventListener('transitionend', this._onExpanded);
    }

    collapse() {
        if (!this.content) return;
        this.expanded = false;
        if (this._onExpanded) {
            this.content.removeEventListener('transitionend', this._onExpanded);
            this._onExpanded = null;
        }
        this.content.style.overflow = 'hidden';
        this.content.style.maxHeight = this.content.getBoundingClientRect().height + 'px';
        void this.content.offsetHeight;
        requestAnimationFrame(() => { this.content.style.maxHeight = '0'; });
        this.content.classList.remove('opacity-100');
        this.content.classList.add('opacity-0');
        if (this.icon) this.icon.style.transform = 'rotate(0deg)';
        if (this.toggle) this.toggle.setAttribute('aria-expanded', 'false');
    }

    toggleState() {
        this.expanded ? this.collapse() : this.expand();
    }

    setCount(count) {
        if (this.countEl) this.countEl.textContent = count;
    }
}
