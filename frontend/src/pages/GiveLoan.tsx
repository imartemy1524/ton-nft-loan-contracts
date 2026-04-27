import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function GiveLoan() {
    const navigate = useNavigate();
    const [contractAddr, setContractAddr] = useState('');

    const handleOpen = () => {
        const addr = contractAddr.trim();
        if (addr) navigate(`/loan/${addr}`);
    };

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
        </div>
    );
}
