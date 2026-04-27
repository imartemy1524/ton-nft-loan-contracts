import { Address, beginCell, Builder, Cell } from '@ton/core';

export type NftTransfer = {
    $$type: 'Transfer';
    query_id: bigint;
    new_owner: Address;
    response_destination: Address | null;
    custom_payload: Cell | null;
    forward_amount: bigint;
    forward_payload: Cell | null;
};

export function storeNftTransfer(src: NftTransfer) {
    return (builder: Builder) => {
        builder.storeUint(0x5fcc3d14, 32);
        builder.storeUint(src.query_id, 64);
        builder.storeAddress(src.new_owner);
        builder.storeAddress(src.response_destination);
        if (src.custom_payload !== null && src.custom_payload !== undefined) {
            builder.storeBit(true).storeRef(src.custom_payload);
        } else {
            builder.storeBit(false);
        }
        builder.storeCoins(src.forward_amount);
        // Either Cell ^Cell: 0 = inline empty, 1 = ref
        if (src.forward_payload !== null && src.forward_payload !== undefined) {
            builder.storeBit(true).storeRef(src.forward_payload);
        } else {
            builder.storeBit(false);
        }
    };
}

export function buildNftTransferBody(newOwner: Address, responseDest: Address): Cell {
    const comment = beginCell()
        .storeUint(0, 32) // text comment op
        .storeStringTail('Contract initialization')
        .endCell();

    return beginCell()
        .store(storeNftTransfer({
            $$type: 'Transfer',
            query_id: 0n,
            new_owner: newOwner,
            response_destination: responseDest,
            custom_payload: null,
            forward_amount: 1n,
            forward_payload: comment,
        }))
        .endCell();
}
