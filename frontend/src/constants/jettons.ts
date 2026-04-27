export interface JettonInfo {
    symbol: string;
    name: string;
    address: string | null; // null = native TON
    decimals: number;
    icon: string;
    coingeckoId: string;
}

export const JETTONS: JettonInfo[] = [
    {
        symbol: 'TON',
        name: 'Toncoin',
        address: null,
        decimals: 9,
        icon: 'https://assets.dedust.io/images/ton.webp',
        coingeckoId: 'the-open-network',
    },
    {
        symbol: 'USDT',
        name: 'Tether USD',
        address: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
        decimals: 6,
        icon: 'https://assets.dedust.io/images/usdt.webp',
        coingeckoId: 'tether',
    },
    {
        symbol: 'NOT',
        name: 'Notcoin',
        address: 'EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT',
        decimals: 9,
        icon: 'https://assets.dedust.io/images/not.webp',
        coingeckoId: 'notcoin',
    },
];
