import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTonAddress } from '@tonconnect/ui-react';
import { Address, fromNano, toNano } from '@ton/core';
import { useMainContract } from '../hooks/useMainContract';
import { LoanStatus, MainConfig } from '../hooks/contracts/Main';
import { useTokenPrices } from '../hooks/useTokenPrices';
import { useNetwork } from '../network';
import { JETTONS } from '../constants/jettons';
import { percentToDecimal } from '../utils/percentToDecimal';
import { useBankContract } from '../hooks/useBankContract';
import {
    getOffers,
    loanParamsFromStoredOffer,
    refreshBank,
    refreshLoan,
    StoredBankOffer,
} from '../api';

const STATUS_CONFIG: Record<LoanStatus, { label: string; cls: string; dot: string }> = {
    [LoanStatus.NOT_INITIALIZED]: {
        label: 'Initializing',
        cls: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
        dot: 'bg-gray-400',
    },
    [LoanStatus.WAITING_FOR_FUNDS]: {
        label: 'Seeking Lender',
        cls: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
        dot: 'bg-yellow-400 animate-pulse',
    },
    [LoanStatus.IN_PROGRESS]: {
        label: 'Active',
        cls: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
        dot: 'bg-blue-400 animate-pulse',
    },
    [LoanStatus.NOT_REPAYED]: {
        label: 'Defaulted',
        cls: 'bg-red-500/20 text-red-300 border border-red-500/30',
        dot: 'bg-red-400',
    },
    [LoanStatus.REPAYED]: {
        label: 'Repaid',
        cls: 'bg-green-500/20 text-green-300 border border-green-500/30',
        dot: 'bg-green-400',
    },
    [LoanStatus.CANCELLED]: {
        label: 'Cancelled',
        cls: 'bg-gray-500/20 text-gray-500 border border-gray-500/30',
        dot: 'bg-gray-500',
    },
};

type NftMeta = { name: string; image?: string; collection?: string };
type TonApiPreview = { resolution?: string; url?: string };
type OfferFundingStatus = {
    checking: boolean;
    fundable: boolean;
    reason: string;
};

const TON_OFFER_GAS_RESERVE = toNano('0.05');
const JETTON_OFFER_GAS_RESERVE = toNano('0.2');

