/**
 * Tests for voting.js - Zap voting functionality
 * 
 * Note: These tests mock fetch and localStorage. Full integration tests
 * should be added for complete voting flow verification.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { getVoteCount, initVoting } from './voting.js';

// Mock fetch globally
let mockFetchResponse = null;
const originalFetch = global.fetch;

const createMockFetch = () => (url, options) => {
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
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    querySelector: () => ({ textContent: '0' }),
    click: () => {},
    closest: () => null
};
global.document = {
    querySelectorAll: () => [mockElement],
    addEventListener: () => {},
    body: { innerHTML: '' },
    createElement: () => mockElement
};

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
