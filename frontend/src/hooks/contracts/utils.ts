import { TonClient } from '@ton/ton';
import { Network } from '../../network';

export function createTonClient(network: Network): TonClient {
    const isTestnet = network === 'testnet';
    return new TonClient({
        endpoint: isTestnet
            ? import.meta.env.VITE_TONCENTER_TESTNET_URL
            : import.meta.env.VITE_TONCENTER_MAINNET_URL,
        apiKey: import.meta.env.VITE_TONCENTER_API_KEY,
    });
}
