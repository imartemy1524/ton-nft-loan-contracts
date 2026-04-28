import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTonAddress } from '@tonconnect/ui-react';
import { Address } from '@ton/core';
import { scaleAmount } from '../utils/amounts';
import { useMainContract } from '../hooks/useMainContract';
import { useTonNfts, NftItem } from '../hooks/useTonNfts';
import { percentToDecimal } from '../utils/percentToDecimal';
import { getJettons } from '../constants/jettons';
import { useTokenPrices } from '../hooks/useTokenPrices';
import { refreshLoan } from '../api';
import { useNetwork } from '../network';

export default function GetLoan() {
    const navigate = useNavigate();
    const walletAddress = useTonAddress();
    const { deployLoanContract } = useMainContract();
    const { nfts, loading: nftsLoading, error: nftsError } = useTonNfts();
    const { network, isTestnet } = useNetwork();
    const JETTONS = getJettons(isTestnet);

    const [selectedNft, setSelectedNft] = useState<NftItem | null>(null);
    const [amount, setAmount] = useState('');
    const [duration, setDuration] = useState('7');
    const [interestPct, setInterestPct] = useState('1.00');
    const [selectedToken, setSelectedToken] = useState('TON');
    const [deploying, setDeploying] = useState(false);
    const tokenPrices = useTokenPrices();

    const handleDeploy = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedNft || !walletAddress || !amount) return;

        setDeploying(true);
        try {
            const jetton = JETTONS.find((j) => j.symbol === selectedToken);
            const parsedJetton = jetton?.address ? Address.parse(jetton.address) : null;
            const contractAddr = await deployLoanContract(
                Address.parse(selectedNft.address),
                Address.parse(walletAddress),
                {
                    duration: parseInt(duration) * 86400,
                    interestPerDay: percentToDecimal(interestPct),
                    amount: scaleAmount(amount, jetton?.decimals ?? 9),
                },
                parsedJetton,
            );
            refreshLoan(network, contractAddr.toString()).catch(console.error);
            navigate(`/loan/${contractAddr.toString()}`);
        } catch (err) {
            console.error(err);
            alert('Failed to deploy contract');
        } finally {
            setDeploying(false);
        }
    };

    if (!walletAddress) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-10 text-center">
                    <h2 className="text-2xl font-bold mb-3">Connect Your Wallet</h2>
                    <p className="text-[var(--color-text-secondary)]">
                        Connect your TON wallet to list your NFT as collateral and get a loan.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold mb-2">Get a Loan</h1>
                <p className="text-[var(--color-text-secondary)]">
                    Select an NFT from your wallet as collateral, set loan parameters, and deploy a loan contract.
                </p>
            </div>

            <>
                    {/* Step 1: Select NFT */}
                    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
                        <h2 className="text-lg font-semibold mb-4">
                            <span className="inline-flex items-center justify-center w-7 h-7 bg-[var(--color-primary)] rounded-full text-sm font-bold mr-2">
                                1
                            </span>
                            Select NFT Collateral
                        </h2>

                        {nftsLoading && (
                            <div className="text-center py-8 text-[var(--color-text-secondary)]">Loading your NFTs...</div>
                        )}

                        {nftsError && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-sm text-red-300">
                                Failed to load NFTs: {nftsError}
                            </div>
                        )}

                        {!nftsLoading && !nftsError && nfts.length === 0 && (
                            <div className="text-center py-8 text-[var(--color-text-secondary)]">
                                No NFTs found in your wallet.
                            </div>
                        )}

                        {!nftsLoading && nfts.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                {nfts.map((nft) => {
                                    const imgUrl =
                                        nft.previews?.find((p) => p.resolution === '100x100')?.url ||
                                        nft.previews?.[0]?.url ||
                                        nft.metadata?.image;
                                    const isSelected = selectedNft?.address === nft.address;

                                    return (
                                        <button
                                            key={nft.address}
                                            onClick={() => setSelectedNft(isSelected ? null : nft)}
                                            className={`relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer text-left ${
                                                isSelected
                                                    ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30'
                                                    : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
                                            }`}
                                        >
                                            <div className="aspect-square bg-[var(--color-bg)]">
                                                {imgUrl ? (
                                                    <img
                                                        src={imgUrl}
                                                        alt={nft.metadata?.name || 'NFT'}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-[var(--color-text-secondary)] text-xs">
                                                        No image
                                                    </div>
                                                )}
                                            </div>
                                            <div className="p-2">
                                                <p className="text-xs font-medium truncate">
                                                    {nft.metadata?.name || `NFT #${nft.index}`}
                                                </p>
                                                {nft.collection && (
                                                    <p className="text-[10px] text-[var(--color-text-secondary)] truncate">
                                                        {nft.collection.name}
                                                    </p>
                                                )}
                                            </div>
                                            {isSelected && (
                                                <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-[var(--color-primary)] rounded-full flex items-center justify-center">
                                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Step 2: Loan Parameters */}
                    <form
                        onSubmit={handleDeploy}
                        className={`bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-5 transition-opacity ${
                            !selectedNft ? 'opacity-50 pointer-events-none' : ''
                        }`}
                    >
                        <h2 className="text-lg font-semibold">
                            <span className="inline-flex items-center justify-center w-7 h-7 bg-[var(--color-primary)] rounded-full text-sm font-bold mr-2">
                                2
                            </span>
                            Set Loan Parameters
                        </h2>

                        {selectedNft && (
                            <div className="flex items-center gap-3 bg-[var(--color-bg)] rounded-lg p-3">
                                {(selectedNft.previews?.[0]?.url || selectedNft.metadata?.image) && (
                                    <img
                                        src={selectedNft.previews?.[0]?.url || selectedNft.metadata?.image}
                                        alt=""
                                        className="w-10 h-10 rounded-lg object-cover"
                                    />
                                )}
                                <div>
                                    <p className="text-sm font-medium">{selectedNft.metadata?.name || `NFT #${selectedNft.index}`}</p>
                                    <p className="text-xs text-[var(--color-text-secondary)] font-mono truncate max-w-xs">
                                        {selectedNft.address}
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                                    Loan Amount ({selectedToken})
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    required
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="10"
                                    className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary)]"
                                />
                                {amount && tokenPrices[selectedToken] && (
                                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                                        ≈ ${(parseFloat(amount) * tokenPrices[selectedToken]).toFixed(2)} USD
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                                    Duration (days)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    required
                                    value={duration}
                                    onChange={(e) => setDuration(e.target.value)}
                                    className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary)]"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                                Daily Interest Rate (%)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                max="99.99"
                                required
                                value={interestPct}
                                onChange={(e) => setInterestPct(e.target.value)}
                                placeholder="1.00"
                                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary)]"
                            />
                        </div>

                        {/* Token selector */}
                        <div>
                            <label className="block text-sm text-[var(--color-text-secondary)] mb-2">
                                Loan Currency
                            </label>
                            <div className="flex gap-2 flex-wrap">
                                {JETTONS.map((j) => (
                                    <button
                                        key={j.symbol}
                                        type="button"
                                        onClick={() => setSelectedToken(j.symbol)}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                                            selectedToken === j.symbol
                                                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-white'
                                                : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/50 hover:text-white'
                                        }`}
                                    >
                                        {j.icon && <img src={j.icon} alt="" className="w-5 h-5 rounded-full" />}
                                        <span>{j.symbol}</span>
                                        {tokenPrices[j.symbol] && (
                                            <span className="text-xs opacity-60">${tokenPrices[j.symbol].toFixed(2)}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Summary */}
                        {amount && duration && (() => {
                            const principal = parseFloat(amount) || 0;
                            const days = parseInt(duration) || 0;
                            const rate = parseFloat(interestPct) / 100 || 0;
                            const totalInterest = principal * rate * days;
                            const total = principal + totalInterest;
                            const price = tokenPrices[selectedToken];
                            const usd = (val: number) =>
                                price ? ` (≈ $${(val * price).toFixed(2)})` : '';
                            return (
                                <div className="bg-[var(--color-bg)] rounded-lg p-4 space-y-2">
                                    <h3 className="text-sm font-semibold text-[var(--color-text-secondary)]">Loan Summary</h3>
                                    <div className="grid grid-cols-2 gap-y-1.5 text-sm">
                                        <span className="text-[var(--color-text-secondary)]">Principal:</span>
                                        <span>{principal.toFixed(4)} {selectedToken}{usd(principal)}</span>
                                        <span className="text-[var(--color-text-secondary)]">Duration:</span>
                                        <span>{days} days</span>
                                        <span className="text-[var(--color-text-secondary)]">Interest rate:</span>
                                        <span>{interestPct}% / day</span>
                                        <span className="text-[var(--color-text-secondary)]">Total interest:</span>
                                        <span className="text-orange-400">
                                            +{totalInterest.toFixed(4)} {selectedToken}{usd(totalInterest)}
                                        </span>
                                        <span className="text-[var(--color-border)] col-span-2 border-t border-[var(--color-border)] my-0.5" />
                                        <span className="font-semibold">Total repayment:</span>
                                        <span className="font-semibold text-white">
                                            {total.toFixed(4)} {selectedToken}{usd(total)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })()}

                        <button
                            type="submit"
                            disabled={deploying || !selectedNft}
                            className="w-full py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-white rounded-lg font-semibold transition-colors cursor-pointer"
                        >
                            {deploying ? 'Waiting for confirmation...' : 'Create Loan Contract'}
                        </button>
                    </form>
            </>
        </div>
    );
}
