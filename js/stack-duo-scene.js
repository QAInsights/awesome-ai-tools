import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Device proportions (world units). Inner display spans both halves; the outer display sits on the left half's back.
const H = 1.6, W = 1.12, T = 0.044, R = 0.17, BZ = 0.04, HR = 0.022, SR = R - BZ;
const SCALE = 1100;
const IW = Math.round(2 * (W - BZ) * SCALE), IH = Math.round((H - 2 * BZ) * SCALE);
const CW = Math.round((W - 2 * BZ) * SCALE), CH = IH;
const GOLD = '#c8a96a', INK = '#f4f4f2', MUTE = '#8b8b88', RULE = '#1d1d1c', DIM = '#4a4a48';
const bump = (x, c, w) => Math.exp(-((x - c) ** 2) / (2 * w * w));
const easeIO = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function shapeRR(x0, y0, x1, y1, rl, rr) {
    const s = new THREE.Shape();
    s.moveTo(x0 + rl, y0); s.lineTo(x1 - rr, y0);
    if (rr) s.absarc(x1 - rr, y0 + rr, rr, -Math.PI / 2, 0, false);
    s.lineTo(x1, y1 - rr);
    if (rr) s.absarc(x1 - rr, y1 - rr, rr, 0, Math.PI / 2, false);
    s.lineTo(x0 + rl, y1);
    if (rl) s.absarc(x0 + rl, y1 - rl, rl, Math.PI / 2, Math.PI, false);
    s.lineTo(x0, y0 + rl);
    if (rl) s.absarc(x0 + rl, y0 + rl, rl, Math.PI, Math.PI * 1.5, false);
    return s;
}
function bodyGeo(side) {
    const b = 0.016;
    const sh = side > 0
        ? shapeRR(b, -H / 2 + b, W - b, H / 2 - b, HR, R - b)
        : shapeRR(-W + b, -H / 2 + b, -b, H / 2 - b, R - b, HR);
    const g = new THREE.ExtrudeGeometry(sh, { depth: T - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 8, curveSegments: 40 });
    g.translate(0, 0, -T + b);
    g.computeVertexNormals();
    return g;
}
function faceGeo(x0, y0, x1, y1, rl, rr, u0 = 0, u1 = 1) {
    const g = new THREE.ShapeGeometry(shapeRR(x0, y0, x1, y1, rl, rr), 40);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, u0 + ((p.getX(i) - x0) / (x1 - x0)) * (u1 - u0), (p.getY(i) - y0) / (y1 - y0));
    return g;
}

