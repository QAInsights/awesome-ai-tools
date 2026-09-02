export interface EmailLayout {
    title: string;
    content: string;
    unsubscribeUrl: string;
    siteOrigin: string;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function renderLayout({ title, content, unsubscribeUrl, siteOrigin }: EmailLayout): string {
    return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#090909;color:#f5f5f5;font-family:Arial,sans-serif;line-height:1.6">
    <div style="max-width:640px;margin:0 auto;background:#111">
        <header style="padding:28px 32px;background:#191919;border-bottom:1px solid #333">
            <div style="font-size:20px;font-weight:700;letter-spacing:.04em">ai.dosa.dev</div>
        </header>
        <main style="padding:32px">${content}</main>
        <footer style="padding:24px 32px;border-top:1px solid #333;color:#999;font-size:13px">
            <a href="${escapeHtml(siteOrigin)}/settings" style="color:#d9b878">Manage notifications</a>
            <span style="color:#555;padding:0 8px">·</span>
            <a href="${escapeHtml(unsubscribeUrl)}" style="color:#d9b878">Unsubscribe</a>
        </footer>
    </div>
</body>
</html>`;
}
