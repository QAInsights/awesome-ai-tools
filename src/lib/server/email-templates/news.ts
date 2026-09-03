import { renderLayout } from './layout';
import type { NewsPost } from '../news-source';

export interface NewsEmailInput {
    userName: string;
    post: NewsPost;
    postUrl: string;
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

export function renderNewsEmail({
    userName,
    post,
    postUrl,
    unsubscribeUrl,
    siteOrigin,
}: NewsEmailInput) {
    const subject = `Today in AI: ${post.title}`;
    const htmlItems = post.items.map(item => `
        <article style="padding:20px 0;border-top:1px solid #333">
            <h2 style="margin:0 0 8px;font-size:20px">${escapeHtml(item.heading)}</h2>
            ${item.whatHappened ? `<p style="margin:0 0 8px;color:#bbb"><strong>What happened</strong><br>${escapeHtml(item.whatHappened)}</p>` : ''}
            ${item.whyItMatters ? `<p style="margin:0 0 8px;color:#bbb"><strong>Why it matters</strong><br>${escapeHtml(item.whyItMatters)}</p>` : ''}
            ${item.sourceUrl ? `<a href="${escapeHtml(item.sourceUrl)}" style="color:#e2c48a">Source: ${escapeHtml(item.sourceLabel || item.sourceUrl)}</a>` : ''}
        </article>`).join('');
    const intro = post.intro.map(paragraph => `<p style="margin:0 0 12px;color:#bbb">${escapeHtml(paragraph)}</p>`).join('');
    const content = `
        <h1 style="margin:0 0 8px;font-size:26px">Today in AI</h1>
        <p style="margin:0 0 16px;color:#777;font-family:monospace;font-size:13px">${escapeHtml(post.date)}</p>
        <p style="margin:0 0 16px;color:#bbb">Hi ${escapeHtml(userName)}, here is today's brief.</p>
        ${intro}${htmlItems}
        <p style="margin:24px 0 0"><a href="${escapeHtml(postUrl)}" style="color:#e2c48a;font-weight:700">Read the full brief</a></p>`;
    const html = renderLayout({ title: subject, content, unsubscribeUrl, siteOrigin });
    const text = [
        subject,
        '',
        post.date,
        `Hi ${userName}, here is today's brief.`,
        ...post.intro,
        ...post.items.flatMap(item => [
            '',
            item.heading,
            item.whatHappened ? `What happened: ${item.whatHappened}` : '',
            item.whyItMatters ? `Why it matters: ${item.whyItMatters}` : '',
            item.sourceUrl ? `Source: ${item.sourceLabel || item.sourceUrl} (${item.sourceUrl})` : '',
        ].filter(Boolean)),
        '',
        `Read the full brief: ${postUrl}`,
        `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');
    return { subject, html, text };
}
