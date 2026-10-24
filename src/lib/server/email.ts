import {
    getEmailFrom,
    getEmailBinding,
    getLoginEmailFrom,
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

export class EmailBindingUnavailableError extends Error {
    constructor() {
        super('Cloudflare Email Service is not configured');
        this.name = 'EmailBindingUnavailableError';
    }
}

export class LoginEmailDeliveryError extends Error {
    constructor() {
        super('Cloudflare Email Service could not send the sign-in code');
        this.name = 'LoginEmailDeliveryError';
    }
}

function maskEmail(value: string): string {
    const [local, domain] = value.split('@');
    if (!local || !domain) return '***';
    return `${local.slice(0, 1)}***@${domain}`;
}

function sanitizeLoginEmailError(error: unknown, to: string, code: string): string {
    let message = (error instanceof Error ? error.message : String(error)).replace(/[\r\n\t]+/g, ' ');
    if (to) {
        const escapedRecipient = to.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        message = message.replace(new RegExp(escapedRecipient, 'gi'), maskEmail(to));
    }
    return message
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, address => maskEmail(address))
        .replaceAll(code, '[redacted]')
        .slice(0, 500);
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
    const result = await response.json().catch(() => ({})) as { id?: string | null };
    return { messageId: result.id ?? null, dryRun: false };
}

export async function sendLoginCodeEmail(to: string, code: string): Promise<void> {
    const binding = getEmailBinding();
    if (!binding) {
        if (import.meta.env.DEV) {
            console.info(`[Email OTP] Local sign-in code: ${code}`);
            return;
        }
        throw new EmailBindingUnavailableError();
    }

    const subject = `${code} is your ai.dosa.dev sign-in code`;
    const html = `
        <div style="margin:0;padding:32px 16px;background:#0a0a0a;color:#f5f2eb;font-family:Inter,Arial,sans-serif">
            <div style="max-width:520px;margin:0 auto;padding:32px;border:1px solid #2a2a2a;border-radius:20px;background:#111">
                <p style="margin:0 0 12px;color:#d6b77a;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase">ai.dosa.dev</p>
                <h1 style="margin:0 0 20px;font-size:22px;line-height:1.35;color:#f5f2eb">Your sign-in code</h1>
                <p style="margin:0 0 18px;color:#b9b6ae;font-size:14px;line-height:1.6">Enter this code to sign in:</p>
                <p style="margin:0 0 20px;padding:18px 20px;border:1px solid #38342c;border-radius:12px;background:#171512;color:#f5f2eb;font-family:monospace;font-size:34px;font-weight:700;letter-spacing:0.28em;text-align:center">${code}</p>
                <p style="margin:0 0 16px;color:#b9b6ae;font-size:14px;line-height:1.6">It expires in 10 minutes.</p>
                <p style="margin:0;color:#8b8983;font-size:13px;line-height:1.6">If you didn't ask for this, you can ignore this email. No account was changed.</p>
            </div>
        </div>
    `;
    const text = [
        'ai.dosa.dev',
        '',
        'Your sign-in code:',
        code,
        '',
        'It expires in 10 minutes.',
        '',
        "If you didn't ask for this, you can ignore this email. No account was changed.",
    ].join('\n');

    try {
        await binding.send({
            to,
            from: { email: getLoginEmailFrom(), name: 'ai.dosa.dev' },
            subject,
            html,
            text,
        });
    } catch (error) {
        console.error('[Email OTP] send failed:', sanitizeLoginEmailError(error, to, code));
        throw new LoginEmailDeliveryError();
    }
}
