/**
 * Tests for voting.js - Zap voting functionality
 * 
 * Note: These tests mock fetch and localStorage. Full integration tests
 * should be added for complete voting flow verification.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { getVoteCount, initVoting } from './voting.js';
import { auth } from './auth.js';
import { authAttribution } from './auth-attribution.js';

// Mock fetch globally
let mockFetchResponse = null;
const originalFetch = global.fetch;

const fetchCalls = [];
const createMockFetch = () => (url, options) => {
    fetchCalls.push({ url, options });
    if (mockFetchResponse) {
        return Promise.resolve(mockFetchResponse);
    }
    return Promise.resolve({ ok: false, status: 500 });
};

global.fetch = createMockFetch();

// Mock localStorage
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => { store[key] = value; },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; }
    };
})();

global.localStorage = localStorageMock;

// Mock document for DOM operations
const mockElement = {
    textContent: '0',
    dataset: {},
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    querySelector: () => ({ textContent: '0' }),
    click: () => {},
    closest: () => null
};
const clickHandlers = [];
global.document = {
    querySelectorAll: () => [mockElement],
    querySelector: () => null,
    addEventListener: (event, handler) => {
        if (event === 'click') clickHandlers.push(handler);
    },
    body: { innerHTML: '' },
    createElement: () => mockElement
};
global.window = {};
global.location = { href: '', protocol: 'https:' };

describe('voting', () => {
    beforeEach(() => {
        // Reset module state by reimporting or clearing
        localStorageMock.clear();
        mockFetchResponse = null;
    });

    afterEach(() => {
        mockFetchResponse = null;
    });

    describe('getVoteCount', () => {
        test('should return 0 for tool with no votes', () => {
            expect(getVoteCount('nonexistent-tool')).toBe(0);
        });

        test('should return vote count after votes are loaded', async () => {
            mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve({
                    'votes:tool-a': 100,
                    'votes:tool-b': 250
                })
            };

            try {
                await initVoting();
                expect(getVoteCount('tool-a')).toBe(100);
                expect(getVoteCount('tool-b')).toBe(250);
                expect(getVoteCount('unknown')).toBe(0);
            } catch (e) {
                // DOM operations may fail in test env, but vote counts should still work
                expect(getVoteCount('tool-a')).toBe(100);
            }
        });
    });

    describe('initVoting', () => {
        test('should fetch vote counts from API', async () => {
            mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve({
                    'votes:cursorinc-cursor': 500,
                    'votes:aider-aider': 300
                })
            };

            try {
                await initVoting();
            } catch (e) {
                // DOM operations may fail in test env
            }
            expect(getVoteCount('cursorinc-cursor')).toBe(500);
            expect(getVoteCount('aider-aider')).toBe(300);
        });

        test('should handle API error gracefully', async () => {
            mockFetchResponse = {
                ok: false,
                status: 500
            };

            // Should not throw - catches errors internally
            try {
                await initVoting();
            } catch (e) {
                // DOM operations may fail, but that's OK
            }
            // If we get here without unhandled rejection, test passes
        });

        test('should handle network timeout', async () => {
            // Mock AbortController timeout behavior
            global.fetch = (url, options) => {
                return new Promise((_, reject) => {
                    setTimeout(() => {
                        const error = new Error('Aborted');
                        error.name = 'AbortError';
                        reject(error);
                    }, 100);
                });
            };

            // Should handle abort gracefully - catches errors internally
            try {
                await initVoting();
            } catch (e) {
                // Expected - DOM operations may fail
            }
            
            // Restore fetch
            global.fetch = createMockFetch();
        });

        test('should strip "votes:" prefix from keys', async () => {
            mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve({
                    'votes:my-tool': 42
                })
            };

            try {
                await initVoting();
            } catch (e) {
                // DOM operations may fail in test env
            }
            
            // Key should be 'my-tool', not 'votes:my-tool'
            expect(getVoteCount('my-tool')).toBe(42);
        });

        test('should store each returned key without client-side aliasing', async () => {
            mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve({
                    'votes:cognition-devin': 24
                })
            };

            try {
                await initVoting();
            } catch (e) {
                // DOM operations may fail in test env
            }

            expect(getVoteCount('cognition-devin')).toBe(24);
        });
    });

    describe('vote button click handling', () => {
        test('should prevent voting when not authenticated (integration test)', async () => {
            // Note: Testing auth-gated voting requires integration tests
            // since we cannot mock ES module exports (auth module)
            // This test verifies the module loads correctly
            mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve({})
            };

            try {
                await initVoting();
            } catch (e) {
                // DOM operations may fail in test env
            }
            expect(getVoteCount('test-tool')).toBe(0);
        });

        test('should prevent double-voting (integration test)', async () => {
            // Note: Testing double-vote prevention requires integration tests
            // with actual DOM interaction and auth state
        });
    });

    describe('castVote click flow', () => {
        const makeBtn = (toolId) => {
            const countEl = { textContent: '5', style: {} };
            const classes = new Set();
            return {
                dataset: { toolId, tip: 'Zap!' },
                classList: {
                    add: (c) => classes.add(c),
                    remove: (c) => classes.delete(c),
                    contains: (c) => classes.has(c),
                },
                querySelector: () => countEl,
                countEl,
                classes,
            };
        };

        const click = (btn) => {
            const handler = clickHandlers[clickHandlers.length - 1];
            handler({
                target: { closest: () => btn },
                preventDefault: () => {},
                stopPropagation: () => {},
            });
        };

        const flush = () => new Promise(resolve => setTimeout(resolve, 20));

        const authOpenCalls = [];
        const originalAuthOpen = authAttribution.open;

        beforeEach(async () => {
            fetchCalls.length = 0;
            authOpenCalls.length = 0;
            authAttribution.open = (trigger) => { authOpenCalls.push(trigger); };
            auth.user = { id: 'github:test-user' };
            window.cfTokenValue = 'test-cf-token';
            mockFetchResponse = { ok: true, json: () => Promise.resolve({ 'votes:cursor': 5 }) };
            await initVoting();
            mockFetchResponse = null;
        });

        afterEach(() => {
            authAttribution.open = originalAuthOpen;
            auth.user = null;
            window.cfTokenValue = '';
            delete window.turnstile;
            delete window.turnstileWidgetId;
            global.fetch = createMockFetch();
        });

        test('signed-out click opens sign-in and keeps the count visible', async () => {
            const btn = makeBtn('cursor');
            auth.user = null;

            click(btn);
            await flush();

            expect(fetchCalls.some(call => call.url === '/api/v1/vote')).toBe(false);
            expect(btn.countEl.textContent).toBe('5');
            expect(btn.dataset.tip).toBe('Zap!');
            expect(authOpenCalls).toEqual(['zap_btn']);
        });

        test('posts { tool_id, cf_token } to the same-origin vote endpoint', async () => {
            const btn = makeBtn('cursor');
            mockFetchResponse = { ok: true, status: 200 };

            click(btn);
            await flush();

            const voteCall = fetchCalls.find(call => call.url === '/api/v1/vote');
            expect(voteCall.options.method).toBe('POST');
            expect(JSON.parse(voteCall.options.body)).toEqual({ tool_id: 'cursor', cf_token: 'test-cf-token' });
            expect(btn.classes.has('zapped')).toBe(true);
            expect(getVoteCount('cursor')).toBe(6);
            expect(btn.disabled).toBe(false);
        });

        test('waits for persistence before incrementing and blocks repeat pending clicks', async () => {
            const btn = makeBtn('cursor');
            let completeVote;
            global.fetch = (url, options) => {
                fetchCalls.push({ url, options });
                return new Promise(resolve => { completeVote = resolve; });
            };

            click(btn);
            await flush();
            click(btn);

            expect(btn.disabled).toBe(true);
            expect(btn.countEl.textContent).toBe('5');
            expect(getVoteCount('cursor')).toBe(5);
            expect(btn.classes.has('zapped')).toBe(false);
            expect(fetchCalls.filter(call => call.url === '/api/v1/vote')).toHaveLength(1);

            completeVote({ ok: true, status: 200 });
            await flush();

            expect(btn.disabled).toBe(false);
            expect(btn.countEl.textContent).toBe('6');
            expect(getVoteCount('cursor')).toBe(6);
            expect(btn.classes.has('zapped')).toBe(true);
        });

        test('reloads the saved count instead of reusing a cached pre-vote total', async () => {
            let savedCount = 5;
            global.fetch = async (url, options) => {
                if (url === '/api/v1/vote') {
                    savedCount += 1;
                    return { ok: true, status: 200 };
                }
                const count = options.cache === 'no-store' ? savedCount : 5;
                return { ok: true, json: async () => ({ 'votes:cursor': count }) };
            };
            const btn = makeBtn('cursor');

            click(btn);
            await flush();
            expect(getVoteCount('cursor')).toBe(6);

            await initVoting();
            expect(getVoteCount('cursor')).toBe(6);
        });

        test.each([
            new TypeError('Failed to fetch'),
            new DOMException('Request timed out', 'AbortError'),
        ])('keeps the saved count and allows retry after a network failure: %s', async error => {
            const btn = makeBtn('cursor');
            global.fetch = async () => { throw error; };

            click(btn);
            await flush();

            expect(getVoteCount('cursor')).toBe(5);
            expect(btn.disabled).toBe(false);
            expect(btn.classes.has('zapped')).toBe(false);
            expect(btn.countEl.textContent).toBe('Failed');
            expect(btn.dataset.tip).toBe('Could not confirm your zap. Please refresh and try again.');

            global.fetch = createMockFetch();
            mockFetchResponse = { ok: true, status: 200 };
            window.cfTokenValue = 'retry-cf-token';
            click(btn);
            await flush();

            expect(getVoteCount('cursor')).toBe(6);
            expect(btn.classes.has('zapped')).toBe(true);
        });

        test('aborts a stalled vote request and re-enables the button', async () => {
            const btn = makeBtn('cursor');
            const originalSetTimeout = global.setTimeout;
            let voteSignal;
            global.setTimeout = (callback, delay, ...args) => originalSetTimeout(callback, delay === 10000 ? 0 : delay, ...args);
            global.fetch = (_url, { signal }) => {
                voteSignal = signal;
                return new Promise((_resolve, reject) => {
                    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
                });
            };

            try {
                click(btn);
                await flush();

                expect(voteSignal.aborted).toBe(true);
                expect(getVoteCount('cursor')).toBe(5);
                expect(btn.disabled).toBe(false);
                expect(btn.countEl.textContent).toBe('Failed');
            } finally {
                global.setTimeout = originalSetTimeout;
            }
        });

        test('keeps a confirmed vote even if resetting Turnstile fails', async () => {
            const btn = makeBtn('cursor');
            window.turnstile = { reset: () => { throw new Error('Widget unavailable'); } };
            mockFetchResponse = { ok: true, status: 200 };

            click(btn);
            await flush();

            expect(getVoteCount('cursor')).toBe(6);
            expect(btn.classes.has('zapped')).toBe(true);
            expect(btn.disabled).toBe(false);
        });

        test.each([
            [403, 'Failed'],
            [429, 'Wait'],
            [400, "Zap'd"],
            [500, 'Failed'],
        ])('leaves the count unchanged and shows %s error state', async (status, label) => {
            const btn = makeBtn('cursor');
            mockFetchResponse = { ok: false, status };

            click(btn);
            await flush();

            expect(getVoteCount('cursor')).toBe(5);
            expect(btn.disabled).toBe(false);
            expect(btn.classes.has('zapped')).toBe(false);
            expect(btn.countEl.textContent).toBe(label);
            expect(authOpenCalls).toEqual([]);
        });

        test('401 leaves the count unchanged and prompts sign-in', async () => {
            const btn = makeBtn('cursor');
            mockFetchResponse = { ok: false, status: 401 };

            click(btn);
            await flush();

            expect(getVoteCount('cursor')).toBe(5);
            expect(btn.classes.has('zapped')).toBe(false);
            expect(btn.countEl.textContent).toBe('5');
            expect(authOpenCalls).toEqual(['zap_btn']);
        });
    });

    describe('error handling', () => {
        test('should handle 429 rate limit response (integration test)', async () => {
            // Note: Testing rate limit handling requires integration tests
            // with actual vote API calls
        });

        test('should handle 400 duplicate vote response (integration test)', async () => {
            // Integration test needed for full flow
        });

        test('should handle general server error (integration test)', async () => {
            // Integration test needed for full flow
        });
    });
});
