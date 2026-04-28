import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AggregatedLoan, getLoans } from '../api';
import { formatAmount } from '../utils/amounts';
import { useNetwork } from '../network';
import { LoanStatus } from '../hooks/contracts/Main';

export default function GiveLoan() {
    const navigate = useNavigate();
    const { network, isTestnet } = useNetwork();
    const [contractAddr, setContractAddr] = useState('');
    const [loans, setLoans] = useState<AggregatedLoan[]>([]);
    const [status, setStatus] = useState('');
    const [collection, setCollection] = useState('');
    const [hasOffers, setHasOffers] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleOpen = () => {
        const addr = contractAddr.trim();
        if (addr) navigate(`/loan/${addr}`);
    };

    const loadLoans = async () => {
        setLoading(true);
        setError(null);
        try {
            setLoans((await getLoans({ network, status, collection: collection.trim(), hasOffers })).loans);
        } catch (e) {
            console.error(e);
            setError('Failed to load loans.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadLoans();
    }, [network, status, collection, hasOffers]);

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold mb-2">Give a Loan</h1>
                <p className="text-[var(--color-text-secondary)]">
                    Enter a loan contract address to view its details and fund it.
                </p>
            </div>

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-semibold">Find Loan Contract</h2>
                <div className="flex gap-3">
                    <input
                        type="text"
                        value={contractAddr}
                        onChange={(e) => setContractAddr(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleOpen()}
                        placeholder="EQ..."
                        className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary)]"
                    />
                    <button
                        onClick={handleOpen}
                        disabled={!contractAddr.trim()}
                        className="px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors cursor-pointer"
                    >
                        View Loan
                    </button>
                </div>
            </div>

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold">Available Loans</h2>
                        <p className="text-sm text-[var(--color-text-secondary)]">
                            Loans found from recent blockchain snapshots.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]"
                        >
                            <option value="">All statuses</option>
                            <option value={String(LoanStatus.WAITING_FOR_FUNDS)}>Seeking lender</option>
                            <option value={String(LoanStatus.IN_PROGRESS)}>Active</option>
                            <option value={String(LoanStatus.REPAYED)}>Repaid</option>
                            <option value={String(LoanStatus.NOT_REPAYED)}>Defaulted</option>
                            <option value={String(LoanStatus.CANCELLED)}>Cancelled</option>
                        </select>
                        <input
                            type="text"
                            value={collection}
                            onChange={(e) => setCollection(e.target.value)}
                            placeholder="Collection"
                            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary)]"
                        />
                        <label className="flex items-center gap-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-secondary)]">
                            <input
                                type="checkbox"
                                checked={hasOffers}
                                onChange={(e) => setHasOffers(e.target.checked)}
                            />
                            With offers
                        </label>
                        <button
                            type="button"
                            onClick={loadLoans}
                            className="px-4 py-2 border border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-primary)]/50 text-white rounded-lg text-sm cursor-pointer"
                        >
                            Refresh
                        </button>
                    </div>
                </div>

                {error && <p className="text-sm text-red-300">{error}</p>}
                {loading && <p className="text-sm text-[var(--color-text-secondary)]">Loading loans...</p>}

                {!loading && loans.length === 0 ? (
                    <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-5 text-sm text-[var(--color-text-secondary)]">
                        No loans found yet. Open or create a loan once, then refresh this list.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {loans.map((loan) => {
                            const rate = ((loan.interestNominator / loan.interestDenominator) * 100).toFixed(2);
                            return (
                                <Link
                                    key={loan.address}
                                    to={`/loan/${loan.address}`}
                                    className="block bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 rounded-lg overflow-hidden no-underline transition-colors"
                                >
                                    <div className="flex gap-4 p-4">
                                        <div className="w-20 h-20 rounded-lg bg-[var(--color-surface)] overflow-hidden shrink-0">
                                            {loan.nftImage ? (
                                                <img src={loan.nftImage} alt={loan.nftName || 'NFT'} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-xs text-[var(--color-text-secondary)]">NFT</div>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <a
                                                        href={`${isTestnet ? 'https://testnet.getgems.io' : 'https://getgems.io'}/collection/${loan.nftCollectionAddress ?? ''}/${loan.nftAddress}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="font-semibold text-white truncate block hover:text-[var(--color-primary)] transition-colors"
                                                    >
                                                        {loan.nftName || 'NFT-backed loan'}
                                                    </a>
                                                    {loan.nftCollectionAddress ? (
                                                        <a
                                                            href={`${isTestnet ? 'https://testnet.getgems.io' : 'https://getgems.io'}/collection/${loan.nftCollectionAddress}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="text-xs text-[var(--color-text-secondary)] truncate block hover:text-[var(--color-primary)] transition-colors"
                                                        >
                                                            {loan.nftCollection || loan.nftAddress}
                                                        </a>
                                                    ) : (
                                                        <p className="text-xs text-[var(--color-text-secondary)] truncate">{loan.nftCollection || loan.nftAddress}</p>
                                                    )}
                                                </div>
                                                <span className="text-xs text-[var(--color-primary)] whitespace-nowrap">{loan.offersCount} offers</span>
                                            </div>
                                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                                                <div>
                                                    <p className="text-[var(--color-text-secondary)]">Amount</p>
                                                    <p className="text-white">
                                                        {formatAmount(BigInt(loan.amount), loan.tokenDecimals)}{' '}
                                                        {loan.tokenAddress ? (
                                                            <a href={`${isTestnet ? 'https://testnet.tonviewer.com' : 'https://tonviewer.com'}/${loan.tokenAddress}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="hover:text-[var(--color-primary)] transition-colors">
                                                                {loan.tokenSymbol === 'Undefined token' ? '???' : loan.tokenSymbol}
                                                            </a>
                                                        ) : (loan.tokenSymbol === 'Undefined token' ? '???' : loan.tokenSymbol)}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[var(--color-text-secondary)]">Duration</p>
                                                    <p className="text-white">{Math.floor(loan.duration / 86400)}d</p>
                                                </div>
                                                <div>
                                                    <p className="text-[var(--color-text-secondary)]">Rate</p>
                                                    <p className="text-white">{rate}%</p>
                                                </div>
                                            </div>
                                            <p className="mt-3 text-[10px] text-[var(--color-text-secondary)] font-mono truncate">{loan.address}</p>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
