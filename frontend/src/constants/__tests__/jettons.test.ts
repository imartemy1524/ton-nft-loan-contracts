import { describe, it, expect } from 'vitest';
import { getJettons } from '../jettons';

describe('getJettons', () => {
    it('returns mainnet addresses on mainnet', () => {
        const jettons = getJettons(false);
        const usdt = jettons.find((j) => j.symbol === 'USDT')!;
        expect(usdt.address).toBe('EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs');
    });

    it('returns testnet addresses on testnet', () => {
        const jettons = getJettons(true);
        const usdt = jettons.find((j) => j.symbol === 'USDT')!;
        expect(usdt.address).toBe('kQD0GKBM8ZbryVk2aESmzfU6b9b_8era_IkvBSELujFZPsyy');
    });

    it('TON always has null address on both networks', () => {
        expect(getJettons(false).find((j) => j.symbol === 'TON')!.address).toBeNull();
        expect(getJettons(true).find((j) => j.symbol === 'TON')!.address).toBeNull();
    });

    it('all jettons have required fields', () => {
        for (const j of getJettons(false)) {
            expect(j).toHaveProperty('symbol');
            expect(j).toHaveProperty('name');
            expect(j).toHaveProperty('decimals');
            expect(typeof j.decimals).toBe('number');
        }
    });

    it('USDT has 6 decimals', () => {
        const usdt = getJettons(false).find((j) => j.symbol === 'USDT')!;
        expect(usdt.decimals).toBe(6);
    });

    it('TON has 9 decimals', () => {
        const ton = getJettons(false).find((j) => j.symbol === 'TON')!;
        expect(ton.decimals).toBe(9);
    });
});
