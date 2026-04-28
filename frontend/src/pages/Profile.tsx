import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { fromNano } from '@ton/core';
import { formatStoredOfferAmount, getLoans, AggregatedLoan } from '../api';
import { formatAmount } from '../utils/amounts';
import { useBankData } from '../hooks/useBankData';
import { useNetwork } from '../network';
import { getJettons } from '../constants/jettons';
import { LoanStatus } from '../hooks/contracts/Main';
import { BankTonSection } from '../components/bank/BankTonSection';
import { BankJettonsSection } from '../components/bank/BankJettonsSection';
import { BankNftsSection } from '../components/bank/BankNftsSection';

export default function Profile() {
    const [tonConnectUI] = useTonConnectUI();
    const navigate = useNavigate();
    const { isTestnet, network } = useNetwork();
    const jettons = getJettons(isTestnet);
    const { address, bankAddress, bankBalance, jettons: bankJettons, nfts, offers, error, actionLoading, refresh, runAction, bank } = useBankData();

    const [contractAddr, setContractAddr] = useState('');
    const [depositAmount, setDepositAmount] = useState('');
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [loansGiven, setLoansGiven] = useState<AggregatedLoan[]>([]);
    const [loansGot, setLoansGot] = useState<AggregatedLoan[]>([]);
    const [loansLoading, setLoansLoading] = useState(false);

    useEffect(() => {
        if (!address) return;

        const loadLoans = async () => {
            setLoansLoading(true);
            try {
                const [givenRes, gotRes] = await Promise.all([
                    getLoans({ network, moneyGiverAddress: address, status: String(LoanStatus.IN_PROGRESS) }),
                    getLoans({ network, borrowerAddress: address, status: String(LoanStatus.IN_PROGRESS) }),
                ]);
                setLoansGiven(givenRes.loans);
                setLoansGot(gotRes.loans);
            } catch (e) {
                console.error('Failed to load active loans:', e);
            } finally {
                setLoansLoading(false);
            }
        };

        loadLoans();
    }, [address, network]);

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

            {/* Trusted wallet card */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-semibold">Trusted Wallet</h2>
                            <span className="px-2 py-0.5 rounded-full bg-green-500/15 border border-green-500/30 text-green-300 text-xs">
                                Secured on-chain
                            </span>
                        </div>
                        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                          Wallet used to create offers.
                          You can top-up it and withdraw funds anytime
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-text-secondary)] font-mono break-all">{bankAddress}</p>
                        <a
                            href={bank.tonviewerUrl(bankAddress)}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-block text-xs text-[var(--color-primary)] hover:underline"
                        >
                            Open trusted wallet on Tonviewer
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

                <BankTonSection
                    bankBalance={bankBalance}
                    error={error}
                    actionLoading={actionLoading}
                    depositAmount={depositAmount}
                    withdrawAmount={withdrawAmount}
                    setDepositAmount={setDepositAmount}
                    setWithdrawAmount={setWithdrawAmount}
                    onDepositTon={(amount) => runAction(() => bank.sendDepositTon(address, amount))}
                    onWithdrawTon={(amount) => runAction(() => bank.sendWithdrawTon(address, amount))}
                    onWithdrawAll={() => runAction(() => bank.sendWithdrawTon(address, fromNano(bankBalance!)))}
                />
            </div>

            {/* Jettons + NFTs */}
            <div className={`grid gap-6 ${nfts.length === 0 ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
                <BankJettonsSection
                    jettons={bankJettons}
                    availableJettons={jettons}
                    actionLoading={actionLoading}
                    tonviewerUrl={bank.tonviewerUrl}
                    onWithdrawJetton={(walletAddress, balance) => runAction(() => bank.sendWithdrawJetton(address, walletAddress, balance))}
                    onDepositJetton={(masterAddress, amount) => runAction(() => bank.sendDepositJetton(address, masterAddress, amount))}
                />
                {nfts.length > 0 && (
                    <BankNftsSection
                        nfts={nfts}
                        actionLoading={actionLoading}
                        tonviewerUrl={bank.tonviewerUrl}
                        onWithdrawNft={(nftAddress) => runAction(() => bank.sendWithdrawNft(address, nftAddress))}
                    />
                )}
            </div>

            {/* Loans as Lender */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-semibold">Loans as Lender</h2>
                <p className="text-sm text-[var(--color-text-secondary)]">
                    Active loans where you provided funds.
                </p>
                {loansLoading ? (
                    <p className="text-sm text-[var(--color-text-secondary)]">Loading...</p>
                ) : loansGiven.length === 0 ? (
                    <p className="text-sm text-[var(--color-text-secondary)]">No active loans given yet.</p>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {loansGiven.map((loan) => {
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
                                            </div>
                                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                                                <div>
                                                    <p className="text-[var(--color-text-secondary)]">Amount</p>
                                                    <p className="text-white">{formatAmount(BigInt(loan.amount), loan.tokenDecimals)} {loan.tokenSymbol}</p>
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

            {/* Loans as Borrower */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-semibold">Loans as Borrower</h2>
                <p className="text-sm text-[var(--color-text-secondary)]">
                    Active loans where you borrowed funds.
                </p>
                {loansLoading ? (
                    <p className="text-sm text-[var(--color-text-secondary)]">Loading...</p>
                ) : loansGot.length === 0 ? (
                    <p className="text-sm text-[var(--color-text-secondary)]">No active loans borrowed yet.</p>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {loansGot.map((loan) => {
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
                                            </div>
                                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                                                <div>
                                                    <p className="text-[var(--color-text-secondary)]">Amount</p>
                                                    <p className="text-white">{formatAmount(BigInt(loan.amount), loan.tokenDecimals)} {loan.tokenSymbol}</p>
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

            {/* Open loan contract */}
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

            {/* Trusted offers */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-semibold">Trusted Offers</h2>
                {offers.length === 0 ? (
                    <p className="text-sm text-[var(--color-text-secondary)]">No trusted offers created from this wallet yet.</p>
                ) : (
                    <div className="space-y-3">
                        {offers.map((offer) => {
                            const offerAmount = BigInt(offer.amount);
                            const isInvalid = bankBalance !== null && bankBalance < offerAmount;
                            return (
                                <Link
                                    key={offer.id}
                                    to={`/loan/${offer.loanAddress}`}
                                    className={`block bg-[var(--color-bg)] border rounded-lg p-4 no-underline transition-colors ${
                                        isInvalid
                                            ? 'border-red-500/50 opacity-60 hover:border-red-500/70'
                                            : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
                                    }`}
                                >
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-white font-medium">{formatStoredOfferAmount(offer)}</p>
                                                {isInvalid && (
                                                    <span className="px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
                                                        Insufficient balance
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-[var(--color-text-secondary)] font-mono break-all">{offer.loanAddress}</p>
                                        </div>
                                        <div className="text-sm text-[var(--color-text-secondary)] sm:text-right">
                                            <p>{Math.floor(offer.duration / 86400)} days</p>
                                            <p>{((offer.interestNominator / offer.interestDenominator) * 100).toFixed(2)}% / day</p>
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
