import { Address } from '@ton/core';
import { TonClient } from '@ton/ton';
import { getTonapiUrl, getToncenterUrl, Network } from './config.js';
import { Bank, Main } from './contracts.js';

type NftMeta = {
    name: string | null;
    image: string | null;
    collection: string | null;
};

export function createClient(network: Network) {
    return new TonClient({
        endpoint: getToncenterUrl(network),
        apiKey: process.env.TONCENTER_API_KEY || undefined,
    });
}

async function tonapiFetch(network: Network, path: string) {
    return fetch(`${getTonapiUrl(network)}${path}`, {
        headers: process.env.TONAPI_API_KEY
            ? { Authorization: `Bearer ${process.env.TONAPI_API_KEY}` }
            : undefined,
    });
}

export async function getLoanData(network: Network, address: string) {
    const client = createClient(network);
    const contract = client.open(Main.createFromAddress(Address.parse(address)));
    return contract.getData();
}

export async function getBankData(network: Network, address: string) {
    const client = createClient(network);
    const contract = client.open(Bank.createFromAddress(Address.parse(address)));
    return contract.getData();
}

export async function getAccountBalance(network: Network, address: string) {
    const res = await tonapiFetch(network, `/v2/accounts/${address}`);
    if (!res.ok) {
        if (res.status === 404) return 0n;
        throw new Error(`TonAPI account request failed: ${res.status}`);
    }
    const data = await res.json() as { balance?: string | number };
    return BigInt(data.balance ?? 0);
}

export async function getNftMeta(network: Network, address: string): Promise<NftMeta> {
    try {
        const res = await tonapiFetch(network, `/nfts/${address}`);
        if (!res.ok) return { name: null, image: null, collection: null };
        const data = await res.json() as {
            index?: number;
            metadata?: { name?: string; image?: string };
            previews?: Array<{ resolution?: string; url?: string }>;
            collection?: { name?: string };
        };
        return {
            name: data.metadata?.name || `NFT #${data.index ?? '?'}`,
            image: data.previews?.find((p) => p.resolution === '500x500')?.url || data.previews?.[0]?.url || data.metadata?.image || null,
            collection: data.collection?.name || null,
        };
    } catch {
        return { name: null, image: null, collection: null };
    }
}
