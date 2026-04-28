import { Address } from '@ton/core';
import { Network } from './config.js';

export type TokenInfo = {
    symbol: string;
    name: string;
    address: string | null;
    decimals: number;
};

type TokenDefinition = TokenInfo & {
    testnetAddress?: string | null;
};

const TOKEN_DEFINITIONS: TokenDefinition[] = [
    {
        symbol: 'TON',
        name: 'Toncoin',
        address: null,
        decimals: 9,
    },
    {
        symbol: 'USDT',
        name: 'Tether USD',
        address: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
        testnetAddress: 'kQD0GKBM8ZbryVk2aESmzfU6b9b_8era_IkvBSELujFZPsyy',
        decimals: 6,
    },
    {
        symbol: 'NOT',
        name: 'Notcoin',
        address: 'EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT',
        decimals: 9,
    },
];

export const UNDEFINED_TOKEN: TokenInfo = {
    symbol: 'Undefined token',
    name: 'Undefined token',
    address: null,
    decimals: 9,
};

export function getWhitelistedTokens(network: Network): TokenInfo[] {
    return TOKEN_DEFINITIONS.map(({ testnetAddress, ...token }) => ({
        ...token,
        address: network === 'testnet' && testnetAddress !== undefined ? testnetAddress : token.address,
    }));
}

export function findWhitelistedToken(network: Network, address: Address): TokenInfo | null {
    return getWhitelistedTokens(network).find((token) => (
        token.address !== null && Address.parse(token.address).equals(address)
    )) ?? null;
}
