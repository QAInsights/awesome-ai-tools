/**
 * Tests for compare-state.js - Tool comparison selection state management
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { state, toggleTool, isSelected, getSelected, clearSelection } from './compare-state.js';

describe('compare-state', () => {
    beforeEach(() => {
        clearSelection();
    });

    describe('toggleTool', () => {
        test('should add a tool to selection when empty', () => {
            const result = toggleTool('tool-a');
            expect(result).toBe(true);
            expect(isSelected('tool-a')).toBe(true);
            expect(getSelected()).toEqual(['tool-a']);
        });

        test('should add multiple tools up to limit of 3', () => {
            expect(toggleTool('tool-a')).toBe(true);
            expect(toggleTool('tool-b')).toBe(true);
            expect(toggleTool('tool-c')).toBe(true);
            expect(getSelected().length).toBe(3);
        });

        test('should return false when trying to add 4th tool', () => {
            toggleTool('tool-a');
            toggleTool('tool-b');
            toggleTool('tool-c');
            const result = toggleTool('tool-d');
            expect(result).toBe(false);
            expect(getSelected().length).toBe(3);
            expect(isSelected('tool-d')).toBe(false);
        });

        test('should remove a tool when toggling an already selected tool', () => {
            toggleTool('tool-a');
            toggleTool('tool-b');
            const result = toggleTool('tool-a');
            expect(result).toBe(true);
            expect(isSelected('tool-a')).toBe(false);
            expect(getSelected().length).toBe(1);
        });

        test('should allow adding a new tool after removing one', () => {
            toggleTool('tool-a');
            toggleTool('tool-b');
            toggleTool('tool-c');
            toggleTool('tool-a'); // Remove tool-a
            const result = toggleTool('tool-d'); // Should now succeed
            expect(result).toBe(true);
            expect(isSelected('tool-d')).toBe(true);
        });

        test('should handle duplicate toggle calls gracefully', () => {
            toggleTool('tool-a');
            toggleTool('tool-a'); // Remove
            toggleTool('tool-a'); // Add again
            expect(isSelected('tool-a')).toBe(true);
        });
    });

    describe('isSelected', () => {
        test('should return false for unselected tool', () => {
            expect(isSelected('nonexistent')).toBe(false);
        });

        test('should return true for selected tool', () => {
            toggleTool('tool-a');
            expect(isSelected('tool-a')).toBe(true);
        });

        test('should return false after tool is deselected', () => {
            toggleTool('tool-a');
            toggleTool('tool-a');
            expect(isSelected('tool-a')).toBe(false);
        });
    });

    describe('getSelected', () => {
        test('should return empty array when nothing selected', () => {
            expect(getSelected()).toEqual([]);
        });

        test('should return array of selected tool slugs', () => {
            toggleTool('tool-a');
            toggleTool('tool-b');
            const selected = getSelected();
            expect(selected).toContain('tool-a');
            expect(selected).toContain('tool-b');
            expect(selected.length).toBe(2);
        });

        test('should return copy of selection, not reference to Set', () => {
            toggleTool('tool-a');
            const selected1 = getSelected();
            toggleTool('tool-b');
            const selected2 = getSelected();
            expect(selected1.length).toBe(1);
            expect(selected2.length).toBe(2);
        });
    });

    describe('clearSelection', () => {
        test('should clear all selected tools', () => {
            toggleTool('tool-a');
            toggleTool('tool-b');
            toggleTool('tool-c');
            clearSelection();
            expect(getSelected()).toEqual([]);
            expect(isSelected('tool-a')).toBe(false);
            expect(isSelected('tool-b')).toBe(false);
            expect(isSelected('tool-c')).toBe(false);
        });

        test('should be safe to call on empty selection', () => {
            clearSelection(); // Should not throw
            expect(getSelected()).toEqual([]);
        });
    });

    describe('state', () => {
        test('should expose state object with selectedTools Set', () => {
            expect(state).toBeDefined();
            expect(state.selectedTools).toBeInstanceOf(Set);
        });
    });
});
