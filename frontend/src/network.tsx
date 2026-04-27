import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type Network = 'mainnet' | 'testnet';

interface NetworkConfig {
    network: Network;
    toncenterUrl: string;
    toncenterApiKey: string;
    tonapiUrl: string;
    manifestUrl: string;
}

function getConfig(network: Network): NetworkConfig {
    const isTestnet = network === 'testnet';
    return {
        network,
        toncenterUrl: isTestnet
            ? import.meta.env.VITE_TONCENTER_TESTNET_URL
            : import.meta.env.VITE_TONCENTER_MAINNET_URL,
        toncenterApiKey: import.meta.env.VITE_TONCENTER_API_KEY,
        tonapiUrl: isTestnet
            ? import.meta.env.VITE_TONAPI_TESTNET_URL
            : import.meta.env.VITE_TONAPI_MAINNET_URL,
        manifestUrl: import.meta.env.VITE_TONCONNECT_MANIFEST_URL,
    };
}

interface NetworkContextValue {
    config: NetworkConfig;
    network: Network;
    isTestnet: boolean;
    toggleNetwork: () => void;
    setNetwork: (n: Network) => void;
}

const NetworkContext = createContext<NetworkContextValue>(null!);

const STORAGE_KEY = 'ton-nft-loan-network';

function getInitialNetwork(): Network {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'mainnet' || stored === 'testnet') return stored;
    return (import.meta.env.VITE_DEFAULT_NETWORK as Network) || 'testnet';
}

export function NetworkProvider({ children }: { children: ReactNode }) {
    const [network, setNetworkState] = useState<Network>(getInitialNetwork);

    const setNetwork = useCallback((n: Network) => {
        setNetworkState(n);
        localStorage.setItem(STORAGE_KEY, n);
    }, []);

    const toggleNetwork = useCallback(() => {
        setNetwork(network === 'mainnet' ? 'testnet' : 'mainnet');
    }, [network, setNetwork]);

    const config = getConfig(network);

    return (
        <NetworkContext.Provider value={{ config, network, isTestnet: network === 'testnet', toggleNetwork, setNetwork }}>
            {children}
        </NetworkContext.Provider>
    );
}

export function useNetwork() {
    return useContext(NetworkContext);
}
