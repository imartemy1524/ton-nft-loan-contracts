import { Address, Cell } from '@ton/core';
import { TonClient } from '@ton/ton';
import { getTonapiUrl, getToncenterUrl, Network } from './config.js';
import { Bank, JettonMaster, JettonWallet, Main } from './contracts.js';

type NftMeta = {
    name: string | null;
    ownerAddress: string | null;
    description: string | null;
    image: string | null;
    collection: string | null;
    collectionAddress: string | null;
};

export const EXPECTED_LOAN_CODE_HASH = '5392acc74175f3b9672f9a3f5d3bd72e33a3d562c81cdb074159b358daacd81b';

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

export async function getAccountCodeHash(network: Network, address: string) {
    const client = createClient(network);
    const state = await client.getContractState(Address.parse(address));
    if (state.state !== 'active' || !state.code) return null;
    return Cell.fromBoc(state.code)[0]?.hash().toString('hex') ?? null;
}

export async function assertLoanContractCode(network: Network, address: string) {
    const codeHash = await getAccountCodeHash(network, address);
    if (codeHash !== EXPECTED_LOAN_CODE_HASH) {
        throw new Error(`Address is not a supported loan contract: code hash ${codeHash ?? 'missing'} does not match ${EXPECTED_LOAN_CODE_HASH}`);
    }
    return codeHash;
}

export async function getBankData(network: Network, address: string) {
    const client = createClient(network);
    const contract = client.open(Bank.createFromAddress(Address.parse(address)));
    return contract.getData();
}

export async function getVerifiedJettonMaster(network: Network, jettonWalletAddress: string, expectedOwnerAddress: string) {
    const client = createClient(network);
    const walletAddress = Address.parse(jettonWalletAddress);
    const expectedOwner = Address.parse(expectedOwnerAddress);
    const wallet = client.open(JettonWallet.createFromAddress(walletAddress));
    const walletData = await wallet.getData();

    if (!walletData.owner.equals(expectedOwner)) {
        return null;
    }

    const master = client.open(JettonMaster.createFromAddress(walletData.master));
    const derivedWalletAddress = await master.getWalletAddress(expectedOwner);
    if (!derivedWalletAddress.equals(walletAddress)) {
        return null;
    }

    return walletData.master;
}

export async function getJettonWalletAddress(network: Network, masterAddress: string, ownerAddress: string) {
    const client = createClient(network);
    const master = client.open(JettonMaster.createFromAddress(Address.parse(masterAddress)));
    return master.getWalletAddress(Address.parse(ownerAddress));
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
        const res = await tonapiFetch(network, `/v2/nfts/${address}`);
        if (!res.ok) {
            console.warn("Error from tonapi: ", res.statusText)
            return { name: null, ownerAddress: null, description: null, image: null, collection: null, collectionAddress: null };
        }
        const data = await res.json() as {
            index?: number;
            owner?: string | { address?: string };
            owner_address?: string | { address?: string };
            metadata?: { name?: string; description?: string; image?: string };
            previews?: Array<{ resolution?: string; url?: string }>;
            collection?: { address?: string; name?: string };
        };
        const owner = data.owner_address ?? data.owner;
        return {
            name: data.metadata?.name || `NFT #${data.index ?? '?'}`,
            ownerAddress: typeof owner === 'string' ? owner : owner?.address || null,
            description: data.metadata?.description || null,
            image: data.previews?.find((p) => p.resolution === '500x500')?.url || data.previews?.[0]?.url || data.metadata?.image || null,
            collection: data.collection?.name || null,
            collectionAddress: data.collection?.address || null,
        };
    } catch {
        return { name: null, ownerAddress: null, description: null, image: null, collection: null, collectionAddress: null };
    }
}