export default function Loan() {
    const { address: contractAddr } = useParams<{ address: string }>();
    const walletAddress = useTonAddress();
    const navigate = useNavigate();
    const { config, network } = useNetwork();
    const {
        getData,
        sendRepayLoan,
        sendGiveLoan,
        sendCancelBeforeStart,
        sendChangeLoanParams,
        sendWithdrawNftNotRepaid,
        sendAcceptOffer,
    } = useMainContract();
    const bank = useBankContract();
    const prices = useTokenPrices();

    const [loanInfo, setLoanInfo] = useState<MainConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [nftMeta, setNftMeta] = useState<NftMeta | null>(null);
    const [showChangeParams, setShowChangeParams] = useState(false);
    const [newAmount, setNewAmount] = useState('');
    const [newDuration, setNewDuration] = useState('');
    const [newInterest, setNewInterest] = useState('');
    const [bankBalance, setBankBalance] = useState<bigint | null>(null);
    const [offers, setOffers] = useState<StoredBankOffer[]>([]);
    const [offerFundingStatuses, setOfferFundingStatuses] = useState<Record<string, OfferFundingStatus>>({});
    const [offerAmount, setOfferAmount] = useState('');
    const [offerDuration, setOfferDuration] = useState('7');
    const [offerInterest, setOfferInterest] = useState('1.00');
    const [offerExpiresDays, setOfferExpiresDays] = useState('7');

    const load = async () => {
        if (!contractAddr) return;
        setLoading(true);
        setError(null);
        try {
            const data = await getData(contractAddr);
            setLoanInfo(data);
            const pct = (data.loanParams.interestPerDay.nominator / data.loanParams.interestPerDay.denominator) * 100;
            setNewAmount(fromNano(data.loanParams.amount));
            setNewDuration(String(Math.floor(data.loanParams.duration / 86400)));
            setNewInterest(pct.toFixed(2));
            fetchNftMeta(data.nftAddress.toString());
            refreshLoan(network, contractAddr).catch(console.error);
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
            await refreshBank(network, bankAddress);
            setOffers((await getOffers({ network, loanAddress: contractAddr })).offers);
        } catch {
            setOffers(refreshed.offers);
        }
    };

    const fetchNftMeta = async (nftAddr: string) => {
        try {
            const res = await fetch(`${config.tonapiUrl}/nfts/${nftAddr}`);
            if (!res.ok) return;
            const d = await res.json();
            setNftMeta({
                name: d.metadata?.name || `NFT #${d.index ?? '?'}`,
                image:
                    d.previews?.find((p: TonApiPreview) => p.resolution === '500x500')?.url ||
                    d.previews?.[0]?.url ||
                    d.metadata?.image,
                collection: d.collection?.name,
            });
        } catch {
            return;
        }
    };

    useEffect(() => { load(); }, [contractAddr]);
    useEffect(() => {
        loadOffers();
    }, [contractAddr, walletAddress, network]);

    useEffect(() => {
        let cancelled = false;
        if (!contractAddr || offers.length === 0) {
            setOfferFundingStatuses({});
            return;
        }

        setOfferFundingStatuses(Object.fromEntries(
            offers.map((offer) => [offer.id, { checking: true, fundable: false, reason: 'Checking bank funds on-chain...' }]),
        ));

        const sameOfferTerms = (chainOffer: {
            loanParams: {
                amount: bigint;
                duration: number;
                interestPerDay: { nominator: number; denominator: number };
            };
            expirationDate: bigint;
            jettonWallet: Address | null;
        }, stored: StoredBankOffer) => (
            chainOffer.loanParams.amount === BigInt(stored.amount) &&
            chainOffer.loanParams.duration === stored.duration &&
            chainOffer.loanParams.interestPerDay.nominator === stored.interestNominator &&
            chainOffer.loanParams.interestPerDay.denominator === stored.interestDenominator &&
            chainOffer.expirationDate === BigInt(stored.expirationDate) &&
            (chainOffer.jettonWallet?.toString() ?? null) === stored.jettonWallet
        );

        const verifyOffer = async (offer: StoredBankOffer): Promise<[string, OfferFundingStatus]> => {
            try {
                const bankData = await bank.getData(offer.bankAddress);
                const chainOffer = bankData.offers.get(Address.parse(contractAddr));
                if (!chainOffer) {
                    return [offer.id, { checking: false, fundable: false, reason: 'Offer is no longer present in this bank contract.' }];
                }
                if (!sameOfferTerms(chainOffer, offer)) {
                    return [offer.id, { checking: false, fundable: false, reason: 'Indexed offer does not match the current bank contract offer.' }];
                }
                if (BigInt(Math.floor(Date.now() / 1000)) >= chainOffer.expirationDate) {
                    return [offer.id, { checking: false, fundable: false, reason: 'Offer is expired on-chain.' }];
                }

                const bankTonBalance = await bank.getBankBalance(offer.bankAddress);
                if (chainOffer.jettonWallet) {
                    const jettonBalance = await bank.getJettonWalletBalance(chainOffer.jettonWallet.toString());
                    if (jettonBalance < chainOffer.loanParams.amount) {
                        return [offer.id, { checking: false, fundable: false, reason: 'Bank jetton wallet balance is below the offered amount.' }];
                    }
                    if (bankTonBalance < JETTON_OFFER_GAS_RESERVE) {
                        return [offer.id, { checking: false, fundable: false, reason: `Bank needs at least ${fromNano(JETTON_OFFER_GAS_RESERVE)} TON for jetton transfer gas.` }];
                    }
                    return [offer.id, { checking: false, fundable: true, reason: 'Bank jetton and gas balances are sufficient.' }];
                }

                const requiredTon = chainOffer.loanParams.amount + TON_OFFER_GAS_RESERVE;
                if (bankTonBalance < requiredTon) {
                    return [offer.id, { checking: false, fundable: false, reason: `Bank needs ${fromNano(requiredTon)} TON including funding gas.` }];
                }
                return [offer.id, { checking: false, fundable: true, reason: 'Bank TON balance is sufficient.' }];
            } catch (error) {
                console.error(error);
                return [offer.id, { checking: false, fundable: false, reason: 'Could not verify this offer from blockchain.' }];
            }
        };

        Promise.all(offers.map(verifyOffer)).then((entries) => {
            if (!cancelled) setOfferFundingStatuses(Object.fromEntries(entries));
        });

        return () => {
            cancelled = true;
        };
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

    const token = loanInfo?.jettonAddress
        ? JETTONS.find((j) => j.address && loanInfo.jettonAddress &&
              Address.parse(j.address).equals(loanInfo.jettonAddress!))
        : JETTONS.find((j) => j.symbol === 'TON');
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

    const fmt = (nano: bigint) => `${fromNano(nano)} ${tokenSymbol}`;
    const usd = (nano: bigint) =>
        tokenPrice ? ` ≈ $${(Number(fromNano(nano)) * tokenPrice).toFixed(2)}` : '';

    const startedDate = loanInfo?.startedAt
        ? new Date(loanInfo.startedAt * 1000).toLocaleDateString()
        : null;

    // ── Action handlers ───────────────────────────────────────────────────────

    const handleAction = async (action: () => Promise<void>) => {
        setActionLoading(true);
        try {
            await action();
            setTimeout(() => {
                load();
                loadOffers();
            }, 3000);
        } catch (e) {
            console.error(e);
            alert('Transaction failed');
        } finally {
            setActionLoading(false);
        }
    };

    const onRepay = () => handleAction(() => sendRepayLoan(contractAddr!, totalRepayment));
    const onFund = () => handleAction(() => sendGiveLoan(contractAddr!, loanInfo!.loanParams));
    const onAcceptOffer = (offer: StoredBankOffer) =>
        handleAction(async () => {
            const status = offerFundingStatuses[offer.id];
            if (status && !status.fundable) {
                alert(status.reason);
                return;
            }
            await sendAcceptOffer(contractAddr!, offer.bankAddress, loanParamsFromStoredOffer(offer));
            setTimeout(() => refreshBank(network, offer.bankAddress).then(loadOffers).catch(console.error), 3000);
        });
    const onCancel = () => handleAction(() => sendCancelBeforeStart(contractAddr!));
    const onWithdrawNft = () => handleAction(() => sendWithdrawNftNotRepaid(contractAddr!));
    const onChangeParams = () =>
        handleAction(async () => {
            await sendChangeLoanParams(contractAddr!, {
                duration: parseInt(newDuration) * 86400,
                interestPerDay: percentToDecimal(newInterest),
                amount: toNano(newAmount),
            });
            setShowChangeParams(false);
        });
    const onCreateOffer = () =>
        handleAction(async () => {
            if (!walletAddress || !contractAddr) return;
            const bankAddress = bank.getBankAddress(walletAddress).toString();
            const loanParams = {
                duration: parseInt(offerDuration) * 86400,
                interestPerDay: percentToDecimal(offerInterest),
                amount: toNano(offerAmount),
            };
            const expirationDate = BigInt(Math.floor(Date.now() / 1000) + parseInt(offerExpiresDays) * 86400);
            await bank.sendAddOffer(walletAddress, contractAddr, loanParams, expirationDate);
            setTimeout(() => refreshBank(network, bankAddress).then(loadOffers).catch(console.error), 3000);
        });
    const onRemoveOffer = (offer: StoredBankOffer) =>
        handleAction(async () => {
            if (!walletAddress || !contractAddr) return;
            await bank.sendRemoveOffer(walletAddress, contractAddr);
            setTimeout(() => refreshBank(network, offer.bankAddress).then(loadOffers).catch(console.error), 3000);
        });

    // ── Render ────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex items-center justify-center py-32">
                <div className="text-center space-y-3">
                    <div className="w-10 h-10 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-[var(--color-text-secondary)] text-sm">Loading contract...</p>
                </div>
            </div>
        );
    }

    if (error || !loanInfo) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-8 text-center max-w-md space-y-3">
                    <p className="text-red-300 font-semibold">Contract not found</p>
                    <p className="text-[var(--color-text-secondary)] text-sm">{error}</p>
                    <button onClick={() => navigate(-1)} className="text-sm text-[var(--color-primary)] hover:underline cursor-pointer">
                        ← Go back
                    </button>
                </div>
            </div>
        );
    }

    const status = loanInfo.status as LoanStatus;
    const statusCfg = STATUS_CONFIG[status];

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => navigate(-1)}
                            className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-white transition-colors cursor-pointer"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            Back
                        </button>
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${statusCfg.cls}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                            {statusCfg.label}
                        </span>
                        {(isBorrower || isLender) && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30">
                                {isBorrower && isLender ? 'Borrower & Lender' : isBorrower ? 'Your loan' : 'You funded'}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)] font-mono truncate">{contractAddr}</p>
                </div>
                <button
                    onClick={load}
                    title="Refresh"
                    className="shrink-0 p-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/50 transition-colors cursor-pointer"
                >
                    <svg className="w-4 h-4 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                </button>
            </div>

            {/* Main layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* NFT card */}
                <div className="lg:col-span-1">
                    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
                        <div className="aspect-square bg-[var(--color-bg)]">
                            {nftMeta?.image ? (
                                <img src={nftMeta.image} alt={nftMeta.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-[var(--color-text-secondary)]">
                                    <svg className="w-14 h-14 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <span className="text-xs">NFT preview unavailable</span>
                                </div>
                            )}
                        </div>
                        <div className="p-4 space-y-0.5">
                            <p className="font-semibold truncate">{nftMeta?.name ?? '—'}</p>
                            {nftMeta?.collection && (
                                <p className="text-xs text-[var(--color-text-secondary)] truncate">{nftMeta.collection}</p>
                            )}
                            <p className="text-[10px] text-[var(--color-text-secondary)] font-mono truncate pt-1">
                                {loanInfo.nftAddress.toString()}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Right column */}
                <div className="lg:col-span-2 space-y-4">

                    {/* Loan parameters */}
                    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
                        <h2 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-4">
                            Loan Parameters
                        </h2>
                        <div className="grid grid-cols-2 gap-y-3 text-sm">
                            <span className="text-[var(--color-text-secondary)]">Principal</span>
                            <span className="font-medium">
                                {fmt(principal)}
                                {tokenPrice && <span className="text-xs text-[var(--color-text-secondary)] ml-1.5">{usd(principal)}</span>}
                            </span>

                            <span className="text-[var(--color-text-secondary)]">Duration</span>
                            <span className="font-medium">{durationDays} days</span>

                            <span className="text-[var(--color-text-secondary)]">Interest rate</span>
                            <span className="font-medium">{interestPctNum.toFixed(2)}% / day</span>

                            <span className="text-[var(--color-text-secondary)]">Total interest</span>
                            <span className="font-medium text-orange-400">
                                +{fmt(totalInterest)}
                                {tokenPrice && <span className="text-xs opacity-70 ml-1.5">{usd(totalInterest)}</span>}
                            </span>

                            <span className="col-span-2 border-t border-[var(--color-border)]" />

                            <span className="font-semibold">Total repayment</span>
                            <span className="font-semibold">
                                {fmt(totalRepayment)}
                                {tokenPrice && <span className="text-sm font-normal text-[var(--color-text-secondary)] ml-1.5">{usd(totalRepayment)}</span>}
                            </span>

                            <span className="col-span-2 border-t border-[var(--color-border)]" />

                            <span className="text-[var(--color-text-secondary)]">Borrower</span>
                            <span className="font-mono text-xs break-all">{loanInfo.ownerAddresses.borrower.toString()}</span>

                            <span className="text-[var(--color-text-secondary)]">Lender</span>
                            {loanInfo.ownerAddresses.moneyGiver ? (
                                <span className="font-mono text-xs break-all">{loanInfo.ownerAddresses.moneyGiver.toString()}</span>
                            ) : (
                                <span className="text-xs text-[var(--color-text-secondary)] italic">Not funded yet</span>
                            )}

                            {startedDate && (
                                <>
                                    <span className="text-[var(--color-text-secondary)]">Started</span>
                                    <span className="font-medium">{startedDate}</span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    <ActionsCard
                        status={status}
                        isBorrower={isBorrower}
                        isLender={isLender}
                        walletAddress={walletAddress}
                        actionLoading={actionLoading}
                        showChangeParams={showChangeParams}
                        setShowChangeParams={setShowChangeParams}
                        newAmount={newAmount}
                        newDuration={newDuration}
                        newInterest={newInterest}
                        setNewAmount={setNewAmount}
                        setNewDuration={setNewDuration}
                        setNewInterest={setNewInterest}
                        totalRepayment={totalRepayment}
                        principal={principal}
                        tokenSymbol={tokenSymbol}
                        tokenPrice={tokenPrice}
                        onRepay={onRepay}
                        onFund={onFund}
                        onCancel={onCancel}
                        onWithdrawNft={onWithdrawNft}
                        onChangeParams={onChangeParams}
                    />

                    <OffersCard
                        offers={offers}
                        status={status}
                        walletAddress={walletAddress}
                        currentBankAddress={walletAddress ? bank.getBankAddress(walletAddress).toString() : ''}
                        bankBalance={bankBalance}
                        fundingStatuses={offerFundingStatuses}
                        isBorrower={isBorrower}
                        actionLoading={actionLoading}
                        offerAmount={offerAmount}
                        offerDuration={offerDuration}
                        offerInterest={offerInterest}
                        offerExpiresDays={offerExpiresDays}
                        setOfferAmount={setOfferAmount}
                        setOfferDuration={setOfferDuration}
                        setOfferInterest={setOfferInterest}
                        setOfferExpiresDays={setOfferExpiresDays}
                        onCreateOffer={onCreateOffer}
                        onRemoveOffer={onRemoveOffer}
                        onAcceptOffer={onAcceptOffer}
                    />
                </div>
            </div>
        </div>
    );
}

