import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { fromNano } from '@ton/core';
import { getOffers, refreshBank, StoredBankOffer, formatStoredOfferAmount } from '../api';
import { BankJettonAsset, BankNftAsset, useBankContract } from '../hooks/useBankContract';
import { useNetwork } from '../network';

function formatJettonBalance(asset: BankJettonAsset) {
    const base = 10 ** asset.decimals;
    return `${(Number(asset.balance) / base).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${asset.symbol}`;
}

export default function Profile() {
    const address = useTonAddress();
    const [tonConnectUI] = useTonConnectUI();
    const navigate = useNavigate();
    const bank = useBankContract();
    const { network } = useNetwork();
    const [contractAddr, setContractAddr] = useState('');
    const [bankBalance, setBankBalance] = useState<bigint | null>(null);
    const [balanceError, setBalanceError] = useState<string | null>(null);
    const [depositAmount, setDepositAmount] = useState('');
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [offers, setOffers] = useState<StoredBankOffer[]>([]);
    const [jettons, setJettons] = useState<BankJettonAsset[]>([]);
    const [nfts, setNfts] = useState<BankNftAsset[]>([]);

    const bankAddress = useMemo(() => (address ? bank.getBankAddress(address).toString() : ''), [address, bank]);

    const refresh = async () => {
        if (!bankAddress) return;
        setBalanceError(null);
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
            setBalanceError('Failed to load bank assets from TonAPI.');
        }
    };

    useEffect(() => {
        refresh();
    }, [bankAddress, network]);

    if (!address) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-10 text-center">
                    <h2 className="text-2xl font-bold mb-3">Connect Your Wallet</h2>
                    <p className="text-[var(--color-text-secondary)]">
                        Connect your TON wallet to view and manage your loans.
                    </p>
                    <button
                        type="button"
                        onClick={() => tonConnectUI.openModal()}
                        className="mt-6 px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg font-medium text-sm transition-colors cursor-pointer"
                    >
                        Connect Wallet
                    </button>
                </div>
            </div>
        );
    }

    const handleOpen = () => {
        const addr = contractAddr.trim();
        if (addr) navigate(`/loan/${addr}`);
    };

    const runBankAction = async (action: () => Promise<void>) => {
        setActionLoading(true);
        try {
            await action();
            setTimeout(refresh, 3000);
        } catch (e) {
            console.error(e);
            alert('Bank transaction failed');
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold mb-2">Profile</h1>
                    <p className="text-sm text-[var(--color-text-secondary)] font-mono break-all">{address}</p>
                </div>
                <button
                    type="button"
                    onClick={() => tonConnectUI.disconnect()}
                    className="self-start px-4 py-2 border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/50 text-white rounded-lg text-sm transition-colors cursor-pointer"
                >
                    Disconnect
                </button>
            </div>

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-semibold">Bank</h2>
                            <span className="px-2 py-0.5 rounded-full bg-green-500/15 border border-green-500/30 text-green-300 text-xs">
                                Funds loans
                            </span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--color-text-secondary)] font-mono break-all">{bankAddress}</p>
                        <a
                            href={bank.tonviewerUrl(bankAddress)}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-block text-xs text-[var(--color-primary)] hover:underline"
                        >
                            Open bank on Tonviewer
                        </a>
                    </div>
                    <button
                        type="button"
                        onClick={refresh}
                        className="self-start px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-sm hover:border-[var(--color-primary)]/50 transition-colors cursor-pointer"
                    >
                        Refresh
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
                        <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">Bank balance</p>
                        <p className="mt-2 text-2xl font-semibold">{bankBalance === null ? '...' : `${fromNano(bankBalance)} TON`}</p>
                        {balanceError && <p className="mt-2 text-xs text-red-300">{balanceError}</p>}
                        {bankBalance !== null && bankBalance > 0n && (
                            <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => runBankAction(() => bank.sendWithdrawTon(address, fromNano(bankBalance)))}
                                className="mt-4 w-full py-2 border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/50 disabled:opacity-50 text-white rounded-lg text-sm font-semibold cursor-pointer"
                            >
                                Withdraw all TON
                            </button>
                        )}
                    </div>
                    <form
                        className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 space-y-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (depositAmount) runBankAction(() => bank.sendDepositTon(address, depositAmount));
                        }}
                    >
                        <label className="block text-xs text-[var(--color-text-secondary)]">Add balance to bank</label>
                        <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={depositAmount}
                            onChange={(e) => setDepositAmount(e.target.value)}
                            placeholder="10"
                            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary)]"
                        />
                        <button disabled={actionLoading || !depositAmount} className="w-full py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-white rounded-lg text-sm font-semibold cursor-pointer">
                            Deposit TON
                        </button>
                    </form>
                    <form
                        className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 space-y-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (withdrawAmount) runBankAction(() => bank.sendWithdrawTon(address, withdrawAmount));
                        }}
                    >
                        <label className="block text-xs text-[var(--color-text-secondary)]">Remove balance from bank</label>
                        <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={withdrawAmount}
                            onChange={(e) => setWithdrawAmount(e.target.value)}
                            placeholder="5"
                            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary)]"
                        />
                        <button disabled={actionLoading || !withdrawAmount} className="w-full py-2 border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/50 disabled:opacity-50 text-white rounded-lg text-sm font-semibold cursor-pointer">
                            Withdraw TON
                        </button>
                    </form>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-4">
                    <div>
                        <h2 className="text-lg font-semibold">Top Bank Jettons</h2>
                        <p className="text-sm text-[var(--color-text-secondary)]">Loaded from TonAPI for the bank address.</p>
                    </div>
                    {jettons.length === 0 ? (
                        <p className="text-sm text-[var(--color-text-secondary)]">No jetton balances found.</p>
                    ) : (
                        <div className="space-y-3">
                            {jettons.map((asset) => (
                                <div key={asset.walletAddress} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <p className="font-medium text-white">{formatJettonBalance(asset)}</p>
                                            <p className="text-xs text-[var(--color-text-secondary)] truncate">{asset.name}</p>
                                            <a
                                                href={bank.tonviewerUrl(asset.masterAddress || asset.walletAddress)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-xs text-[var(--color-primary)] hover:underline"
                                            >
                                                Tonviewer
                                            </a>
                                        </div>
                                        <button
                                            type="button"
                                            disabled={actionLoading}
                                            onClick={() => runBankAction(() => bank.sendWithdrawJetton(address, asset.walletAddress, asset.balance))}
                                            className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-white rounded-lg text-sm font-semibold cursor-pointer"
                                        >
                                            Withdraw all
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-[var(--color-text-secondary)] font-mono break-all">{asset.walletAddress}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-4">
                    <div>
                        <h2 className="text-lg font-semibold">Bank NFTs</h2>
                        <p className="text-sm text-[var(--color-text-secondary)]">NFTs currently owned by the bank contract.</p>
                    </div>
                    {nfts.length === 0 ? (
                        <p className="text-sm text-[var(--color-text-secondary)]">No NFTs found.</p>
                    ) : (
                        <div className="space-y-3">
                            {nfts.map((asset) => (
                                <div key={asset.address} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <p className="font-medium text-white truncate">{asset.name}</p>
                                            {asset.collection && <p className="text-xs text-[var(--color-text-secondary)] truncate">{asset.collection}</p>}
                                            <a
                                                href={bank.tonviewerUrl(asset.address)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-xs text-[var(--color-primary)] hover:underline"
                                            >
                                                Tonviewer
                                            </a>
                                            <p className="mt-1 text-[10px] text-[var(--color-text-secondary)] font-mono break-all">{asset.address}</p>
                                        </div>
                                        <button
                                            type="button"
                                            disabled={actionLoading}
                                            onClick={() => runBankAction(() => bank.sendWithdrawNft(address, asset.address))}
                                            className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-white rounded-lg text-sm font-semibold cursor-pointer"
                                        >
                                            Withdraw NFT
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-semibold">Open Loan Contract</h2>
                <p className="text-sm text-[var(--color-text-secondary)]">
                    Enter a loan contract address to view its details and manage it.
                </p>
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
                        className="px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] border border-transparent disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors cursor-pointer"
                    >
                        Open
                    </button>
                </div>
            </div>

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-semibold">Bank Offers</h2>
                {offers.length === 0 ? (
                    <p className="text-sm text-[var(--color-text-secondary)]">No offers created from this bank in this browser yet.</p>
                ) : (
                    <div className="space-y-3">
                        {offers.map((offer) => (
                            <Link
                                key={offer.id}
                                to={`/loan/${offer.loanAddress}`}
                                className="block bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 rounded-lg p-4 no-underline transition-colors"
                            >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-white font-medium">{formatStoredOfferAmount(offer)}</p>
                                        <p className="text-xs text-[var(--color-text-secondary)] font-mono break-all">{offer.loanAddress}</p>
                                    </div>
                                    <div className="text-sm text-[var(--color-text-secondary)] sm:text-right">
                                        <p>{Math.floor(offer.duration / 86400)} days</p>
                                        <p>{((offer.interestNominator / offer.interestDenominator) * 100).toFixed(2)}% / day</p>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
