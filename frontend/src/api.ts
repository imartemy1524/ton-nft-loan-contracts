import { LoanParams } from './hooks/contracts/Main';
import { Network } from './network';
import { formatAmount } from './utils/amounts';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

export type StoredBankOffer = {
    id: string;
    network?: Network;
    bankAddress: string;
    ownerAddress: string;
    loanAddress: string;
    amount: string;
    duration: number;
    interestNominator: number;
    interestDenominator: number;
    expirationDate: string;
    jettonWallet: string | null;
    jettonAddress: string | null;
    tokenSymbol: string;
    tokenName: string;
    tokenDecimals: number;
    active?: boolean;
    updatedAt?: string;
};

export type AggregatedLoan = {
    network: Network;
    address: string;
    status: number;
    nftAddress: string;
    jettonAddress: string | null;
    borrowerAddress: string;
    moneyGiverAddress: string | null;
    amount: string;
    duration: number;
    interestNominator: number;
    interestDenominator: number;
    startedAt: string;
    nftName: string | null;
    nftDescription: string | null;
    nftImage: string | null;
    nftCollection: string | null;
    nftCollectionAddress: string | null;
    codeHash: string | null;
    valid: boolean;
    tokenAddress: string | null;
    tokenSymbol: string;
    tokenName: string;
    tokenDecimals: number;
    offersCount: number;
    bestOfferAmount: string | null;
    updatedAt: string;
};

export type IndexedStats = {
    network: Network;
    totalLoans: number;
    activeLoans: number;
    nftsLocked: number;
    totalVolume: Array<{
        tokenSymbol: string;
        tokenName: string;
        tokenDecimals: number;
        amount: string;
    }>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...init?.headers,
        },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `API request failed: ${res.status}`);
    }
    return res.json() as Promise<T>;
}

export async function refreshLoan(network: Network, address: string) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    return request<{ loan: unknown }>('/api/refresh/loan', {
        method: 'POST',
        body: JSON.stringify({ network, address }),
    });
}

export async function refreshBank(network: Network, address: string) {
    await new Promise((resolve) => setTimeout(resolve, 8000));

    return request<{ bank: unknown }>('/api/refresh/bank', {
        method: 'POST',
        body: JSON.stringify({ network, address }),
    });
}

export async function getOffers(filters: {
    network: Network;
    loanAddress?: string;
    bankAddress?: string;
    ownerAddress?: string;
    active?: boolean;
}) {
    const params = new URLSearchParams({ network: filters.network });
    if (filters.loanAddress) params.set('loanAddress', filters.loanAddress);
    if (filters.bankAddress) params.set('bankAddress', filters.bankAddress);
    if (filters.ownerAddress) params.set('ownerAddress', filters.ownerAddress);
    if (filters.active === false) params.set('active', 'false');
    return request<{ offers: StoredBankOffer[] }>(`/api/offers?${params.toString()}`);
}

export async function getLoans(filters: {
    network: Network;
    loanAddress?: string;
    status?: string;
    borrowerAddress?: string;
    moneyGiverAddress?: string;
    collection?: string;
    collectionAddress?: string;
    hasOffers?: boolean;
}) {
    const params = new URLSearchParams({ network: filters.network });
    if (filters.loanAddress) params.set('loanAddress', filters.loanAddress);
    if (filters.status) params.set('status', filters.status);
    if (filters.borrowerAddress) params.set('borrowerAddress', filters.borrowerAddress);
    if (filters.moneyGiverAddress) params.set('moneyGiverAddress', filters.moneyGiverAddress);
    if (filters.collection) params.set('collection', filters.collection);
    if (filters.collectionAddress) params.set('collectionAddress', filters.collectionAddress);
    if (filters.hasOffers) params.set('hasOffers', 'true');
    return request<{ loans: AggregatedLoan[] }>(`/api/loans?${params.toString()}`);
}

export async function getStats(network: Network) {
    return request<{ stats: IndexedStats }>(`/api/stats?${new URLSearchParams({ network }).toString()}`);
}

export function loanParamsFromStoredOffer(offer: StoredBankOffer): LoanParams {
    return {
        amount: BigInt(offer.amount),
        duration: offer.duration,
        interestPerDay: {
            nominator: offer.interestNominator,
            denominator: offer.interestDenominator,
        },
    };
}

export function formatStoredOfferAmount(offer: StoredBankOffer) {
    return `${formatAmount(BigInt(offer.amount), offer.tokenDecimals ?? 9)} ${offer.tokenSymbol ?? 'TON'}`;
}