type OffersProps = {
    offers: StoredBankOffer[];
    status: LoanStatus;
    walletAddress: string;
    currentBankAddress: string;
    bankBalance: bigint | null;
    fundingStatuses: Record<string, OfferFundingStatus>;
    isBorrower: boolean;
    actionLoading: boolean;
    offerAmount: string;
    offerDuration: string;
    offerInterest: string;
    offerExpiresDays: string;
    setOfferAmount: (v: string) => void;
    setOfferDuration: (v: string) => void;
    setOfferInterest: (v: string) => void;
    setOfferExpiresDays: (v: string) => void;
    onCreateOffer: () => void;
    onRemoveOffer: (offer: StoredBankOffer) => void;
    onAcceptOffer: (offer: StoredBankOffer) => void;
};

function OffersCard(p: OffersProps) {
    const inputCls =
        'w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary)]';

    return (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 space-y-5">
            <div>
                <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Bank offers</h3>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    Offers are refreshed from bank contracts and cached by the backend.
                </p>
            </div>

            <div className="space-y-3">
                {p.offers.length === 0 && (
                    <div className="border border-[var(--color-border)] bg-[var(--color-bg)] rounded-lg p-4 text-sm text-[var(--color-text-secondary)]">
                        No bank offers have been indexed for this loan yet.
                    </div>
                )}
                {p.offers.map((offer) => {
                    const isOwnOffer = offer.bankAddress === p.currentBankAddress;
                    const fundingStatus = p.fundingStatuses[offer.id];
                    const isFundable = fundingStatus?.fundable === true;
                    const isUnderfunded = fundingStatus && !fundingStatus.checking && !fundingStatus.fundable;
                    const amount = `${fromNano(BigInt(offer.amount))} TON`;
                    const duration = Math.floor(offer.duration / 86400);
                    const rate = ((offer.interestNominator / offer.interestDenominator) * 100).toFixed(2);
                    const expires = new Date(Number(BigInt(offer.expirationDate)) * 1000).toLocaleDateString();
                    return (
                        <div
                            key={offer.id}
                            className={`border rounded-lg p-4 ${
                                isUnderfunded
                                    ? 'border-red-500/40 bg-red-500/10'
                                    : 'border-green-500/30 bg-green-500/10'
                            }`}
                        >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium text-white">{amount}</p>
                                        {isOwnOffer && <span className="px-2 py-0.5 rounded-full bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs">Your bank</span>}
                                    </div>
                                    <p className="text-xs text-[var(--color-text-secondary)] font-mono truncate">{offer.bankAddress}</p>
                                    <p className="text-xs text-[var(--color-text-secondary)]">Expires {expires}</p>
                                    {fundingStatus && (
                                        <p className={`text-xs mt-1 ${isUnderfunded ? 'text-red-300' : isFundable ? 'text-green-300' : 'text-[var(--color-text-secondary)]'}`}>
                                            {fundingStatus.reason}
                                        </p>
                                    )}
                                </div>
                                <div className="text-sm text-[var(--color-text-secondary)] sm:text-right">
                                    <p>{duration} days</p>
                                    <p>{rate}% / day</p>
                                </div>
                                <div className="flex gap-2">
                                    {p.isBorrower && p.status === LoanStatus.WAITING_FOR_FUNDS && (
                                        <button
                                            onClick={() => p.onAcceptOffer(offer)}
                                            disabled={p.actionLoading || !isFundable}
                                            className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-white rounded-lg text-sm font-semibold cursor-pointer"
                                        >
                                            {fundingStatus?.checking ? 'Checking...' : 'Accept'}
                                        </button>
                                    )}
                                    {isOwnOffer && (
                                        <button
                                            onClick={() => p.onRemoveOffer(offer)}
                                            disabled={p.actionLoading}
                                            className="px-4 py-2 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 text-red-300 rounded-lg text-sm font-semibold cursor-pointer"
                                        >
                                            Delete
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {!p.isBorrower && p.walletAddress && p.status === LoanStatus.WAITING_FOR_FUNDS && (
                <form
                    className="border-t border-[var(--color-border)] pt-5 space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        p.onCreateOffer();
                    }}
                >
                    <div className="flex flex-col gap-1">
                        <h4 className="font-semibold">Create offer from your bank</h4>
                        <p className="text-xs text-[var(--color-text-secondary)] font-mono break-all">{p.currentBankAddress}</p>
                        <p className="text-xs text-[var(--color-text-secondary)]">
                            Bank balance: {p.bankBalance === null ? '...' : `${fromNano(p.bankBalance)} TON`}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Amount (TON)</label>
                            <input type="number" min="0.01" step="0.01" required value={p.offerAmount} onChange={(e) => p.setOfferAmount(e.target.value)} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Duration (days)</label>
                            <input type="number" min="1" required value={p.offerDuration} onChange={(e) => p.setOfferDuration(e.target.value)} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Interest (% / day)</label>
                            <input type="number" min="0.01" step="0.01" required value={p.offerInterest} onChange={(e) => p.setOfferInterest(e.target.value)} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Expires in days</label>
                            <input type="number" min="1" required value={p.offerExpiresDays} onChange={(e) => p.setOfferExpiresDays(e.target.value)} className={inputCls} />
                        </div>
                    </div>
                    <button
                        disabled={p.actionLoading || !p.offerAmount}
                        className="w-full py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-white rounded-lg font-semibold transition-colors cursor-pointer"
                    >
                        {p.actionLoading ? 'Sending...' : 'Create Bank Offer'}
                    </button>
                </form>
            )}
        </div>
    );
}

// ── ActionsCard ───────────────────────────────────────────────────────────────

type ActionsProps = {
    status: LoanStatus;
    isBorrower: boolean;
    isLender: boolean;
    walletAddress: string;
    actionLoading: boolean;
    showChangeParams: boolean;
    setShowChangeParams: (v: boolean) => void;
    newAmount: string;
    newDuration: string;
    newInterest: string;
    setNewAmount: (v: string) => void;
    setNewDuration: (v: string) => void;
    setNewInterest: (v: string) => void;
    totalRepayment: bigint;
    principal: bigint;
    tokenSymbol: string;
    tokenPrice: number | undefined;
    onRepay: () => void;
    onFund: () => void;
    onCancel: () => void;
    onWithdrawNft: () => void;
    onChangeParams: () => void;
};

function ActionsCard(p: ActionsProps) {
    const fmt = (nano: bigint) => `${fromNano(nano)} ${p.tokenSymbol}`;
    const usd = (nano: bigint) =>
        p.tokenPrice ? ` ≈ $${(Number(fromNano(nano)) * p.tokenPrice).toFixed(2)}` : '';

    const inputCls =
        'w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary)]';

    // ── NOT_INITIALIZED ──────────────────────────────────────────────────────
    if (p.status === LoanStatus.NOT_INITIALIZED) {
        return (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
                <div className="flex items-center gap-3 text-[var(--color-text-secondary)]">
                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                    <p className="text-sm">Contract is initializing. Waiting for the NFT to be transferred on-chain...</p>
                </div>
            </div>
        );
    }

    // ── REPAYED ──────────────────────────────────────────────────────────────
    if (p.status === LoanStatus.REPAYED) {
        return (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-5">
                <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-green-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                        <p className="text-green-300 font-semibold">Loan fully repaid</p>
                        <p className="text-xs text-green-200/60 mt-1">The borrower repaid the loan and recovered their NFT.</p>
                    </div>
                </div>
            </div>
        );
    }

    // ── CANCELLED ────────────────────────────────────────────────────────────
    if (p.status === LoanStatus.CANCELLED) {
        return (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
                <div className="flex items-start gap-3 text-[var(--color-text-secondary)]">
                    <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                        <p className="font-semibold text-white">Loan cancelled</p>
                        <p className="text-xs mt-1">The borrower cancelled this loan before it was funded.</p>
                    </div>
                </div>
            </div>
        );
    }

    // ── WAITING_FOR_FUNDS ─────────────────────────────────────────────────────
    if (p.status === LoanStatus.WAITING_FOR_FUNDS) {
        return (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 space-y-4">
                <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Actions</h3>

                {/* Fund button — visible to anyone who is NOT the borrower */}
                {!p.isBorrower && (
                    <div className="space-y-2">
                        <p className="text-sm text-[var(--color-text-secondary)]">
                            Fund this loan by sending{' '}
                            <span className="text-white font-medium">{fmt(p.principal)}</span>
                            {p.tokenPrice && <span className="text-xs"> ({usd(p.principal)})</span>}
                            {' '}to the borrower. You will receive{' '}
                            <span className="text-white font-medium">{fmt(p.totalRepayment)}</span> back.
                        </p>
                        {p.walletAddress ? (
                            <button
                                onClick={p.onFund}
                                disabled={p.actionLoading}
                                className="w-full py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-white rounded-lg font-semibold transition-colors cursor-pointer"
                            >
                                {p.actionLoading ? 'Sending...' : `Fund — send ${fmt(p.principal)}`}
                            </button>
                        ) : (
                            <div className="w-full py-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-center text-sm text-[var(--color-text-secondary)]">
                                Connect your wallet to fund this loan
                            </div>
                        )}
                    </div>
                )}

                {/* Borrower controls */}
                {p.isBorrower && (
                    <div className="space-y-3">
                        <p className="text-sm text-[var(--color-text-secondary)]">
                            Your loan contract is live and waiting for a lender. You can edit the terms or cancel.
                        </p>

                        {/* Edit loan terms */}
                        <button
                            type="button"
                            onClick={() => p.setShowChangeParams(!p.showChangeParams)}
                            className="w-full py-2.5 border border-[var(--color-border)] hover:border-[var(--color-primary)]/60 bg-[var(--color-bg)] text-white rounded-lg font-medium text-sm transition-colors cursor-pointer flex items-center justify-between px-4"
                        >
                            <span>Edit Loan Terms</span>
                            <svg className={`w-4 h-4 transition-transform ${p.showChangeParams ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {p.showChangeParams && (
                            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Amount ({p.tokenSymbol})</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0.01"
                                            value={p.newAmount}
                                            onChange={(e) => p.setNewAmount(e.target.value)}
                                            className={inputCls}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Duration (days)</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={p.newDuration}
                                            onChange={(e) => p.setNewDuration(e.target.value)}
                                            className={inputCls}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Interest rate (% / day)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        max="99.99"
                                        value={p.newInterest}
                                        onChange={(e) => p.setNewInterest(e.target.value)}
                                        className={inputCls}
                                    />
                                </div>
                                <div className="flex gap-2 pt-1">
                                    <button
                                        onClick={p.onChangeParams}
                                        disabled={p.actionLoading}
                                        className="flex-1 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors cursor-pointer"
                                    >
                                        {p.actionLoading ? 'Saving...' : 'Save Changes'}
                                    </button>
                                    <button
                                        onClick={() => p.setShowChangeParams(false)}
                                        className="px-4 py-2 border border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-primary)]/50 text-white rounded-lg text-sm transition-colors cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Cancel loan */}
                        <button
                            onClick={p.onCancel}
                            disabled={p.actionLoading}
                            className="w-full py-2.5 bg-red-600/15 hover:bg-red-600/25 border border-red-600/30 hover:border-red-600/50 disabled:opacity-50 text-red-400 rounded-lg font-medium text-sm transition-colors cursor-pointer"
                        >
                            {p.actionLoading ? 'Sending...' : 'Cancel Loan'}
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // ── IN_PROGRESS ───────────────────────────────────────────────────────────
    if (p.status === LoanStatus.IN_PROGRESS) {
        return (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 space-y-4">
                <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Actions</h3>

                {p.isBorrower && (
                    <div className="space-y-3">
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-sm space-y-1">
                            <p className="text-blue-300 font-medium">Loan is active</p>
                            <p className="text-[var(--color-text-secondary)]">
                                Repay{' '}
                                <span className="text-white font-medium">{fmt(p.totalRepayment)}</span>
                                {p.tokenPrice && <span className="text-xs"> ({usd(p.totalRepayment)})</span>}
                                {' '}to recover your NFT.
                            </p>
                        </div>
                        <button
                            onClick={p.onRepay}
                            disabled={p.actionLoading}
                            className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-semibold transition-colors cursor-pointer"
                        >
                            {p.actionLoading ? 'Sending...' : `Repay — ${fmt(p.totalRepayment)}`}
                        </button>
                    </div>
                )}

                {p.isLender && !p.isBorrower && (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-sm space-y-1">
                        <p className="text-blue-300 font-medium">You funded this loan</p>
                        <p className="text-[var(--color-text-secondary)]">
                            Awaiting repayment of{' '}
                            <span className="text-white font-medium">{fmt(p.totalRepayment)}</span>.
                            If the borrower defaults, you can claim the NFT.
                        </p>
                    </div>
                )}

                {!p.isBorrower && !p.isLender && (
                    <p className="text-sm text-[var(--color-text-secondary)]">This loan is currently active. No actions available.</p>
                )}
            </div>
        );
    }

    // ── NOT_REPAYED ───────────────────────────────────────────────────────────
    if (p.status === LoanStatus.NOT_REPAYED) {
        return (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 space-y-4">
                <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Actions</h3>

                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm space-y-1">
                    <p className="text-red-300 font-medium">Loan defaulted</p>
                    <p className="text-[var(--color-text-secondary)]">
                        The borrower did not repay before the loan expired.
                    </p>
                </div>

                {p.isLender && (
                    <button
                        onClick={p.onWithdrawNft}
                        disabled={p.actionLoading}
                        className="w-full py-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg font-semibold transition-colors cursor-pointer"
                    >
                        {p.actionLoading ? 'Sending...' : 'Claim NFT Collateral'}
                    </button>
                )}

                {p.isBorrower && !p.isLender && (
                    <p className="text-sm text-[var(--color-text-secondary)]">
                        The loan period has ended. The lender can now claim your NFT as collateral.
                    </p>
                )}

                {!p.isBorrower && !p.isLender && (
                    <p className="text-sm text-[var(--color-text-secondary)]">No actions available for your account.</p>
                )}
            </div>
        );
    }

    return null;
}
