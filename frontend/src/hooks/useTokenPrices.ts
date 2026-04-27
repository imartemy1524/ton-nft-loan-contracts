import { useState, useEffect } from 'react';
import { JETTONS } from '../constants/jettons';

type PriceMap = Record<string, number>;

export function useTokenPrices(): PriceMap {
    const [prices, setPrices] = useState<PriceMap>({});

    useEffect(() => {
        const ids = JETTONS.map((j) => j.coingeckoId).join(',');
        fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`)
            .then((r) => r.json())
            .then((data) => {
                const map: PriceMap = {};
                for (const j of JETTONS) {
                    const price = data[j.coingeckoId]?.usd;
                    if (price != null) map[j.symbol] = price;
                }
                setPrices(map);
            })
            .catch(() => {/* silently ignore price fetch errors */});
    }, []);

    return prices;
}
