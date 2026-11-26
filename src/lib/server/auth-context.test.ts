import { expect, test } from 'bun:test';
import { getAuthContext } from './auth-attribution';

const request = new Request('https://ai.dosa.dev/api/auth/github');
const cookies = (value: string) => ({ get: () => ({ value }) }) as any;

test('carries an OAuth origin URL, pathname and session', () => {
    expect(getAuthContext(cookies(encodeURIComponent(JSON.stringify({ url: 'https://ai.dosa.dev/tools/cursor?ref=tool_share', sessionId: 'session-123' }))), request)).toEqual({
        $pathname: '/tools/cursor', $current_url: 'https://ai.dosa.dev/tools/cursor?ref=tool_share', $session_id: 'session-123',
    });
});

test('ignores empty, malformed and foreign auth context', () => {
    for (const value of ['', '%broken', '{}', JSON.stringify({ url: 'https://evil.example/tools/cursor' })]) {
        expect(getAuthContext(cookies(value), request)).toEqual({});
    }
});

test('strips user input and fragments even from an unsanitized cookie', () => {
    const context = getAuthContext(cookies(JSON.stringify({ url: 'https://ai.dosa.dev/utilities/token-counter?input=private&ref=tool_share&utm_medium=chat#private' })), request);
    expect(context.$current_url).toBe('https://ai.dosa.dev/utilities/token-counter?ref=tool_share&utm_medium=chat');
});
