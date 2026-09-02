import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

let binding: { send: (message: unknown) => Promise<{ messageId: string }> } | undefined;
let dryRun = false;
let emailFrom = 'updates@ai.dosa.dev';

mock.module('./runtime-env', () => ({
    getEmailBinding: () => binding,
    getEmailFrom: () => emailFrom,
    isEmailDryRun: () => dryRun,
}));

afterAll(() => mock.restore());

describe('email sender', () => {
    beforeEach(() => {
        binding = {
            send: async message => {
                bindingMessage = message;
                return { messageId: 'message-1' };
            },
        };
        dryRun = false;
        emailFrom = 'updates@ai.dosa.dev';
        bindingMessage = null;
    });

    let bindingMessage: unknown = null;

    test('sends through the Email Service binding with unsubscribe headers', async () => {
        const { sendEmail } = await import(`./email.ts?test=${Date.now()}`);
        await expect(sendEmail({
            to: 'ada@example.com',
            subject: 'Updates',
            html: '<p>Hello</p>',
            text: 'Hello',
            unsubscribeUrl: 'https://ai.dosa.dev/unsubscribe?token=abc',
        })).resolves.toEqual({ messageId: 'message-1', dryRun: false });
        expect(bindingMessage).toEqual({
            to: 'ada@example.com',
            from: { email: 'updates@ai.dosa.dev', name: 'ai.dosa.dev' },
            subject: 'Updates',
            html: '<p>Hello</p>',
            text: 'Hello',
            headers: {
                'List-Unsubscribe': '<https://ai.dosa.dev/unsubscribe?token=abc>',
            },
        });
    });

    test('redacts recipients during dry runs', async () => {
        binding = undefined;
        dryRun = true;
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
    });
});
