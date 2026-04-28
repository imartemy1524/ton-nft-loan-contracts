import { fromNano } from '@ton/core';
import { LoanStatus } from '../../hooks/contracts/Main';
import { StoredBankOffer } from '../../api';
import { JettonInfo } from '../../constants/jettons';
import { OfferFundingStatus } from '../../hooks/useLoan';
import { formatAmount } from '../../utils/amounts';

type Props = {
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
    offerToken: JettonInfo;
    loanToken: JettonInfo | undefined;
    jettons: JettonInfo[];
    setOfferAmount: (v: string) => void;
    setOfferDuration: (v: string) => void;
    setOfferInterest: (v: string) => void;
    setOfferExpiresDays: (v: string) => void;
    setOfferToken: (t: JettonInfo) => void;
    onCreateOffer: () => void;
    onRemoveOffer: (offer: StoredBankOffer) => void;
    onAcceptOffer: (offer: StoredBankOffer) => void;
};

const inputCls =
    'w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary)]';

export function LoanOffersCard(p: Props) {
    return (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 space-y-5">
            <div>
                <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Trusted offers</h3>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    Trusted offers are secured by blockchain promises.
                </p>
            </div>

            <div className="space-y-3">
                {p.offers.length === 0 && (
                    <div className="border border-[var(--color-border)] bg-[var(--color-bg)] rounded-lg p-4 text-sm text-[var(--color-text-secondary)]">
                        No trusted offers found for this loan yet.
                    </div>
                )}
                {p.offers.map((offer) => {
                    const isOwnOffer = offer.bankAddress === p.currentBankAddress;
                    const fundingStatus = p.fundingStatuses[offer.id];
                    const isFundable = fundingStatus?.fundable === true;
                    const isUnderfunded = fundingStatus && !fundingStatus.checking && !fundingStatus.fundable;
                    const displayToken = {
                        decimals: offer.tokenDecimals ?? p.loanToken?.decimals ?? p.jettons[0]?.decimals ?? 9,
                        symbol: offer.tokenSymbol ?? p.loanToken?.symbol ?? 'TON',
                    };
                    const amount = `${formatAmount(BigInt(offer.amount), displayToken.decimals)} ${displayToken.symbol}`;
                    const duration = Math.floor(offer.duration / 86400);
                    const rate = ((offer.interestNominator / offer.interestDenominator) * 100).toFixed(2);
                    const expires = new Date(Number(BigInt(offer.expirationDate)) * 1000).toLocaleDateString();
                    return (
                        <div
                            key={offer.id}
                            className={`border rounded-lg p-4 ${
                                isUnderfunded ? 'border-red-500/40 bg-red-500/10' : 'border-green-500/30 bg-green-500/10'
                            }`}
                        >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium text-white">{amount}</p>
                                        {isOwnOffer && (
                                            <span className="px-2 py-0.5 rounded-full bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs">
                                                Your trusted wallet
                                            </span>
                                        )}
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
                    onSubmit={(e) => { e.preventDefault(); p.onCreateOffer(); }}
                >
                    <div className="flex flex-col gap-1">
                        <h4 className="font-semibold">Create trusted offer</h4>
                        <p className="text-xs text-[var(--color-text-secondary)] font-mono break-all">{p.currentBankAddress}</p>
                        <p className="text-xs text-[var(--color-text-secondary)]">
                            Trusted wallet TON balance: {p.bankBalance === null ? '...' : `${fromNano(p.bankBalance)} TON`}
                        </p>
                        <p className="text-xs text-green-300">
                            Secured because the offer is promised and enforced by the blockchain contract.
                        </p>
                    </div>
                    <div>
                        <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Offer Currency</label>
                        <div className="flex gap-2 flex-wrap">
                            {p.jettons.map((j) => (
                                <button
                                    key={j.symbol}
                                    type="button"
                                    onClick={() => p.setOfferToken(j)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                                        p.offerToken.symbol === j.symbol
                                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-white'
                                            : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/50 hover:text-white'
                                    }`}
                                >
                                    {j.icon && <img src={j.icon} alt="" className="w-4 h-4 rounded-full" />}
                                    <span>{j.symbol}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Amount ({p.offerToken.symbol})</label>
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
                        {p.actionLoading ? 'Sending...' : 'Create Trusted Offer'}
                    </button>
                </form>
            )}
        </div>
    );
}
