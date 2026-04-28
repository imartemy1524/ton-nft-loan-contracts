import { describe, it, expect } from 'vitest';
import { percentToDecimal } from '../percentToDecimal';

describe('percentToDecimal', () => {
    it('converts integer percent', () => {
        const result = percentToDecimal('1');
        expect(result.nominator / result.denominator).toBeCloseTo(0.01);
    });

    it('converts 1% to 1/100', () => {
        expect(percentToDecimal('1')).toEqual({ nominator: 1, denominator: 100 });
    });

    it('converts 1.5% to 15/1000 simplified to 3/200', () => {
        const { nominator, denominator } = percentToDecimal('1.5');
        expect(nominator / denominator).toBeCloseTo(0.015);
    });

    it('converts 0.25% to 1/400', () => {
        const { nominator, denominator } = percentToDecimal('0.25');
        expect(nominator / denominator).toBeCloseTo(0.0025);
    });

    it('converts 1.50% same as 1.5%', () => {
        const a = percentToDecimal('1.5');
        const b = percentToDecimal('1.50');
        expect(a.nominator / a.denominator).toBeCloseTo(b.nominator / b.denominator);
    });

    it('returns 0 for negative input', () => {
        expect(percentToDecimal('-1')).toEqual({ nominator: 0, denominator: 1 });
    });

    it('returns 0 for non-numeric input', () => {
        expect(percentToDecimal('abc')).toEqual({ nominator: 0, denominator: 1 });
    });

    it('converts 100% to 1/1', () => {
        const { nominator, denominator } = percentToDecimal('100');
        expect(nominator / denominator).toBeCloseTo(1);
    });
});
