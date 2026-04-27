/**
 * Convert a percentage string (e.g. "1.50" meaning 1.50%) to a Decimal { nominator, denominator }.
 * Supports up to 2 decimal places (0.01% precision).
 * Examples:
 *   "1"    -> { nominator: 1,   denominator: 100 }
 *   "1.5"  -> { nominator: 15,  denominator: 1000 }
 *   "0.25" -> { nominator: 25,  denominator: 10000 }
 *   "1.50" -> { nominator: 150, denominator: 10000 }
 */
export function percentToDecimal(percentStr: string): { nominator: number; denominator: number } {
    const pct = parseFloat(percentStr);
    if (isNaN(pct) || pct < 0) return { nominator: 0, denominator: 1 };

    // Figure out how many decimal places the user typed
    const parts = percentStr.split('.');
    const decimals = parts.length > 1 ? parts[1].length : 0;

    // nominator = pct value as integer (scaled by 10^decimals)
    // denominator = 100 * 10^decimals (because pct / 100 = fraction)
    const scale = Math.pow(10, decimals);
    const nominator = Math.round(pct * scale);
    const denominator = 100 * scale;

    // Simplify with GCD
    const g = gcd(nominator, denominator);
    return {
        nominator: g > 0 ? nominator / g : nominator,
        denominator: g > 0 ? denominator / g : denominator,
    };
}

function gcd(a: number, b: number): number {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
        [a, b] = [b, a % b];
    }
    return a;
}
