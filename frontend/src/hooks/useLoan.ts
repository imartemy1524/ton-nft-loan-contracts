import { useState, useEffect } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { Address, fromNano, toNano } from '@ton/core';
import { useMainContract } from './useMainContract';
import { LoanStatus, MainConfig } from './contracts/Main';
import { useTokenPrices } from './useTokenPrices';
import { useNetwork } from '../network';
import { getJettons, JettonInfo } from '../constants/jettons';
import { percentToDecimal } from '../utils/percentToDecimal';
import { formatAmount, scaleAmount } from '../utils/amounts';
import { useBankContract } from './useBankContract';
import { AggregatedLoan, getLoans, getOffers, loanParamsFromStoredOffer, refreshBank, refreshLoan, StoredBankOffer } from '../api';
import { resolveOfferTokens } from '../utils/tokens';

export type OfferFundingStatus = {
    checking: boolean;
    fundable: boolean;
    reason: string;
};

type NftMeta = { name: string; description?: string; image?: string; collection?: string };
type TonApiPreview = { resolution?: string; url?: string };

const TON_OFFER_GAS_RESERVE = toNano('0.05');
const JETTON_OFFER_GAS_RESERVE = toNano('0.2');
const UNDEFINED_TOKEN: JettonInfo = {
    symbol: 'Undefined token',
    name: 'Undefined token',
    address: null,
    decimals: 9,
    icon: '',
    coingeckoId: '',
};
const loanTokenCache = new Map<string, Promise<JettonInfo | null>>();

function normalizeMeta(value: string | null | undefined) {
    return value || null;
}

function indexedLoanMatchesChain(indexed: AggregatedLoan, chain: MainConfig, nft?: NftMeta | null) {
    return (
        indexed.status === chain.status &&
        indexed.nftAddress === chain.nftAddress.toString() &&
        (indexed.jettonAddress ?? null) === (chain.jettonAddress?.toString() ?? null) &&
        indexed.borrowerAddress === chain.ownerAddresses.borrower.toString() &&
        (indexed.moneyGiverAddress ?? null) === (chain.ownerAddresses.moneyGiver?.toString() ?? null) &&
        indexed.amount === chain.loanParams.amount.toString() &&
        indexed.duration === chain.loanParams.duration &&
        indexed.interestNominator === chain.loanParams.interestPerDay.nominator &&
        indexed.interestDenominator === chain.loanParams.interestPerDay.denominator &&
        String(indexed.startedAt) === String(chain.startedAt) &&
        indexed.codeHash !== null &&
        (!nft || (
            normalizeMeta(indexed.nftName) === normalizeMeta(nft.name) &&
            normalizeMeta(indexed.nftDescription) === normalizeMeta(nft.description) &&
            normalizeMeta(indexed.nftImage) === normalizeMeta(nft.image) &&
            normalizeMeta(indexed.nftCollection) === normalizeMeta(nft.collection)
        ))
    );
}

