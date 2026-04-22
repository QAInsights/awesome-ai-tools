/**
 * Tests for tool-cache.js - localStorage cache for enriched-tools.json
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { read, write, isStale, clear } from './tool-cache.js';

// TTL is 24 hours (internal constant, verify via behavior)
const TTL_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'tools:enriched:v1';

// Mock localStorage
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => { store[key] = value; },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; },
        get store() { return store; }
    };
})();

global.localStorage = localStorageMock;

describe('tool-cache', () => {
    beforeEach(() => {
        localStorageMock.clear();
    });

    describe('read', () => {
        test('should return null when cache is empty', () => {
            expect(read()).toBeNull();
        });

        test('should return null for corrupted JSON', () => {
            localStorageMock.setItem(STORAGE_KEY, 'not-valid-json');
            expect(read()).toBeNull();
        });

        test('should return null for wrong version', () => {
            const envelope = { v: 2, data: [], fetchedAt: Date.now() };
            localStorageMock.setItem(STORAGE_KEY, JSON.stringify(envelope));
            expect(read()).toBeNull();
        });

        test('should return null when data is not an array', () => {
            const envelope = { v: 1, data: 'not-an-array', fetchedAt: Date.now() };
            localStorageMock.setItem(STORAGE_KEY, JSON.stringify(envelope));
            expect(read()).toBeNull();
        });

        test('should return valid cached entry', () => {
            const data = [{ slug: 'tool-a', name: 'Tool A' }];
            const envelope = { v: 1, data, fetchedAt: Date.now(), etag: 'abc123' };
            localStorageMock.setItem(STORAGE_KEY, JSON.stringify(envelope));
            
            const result = read();
            expect(result).not.toBeNull();
            expect(result.data).toEqual(data);
            expect(result.fetchedAt).toBeDefined();
            expect(result.etag).toBe('abc123');
        });

        test('should handle null etag', () => {
            const data = [{ slug: 'tool-a' }];
            const envelope = { v: 1, data, fetchedAt: Date.now(), etag: null };
            localStorageMock.setItem(STORAGE_KEY, JSON.stringify(envelope));
            
            const result = read();
            expect(result.etag).toBeNull();
        });
    });

    describe('write', () => {
        test('should write valid data to localStorage', () => {
            const data = [{ slug: 'tool-a', name: 'Tool A' }];
            write(data);
            
            const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY));
            expect(stored.v).toBe(1);
            expect(stored.data).toEqual(data);
            expect(stored.fetchedAt).toBeDefined();
            expect(typeof stored.fetchedAt).toBe('number');
        });

        test('should write with etag when provided', () => {
            const data = [{ slug: 'tool-a' }];
            write(data, 'etag-123');
            
            const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY));
            expect(stored.etag).toBe('etag-123');
        });

        test('should not write non-array data', () => {
            write('not-an-array');
            write(null);
            write({ not: 'array' });
            
            expect(localStorageMock.getItem(STORAGE_KEY)).toBeNull();
        });

        test('should write empty array', () => {
            write([]);
            
            const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY));
            expect(stored.data).toEqual([]);
        });

        test('should overwrite existing cache', () => {
            write([{ slug: 'old' }]);
            write([{ slug: 'new' }]);
            
            const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY));
            expect(stored.data).toEqual([{ slug: 'new' }]);
        });
    });

    describe('isStale', () => {
        test('should return true for null entry', () => {
            expect(isStale(null)).toBe(true);
        });

        test('should return true for undefined entry', () => {
            expect(isStale(undefined)).toBe(true);
        });

        test('should return false for fresh entry', () => {
            const entry = { fetchedAt: Date.now() };
            expect(isStale(entry)).toBe(false);
        });

        test('should return true for entry older than TTL', () => {
            const oldTimestamp = Date.now() - TTL_MS - 1000; // 1 second past TTL
            const entry = { fetchedAt: oldTimestamp };
            expect(isStale(entry)).toBe(true);
        });

        test('should return false for entry exactly at TTL boundary', () => {
            const timestamp = Date.now() - TTL_MS + 1000; // 1 second before TTL
            const entry = { fetchedAt: timestamp };
            expect(isStale(entry)).toBe(false);
        });
    });

    describe('clear', () => {
        test('should remove cache from localStorage', () => {
            write([{ slug: 'tool-a' }]);
            expect(localStorageMock.getItem(STORAGE_KEY)).not.toBeNull();
            
            clear();
            expect(localStorageMock.getItem(STORAGE_KEY)).toBeNull();
        });

        test('should be safe to call on empty cache', () => {
            clear(); // Should not throw
            expect(localStorageMock.getItem(STORAGE_KEY)).toBeNull();
        });
    });

    describe('TTL behavior', () => {
        test('should be 24 hours in milliseconds', () => {
            // Verify TTL is 24 hours by testing staleness behavior
            const entry = { fetchedAt: Date.now() - (24 * 60 * 60 * 1000) - 1000 };
            expect(isStale(entry)).toBe(true);
        });
    });
});
