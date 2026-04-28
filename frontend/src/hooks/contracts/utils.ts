import { Address, beginCell, Cell, toNano } from '@ton/core';
import { TonClient } from '@ton/ton';
import { Network } from '../../network';

/**
 * Builds a TEP-74 jetton transfer message body.
 *
 * @param amount        - Amount of jettons to transfer (in the token's base units).
 * @param destination   - Address that will receive the jettons.
 * @param responseDestination - Address that receives the excesses / gas refund.
 * @param forwardAmount - TON attached to the transfer notification sent to `destination` (default 0.05 TON).
 * @param queryId       - Arbitrary query id for deduplication (default 0).
 */
export function buildJettonTransfer({
    amount,
    destination,
    responseDestination,
    forwardAmount = toNano('0.05'),
    forwardPayload,
    queryId = 0n,
}: {
    amount: bigint;
    destination: Address;
    responseDestination: Address;
    forwardAmount?: bigint;
    forwardPayload?: Cell;
    queryId?: bigint;
}): Cell {
    const body = beginCell()
        .storeUint(0xf8a7ea5, 32)   // op: transfer (TEP-74)
        .storeUint(queryId, 64)      // query_id
        .storeCoins(amount)          // jetton amount
        .storeAddress(destination)   // recipient
        .storeAddress(responseDestination) // excess gas refund target
        .storeBit(false)             // no custom_payload
        .storeCoins(forwardAmount)   // TON forwarded with transfer notification
        .storeBit(false);            // forward_payload in-place

    if (forwardPayload) {
        body.storeRef(forwardPayload);
    }

    return body.endCell();
}

export function createTonClient(network: Network): TonClient {
    const isTestnet = network === 'testnet';
    return new TonClient({
        endpoint: isTestnet
            ? import.meta.env.VITE_TONCENTER_TESTNET_URL
            : import.meta.env.VITE_TONCENTER_MAINNET_URL,
        apiKey: import.meta.env.VITE_TONCENTER_API_KEY,
    });
}
