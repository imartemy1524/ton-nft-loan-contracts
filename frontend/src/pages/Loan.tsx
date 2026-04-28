import { useParams, useNavigate } from 'react-router-dom';
import { LoanStatus } from '../hooks/contracts/Main';
import { useLoan } from '../hooks/useLoan';
import { formatAmount } from '../utils/amounts';
import { LoanActionsCard } from '../components/loan/LoanActionsCard';
import { LoanOffersCard } from '../components/loan/LoanOffersCard';

const STATUS_CONFIG: Record<LoanStatus, { label: string; cls: string; dot: string }> = {
    [LoanStatus.NOT_INITIALIZED]: { label: 'Initializing', cls: 'bg-gray-500/20 text-gray-400 border border-gray-500/30', dot: 'bg-gray-400' },
    [LoanStatus.WAITING_FOR_FUNDS]: { label: 'Seeking Lender', cls: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30', dot: 'bg-yellow-400 animate-pulse' },
    [LoanStatus.IN_PROGRESS]: { label: 'Active', cls: 'bg-blue-500/20 text-blue-300 border border-blue-500/30', dot: 'bg-blue-400 animate-pulse' },
    [LoanStatus.NOT_REPAYED]: { label: 'Defaulted', cls: 'bg-red-500/20 text-red-300 border border-red-500/30', dot: 'bg-red-400' },
    [LoanStatus.REPAYED]: { label: 'Repaid', cls: 'bg-green-500/20 text-green-300 border border-green-500/30', dot: 'bg-green-400' },
    [LoanStatus.CANCELLED]: { label: 'Cancelled', cls: 'bg-gray-500/20 text-gray-500 border border-gray-500/30', dot: 'bg-gray-500' },
};

type LoanState = ReturnType<typeof useLoan>;

export default function Loan() {
    const { address: contractAddr } = useParams<{ address: string }>();
    const navigate = useNavigate();
    const loan = useLoan(contractAddr);

    if (loan.loading) {
        return (
            <div className="flex items-center justify-center py-32">
                <div className="text-center space-y-3">
                    <div className="w-10 h-10 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-[var(--color-text-secondary)] text-sm">Loading contract...</p>
                </div>
            </div>
        );
    }

    if (loan.error || !loan.loanInfo) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-8 text-center max-w-md space-y-3">
                    <p className="text-red-300 font-semibold">Contract not found</p>
                    <p className="text-[var(--color-text-secondary)] text-sm">{loan.error}</p>
                    <button onClick={() => navigate(-1)} className="text-sm text-[var(--color-primary)] hover:underline cursor-pointer">
                        ← Go back
                    </button>
                </div>
            </div>
        );
    }

    const status = loan.loanInfo.status as LoanStatus;
    const statusCfg = STATUS_CONFIG[status];

    return (
        <div className="space-y-6">
            {/* Header */}
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
                        {(loan.isBorrower || loan.isLender) && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30">
                                {loan.isBorrower && loan.isLender ? 'Borrower & Lender' : loan.isBorrower ? 'Your loan' : 'You funded'}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)] font-mono truncate">{contractAddr}</p>
                </div>
                <button
                    onClick={loan.load}
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
                            {loan.nftMeta?.image ? (
                                <img src={loan.nftMeta.image} alt={loan.nftMeta.name} className="w-full h-full object-cover" />
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
                            <p className="font-semibold truncate">{loan.nftMeta?.name ?? '—'}</p>
                            {loan.nftMeta?.collection && (
                                <p className="text-xs text-[var(--color-text-secondary)] truncate">{loan.nftMeta.collection}</p>
                            )}
                            <p className="text-[10px] text-[var(--color-text-secondary)] font-mono truncate pt-1">
                                {loan.loanInfo.nftAddress.toString()}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Right column */}
                <div className="lg:col-span-2 space-y-4">
                    <LoanParamsCard loan={loan} />

                    <LoanActionsCard
                        status={status}
                        isBorrower={loan.isBorrower}
                        isLender={loan.isLender}
                        walletAddress={loan.walletAddress}
                        actionLoading={loan.actionLoading}
                        showChangeParams={loan.showChangeParams}
                        setShowChangeParams={loan.setShowChangeParams}
                        newAmount={loan.newAmount}
                        newDuration={loan.newDuration}
                        newInterest={loan.newInterest}
                        setNewAmount={loan.setNewAmount}
                        setNewDuration={loan.setNewDuration}
                        setNewInterest={loan.setNewInterest}
                        totalRepayment={loan.totalRepayment}
                        principal={loan.principal}
                        tokenSymbol={loan.tokenSymbol}
                        tokenDecimals={loan.token?.decimals ?? 9}
                        tokenPrice={loan.tokenPrice}
                        onRepay={loan.onRepay}
                        onFund={loan.onFund}
                        onCancel={loan.onCancel}
                        onWithdrawNft={loan.onWithdrawNft}
                        onChangeParams={loan.onChangeParams}
                    />

                    <LoanOffersCard
                        offers={loan.offers}
                        status={status}
                        walletAddress={loan.walletAddress}
                        currentBankAddress={loan.walletAddress ? loan.bank.getBankAddress(loan.walletAddress).toString() : ''}
                        bankBalance={loan.bankBalance}
                        fundingStatuses={loan.offerFundingStatuses}
                        isBorrower={loan.isBorrower}
                        actionLoading={loan.actionLoading}
                        offerAmount={loan.offerAmount}
                        offerDuration={loan.offerDuration}
                        offerInterest={loan.offerInterest}
                        offerExpiresDays={loan.offerExpiresDays}
                        offerToken={loan.offerToken}
                        loanToken={loan.token}
                        jettons={loan.jettons}
                        setOfferAmount={loan.setOfferAmount}
                        setOfferDuration={loan.setOfferDuration}
                        setOfferInterest={loan.setOfferInterest}
                        setOfferExpiresDays={loan.setOfferExpiresDays}
                        setOfferToken={loan.setOfferToken}
                        onCreateOffer={loan.onCreateOffer}
                        onRemoveOffer={loan.onRemoveOffer}
                        onAcceptOffer={loan.onAcceptOffer}
                    />
                </div>
            </div>
        </div>
    );
}