// ---------- canvas drawing ----------
const F = (w, s) => `${w} ${s}px Inter, system-ui, sans-serif`;
function grad(c, x0, x1) {
    const g = c.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, '#a78bfa'); g.addColorStop(1, '#22d3ee');
    return g;
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function fit(c, text, maxW, weight, size, min) {
    let s = size;
    c.font = F(weight, s);
    while (s > min && c.measureText(text).width > maxW) { s -= 2; c.font = F(weight, s); }
    if (c.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && c.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t.trimEnd() + '…';
}
function aurora(c, w, h) {
    c.fillStyle = '#050506'; c.fillRect(0, 0, w, h);
    let g = c.createRadialGradient(w * 0.18, h, 0, w * 0.18, h, h * 0.8);
    g.addColorStop(0, 'rgba(34,211,238,0.10)'); g.addColorStop(1, 'rgba(34,211,238,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    g = c.createRadialGradient(w * 0.85, 0, 0, w * 0.85, 0, h * 0.8);
    g.addColorStop(0, 'rgba(167,139,250,0.14)'); g.addColorStop(1, 'rgba(167,139,250,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
}
function statusIcons(c, x, y, s) {
    c.fillStyle = '#ececea';
    for (let i = 0; i < 4; i++) { const bh = s * (0.35 + i * 0.22); rr(c, x - s * 3.3 + i * s * 0.42, y + s - bh, s * 0.28, bh, 3); c.fill(); }
    c.strokeStyle = 'rgba(236,236,234,.55)'; c.lineWidth = 3; rr(c, x - s * 1.55, y + s * 0.05, s * 1.35, s * 0.9, 9); c.stroke();
    rr(c, x - s * 1.42, y + s * 0.18, s * 1.0, s * 0.64, 6); c.fill();
    rr(c, x - s * 0.14, y + s * 0.36, s * 0.1, s * 0.3, 2); c.fill();
}
const GLYPHS = {
    share: (c, r) => { c.beginPath(); c.moveTo(0, -r * 1.1); c.lineTo(0, r * 0.4); c.moveTo(-r * 0.45, -r * 0.65); c.lineTo(0, -r * 1.1); c.lineTo(r * 0.45, -r * 0.65); c.moveTo(-r * 0.55, -r * 0.2); c.lineTo(-r * 0.85, -r * 0.2); c.lineTo(-r * 0.85, r); c.lineTo(r * 0.85, r); c.lineTo(r * 0.85, -r * 0.2); c.lineTo(r * 0.55, -r * 0.2); c.stroke(); },
    link: (c, r) => { rr(c, -r * 1.05, -r * 0.35, r * 1.2, r * 0.7, r * 0.35); c.stroke(); rr(c, -r * 0.15, -r * 0.35, r * 1.2, r * 0.7, r * 0.35); c.stroke(); },
    plus: (c, r) => { c.beginPath(); c.moveTo(-r, 0); c.lineTo(r, 0); c.moveTo(0, -r); c.lineTo(0, r); c.stroke(); },
    heart: (c, r) => { c.beginPath(); c.moveTo(0, r * 0.9); c.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.6, -r * 1.2, 0, -r * 0.4); c.bezierCurveTo(r * 0.6, -r * 1.2, r * 1.4, -r * 0.1, 0, r * 0.9); c.stroke(); },
};
// Vertical control rail on the side of the display (iPhone Duo HIG: side controls on the wide inner display).
function sideRail(c, x, y, glyphs, s) {
    const h = glyphs.length * s * 1.25 + s * 0.25;
    c.fillStyle = 'rgba(255,255,255,.07)'; rr(c, x, y, s * 1.3, h, s * 0.65); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 2; c.stroke();
    glyphs.forEach((gl, i) => {
        c.save(); c.translate(x + s * 0.65, y + s * 0.78 + i * s * 1.25);
        c.strokeStyle = '#e9e9e6'; c.lineWidth = s * 0.075; c.lineCap = 'round'; c.lineJoin = 'round';
        gl(c, s * 0.3); c.restore();
    });
}

export function mountStackDuo(section) {
    const data = JSON.parse(section.querySelector('script[type="application/json"]')?.textContent || '{}');
    const tools = (data.tools || []).slice(0, 10);
    if (!tools.length) throw new Error('no tools');
    const host = section.querySelector('[data-sd-stage]');
    const slider = section.querySelector('[data-sd-slider]');
    const toggleBtn = section.querySelector('[data-sd-toggle]');
    const toggleLabel = section.querySelector('[data-sd-label]');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const leftCount = Math.ceil(tools.length / 2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-3, 4, 5);
    const rim = new THREE.DirectionalLight(0xc8d8ff, 2.2); rim.position.set(4, 1.5, -3);
    const warm = new THREE.DirectionalLight(0xc8a96a, 0.8); warm.position.set(0, -3, 2);
    scene.add(key, rim, warm, new THREE.AmbientLight(0xffffff, 0.15));

    // ---------- textures ----------
    const icons = tools.map(t => {
        const im = new Image();
        im.decoding = 'async';
        im.src = `/api/tool-icon/${encodeURIComponent(t.slug)}`;
        im.onload = im.onerror = () => { dirtyInner = true; };
        return im;
    });
    const drawIcon = (c, i, x, y, s) => {
        c.save(); rr(c, x, y, s, s, s * 0.24); c.fillStyle = '#fff'; c.fill(); c.clip();
        const im = icons[i];
        if (im && im.complete && im.naturalWidth > 0) {
            const p = s * 0.14; c.drawImage(im, x + p, y + p, s - 2 * p, s - 2 * p);
        } else {
            c.fillStyle = '#0a0a0a'; c.font = F(650, s * 0.46); c.textAlign = 'center';
            c.fillText((tools[i].name || '?').trim().charAt(0).toUpperCase(), x + s / 2, y + s * 0.66);
            c.textAlign = 'left';
        }
        c.restore();
    };
    const inner = document.createElement('canvas'); inner.width = IW; inner.height = IH;
    const cover = document.createElement('canvas'); cover.width = CW; cover.height = CH;
    const innerTex = new THREE.CanvasTexture(inner), coverTex = new THREE.CanvasTexture(cover);
    for (const t of [innerTex, coverTex]) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); }

    const owner = (data.displayName || data.username || 'My').trim().split(/\s+/)[0] || 'My';
    const possessive = owner === 'My' ? 'My' : /s$/i.test(owner) ? `${owner}’` : `${owner}’s`;
    const toolWord = n => `${n} ${n === 1 ? 'tool' : 'tools'}`;
    const range = (a, b) => (a === b ? String(a).padStart(2, '0') : `${String(a).padStart(2, '0')} – ${String(b).padStart(2, '0')}`);
    const today = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());

    function drawCover(t) {
        const c = cover.getContext('2d'), w = CW, h = CH;
        aurora(c, w, h);
        const pad = 70, railX = w - 150;
        c.fillStyle = '#000'; c.beginPath(); c.arc(railX + 47, 92, 34, 0, 7); c.fill();
        c.strokeStyle = '#17171b'; c.lineWidth = 5; c.stroke();
        c.fillStyle = '#1d2433'; c.beginPath(); c.arc(railX + 40, 85, 8, 0, 7); c.fill();
        c.fillStyle = '#ececea'; c.font = F(600, 34); c.textAlign = 'center'; c.fillText('9:41', railX + 47, 186); c.textAlign = 'left';
        sideRail(c, railX, 250, [GLYPHS.share, GLYPHS.link, GLYPHS.heart], 94);
        c.fillStyle = MUTE; c.font = F(500, 38); c.fillText(today, pad, 128);
        c.fillStyle = '#cfcfcc'; c.fillText(fit(c, possessive, railX - pad - 30, 500, 46, 30), pad, 400);
        c.font = F(650, 210); c.fillStyle = grad(c, pad, pad + 600);
        c.fillText('AI', pad - 8, 610); c.fillText('Stack', pad - 10, 800);
        c.fillStyle = GOLD; c.fillText(fit(c, data.title || toolWord(data.count || tools.length), w - pad * 2, 500, 40, 30), pad, 880);
        const s = 118, gap = 26;
        for (let i = 0; i < tools.length; i++) {
            const bob = reduce ? 0 : Math.sin(t * 1.6 + i * 0.7) * 5;
            drawIcon(c, i, pad + (i % 5) * (s + gap), 980 + Math.floor(i / 5) * (s + gap) + bob, s);
        }
        const pw = 400, ph = 104, px = pad, py = h - 190;
        c.fillStyle = 'rgba(255,255,255,.09)'; rr(c, px, py, pw, ph, ph / 2); c.fill();
        const pulse = reduce ? 0.5 : (t * 0.6) % 1;
        c.fillStyle = `rgba(200,169,106,${0.5 * (1 - pulse)})`; c.beginPath(); c.arc(px + 58, py + ph / 2, 14 + pulse * 26, 0, 7); c.fill();
        c.fillStyle = GOLD; c.beginPath(); c.arc(px + 58, py + ph / 2, 13, 0, 7); c.fill();
        c.fillStyle = INK; c.font = F(500, 42); c.fillText('Tap to open', px + 100, py + ph / 2 + 15);
        c.fillStyle = 'rgba(255,255,255,.55)'; rr(c, w / 2 - 150, h - 34, 300, 12, 6); c.fill();
        coverTex.needsUpdate = true;
    }

    // One row: number, icon, name, purpose · company. Fades and rises in as the hinge opens.
    function drawRow(c, i, x0, x1, y, rh, k, sz) {
        const a = Math.min(1, Math.max(0, (k - 0.5 - i * 0.035) / 0.16));
        if (a <= 0) return;
        const yy = y + (1 - a) * 30, tool = tools[i];
        c.globalAlpha = a;
        c.fillStyle = RULE; c.fillRect(x0, yy, x1 - x0, 2);
        c.fillStyle = DIM; c.font = F(500, sz.no); c.fillText(String(i + 1).padStart(2, '0'), x0, yy + rh / 2 + sz.no * 0.36);
        const ix = x0 + sz.no * 2.2;
        drawIcon(c, i, ix, yy + (rh - sz.icon) / 2, sz.icon);
        const tx = ix + sz.icon + sz.icon * 0.28, tw = x1 - tx;
        c.fillStyle = INK; c.fillText(fit(c, tool.name, tw, 600, sz.name, sz.name * 0.7), tx, yy + rh / 2 - sz.name * 0.08);
        const purpose = fit(c, tool.purpose || '', tw * 0.62, 500, sz.sub, sz.sub);
        c.fillStyle = GOLD; c.fillText(purpose, tx + 2, yy + rh / 2 + sz.sub * 1.35);
        const pw = c.measureText(purpose).width;
        if (tool.company) {
            c.fillStyle = MUTE;
            c.fillText(fit(c, `  ·  ${tool.company}`, tw - pw, 500, sz.sub, sz.sub), tx + 2 + pw, yy + rh / 2 + sz.sub * 1.35);
        }
        c.globalAlpha = 1;
    }
    function footerRight(c, x0, x1, y, size) {
        c.font = F(500, size); c.fillStyle = MUTE;
        const host = 'ai.dosa.dev/u/';
        c.fillText(host, x0, y); c.fillStyle = INK; c.fillText(data.username || '', x0 + c.measureText(host).width, y);
        c.fillStyle = GOLD; c.textAlign = 'right';
        c.fillText(data.more > 0 ? `+${data.more} more below  ↓` : 'Build yours  →', x1, y);
        c.textAlign = 'left';
    }
    function drawInnerLandscape(c, k) {
        const w = IW, h = IH, half = w / 2, pad = 80;
        aurora(c, w, h);
        c.fillStyle = '#ececea'; c.font = F(600, 38); c.fillText('9:41', pad, 104);
        statusIcons(c, w - 230, 74, 36);
        c.fillStyle = MUTE; c.fillText(fit(c, `${data.displayName || ''} · @${data.username || ''}`, half - 260, 500, 34, 26), pad, 236);
        c.fillStyle = grad(c, pad, pad + 700); c.fillText(fit(c, data.title || 'My AI stack', half - 70 - pad - 190, 650, 108, 64), pad - 4, 352);
        c.fillStyle = MUTE; c.font = F(500, 34); c.textAlign = 'right';
        c.fillText(range(1, leftCount), half - 70, 352);
        if (tools.length > leftCount) c.fillText(range(leftCount + 1, tools.length), w - 250, 352);
        c.textAlign = 'left';
        c.fillStyle = '#cfcfcc'; c.fillText(fit(c, `${toolWord(data.count || tools.length)}, one fold.`, half - 420, 500, 44, 30), half + 70, 352);
        const top = 410, bot = h - 170, rh = (bot - top) / 5, sz = { no: 30, icon: 132, name: 54, sub: 34 };
        tools.forEach((_, i) => {
            const right = i >= leftCount, r = right ? i - leftCount : i;
            drawRow(c, i, right ? half + 70 : pad, right ? w - 250 : half - 70, top + r * rh, rh, k, sz);
        });
        c.fillStyle = RULE; c.fillRect(pad, bot, half - 70 - pad, 2); c.fillRect(half + 70, bot, w - 250 - half - 70, 2);
        c.font = F(500, 32); c.fillStyle = MUTE; c.fillText(data.updated ? `Updated ${data.updated}` : 'ai.dosa.dev', pad, bot + 70);
        footerRight(c, half + 70, w - 250, bot + 70, 32);
        sideRail(c, w - 170, 420, [GLYPHS.share, GLYPHS.link, GLYPHS.plus, GLYPHS.heart], 100);
        c.fillStyle = 'rgba(255,255,255,.55)'; rr(c, half - 200, h - 34, 400, 12, 6); c.fill();
    }
    // Held upright on narrow screens: the fold runs across the middle, tools 1-5 above it and the rest below.
    function drawInnerPortrait(c, k) {
        const w = IH, h = IW, half = h / 2, pad = 70;
        c.setTransform(0, 1, -1, 0, IW, 0);
        aurora(c, w, h);
        c.fillStyle = '#ececea'; c.font = F(600, 44); c.fillText('9:41', pad, 100);
        statusIcons(c, w - 70, 66, 42);
        c.fillStyle = MUTE; c.fillText(fit(c, `${data.displayName || ''} · @${data.username || ''}`, w - pad * 2, 500, 46, 32), pad, 230);
        c.fillStyle = grad(c, pad, pad + 900); c.fillText(fit(c, data.title || 'My AI stack', w - pad * 2, 650, 124, 72), pad - 4, 360);
        const sz = { no: 40, icon: 136, name: 70, sub: 46 };
        const topA = 410, botA = half - 60, rhA = (botA - topA) / 5;
        const topB = half + 60, botB = h - 190, rhB = (botB - topB) / 5;
        tools.forEach((_, i) => {
            const second = i >= leftCount, r = second ? i - leftCount : i;
            drawRow(c, i, pad, w - pad, second ? topB + r * rhB : topA + r * rhA, second ? rhB : rhA, k, sz);
        });
        c.fillStyle = RULE; c.fillRect(pad, botB, w - pad * 2, 2);
        footerRight(c, pad, w - pad, botB + 86, 44);
        c.fillStyle = 'rgba(255,255,255,.55)'; rr(c, w / 2 - 170, h - 34, 340, 12, 6); c.fill();
        c.setTransform(1, 0, 0, 1, 0, 0);
    }
    function drawInner(k) {
        const c = inner.getContext('2d');
        if (portrait) drawInnerPortrait(c, k); else drawInnerLandscape(c, k);
        const crease = Math.min(1, (1 - k) * 3), cx = IW / 2;
        const cg = c.createLinearGradient(cx - 90, 0, cx + 90, 0);
        cg.addColorStop(0, 'rgba(0,0,0,0)'); cg.addColorStop(0.5, `rgba(0,0,0,${0.55 * crease})`); cg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = cg; c.fillRect(cx - 90, 0, 180, IH);
        innerTex.needsUpdate = true;
    }

    // ---------- device ----------
    const titanium = new THREE.MeshPhysicalMaterial({ color: 0x334055, metalness: 1, roughness: 0.3, clearcoat: 0.35, clearcoatRoughness: 0.25, envMapIntensity: 1.25 });
    const titaniumDark = new THREE.MeshPhysicalMaterial({ color: 0x1b2230, metalness: 1, roughness: 0.42 });
    const glassBlack = new THREE.MeshPhysicalMaterial({ color: 0x020203, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 0.6 });
    const backGlass = new THREE.MeshPhysicalMaterial({ color: 0x2a3446, metalness: 0.3, roughness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.4, envMapIntensity: 0.9 });
    const lensMat = new THREE.MeshPhysicalMaterial({ color: 0x05060a, metalness: 0.2, roughness: 0.05, clearcoat: 1, envMapIntensity: 1.4 });
    const screenMat = tex => new THREE.MeshPhysicalMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.22 });

    const root = new THREE.Group(), upright = new THREE.Group(), device = new THREE.Group();
    scene.add(root); root.add(upright); upright.add(device);
    const rightPivot = new THREE.Group(), leftPivot = new THREE.Group();
    device.add(rightPivot, leftPivot);
    rightPivot.add(new THREE.Mesh(bodyGeo(1), titanium));
    leftPivot.add(new THREE.Mesh(bodyGeo(-1), titanium));
    const z0 = 0.0012, e = BZ * 0.45, sy0 = -H / 2 + BZ, sy1 = H / 2 - BZ;
    const add = (parent, geo, mat, fn) => { const m = new THREE.Mesh(geo, mat); fn?.(m); parent.add(m); return m; };
    add(rightPivot, faceGeo(0, -H / 2 + e, W - e, H / 2 - e, 0, R - e), glassBlack, m => { m.position.z = z0 / 2; });
    add(leftPivot, faceGeo(-W + e, -H / 2 + e, 0, H / 2 - e, R - e, 0), glassBlack, m => { m.position.z = z0 / 2; });
    const innerMat = screenMat(innerTex);
    add(rightPivot, faceGeo(0, sy0, W - BZ, sy1, 0, SR, 0.5, 1), innerMat, m => { m.position.z = z0; });
    add(leftPivot, faceGeo(-W + BZ, sy0, 0, sy1, SR, 0, 0, 0.5), innerMat, m => { m.position.z = z0; });
    const flip = (x, z) => m => { m.rotation.y = Math.PI; m.position.set(x, 0, z); };
    add(leftPivot, faceGeo(-W + e, -H / 2 + e, -e, H / 2 - e, R - e, R * 0.55), glassBlack, flip(-W, -T - z0 / 2));
    add(leftPivot, faceGeo(-W + BZ, sy0, -BZ, sy1, SR, SR * 0.7), screenMat(coverTex), flip(-W, -T - z0));
    add(rightPivot, faceGeo(BZ * 0.4, -H / 2 + BZ * 0.4, W - BZ * 0.4, H / 2 - BZ * 0.4, HR, R - BZ * 0.4), backGlass, flip(W, -T - z0 / 2));
    const plateauGeo = new THREE.ExtrudeGeometry(shapeRR(0, 0, 0.6, 0.27, 0.135, 0.135), { depth: 0.012, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 5, curveSegments: 32 });
    add(rightPivot, plateauGeo, titaniumDark, m => { m.rotation.y = Math.PI; m.position.set(0.72, H / 2 - 0.37, -T - 0.002); });
    const camY = H / 2 - 0.235;
    for (const lx of [0.255, 0.49]) {
        add(rightPivot, new THREE.CylinderGeometry(0.105, 0.105, 0.03, 48), titanium, m => { m.rotation.x = Math.PI / 2; m.position.set(lx, camY, -T - 0.03); });
        add(rightPivot, new THREE.CylinderGeometry(0.075, 0.075, 0.032, 48), lensMat, m => { m.rotation.x = Math.PI / 2; m.position.set(lx, camY, -T - 0.032); });
    }
    add(rightPivot, new THREE.CylinderGeometry(0.02, 0.02, 0.02, 24), new THREE.MeshStandardMaterial({ color: 0xf2e8d0, roughness: 0.3 }), m => { m.rotation.x = Math.PI / 2; m.position.set(0.655, camY, -T - 0.02); });
    for (const bx of [0.55, 0.78]) add(rightPivot, new THREE.BoxGeometry(0.16, 0.012, 0.018), titanium, m => { m.position.set(bx, H / 2 + 0.004, -T / 2); });
    add(device, new THREE.CylinderGeometry(T / 2, T / 2, H - 0.22, 40), titaniumDark, m => { m.position.set(0, 0, -T / 2); });

    const radial = (stops) => {
        const cv = document.createElement('canvas'); cv.width = cv.height = 256;
        const c = cv.getContext('2d'), g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
        stops.forEach(([o, col]) => g.addColorStop(o, col)); c.fillStyle = g; c.fillRect(0, 0, 256, 256);
        return new THREE.CanvasTexture(cv);
    };
    const shadow = add(scene, new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: radial([[0, 'rgba(0,0,0,.85)'], [0.55, 'rgba(0,0,0,.35)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false }));
    const glow = add(scene, new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: radial([[0, 'rgba(200,169,106,.30)'], [1, 'rgba(200,169,106,0)']]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    shadow.rotation.x = glow.rotation.x = -Math.PI / 2;

    // ---------- pose and camera ----------
    let k = 0, target = 0, from = 0, t0 = 0, dur = 1, portrait = false, dirtyInner = true;
    let yaw = 0, pitch = 0, dragYaw = 0, dragPitch = 0, lastInteract = -9;
    function pose(k, t) {
        const fold = Math.PI * (1 - k);
        const w = 0.5 * Math.sin(Math.PI * Math.min(1, k * 1.05));
        const settle = -0.07 * bump(k, 0.94, 0.04);
        const aR = -(w * fold) - settle * 0.6, aL = (1 - w) * fold + settle;
        rightPivot.rotation.y = aR; leftPivot.rotation.y = aL;
        leftPivot.position.z = k < 0.02 ? 0.0015 : 0;
        const xr = W * Math.cos(aR), xl = -W * Math.cos(aL);
        const lo = Math.min(0, xr, xl), hi = Math.max(0, xr, xl);
        device.position.x = -(lo + hi) / 2;
        const lift = 0.16 * Math.sin(Math.PI * k), idle = reduce ? 0 : 1;
        device.position.y = idle * Math.sin(t * 1.2) * 0.025;
        upright.rotation.z = portrait ? (Math.PI / 2) * easeIO(Math.min(1, Math.max(0, (k - 0.35) / 0.65))) : 0;
        root.position.y = lift;
        const sway = idle * Math.sin(t * 0.5) * 0.12 * (1 - k * 0.6);
        root.rotation.set(-0.1 + 0.17 * Math.sin(Math.PI * k) + pitch, -0.28 * (1 - k) + 0.32 * Math.sin(Math.PI * k) + sway + yaw, 0);
        const bw = Math.max(hi - lo, W * 1.02), th = upright.rotation.z;
        const sw = Math.abs(bw * Math.cos(th)) + Math.abs(H * Math.sin(th));
        const shH = Math.abs(bw * Math.sin(th)) + Math.abs(H * Math.cos(th));
        shadow.position.y = glow.position.y = -shH / 2 - 0.3;
        glow.position.y -= 0.01;
        shadow.scale.set(sw * 1.25, 0.55 + 0.25 * k, 1); shadow.material.opacity = 0.75 - lift;
        glow.scale.set(sw * 1.6, 0.9, 1); glow.material.opacity = 0.5 + 0.5 * k;
        return { sw, shH };
    }
    function frameCamera({ sw, shH }) {
        const vfov = (camera.fov * Math.PI) / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
        const openW = portrait ? H : 2 * W, openH = portrait ? 2 * W : H;
        const needW = Math.max(sw, openW * k) * 1.16, needH = Math.max(shH, openH * k, H) * 1.3;
        const d = Math.max(needW / 2 / Math.tan(hfov / 2), needH / 2 / Math.tan(vfov / 2));
        camera.position.set(0, 0.06 * d, d); camera.lookAt(0, 0, 0);
    }
    function resize() {
        const r = host.getBoundingClientRect();
        if (!r.width || !r.height) return;
        renderer.setSize(r.width, r.height);
        camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
        const p = camera.aspect < 0.9;
        if (p !== portrait) { portrait = p; dirtyInner = true; }
    }

    // ---------- interaction ----------
    const go = to => { from = k; target = to; t0 = performance.now(); dur = (reduce ? 350 : 1700) * Math.max(0.25, Math.abs(to - from)); wake(); };
    const toggle = () => go(target > 0.5 ? 0 : 1);
    const canvas = renderer.domElement;
    let down = null;
    canvas.addEventListener('pointerdown', ev => { down = { x: ev.clientX, y: ev.clientY, yaw: dragYaw, pitch: dragPitch, moved: false }; canvas.setPointerCapture(ev.pointerId); });
    canvas.addEventListener('pointermove', ev => {
        if (!down) return;
        const dx = ev.clientX - down.x, dy = ev.clientY - down.y;
        if (Math.hypot(dx, dy) > 6) down.moved = true;
        dragYaw = Math.max(-3.2, Math.min(3.2, down.yaw + dx * 0.008));
        dragPitch = Math.max(-0.5, Math.min(0.5, down.pitch + dy * 0.004));
        lastInteract = performance.now() / 1000; wake();
    });
    canvas.addEventListener('pointerup', () => { if (down && !down.moved) toggle(); down = null; });
    canvas.addEventListener('pointercancel', () => { down = null; });
    host.addEventListener('keydown', ev => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); toggle(); } });
    toggleBtn?.addEventListener('click', toggle);
    let scrubbing = false;
    slider?.addEventListener('input', () => { scrubbing = true; k = target = slider.value / 1000; wake(); });
    slider?.addEventListener('change', () => { scrubbing = false; go(k > 0.5 ? 1 : 0); });
    new ResizeObserver(() => { resize(); wake(); }).observe(host);

    // ---------- loop (paused while off screen) ----------
    let visible = true, running = false, frame = 0, lastK = -1;
    const clock = new THREE.Clock();
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) wake(); }).observe(host);
    document.addEventListener('visibilitychange', wake);
    function wake() { if (!running && visible && !document.hidden) { running = true; requestAnimationFrame(loop); } }
    function loop() {
        if (!visible || document.hidden) { running = false; return; }
        const t = clock.getElapsedTime(), now = performance.now();
        if (!scrubbing && k !== target) {
            const x = Math.min(1, (now - t0) / dur);
            k = from + (target - from) * easeIO(x);
            if (x >= 1) k = target;
        }
        if (!down && now / 1000 - lastInteract > 1.4) { dragYaw *= 0.94; dragPitch *= 0.94; }
        yaw += (dragYaw - yaw) * 0.12; pitch += (dragPitch - pitch) * 0.12;
        frameCamera(pose(k, t));
        if (k < 0.995 && frame % 3 === 0) drawCover(t);
        if (k !== lastK || dirtyInner) { drawInner(k); lastK = k; dirtyInner = false; }
        frame++;
        if (slider) { slider.value = String(Math.round(k * 1000)); slider.style.setProperty('--fill', `${k * 100}%`); }
        if (toggleLabel) toggleLabel.textContent = target > 0.5 ? 'Fold it' : 'Open stack';
        host.setAttribute('aria-pressed', String(target > 0.5));
        renderer.render(scene, camera);
        const settled = reduce && k === target && Math.abs(yaw - dragYaw) < 1e-3 && Math.abs(dragYaw) < 1e-3 && Math.abs(dragPitch) < 1e-3;
        if (settled) { running = false; return; }
        requestAnimationFrame(loop);
    }

    resize();
    drawCover(0); drawInner(0);
    return document.fonts.load(F(600, 40)).catch(() => {}).then(() => {
        dirtyInner = true; drawCover(0);
        section.classList.add('is-ready');
        wake();
    });
}
