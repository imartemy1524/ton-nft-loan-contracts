import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { getOffers, refreshBank, StoredBankOffer } from '../api';
import { BankJettonAsset, BankNftAsset, useBankContract } from './useBankContract';
import { useNetwork } from '../network';

export function useBankData() {
    const address = useTonAddress();
    const bank = useBankContract();
    const { network } = useNetwork();

    const [bankBalance, setBankBalance] = useState<bigint | null>(null);
    const [jettons, setJettons] = useState<BankJettonAsset[]>([]);
    const [nfts, setNfts] = useState<BankNftAsset[]>([]);
    const [offers, setOffers] = useState<StoredBankOffer[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    const bankAddress = useMemo(
        () => (address ? bank.getBankAddress(address).toString() : ''),
        [address, bank],
    );

    const refresh = useCallback(async () => {
        if (!bankAddress) return;
        setError(null);
        try {
            const [balance, bankJettons, bankNfts] = await Promise.all([
                bank.getBankBalance(bankAddress),
                bank.getBankJettons(bankAddress),
                bank.getBankNfts(bankAddress),
            ]);
            setBankBalance(balance);
            setJettons(bankJettons);
            setNfts(bankNfts);
            await refreshBank(network, bankAddress).catch(() => null);
            setOffers((await getOffers({ network, bankAddress })).offers);
        } catch (e) {
            console.error(e);
            setError('Failed to load trusted assets from TonAPI.');
        }
    }, [bankAddress, bank, network]);

    const runAction = useCallback(
        async (action: () => Promise<void>) => {
            setActionLoading(true);
            try {
                await action();
                setTimeout(refresh, 3000);
            } catch (e) {
                console.error(e);
                alert('Trusted wallet transaction failed');
            } finally {
                setActionLoading(false);
            }
        },
        [refresh],
    );

    useEffect(() => {
        refresh();
    }, [bankAddress, network]);

    return { address, bankAddress, bankBalance, jettons, nfts, offers, error, actionLoading, refresh, runAction, bank };
}
