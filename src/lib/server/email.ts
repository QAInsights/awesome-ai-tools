import {
    getEmailBinding,
    getEmailFrom,
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
    const binding = getEmailBinding();
    if (isEmailDryRun() || !binding) {
        console.log(`[Email] dry-run to=${maskEmail(message.to)} subject=${message.subject.replace(/[\r\n]/g, ' ')}`);
        return { messageId: null, dryRun: true };
    }

    const headers = message.unsubscribeUrl
        ? {
            'List-Unsubscribe': `<${message.unsubscribeUrl}>`,
        }
        : undefined;
    const result = await binding.send({
        to: message.to,
        from: { email: getEmailFrom(), name: 'ai.dosa.dev' },
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(headers ? { headers } : {}),
    });
    return { messageId: result.messageId ?? null, dryRun: false };
}
