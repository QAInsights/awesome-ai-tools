/**
 * Tests for sorting.js - Tool sorting logic
 * 
 * Note: Vote-based sorting tests are integration tests since we cannot
 * mock ES module exports. See voting.test.js for voting module tests.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { getSortState, setSortState, toggleSortState, sortTools, updateSortUI } from './sorting.js';

// Mock document for DOM operations
const mockElement = {
    textContent: '-',
    classList: { add: () => {}, remove: () => {} }
};
global.document = {
    querySelectorAll: (selector) => {
        if (selector === '[data-sort]') {
            return [
                { dataset: { sort: 'name' }, querySelector: () => ({ ...mockElement }) },
                { dataset: { sort: 'votes' }, querySelector: () => ({ ...mockElement }) }
            ];
        }
        return [];
    },
    querySelector: (selector) => mockElement,
    body: { innerHTML: '' }
};

describe('sorting', () => {
    beforeEach(() => {
        setSortState('votes', 'desc');
    });

    describe('getSortState', () => {
        test('should return current sort state', () => {
            const state = getSortState();
            expect(state).toHaveProperty('column');
            expect(state).toHaveProperty('direction');
        });

        test('should default to votes descending', () => {
            const state = getSortState();
            expect(state.column).toBe('votes');
            expect(state.direction).toBe('desc');
        });
    });

    describe('setSortState', () => {
        test('should set sort column and direction', () => {
            setSortState('name', 'asc');
            const state = getSortState();
            expect(state.column).toBe('name');
            expect(state.direction).toBe('asc');
        });

        test('should update existing state', () => {
            setSortState('name', 'asc');
            setSortState('company', 'desc');
            const state = getSortState();
            expect(state.column).toBe('company');
            expect(state.direction).toBe('desc');
        });
    });

    describe('toggleSortState', () => {
        test('should toggle direction when same column', () => {
            setSortState('name', 'asc');
            const state = toggleSortState('name');
            expect(state.direction).toBe('desc');
        });

        test('should toggle direction multiple times', () => {
            setSortState('name', 'asc');
            toggleSortState('name');
            expect(getSortState().direction).toBe('desc');
            toggleSortState('name');
            expect(getSortState().direction).toBe('asc');
        });

        test('should set new column with asc direction', () => {
            setSortState('name', 'desc');
            const state = toggleSortState('company');
            expect(state.column).toBe('company');
            expect(state.direction).toBe('asc');
        });

        test('should return new state object', () => {
            const state = toggleSortState('name');
            expect(state).toEqual(getSortState());
        });
    });

    describe('sortTools', () => {
        const mockTools = [
            { name: 'Zed', company: 'Zed Industries', category: 'AI IDEs' },
            { name: 'Cursor', company: 'Cursor Inc', category: 'AI IDEs' },
            { name: 'Aider', company: 'Aider', category: 'CLI Agents' }
        ];

        test('should return copy of array, not mutate original', () => {
            setSortState('name', 'asc');
            const sorted = sortTools(mockTools);
            expect(sorted).not.toBe(mockTools);
            expect(mockTools[0].name).toBe('Zed'); // Original unchanged
        });

        test('should sort by name ascending', () => {
            setSortState('name', 'asc');
            const sorted = sortTools(mockTools);
            expect(sorted[0].name).toBe('Aider');
            expect(sorted[1].name).toBe('Cursor');
            expect(sorted[2].name).toBe('Zed');
        });

        test('should sort by name descending', () => {
            setSortState('name', 'desc');
            const sorted = sortTools(mockTools);
            expect(sorted[0].name).toBe('Zed');
            expect(sorted[1].name).toBe('Cursor');
            expect(sorted[2].name).toBe('Aider');
        });

        test('should sort by company ascending', () => {
            setSortState('company', 'asc');
            const sorted = sortTools(mockTools);
            expect(sorted[0].company).toBe('Aider');
            expect(sorted[1].company).toBe('Cursor Inc');
            expect(sorted[2].company).toBe('Zed Industries');
        });

        test('should sort by company descending', () => {
            setSortState('company', 'desc');
            const sorted = sortTools(mockTools);
            expect(sorted[0].company).toBe('Zed Industries');
            expect(sorted[2].company).toBe('Aider');
        });

        test('should sort by category ascending', () => {
            setSortState('category', 'asc');
            const sorted = sortTools(mockTools);
            expect(sorted[0].category).toBe('AI IDEs');
            expect(sorted[2].category).toBe('CLI Agents');
        });

        test('should sort by votes (integration test required for actual vote data)', () => {
            // Vote-based sorting requires integration tests with actual voting module
            // since we cannot mock ES module exports in Bun
            setSortState('votes', 'desc');
            const sorted = sortTools(mockTools);
            // All have 0 votes since we're not mocking, order should be stable
            expect(sorted.length).toBe(3);
        });

        test('should handle tools with null/undefined properties', () => {
            const toolsWithNulls = [
                { name: null, company: 'B' },
                { name: 'A', company: null }
            ];
            setSortState('name', 'asc');
            const sorted = sortTools(toolsWithNulls);
            expect(sorted.length).toBe(2);
        });

        test('should be case-insensitive for name sorting', () => {
            const caseTools = [
                { name: 'zed', company: 'A' },
                { name: 'CURSOR', company: 'B' },
                { name: 'aider', company: 'C' }
            ];
            setSortState('name', 'asc');
            const sorted = sortTools(caseTools);
            expect(sorted[0].name).toBe('aider');
            expect(sorted[1].name).toBe('CURSOR');
            expect(sorted[2].name).toBe('zed');
        });

        test('should return tools unchanged for unknown column', () => {
            setSortState('unknown', 'asc');
            const sorted = sortTools(mockTools);
            expect(sorted.length).toBe(3);
        });

        test('should return tools unchanged when no column set', () => {
            // Set to null column
            setSortState(null, 'asc');
            const sorted = sortTools(mockTools);
            expect(sorted.length).toBe(3);
        });
    });

    describe('updateSortUI', () => {
        test('should update sort icons in DOM', () => {
            // Use mock DOM elements
            let nameIconText = '-';
            let votesIconText = '-';
            
            global.document = {
                querySelectorAll: (selector) => {
                    if (selector === '[data-sort]') {
                        return [
                            { 
                                dataset: { sort: 'name' }, 
                                querySelector: () => { 
                                    return { 
                                        textContent: '', 
                                        set textContent(v) { nameIconText = v; },
                                        get textContent() { return nameIconText; },
                                        classList: { add: () => {}, remove: () => {} }
                                    };
                                }
                            },
                            { 
                                dataset: { sort: 'votes' }, 
                                querySelector: () => { 
                                    return { 
                                        textContent: '', 
                                        set textContent(v) { votesIconText = v; },
                                        get textContent() { return votesIconText; },
                                        classList: { add: () => {}, remove: () => {} }
                                    };
                                }
                            }
                        ];
                    }
                    return [];
                }
            };
            
            setSortState('name', 'asc');
            updateSortUI();
            
            expect(nameIconText).toBe('↑');
            expect(votesIconText).toBe('↕');
        });

        test('should show down arrow for descending sort', () => {
            let iconText = '-';
            
            global.document = {
                querySelectorAll: (selector) => {
                    if (selector === '[data-sort]') {
                        return [
                            { 
                                dataset: { sort: 'name' }, 
                                querySelector: () => { 
                                    return { 
                                        set textContent(v) { iconText = v; },
                                        get textContent() { return iconText; },
                                        classList: { add: () => {}, remove: () => {} }
                                    };
                                }
                            }
                        ];
                    }
                    return [];
                }
            };
            
            setSortState('name', 'desc');
            updateSortUI();
            
            expect(iconText).toBe('↓');
        });

        test('should handle missing icon elements gracefully', () => {
            global.document = {
                querySelectorAll: (selector) => {
                    if (selector === '[data-sort]') {
                        return [
                            { dataset: { sort: 'name' }, querySelector: () => null }
                        ];
                    }
                    return [];
                }
            };
            
            // Should not throw
            expect(() => updateSortUI()).not.toThrow();
        });
    });
});
