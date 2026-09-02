import { renderLayout } from './layout';

export interface DigestTool {
    slug: string;
    name: string;
    description: string;
    recentUpdates: string[];
    lastUpdated: string;
}

export interface DigestInput {
    userName: string;
    tools: DigestTool[];
    unsubscribeUrl: string;
    siteOrigin: string;
}

function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function renderDigest({ userName, tools, unsubscribeUrl, siteOrigin }: DigestInput) {
    const subject = `Updates for ${tools.length} tools you follow on ai.dosa.dev`;
    const htmlTools = tools.map(tool => `
        <article style="padding:20px 0;border-top:1px solid #333">
            <h2 style="margin:0 0 6px;font-size:20px"><a href="${escapeHtml(siteOrigin)}/tools/${escapeHtml(tool.slug)}" style="color:#e2c48a">${escapeHtml(tool.name)}</a></h2>
            <p style="margin:0 0 8px;color:#bbb">${escapeHtml(tool.description)}</p>
            <p style="margin:0 0 8px;color:#777;font-size:13px">Updated ${escapeHtml(tool.lastUpdated)}</p>
            ${tool.recentUpdates.length ? `<ul style="margin:0;padding-left:20px;color:#ddd">${tool.recentUpdates.map(update => `<li>${escapeHtml(update)}</li>`).join('')}</ul>` : ''}
        </article>`).join('');
    const html = renderLayout({
        title: subject,
        content: `<h1 style="margin:0 0 8px;font-size:26px">Your followed tool updates</h1><p style="margin:0 0 16px;color:#bbb">Hi ${escapeHtml(userName)}, here are the latest changes to tools in your library.</p>${htmlTools}`,
        unsubscribeUrl,
        siteOrigin,
    });
    const text = [
        subject,
        '',
        `Hi ${userName}, here are the latest changes to tools in your library.`,
        ...tools.flatMap(tool => [
            '',
            `${tool.name} — ${siteOrigin}/tools/${tool.slug} — updated ${tool.lastUpdated}`,
            tool.description,
            ...tool.recentUpdates.map(update => `- ${update}`),
        ]),
        '',
        `Manage notifications: ${siteOrigin}/settings`,
        `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');
    return { subject, html, text };
}