export function useLoan(contractAddr: string | undefined) {
    const walletAddress = useTonAddress();
    const { config, network, isTestnet } = useNetwork();
    const jettons = getJettons(isTestnet);
    const { getData, sendRepayLoan, sendGiveLoan, sendCancelBeforeStart, sendChangeLoanParams, sendWithdrawNftNotRepaid, sendAcceptOffer } = useMainContract();
    const bank = useBankContract();
    const prices = useTokenPrices();

    const [loanInfo, setLoanInfo] = useState<MainConfig | null>(null);
    const loanJettonAddress = loanInfo?.jettonAddress?.toString() ?? null;
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [nftMeta, setNftMeta] = useState<NftMeta | null>(null);
    const [bankBalance, setBankBalance] = useState<bigint | null>(null);
    const [offers, setOffers] = useState<StoredBankOffer[]>([]);
    const [offerFundingStatuses, setOfferFundingStatuses] = useState<Record<string, OfferFundingStatus>>({});
    const [offerTokenMap, setOfferTokenMap] = useState<Record<string, JettonInfo | null>>({});
    const [loanToken, setLoanToken] = useState<JettonInfo | null>(null);

    // change-params form
    const [showChangeParams, setShowChangeParams] = useState(false);
    const [newAmount, setNewAmount] = useState('');
    const [newDuration, setNewDuration] = useState('');
    const [newInterest, setNewInterest] = useState('');

    // create-offer form
    const [offerAmount, setOfferAmount] = useState('');
    const [offerDuration, setOfferDuration] = useState('7');
    const [offerInterest, setOfferInterest] = useState('1.00');
    const [offerExpiresDays, setOfferExpiresDays] = useState('7');
    const [offerToken, setOfferToken] = useState<JettonInfo>(() => getJettons(false)[0]);

    const load = async () => {
        if (!contractAddr) return;
        setLoading(true);
        setError(null);
        try {
            const data = await getData(contractAddr);
            setLoanInfo(data);
            const pct = (data.loanParams.interestPerDay.nominator / data.loanParams.interestPerDay.denominator) * 100;
            setNewDuration(String(Math.floor(data.loanParams.duration / 86400)));
            setNewInterest(pct.toFixed(2));
            const nft = await fetchNftMeta(data.nftAddress.toString());
            getLoans({ network, loanAddress: contractAddr, hasOffers: false })
                .then(({ loans }) => {
                    if (!loans[0] || !indexedLoanMatchesChain(loans[0], data, nft)) {
                        return refreshLoan(network, contractAddr);
                    }
                    return null;
                })
                .catch(console.error);
        } catch {
            setError('Failed to load contract data. Make sure the address is correct.');
        } finally {
            setLoading(false);
        }
    };

    const loadOffers = async () => {
        if (!contractAddr) return;
        const refreshed = await getOffers({ network, loanAddress: contractAddr }).catch(() => ({ offers: [] }));
        setOffers(refreshed.offers);
        if (!walletAddress) {
            setBankBalance(null);
            return;
        }
        const bankAddress = bank.getBankAddress(walletAddress).toString();
        try {
            setBankBalance(await bank.getBankBalance(bankAddress));
        } catch {
            setOffers(refreshed.offers);
        }
    };

    const fetchNftMeta = async (nftAddr: string): Promise<NftMeta | null> => {
        try {
            const res = await fetch(`${config.tonapiUrl}/nfts/${nftAddr}`);
            if (!res.ok) return null;
            const d = await res.json();
            const meta = {
                name: d.metadata?.name || `NFT #${d.index ?? '?'}`,
                description: d.metadata?.description,
                image:
                    d.previews?.find((p: TonApiPreview) => p.resolution === '500x500')?.url ||
                    d.previews?.[0]?.url ||
                    d.metadata?.image,
                collection: d.collection?.name,
            };
            setNftMeta(meta);
            return meta;
        } catch {
            return null;
        }
    };

    useEffect(() => { load(); }, [contractAddr]);

    useEffect(() => {
        let cancelled = false;

        const resolveLoanToken = async () => {
            if (!loanInfo) {
                setLoanToken(null);
                return;
            }

            if (!loanJettonAddress) {
                setLoanToken(jettons.find((j) => j.symbol === 'TON') ?? jettons[0] ?? null);
                return;
            }

            const directMatch = jettons.find((j) => (
                j.address !== null && Address.parse(j.address).equals(Address.parse(loanJettonAddress))
            ));
            if (directMatch) {
                setLoanToken(directMatch);
                return;
            }

            try {
                const cacheKey = `${network}:${loanJettonAddress}`;
                let tokenPromise = loanTokenCache.get(cacheKey);
                if (!tokenPromise) {
                    tokenPromise = bank.getJettonMasterAddress(loanJettonAddress).then((masterAddress) => {
                        return jettons.find((j) => j.address !== null && Address.parse(j.address).equals(masterAddress)) ?? UNDEFINED_TOKEN;
                    }).catch(() => UNDEFINED_TOKEN);
                    loanTokenCache.set(cacheKey, tokenPromise);
                }
                const resolvedToken = await tokenPromise;
                if (cancelled) return;
                setLoanToken(resolvedToken);
            } catch {
                if (!cancelled) setLoanToken(UNDEFINED_TOKEN);
            }
        };

        resolveLoanToken();
        return () => { cancelled = true; };
    }, [loanJettonAddress, isTestnet, network]);

    useEffect(() => {
        if (loanInfo && loanToken) {
            setNewAmount(formatAmount(loanInfo.loanParams.amount, loanToken.decimals));
            if (loanToken.address !== null) {
                setOfferToken(loanToken);
            } else if (!loanInfo.jettonAddress) {
                setOfferToken(loanToken);
            }
        }
    }, [loanInfo, loanToken]);

    useEffect(() => { loadOffers(); }, [contractAddr, walletAddress, network]);

    useEffect(() => {
        if (offers.length === 0) { setOfferTokenMap({}); return; }
        resolveOfferTokens(offers, bank.getJettonMasterAddress, jettons)
            .then(setOfferTokenMap)
            .catch(console.error);
    }, [offers, isTestnet]);

    useEffect(() => {
        let cancelled = false;
        if (!contractAddr || offers.length === 0) {
            setOfferFundingStatuses({});
            return;
        }

        setOfferFundingStatuses(
            Object.fromEntries(offers.map((o) => [o.id, { checking: true, fundable: false, reason: 'Checking trusted funds on-chain...' }])),
        );

        const sameOfferTerms = (
            chainOffer: { loanParams: { amount: bigint; duration: number; interestPerDay: { nominator: number; denominator: number } }; expirationDate: bigint; jettonWallet: Address | null },
            stored: StoredBankOffer,
        ) =>
            chainOffer.loanParams.amount === BigInt(stored.amount) &&
            chainOffer.loanParams.duration === stored.duration &&
            chainOffer.loanParams.interestPerDay.nominator === stored.interestNominator &&
            chainOffer.loanParams.interestPerDay.denominator === stored.interestDenominator &&
            chainOffer.expirationDate === BigInt(stored.expirationDate) &&
            (chainOffer.jettonWallet?.toString() ?? null) === stored.jettonWallet;

        const verifyOffer = async (offer: StoredBankOffer): Promise<[string, OfferFundingStatus]> => {
            try {
                const bankData = await bank.getData(offer.bankAddress);
                const chainOffer = bankData.offers.get(Address.parse(contractAddr));
                if (!chainOffer) return [offer.id, { checking: false, fundable: false, reason: 'Offer is no longer present in this trusted contract.' }];
                if (!sameOfferTerms(chainOffer, offer)) return [offer.id, { checking: false, fundable: false, reason: 'Indexed offer does not match the current trusted contract offer.' }];
                if (BigInt(Math.floor(Date.now() / 1000)) >= chainOffer.expirationDate) return [offer.id, { checking: false, fundable: false, reason: 'Offer is expired on-chain.' }];

                const bankTonBalance = await bank.getBankBalance(offer.bankAddress);
                if (chainOffer.jettonWallet) {
                    const jettonBalance = await bank.getJettonWalletBalance(chainOffer.jettonWallet.toString());
                    if (jettonBalance < chainOffer.loanParams.amount) return [offer.id, { checking: false, fundable: false, reason: 'Trusted jetton wallet balance is below the offered amount.' }];
                    if (bankTonBalance < JETTON_OFFER_GAS_RESERVE) return [offer.id, { checking: false, fundable: false, reason: `Trusted wallet needs at least ${fromNano(JETTON_OFFER_GAS_RESERVE)} TON for jetton transfer gas.` }];
                    return [offer.id, { checking: false, fundable: true, reason: 'Trusted funds are sufficient and secured by the blockchain contract.' }];
                }

                const requiredTon = chainOffer.loanParams.amount + TON_OFFER_GAS_RESERVE;
                if (bankTonBalance < requiredTon) return [offer.id, { checking: false, fundable: false, reason: `Trusted wallet needs ${fromNano(requiredTon)} TON including funding gas.` }];
                return [offer.id, { checking: false, fundable: true, reason: 'Trusted TON balance is sufficient and secured by the blockchain contract.' }];
            } catch (e) {
                console.error(e);
                return [offer.id, { checking: false, fundable: false, reason: 'Could not verify this offer from blockchain.' }];
            }
        };

        Promise.all(offers.map(verifyOffer)).then((entries) => {
            if (!cancelled) setOfferFundingStatuses(Object.fromEntries(entries));
        });
        return () => { cancelled = true; };
    }, [offers, contractAddr]);

    // ── Computed ──────────────────────────────────────────────────────────────

    const isBorrower = !!(loanInfo && walletAddress && (() => {
        try { return loanInfo.ownerAddresses.borrower.equals(Address.parse(walletAddress)); }
        catch { return false; }
    })());

    const isLender = !!(loanInfo && walletAddress && loanInfo.ownerAddresses.moneyGiver && (() => {
        try { return loanInfo.ownerAddresses.moneyGiver!.equals(Address.parse(walletAddress)); }
        catch { return false; }
    })());

    const token = loanToken ?? (loanInfo?.jettonAddress ? UNDEFINED_TOKEN : jettons.find((j) => j.symbol === 'TON'));
    const tokenSymbol = token?.symbol ?? 'TON';
    const tokenPrice = prices[tokenSymbol];

    const durationDays = loanInfo ? Math.floor(loanInfo.loanParams.duration / 86400) : 0;
    const principal = loanInfo?.loanParams.amount ?? 0n;
    const interestPctNum = loanInfo
        ? (loanInfo.loanParams.interestPerDay.nominator / loanInfo.loanParams.interestPerDay.denominator) * 100
        : 0;
    const totalRepayment = loanInfo
        ? (() => {
              const nom = BigInt(loanInfo.loanParams.interestPerDay.nominator);
              const den = BigInt(loanInfo.loanParams.interestPerDay.denominator);
              const days = BigInt(durationDays);
              return den > 0n ? principal + (principal * nom * days) / den : principal;
          })()
        : 0n;
    const totalInterest = totalRepayment - principal;
    const startedDate = loanInfo?.startedAt ? new Date(loanInfo.startedAt * 1000).toLocaleDateString() : null;

    // ── Action handlers ───────────────────────────────────────────────────────

    const handleAction = async (action: () => Promise<void>) => {
        setActionLoading(true);
        try {
            await action();
            setTimeout(() => { load(); loadOffers(); }, 3000);
        } catch (e) {
            console.error(e);
            alert('Transaction failed');
        } finally {
            setActionLoading(false);
        }
    };

    const onRepay = () => handleAction(async () => {
        if (!loanInfo?.jettonAddress) {
            await sendRepayLoan(contractAddr!, totalRepayment);
            return;
        }

        if (!walletAddress) return;
        const masterAddress = await bank.getJettonMasterAddress(loanInfo.jettonAddress.toString());
        const borrowerJettonWallet = await bank.getJettonWalletAddress(walletAddress, masterAddress.toString());
        await sendRepayLoan(contractAddr!, totalRepayment, {
            walletAddress: borrowerJettonWallet.toString(),
            responseAddress: walletAddress,
        });
    });
    const onFund = () => handleAction(() => sendGiveLoan(contractAddr!, loanInfo!.loanParams));
    const onCancel = () => handleAction(() => sendCancelBeforeStart(contractAddr!));
    const onWithdrawNft = () => handleAction(() => sendWithdrawNftNotRepaid(contractAddr!));

    const onAcceptOffer = (offer: StoredBankOffer) =>
        handleAction(async () => {
            const status = offerFundingStatuses[offer.id];
            if (status && !status.fundable) { alert(status.reason); return; }
            let loanJettonWallet: Address | null = null;
            if (offer.jettonWallet) {
                const masterAddress = offer.jettonAddress
                    ? Address.parse(offer.jettonAddress)
                    : await bank.getJettonMasterAddress(offer.jettonWallet);
                loanJettonWallet = await bank.getJettonWalletAddress(contractAddr!, masterAddress.toString());
            }
            await sendAcceptOffer(contractAddr!, offer.bankAddress, loanParamsFromStoredOffer(offer), loanJettonWallet);
            setTimeout(loadOffers, 3000);
        });

    const onChangeParams = () =>
        handleAction(async () => {
            await sendChangeLoanParams(contractAddr!, {
                duration: parseInt(newDuration) * 86400,
                interestPerDay: percentToDecimal(newInterest),
                amount: scaleAmount(newAmount, token?.decimals ?? 9),
            });
            setShowChangeParams(false);
        });

    const onCreateOffer = () =>
        handleAction(async () => {
            if (!walletAddress || !contractAddr) return;
            const bankAddress = bank.getBankAddress(walletAddress).toString();
            const scaledAmount = scaleAmount(offerAmount, offerToken.decimals);
            const loanParams = {
                duration: parseInt(offerDuration) * 86400,
                interestPerDay: percentToDecimal(offerInterest),
                amount: scaledAmount,
            };
            const expirationDate = BigInt(Math.floor(Date.now() / 1000) + parseInt(offerExpiresDays) * 86400);
            let jettonWallet: Address | null = null;
            if (offerToken.address) {
                jettonWallet = await bank.getJettonWalletAddress(bankAddress, offerToken.address);
            }
            await bank.sendAddOffer(walletAddress, contractAddr, loanParams, expirationDate, jettonWallet);
            setTimeout(() => refreshBank(network, bankAddress).then(loadOffers).catch(console.error), 10_000);
        });

    const onRemoveOffer = (_offer: StoredBankOffer) =>
        handleAction(async () => {
            if (!walletAddress || !contractAddr) return;
            await bank.sendRemoveOffer(walletAddress, contractAddr);
            setTimeout(loadOffers, 3000);
        });

    return {
        // data
        walletAddress, loanInfo, loading, error, nftMeta, actionLoading, jettons,
        offers, offerFundingStatuses, offerTokenMap, bankBalance, bank,
        // computed
        isBorrower, isLender, token, tokenSymbol, tokenPrice,
        durationDays, principal, interestPctNum, totalRepayment, totalInterest, startedDate,
        // change-params form
        showChangeParams, setShowChangeParams,
        newAmount, setNewAmount, newDuration, setNewDuration, newInterest, setNewInterest,
        // offer form
        offerAmount, setOfferAmount, offerDuration, setOfferDuration,
        offerInterest, setOfferInterest, offerExpiresDays, setOfferExpiresDays,
        offerToken, setOfferToken,
        // actions
        load, onRepay, onFund, onCancel, onWithdrawNft,
        onAcceptOffer, onChangeParams, onCreateOffer, onRemoveOffer,
    };
}
