// Stack Duo: 3D foldable phone on public stack pages. three.js loads only when the section nears the viewport.
function hasWebGL() {
    try {
        const c = document.createElement('canvas');
        return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
        return false;
    }
}

function initCopyLink(section) {
    const btn = section.querySelector('[data-sd-copy]');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        const label = btn.querySelector('span') ?? btn;
        const original = label.textContent;
        try {
            await navigator.clipboard.writeText(btn.dataset.sdCopy || location.href);
            label.textContent = 'Link copied';
        } catch {
            label.textContent = 'Copy failed';
        }
        setTimeout(() => { label.textContent = original; }, 1800);
    });
}

const section = document.querySelector('[data-stack-duo]');
if (section) {
    initCopyLink(section);
    if (!hasWebGL()) {
        section.classList.add('is-static');
    } else {
        let started = false;
        const start = () => {
            if (started) return;
            started = true;
            import('./stack-duo-scene.js')
                .then(m => m.mountStackDuo(section))
                .catch(err => {
                    console.error('[Stack Duo] Failed to start:', err instanceof Error ? err.message : String(err));
                    section.classList.add('is-static');
                });
        };
        const io = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting)) { io.disconnect(); start(); }
        }, { rootMargin: '400px 0px' });
        io.observe(section);
    }
}
