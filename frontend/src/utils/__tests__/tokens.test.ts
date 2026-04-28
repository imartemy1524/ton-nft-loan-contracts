import { describe, it, expect, vi } from 'vitest';
import { Address } from '@ton/core';
import { resolveOfferTokens } from '../tokens';
import type { JettonInfo } from '../../constants/jettons';
import type { StoredBankOffer } from '../../api';

const TON: JettonInfo = { symbol: 'TON', name: 'Toncoin', address: null, decimals: 9, icon: '', coingeckoId: 'the-open-network' };
const USDT: JettonInfo = {
    symbol: 'USDT',
    name: 'Tether USD',
    address: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
    decimals: 6,
    icon: '',
    coingeckoId: 'tether',
};

function makeOffer(id: string, jettonWallet: string | null): StoredBankOffer {
    return { id, jettonWallet } as StoredBankOffer;
}

describe('resolveOfferTokens', () => {
    it('maps TON offer (null jettonWallet) to TON jetton', async () => {
        const offers = [makeOffer('offer-1', null)];
        const result = await resolveOfferTokens(offers, vi.fn(), [TON, USDT]);
        expect(result['offer-1']).toEqual(TON);
    });

    it('maps jetton offer to matched JettonInfo by master address', async () => {
        const offers = [makeOffer('offer-2', 'some-wallet-address')];
        const masterAddr = Address.parse(USDT.address!);
        const getMaster = vi.fn().mockResolvedValue(masterAddr);

        const result = await resolveOfferTokens(offers, getMaster, [TON, USDT]);
        expect(getMaster).toHaveBeenCalledWith('some-wallet-address');
        expect(result['offer-2']).toEqual(USDT);
    });

    it('returns null for jetton offer with unrecognised master', async () => {
        const offers = [makeOffer('offer-3', 'some-wallet-address')];
        const unknownAddr = Address.parse('EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT');
        const getMaster = vi.fn().mockResolvedValue(unknownAddr);

        const result = await resolveOfferTokens(offers, getMaster, [TON, USDT]);
        expect(result['offer-3']).toBeNull();
    });

    it('returns null when getJettonMasterAddress throws', async () => {
        const offers = [makeOffer('offer-4', 'bad-wallet')];
        const getMaster = vi.fn().mockRejectedValue(new Error('network error'));

        const result = await resolveOfferTokens(offers, getMaster, [TON, USDT]);
        expect(result['offer-4']).toBeNull();
    });

    it('handles multiple offers in parallel', async () => {
        const offers = [makeOffer('offer-a', null), makeOffer('offer-b', 'usdt-wallet')];
        const masterAddr = Address.parse(USDT.address!);
        const getMaster = vi.fn().mockResolvedValue(masterAddr);

        const result = await resolveOfferTokens(offers, getMaster, [TON, USDT]);
        expect(result['offer-a']).toEqual(TON);
        expect(result['offer-b']).toEqual(USDT);
    });
});
