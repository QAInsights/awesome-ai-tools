import {
    getEmailFrom,
    getResendApiKey,
    isEmailDryRun,
} from './runtime-env';

export interface OutboundEmail {
    to: string;
    subject: string;
    html: string;
    text: string;
    unsubscribeUrl?: string;
}

export interface EmailSendResult {
    messageId: string | null;
    dryRun: boolean;
}

function maskEmail(value: string): string {
    const [local, domain] = value.split('@');
    if (!local || !domain) return '***';
    return `${local.slice(0, 1)}***@${domain}`;
}

export async function sendEmail(message: OutboundEmail): Promise<EmailSendResult> {
    const apiKey = getResendApiKey();
    if (isEmailDryRun() || !apiKey) {
        console.log(`[Email] dry-run to=${maskEmail(message.to)} subject=${message.subject.replace(/[\r\n]/g, ' ')}`);
        return { messageId: null, dryRun: true };
    }

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: `ai.dosa.dev <${getEmailFrom()}>`,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
            ...(message.unsubscribeUrl
                ? { headers: { 'List-Unsubscribe': `<${message.unsubscribeUrl}>` } }
                : {}),
        }),
    });
    if (!response.ok) {
        const body = (await response.text()).slice(0, 200);
        throw new Error(`Resend send failed (${response.status})${body ? `: ${body}` : ''}`);
    }
    const result = await response.json() as { id?: string | null };
    return { messageId: result.id ?? null, dryRun: false };
}
