import { fromNano, toNano } from '@ton/core';

export function scaleAmount(amount: string, decimals: number): bigint {
    if (decimals === 9) return toNano(amount);
    const [integer = '0', fraction = ''] = amount.split('.');
    const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
    return BigInt(integer) * (10n ** BigInt(decimals)) + BigInt(paddedFraction || '0');
}

export function formatAmount(amount: bigint, decimals: number): string {
    if (decimals === 9) return fromNano(amount);
    const factor = 10n ** BigInt(decimals);
    const integer = amount / factor;
    const remainder = amount % factor;
    const fractionStr = remainder.toString().padStart(decimals, '0').replace(/0+$/, '');
    return fractionStr ? `${integer}.${fractionStr}` : `${integer}`;
}
