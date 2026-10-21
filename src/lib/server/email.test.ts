import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

let dryRun = false;
let emailFrom = 'updates@ai.dosa.dev';
let loginEmailFrom = 'login@ai.dosa.dev';
let apiKey = 're_test';
let emailBinding: { send: (message: Record<string, unknown>) => Promise<unknown> } | undefined;
let loginMessage: Record<string, unknown> | undefined;
let fetchMock: ReturnType<typeof mock>;
const originalFetch = globalThis.fetch;

mock.module('./runtime-env', () => ({
    getEmailFrom: () => emailFrom,
    getEmailBinding: () => emailBinding,
    getLoginEmailFrom: () => loginEmailFrom,
    getResendApiKey: () => apiKey,
    isEmailDryRun: () => dryRun,
}));

afterAll(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
});

describe('email sender', () => {
    beforeEach(() => {
        dryRun = false;
        emailFrom = 'updates@ai.dosa.dev';
        loginEmailFrom = 'login@ai.dosa.dev';
        apiKey = 're_test';
        emailBinding = undefined;
        loginMessage = undefined;
        fetchMock = mock(async () => new Response(JSON.stringify({ id: 'message-1' }), { status: 200 }));
        globalThis.fetch = fetchMock as unknown as typeof fetch;
    });

    test('sends through the Resend API with unsubscribe headers', async () => {
        const { sendEmail } = await import(`./email.ts?test=${Date.now()}`);
        await expect(sendEmail({
            to: 'ada@example.com',
            subject: 'Updates',
            html: '<p>Hello</p>',
            text: 'Hello',
            unsubscribeUrl: 'https://ai.dosa.dev/unsubscribe?token=abc',
        })).resolves.toEqual({ messageId: 'message-1', dryRun: false });
        expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer re_test',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'ai.dosa.dev <updates@ai.dosa.dev>',
                to: ['ada@example.com'],
                subject: 'Updates',
                html: '<p>Hello</p>',
                text: 'Hello',
                headers: {
                    'List-Unsubscribe': '<https://ai.dosa.dev/unsubscribe?token=abc>',
                },
            }),
        });
    });

    test('redacts recipients during dry runs', async () => {
        apiKey = '';
        const log = mock(() => {});
        const originalLog = console.log;
        console.log = log;
        try {
            const { sendEmail } = await import(`./email.ts?dry=${Date.now()}`);
            await expect(sendEmail({
                to: 'ada@example.com',
                subject: 'Updates',
                html: '',
                text: '',
            })).resolves.toEqual({ messageId: null, dryRun: true });
        } finally {
            console.log = originalLog;
        }
        expect(log).toHaveBeenCalledWith('[Email] dry-run to=a***@example.com subject=Updates');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test('rejects non-successful Resend responses with a truncated body', async () => {
        fetchMock = mock(async () => new Response('invalid request', { status: 422 }));
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        const { sendEmail } = await import(`./email.ts?error=${Date.now()}`);
        await expect(sendEmail({
            to: 'ada@example.com',
            subject: 'Updates',
            html: '',
            text: '',
        })).rejects.toThrow('Resend send failed (422): invalid request');
    });

    test('sends login codes through the Cloudflare Email Service binding', async () => {
        emailBinding = {
            send: async message => {
                loginMessage = message;
                return { messageId: 'otp-message' };
            },
        };
        loginEmailFrom = 'signin@example.com';
        const { sendLoginCodeEmail } = await import(`./email.ts?otp=${Date.now()}`);

        await sendLoginCodeEmail('ada@example.com', '004219');

        expect(loginMessage).toMatchObject({
            to: 'ada@example.com',
            from: { email: 'signin@example.com', name: 'ai.dosa.dev' },
            subject: '004219 is your ai.dosa.dev sign-in code',
        });
        expect(loginMessage?.html).toContain('004219');
        expect(loginMessage?.html).toContain('It expires in 10 minutes.');
        expect(loginMessage?.html).toContain("If you didn't ask for this, you can ignore this email. No account was changed.");
        expect(loginMessage?.text).toContain('004219');
        expect(loginMessage?.text).toContain('It expires in 10 minutes.');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test('handles a missing login binding by environment', async () => {
        const { EmailBindingUnavailableError, sendLoginCodeEmail } = await import(`./email.ts?missing=${Date.now()}`);
        if (import.meta.env.DEV) {
            const info = mock(() => {});
            const originalInfo = console.info;
            console.info = info;
            try {
                await expect(sendLoginCodeEmail('ada@example.com', '004219')).resolves.toBeUndefined();
            } finally {
                console.info = originalInfo;
            }
            expect(info).toHaveBeenCalledWith('[Email OTP] Local sign-in code: 004219');
        } else {
            await expect(sendLoginCodeEmail('ada@example.com', '004219'))
                .rejects.toBeInstanceOf(EmailBindingUnavailableError);
        }
    });

    test('wraps Cloudflare Email Service delivery failures', async () => {
        const { LoginEmailDeliveryError, sendLoginCodeEmail } = await import(`./email.ts?delivery=${Date.now()}`);
        emailBinding = {
            send: async () => {
                throw new Error('binding rejected the message');
            },
        };

        await expect(sendLoginCodeEmail('ada@example.com', '004219'))
            .rejects.toBeInstanceOf(LoginEmailDeliveryError);
    });
});
