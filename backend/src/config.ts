export type Network = 'mainnet' | 'testnet';

export function parseNetwork(value: unknown): Network {
    return value === 'mainnet' ? 'mainnet' : 'testnet';
}

export function getToncenterUrl(network: Network) {
    return network === 'testnet'
        ? process.env.TONCENTER_TESTNET_URL || 'https://testnet.toncenter.com/api/v2/jsonRPC'
        : process.env.TONCENTER_MAINNET_URL || 'https://toncenter.com/api/v2/jsonRPC';
}

export function getTonapiUrl(network: Network) {
    return (network === 'testnet'
        ? process.env.TONAPI_TESTNET_URL || 'https://testnet.tonapi.io'
        : process.env.TONAPI_MAINNET_URL || 'https://tonapi.io').replace(/\/v2\/?$/, '').replace(/\/$/, '');
}
