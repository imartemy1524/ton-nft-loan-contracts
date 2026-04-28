import { describe, it, expect } from 'vitest';
import { scaleAmount, formatAmount } from '../amounts';

describe('scaleAmount', () => {
    it('converts integer TON (9 decimals)', () => {
        expect(scaleAmount('1', 9)).toBe(1_000_000_000n);
    });

    it('converts fractional TON', () => {
        expect(scaleAmount('1.5', 9)).toBe(1_500_000_000n);
    });

    it('converts USDT with 6 decimals', () => {
        expect(scaleAmount('100', 6)).toBe(100_000_000n);
    });

    it('converts fractional USDT', () => {
        expect(scaleAmount('1.5', 6)).toBe(1_500_000n);
    });

    it('truncates extra decimal places beyond token precision', () => {
        // 1.1234567 USDT — 7 decimal places but token only has 6
        expect(scaleAmount('1.123456', 6)).toBe(1_123_456n);
    });

    it('handles zero', () => {
        expect(scaleAmount('0', 6)).toBe(0n);
        expect(scaleAmount('0', 9)).toBe(0n);
    });

    it('handles integer string without dot for 6 decimals', () => {
        expect(scaleAmount('50', 6)).toBe(50_000_000n);
    });
});

describe('formatAmount', () => {
    it('formats 1 TON (9 decimals)', () => {
        expect(formatAmount(1_000_000_000n, 9)).toBe('1');
    });

    it('formats fractional TON', () => {
        expect(formatAmount(1_500_000_000n, 9)).toBe('1.5');
    });

    it('formats 100 USDT (6 decimals)', () => {
        expect(formatAmount(100_000_000n, 6)).toBe('100');
    });

    it('formats fractional USDT', () => {
        expect(formatAmount(1_500_000n, 6)).toBe('1.5');
    });

    it('formats zero', () => {
        expect(formatAmount(0n, 6)).toBe('0');
        expect(formatAmount(0n, 9)).toBe('0');
    });

    it('strips trailing zeros from fraction', () => {
        // 1.500000 USDT should display as 1.5
        expect(formatAmount(1_500_000n, 6)).toBe('1.5');
    });

    it('roundtrips: scaleAmount then formatAmount', () => {
        const cases = [
            { amount: '1.5', decimals: 9 },
            { amount: '100', decimals: 6 },
            { amount: '0.25', decimals: 6 },
        ];
        for (const { amount, decimals } of cases) {
            expect(formatAmount(scaleAmount(amount, decimals), decimals)).toBe(amount);
        }
    });
});
