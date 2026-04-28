import { LoanStatus } from '../../hooks/contracts/Main';
import { formatAmount } from '../../utils/amounts';

type Props = {
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
    tokenDecimals: number;
    tokenPrice: number | undefined;
    onRepay: () => void;
    onFund: () => void;
    onCancel: () => void;
    onWithdrawNft: () => void;
    onChangeParams: () => void;
};

const inputCls =
    'w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary)]';

export function LoanActionsCard(p: Props) {
    const fmt = (nano: bigint) => `${formatAmount(nano, p.tokenDecimals)} ${p.tokenSymbol}`;
    const usd = (nano: bigint) =>
        p.tokenPrice ? ` ≈ $${(Number(formatAmount(nano, p.tokenDecimals)) * p.tokenPrice).toFixed(2)}` : '';

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

    if (p.status === LoanStatus.WAITING_FOR_FUNDS) {
        return (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 space-y-4">
                <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Actions</h3>

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

                {p.isBorrower && (
                    <div className="space-y-3">
                        <p className="text-sm text-[var(--color-text-secondary)]">
                            Your loan contract is live and waiting for a lender. You can edit the terms or cancel.
                        </p>
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
                                        <input type="number" step="0.01" min="0.01" value={p.newAmount} onChange={(e) => p.setNewAmount(e.target.value)} className={inputCls} />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Duration (days)</label>
                                        <input type="number" min="1" value={p.newDuration} onChange={(e) => p.setNewDuration(e.target.value)} className={inputCls} />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Interest rate (% / day)</label>
                                    <input type="number" step="0.01" min="0.01" max="99.99" value={p.newInterest} onChange={(e) => p.setNewInterest(e.target.value)} className={inputCls} />
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

    if (p.status === LoanStatus.IN_PROGRESS) {
        return (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 space-y-4">
                <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Actions</h3>

                {p.isBorrower && (
                    <div className="space-y-3">
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-sm space-y-1">
                            <p className="text-blue-300 font-medium">Loan is active</p>
                            <p className="text-[var(--color-text-secondary)]">
                                Repay <span className="text-white font-medium">{fmt(p.totalRepayment)}</span>
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
                            Awaiting repayment of <span className="text-white font-medium">{fmt(p.totalRepayment)}</span>.
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

    if (p.status === LoanStatus.NOT_REPAYED) {
        return (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 space-y-4">
                <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Actions</h3>

                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm space-y-1">
                    <p className="text-red-300 font-medium">Loan defaulted</p>
                    <p className="text-[var(--color-text-secondary)]">The borrower did not repay before the loan expired.</p>
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