function LoanParamsCard({ loan }: { loan: LoanState }) {
    const decimals = loan.token?.decimals ?? 9;
    const fmt = (nano: bigint) => `${formatAmount(nano, decimals)} ${loan.tokenSymbol}`;
    const usd = (nano: bigint) =>
        loan.tokenPrice
            ? ` ≈ $${(Number(formatAmount(nano, decimals)) * loan.tokenPrice).toFixed(2)}`
            : '';

    return (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
            <h2 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-4">
                Loan Parameters
            </h2>
            <div className="grid grid-cols-2 gap-y-3 text-sm">
                <span className="text-[var(--color-text-secondary)]">Principal</span>
                <span className="font-medium">
                    {fmt(loan.principal)}
                    {loan.tokenPrice && <span className="text-xs text-[var(--color-text-secondary)] ml-1.5">{usd(loan.principal)}</span>}
                </span>

                <span className="text-[var(--color-text-secondary)]">Duration</span>
                <span className="font-medium">{loan.durationDays} days</span>

                <span className="text-[var(--color-text-secondary)]">Interest rate</span>
                <span className="font-medium">{loan.interestPctNum.toFixed(2)}% / day</span>

                <span className="text-[var(--color-text-secondary)]">Total interest</span>
                <span className="font-medium text-orange-400">
                    +{fmt(loan.totalInterest)}
                    {loan.tokenPrice && <span className="text-xs opacity-70 ml-1.5">{usd(loan.totalInterest)}</span>}
                </span>

                <span className="col-span-2 border-t border-[var(--color-border)]" />

                <span className="font-semibold">Total repayment</span>
                <span className="font-semibold">
                    {fmt(loan.totalRepayment)}
                    {loan.tokenPrice && <span className="text-sm font-normal text-[var(--color-text-secondary)] ml-1.5">{usd(loan.totalRepayment)}</span>}
                </span>

                <span className="col-span-2 border-t border-[var(--color-border)]" />

                <span className="text-[var(--color-text-secondary)]">Borrower</span>
                <span className="font-mono text-xs break-all">{loan.loanInfo!.ownerAddresses.borrower.toString()}</span>

                <span className="text-[var(--color-text-secondary)]">Lender</span>
                {loan.loanInfo!.ownerAddresses.moneyGiver ? (
                    <span className="font-mono text-xs break-all">{loan.loanInfo!.ownerAddresses.moneyGiver.toString()}</span>
                ) : (
                    <span className="text-xs text-[var(--color-text-secondary)] italic">Not funded yet</span>
                )}

                {loan.startedDate && (
                    <>
                        <span className="text-[var(--color-text-secondary)]">Started</span>
                        <span className="font-medium">{loan.startedDate}</span>
                    </>
                )}
            </div>
        </div>
    );
}
