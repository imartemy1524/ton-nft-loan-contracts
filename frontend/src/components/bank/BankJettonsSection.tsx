import { useState } from 'react';
import { BankJettonAsset } from '../../hooks/useBankContract';
import { JettonInfo } from '../../constants/jettons';
import { formatAmount, scaleAmount } from '../../utils/amounts';

type Props = {
    jettons: BankJettonAsset[];
    availableJettons: JettonInfo[];
    actionLoading: boolean;
    tonviewerUrl: (addr: string) => string;
    onWithdrawJetton: (walletAddress: string, amount: bigint) => void;
    onDepositJetton: (jettonMasterAddress: string, amount: bigint) => void;
};

const inputCls =
    'w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary)]';

export function BankJettonsSection(p: Props) {
    const nonTonJettons = p.availableJettons.filter((j) => j.address !== null);
    const [selectedJetton, setSelectedJetton] = useState<JettonInfo | null>(nonTonJettons[0] ?? null);
    const [depositAmount, setDepositAmount] = useState('');
    // per-asset withdrawal amount inputs, keyed by walletAddress
    const [withdrawAmounts, setWithdrawAmounts] = useState<Record<string, string>>({});

    const setWithdrawAmount = (walletAddress: string, value: string) =>
        setWithdrawAmounts((prev) => ({ ...prev, [walletAddress]: value }));

    const handleDeposit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedJetton?.address || !depositAmount) return;
        p.onDepositJetton(selectedJetton.address, scaleAmount(depositAmount, selectedJetton.decimals));
        setDepositAmount('');
    };

    const handleWithdraw = (e: React.FormEvent, asset: BankJettonAsset) => {
        e.preventDefault();
        const raw = withdrawAmounts[asset.walletAddress] ?? '';
        if (!raw) return;
        p.onWithdrawJetton(asset.walletAddress, scaleAmount(raw, asset.decimals));
        setWithdrawAmount(asset.walletAddress, '');
    };

    return (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-4">
            <div>
                <h2 className="text-lg font-semibold">Jettons</h2>
                <p className="text-sm text-[var(--color-text-secondary)]">Jetton balances held by the trusted wallet.</p>
            </div>

            {p.jettons.length === 0 ? (
                <p className="text-sm text-[var(--color-text-secondary)]">No jetton balances found.</p>
            ) : (
                <div className="space-y-3">
                    {p.jettons.map((asset) => {
                        const maxFormatted = formatAmount(asset.balance, asset.decimals);
                        const withdrawRaw = withdrawAmounts[asset.walletAddress] ?? '';
                        return (
                            <div key={asset.walletAddress} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <p className="font-medium text-white">
                                            {maxFormatted} {asset.symbol}
                                        </p>
                                        <p className="text-xs text-[var(--color-text-secondary)] truncate">{asset.name}</p>
                                        <a
                                            href={p.tonviewerUrl(asset.masterAddress || asset.walletAddress)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs text-[var(--color-primary)] hover:underline"
                                        >
                                            Tonviewer
                                        </a>
                                    </div>
                                </div>

                                {/* Withdraw form */}
                                <form
                                    className="flex gap-2 items-center"
                                    onSubmit={(e) => handleWithdraw(e, asset)}
                                >
                                    <div className="flex flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg overflow-hidden focus-within:border-[var(--color-primary)]">
                                        <input
                                            type="number"
                                            min="0"
                                            step="any"
                                            max={maxFormatted}
                                            value={withdrawRaw}
                                            onChange={(e) => setWithdrawAmount(asset.walletAddress, e.target.value)}
                                            placeholder={`Amount (${asset.symbol})`}
                                            className="flex-1 min-w-0 bg-transparent px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setWithdrawAmount(asset.walletAddress, maxFormatted)}
                                            className="px-2.5 text-xs font-medium text-[var(--color-primary)] hover:text-white hover:bg-[var(--color-primary)]/20 transition-colors cursor-pointer border-l border-[var(--color-border)]"
                                        >
                                            Max
                                        </button>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={p.actionLoading || !withdrawRaw}
                                        className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-white rounded-lg text-sm font-semibold whitespace-nowrap cursor-pointer"
                                    >
                                        Withdraw
                                    </button>
                                </form>

                                <p className="text-[10px] text-[var(--color-text-secondary)] font-mono break-all">{asset.walletAddress}</p>
                            </div>
                        );
                    })}
                </div>
            )}

            {nonTonJettons.length > 0 && (
                <form onSubmit={handleDeposit} className="border-t border-[var(--color-border)] pt-4 space-y-3">
                    <p className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Deposit Jetton</p>
                    <div className="flex gap-2 flex-wrap">
                        {nonTonJettons.map((j) => (
                            <button
                                key={j.symbol}
                                type="button"
                                onClick={() => setSelectedJetton(j)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                                    selectedJetton?.symbol === j.symbol
                                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-white'
                                        : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/50 hover:text-white'
                                }`}
                            >
                                {j.icon && <img src={j.icon} alt="" className="w-4 h-4 rounded-full" />}
                                <span>{j.symbol}</span>
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <input
                            type="number"
                            min="0.000001"
                            step="any"
                            value={depositAmount}
                            onChange={(e) => setDepositAmount(e.target.value)}
                            placeholder={`Amount (${selectedJetton?.symbol ?? ''})`}
                            className={inputCls}
                        />
                        <button
                            disabled={p.actionLoading || !depositAmount || !selectedJetton}
                            className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-white rounded-lg text-sm font-semibold whitespace-nowrap cursor-pointer"
                        >
                            Deposit
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
