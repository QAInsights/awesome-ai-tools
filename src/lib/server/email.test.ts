import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

let dryRun = false;
let emailFrom = 'updates@ai.dosa.dev';
let apiKey = 're_test';
let fetchMock: ReturnType<typeof mock>;
const originalFetch = globalThis.fetch;

mock.module('./runtime-env', () => ({
    getEmailFrom: () => emailFrom,
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
        apiKey = 're_test';
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
});
