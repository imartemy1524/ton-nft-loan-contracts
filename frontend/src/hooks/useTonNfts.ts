import { useState, useEffect } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { useNetwork } from '../network';

export interface NftItem {
    address: string;
    index: number;
    collection?: {
        address: string;
        name: string;
    };
    metadata?: {
        name?: string;
        image?: string;
        description?: string;
    };
    previews?: { resolution: string; url: string }[];
}

export function useTonNfts() {
    const walletAddress = useTonAddress();
    const { config } = useNetwork();
    const [nfts, setNfts] = useState<NftItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!walletAddress) {
            setNfts([]);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        fetch(`${config.tonapiUrl}/accounts/${walletAddress}/nfts?limit=100&indirect_ownership=false`)
            .then((res) => {
                if (!res.ok) throw new Error(`TON API error: ${res.status}`);
                return res.json();
            })
            .then((data) => {
                if (cancelled) return;
                const items: NftItem[] = (data.nft_items || [])
                    .filter((item: any) =>  item.trust !== 'blacklist')
                    .filter((item: any) => !item.metadata?.is_scam)
                    .filter((item: any) => item.collection || item.metadata?.name)
                    .map((item: any) => ({
                        address: item.address,
                        index: item.index,
                        collection: item.collection
                            ? { address: item.collection.address, name: item.collection.name }
                            : undefined,
                        metadata: item.metadata,
                        previews: item.previews,
                    }));
                setNfts(items);
            })
            .catch((err) => {
                if (cancelled) return;
                setError(err.message);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [walletAddress, config.tonapiUrl]);

    return { nfts, loading, error };
}
