import { Address } from '@ton/core';
import { JettonInfo } from '../constants/jettons';
import { StoredBankOffer } from '../api';

/**
 * For each offer, resolves which token it uses:
 *  - jettonWallet == null  →  native TON
 *  - jettonWallet != null  →  query the wallet contract for its parent master address,
 *                             then match against the whitelist
 *                             (null in the result map means the master is not whitelisted)
 */
export async function resolveOfferTokens(
    offers: StoredBankOffer[],
    getJettonMasterAddress: (walletAddr: string) => Promise<Address>,
    jettons: JettonInfo[],
): Promise<Record<string, JettonInfo | null>> {
    const tonJetton = jettons.find((j) => j.symbol === 'TON') ?? jettons[0];

    const entries = await Promise.all(
        offers.map(async (offer): Promise<[string, JettonInfo | null]> => {
            if (!offer.jettonWallet) return [offer.id, tonJetton];
            try {
                const masterAddr = await getJettonMasterAddress(offer.jettonWallet);
                const match = jettons.find(
                    (j) => j.address && Address.parse(j.address).equals(masterAddr),
                );
                return [offer.id, match ?? null];
            } catch {
                return [offer.id, null];
            }
        }),
    );

    return Object.fromEntries(entries);
}
