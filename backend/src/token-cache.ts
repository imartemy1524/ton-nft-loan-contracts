import { Address } from '@ton/core';
import { getJettonWalletAddress, getVerifiedJettonMaster } from './chain.js';
import { Network } from './config.js';
import { pool } from './db.js';
import { findWhitelistedToken, getWhitelistedTokens, TokenInfo, UNDEFINED_TOKEN } from './tokens.js';

export type ResolvedTokenWallet = TokenInfo & {
    walletAddress: string;
    masterAddress: string | null;
    verified: boolean;
};

async function saveTokenWallet(network: Network, ownerAddress: string, resolved: ResolvedTokenWallet) {
    await pool.query(
        `
            insert into token_wallets (
                network, owner_address, wallet_address, master_address,
                token_symbol, token_name, token_decimals, verified, updated_at
            )
            values ($1,$2,$3,$4,$5,$6,$7,$8,now())
            on conflict (network, owner_address, wallet_address) do update set
                master_address = excluded.master_address,
                token_symbol = excluded.token_symbol,
                token_name = excluded.token_name,
                token_decimals = excluded.token_decimals,
                verified = excluded.verified,
                updated_at = now()
        `,
        [
            network,
            ownerAddress,
            resolved.walletAddress,
            resolved.masterAddress,
            resolved.symbol,
            resolved.name,
            resolved.decimals,
            resolved.verified,
        ],
    );
}

async function readTokenWallet(network: Network, ownerAddress: string, walletAddress: string): Promise<ResolvedTokenWallet | null> {
    const cached = await pool.query(
        `
            select wallet_address, master_address, token_symbol, token_name, token_decimals, verified
            from token_wallets
            where network = $1 and owner_address = $2 and wallet_address = $3
        `,
        [network, ownerAddress, walletAddress],
    );
    const row = cached.rows[0];
    if (!row) return null;
    return {
        walletAddress: row.wallet_address,
        masterAddress: row.master_address,
        symbol: row.token_symbol,
        name: row.token_name,
        address: row.master_address,
        decimals: Number(row.token_decimals),
        verified: row.verified,
    };
}

function resolvedFromToken(walletAddress: string, masterAddress: string | null, token: TokenInfo, verified: boolean): ResolvedTokenWallet {
    return {
        ...token,
        address: masterAddress,
        walletAddress,
        masterAddress,
        verified,
    };
}

export async function resolveTokenWallet(network: Network, ownerAddress: string, walletAddress: string): Promise<ResolvedTokenWallet> {
    const owner = Address.parse(ownerAddress).toString();
    const wallet = Address.parse(walletAddress).toString();

    const cached = await readTokenWallet(network, owner, wallet);
    if (cached?.masterAddress) return cached;

    try {
        const masterAddress = await getVerifiedJettonMaster(network, wallet, owner);
        if (masterAddress) {
            const token = findWhitelistedToken(network, masterAddress) ?? UNDEFINED_TOKEN;
            const resolved = resolvedFromToken(wallet, masterAddress.toString(), token, true);
            await saveTokenWallet(network, owner, resolved);
            return resolved;
        }
    } catch {
        // The child wallet may not be deployed yet. Fall through to deterministic derivation.
    }

    for (const token of getWhitelistedTokens(network)) {
        if (!token.address) continue;
        try {
            const derivedWallet = await getJettonWalletAddress(network, token.address, owner);
            if (derivedWallet.equals(Address.parse(wallet))) {
                const resolved = resolvedFromToken(wallet, token.address, token, false);
                await saveTokenWallet(network, owner, resolved);
                return resolved;
            }
        } catch {
            // Try the next whitelisted master.
        }
    }

    const resolved = resolvedFromToken(wallet, null, UNDEFINED_TOKEN, false);
    await saveTokenWallet(network, owner, resolved);
    return resolved;
}
