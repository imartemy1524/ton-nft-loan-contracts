import { BankNftAsset } from '../../hooks/useBankContract';

type Props = {
    nfts: BankNftAsset[];
    actionLoading: boolean;
    tonviewerUrl: (addr: string) => string;
    onWithdrawNft: (address: string) => void;
};

export function BankNftsSection(p: Props) {
    return (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-4">
            <div>
                <h2 className="text-lg font-semibold">Trusted NFTs</h2>
                <p className="text-sm text-[var(--color-text-secondary)]">NFTs currently owned by the trusted contract.</p>
            </div>

            {p.nfts.length === 0 ? (
                <p className="text-sm text-[var(--color-text-secondary)]">No NFTs found.</p>
            ) : (
                <div className="space-y-3">
                    {p.nfts.map((asset) => (
                        <div key={asset.address} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                    <p className="font-medium text-white truncate">{asset.name}</p>
                                    {asset.collection && (
                                        <p className="text-xs text-[var(--color-text-secondary)] truncate">{asset.collection}</p>
                                    )}
                                    <a
                                        href={p.tonviewerUrl(asset.address)}
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
                                    disabled={p.actionLoading}
                                    onClick={() => p.onWithdrawNft(asset.address)}
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
    );
}
