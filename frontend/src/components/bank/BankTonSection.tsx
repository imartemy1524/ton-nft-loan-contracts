import { fromNano } from '@ton/core';

type Props = {
    bankBalance: bigint | null;
    error: string | null;
    actionLoading: boolean;
    depositAmount: string;
    withdrawAmount: string;
    setDepositAmount: (v: string) => void;
    setWithdrawAmount: (v: string) => void;
    onDepositTon: (amount: string) => void;
    onWithdrawTon: (amount: string) => void;
    onWithdrawAll: () => void;
};

const inputCls =
    'w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary)]';

export function BankTonSection(p: Props) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">Trusted balance</p>
                <p className="mt-2 text-2xl font-semibold">{p.bankBalance === null ? '...' : `${fromNano(p.bankBalance)} TON`}</p>
                {p.error && <p className="mt-2 text-xs text-red-300">{p.error}</p>}
                {p.bankBalance !== null && p.bankBalance > 0n && (
                    <button
                        type="button"
                        disabled={p.actionLoading}
                        onClick={p.onWithdrawAll}
                        className="mt-4 w-full py-2 border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/50 disabled:opacity-50 text-white rounded-lg text-sm font-semibold cursor-pointer"
                    >
                        Withdraw all TON
                    </button>
                )}
            </div>

            <form
                className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 space-y-3"
                onSubmit={(e) => { e.preventDefault(); if (p.depositAmount) p.onDepositTon(p.depositAmount); }}
            >
                <label className="block text-xs text-[var(--color-text-secondary)]">Add TON to trusted wallet</label>
                <input
                    type="number" min="0.01" step="0.01"
                    value={p.depositAmount}
                    onChange={(e) => p.setDepositAmount(e.target.value)}
                    placeholder="10"
                    className={inputCls}
                />
                <button
                    disabled={p.actionLoading || !p.depositAmount}
                    className="w-full py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-white rounded-lg text-sm font-semibold cursor-pointer"
                >
                    Deposit TON
                </button>
            </form>

            <form
                className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 space-y-3"
                onSubmit={(e) => { e.preventDefault(); if (p.withdrawAmount) p.onWithdrawTon(p.withdrawAmount); }}
            >
                <label className="block text-xs text-[var(--color-text-secondary)]">Remove TON from trusted wallet</label>
                <input
                    type="number" min="0.01" step="0.01"
                    value={p.withdrawAmount}
                    onChange={(e) => p.setWithdrawAmount(e.target.value)}
                    placeholder="5"
                    className={inputCls}
                />
                <button
                    disabled={p.actionLoading || !p.withdrawAmount}
                    className="w-full py-2 border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/50 disabled:opacity-50 text-white rounded-lg text-sm font-semibold cursor-pointer"
                >
                    Withdraw TON
                </button>
            </form>
        </div>
    );
}
