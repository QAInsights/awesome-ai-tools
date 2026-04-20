/**
 * Gradient text selection — deep ocean theme: indigo → purple → cyan.
 * Uses per-rect fixed overlays with mix-blend-mode:screen so the effect
 * works correctly on the app's dark background without blocking pointer events.
 */

const OVERLAY_CLASS = 'gradient-sel-overlay';
let overlays = [];

function removeOverlays() {
    overlays.forEach(el => el.remove());
    overlays = [];
}

function applyGradientSelection() {
    removeOverlays();
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const rects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0);
    if (!rects.length) return;

    rects.forEach(rect => {
        const el = document.createElement('div');
        el.className = OVERLAY_CLASS;
        el.style.cssText =
            `position:fixed;left:${rect.left}px;top:${rect.top}px;` +
            `width:${rect.width}px;height:${rect.height}px;` +
            'background:linear-gradient(90deg,#ff0099,#c026d3);' +
            'mix-blend-mode:screen;opacity:0.8;pointer-events:none;z-index:9999;border-radius:2px;';
        document.body.appendChild(el);
        overlays.push(el);
    });
}

export function initGradientSelection() {
    document.addEventListener('selectionchange', applyGradientSelection);
    document.addEventListener('scroll', applyGradientSelection, { capture: true, passive: true });
    window.addEventListener('blur', removeOverlays);
}
