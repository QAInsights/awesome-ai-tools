import { renderLayout } from './layout';

export type ToolResultKind = 'cost-calculator' | 'rules-converter';

export interface ToolResultEmailInput {
    kind: ToolResultKind;
    userName: string;
    content: string;
    resultUrl: string;
    siteOrigin: string;
}

const COPY: Record<ToolResultKind, { subject: string; heading: string; intro: string; cta: string }> = {
    'cost-calculator': {
        subject: 'Your AI coding cost estimate',
        heading: 'Your AI coding cost estimate',
        intro: 'Here is the estimate you built in the AI Coding Cost Calculator. The link reopens it with the same team size, seats and models, so you can adjust it and compare again.',
        cta: 'Open this estimate',
    },
    'rules-converter': {
        subject: 'Your converted AI rules file',
        heading: 'Your converted rules file',
        intro: 'Here is the rules file you converted in the AI Rules Converter. Save it into your repository as is. The link reopens the converter with the same source and target formats.',
        cta: 'Open the Rules Converter',
    },
};

function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function renderToolResultEmail({ kind, userName, content, resultUrl, siteOrigin }: ToolResultEmailInput) {
    const copy = COPY[kind];
    const greeting = userName ? `Hi ${userName},` : 'Hi,';
    const html = renderLayout({
        title: copy.subject,
        siteOrigin,
        content: `
        <h1 style="margin:0 0 12px;font-size:24px">${escapeHtml(copy.heading)}</h1>
        <p style="margin:0 0 12px;color:#bbb">${escapeHtml(greeting)}</p>
        <p style="margin:0 0 20px;color:#bbb">${escapeHtml(copy.intro)}</p>
        <pre style="margin:0 0 24px;padding:16px;background:#0b0b0b;border:1px solid #333;border-radius:8px;color:#e5e5e5;font-family:Menlo,Consolas,monospace;font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word">${escapeHtml(content)}</pre>
        <p style="margin:0 0 20px"><a href="${escapeHtml(resultUrl)}" style="color:#e2c48a;font-weight:700">${escapeHtml(copy.cta)}</a></p>
        <p style="margin:0;color:#777;font-size:13px">You received this one-time email because you asked ai.dosa.dev to send you this result.</p>`,
    });
    const text = [
        copy.heading,
        '',
        greeting,
        copy.intro,
        '',
        content,
        '',
        `${copy.cta}: ${resultUrl}`,
        '',
        'You received this one-time email because you asked ai.dosa.dev to send you this result.',
    ].join('\n');
    return { subject: copy.subject, html, text };
}
