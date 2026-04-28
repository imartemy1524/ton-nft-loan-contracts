import "structs"
import "global-structs"


@inline
fun nftTransfer(nftAddress: address, newOwner: address, excessTo: address, forwardPayload: cell, forwardAmount: coins, mode: int = SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_IGNORE_ERRORS, value: int = 0) {
    createMessage({
        bounce: false,
        value,
        dest: nftAddress,
        body: NftTransfer<cell>{
            queryId: 0,
            newOwner,
            excessTo,
            forwardAmount,
            forwardPayload,
        }.toCell(),
    }).send(mode);
}

@inline
fun jettonTransfer(jettonAddress: address, to: address, amount: coins, excessTo: address, forwardPayload: cell?, forwardAmount: coins = 1, mode: int = SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_IGNORE_ERRORS, value: int = 0) {
    createMessage({
        bounce: true,
        value,
        dest: jettonAddress,
        body: JettonTransfer{
            queryId: 0,
            amount,
            destination: to,
            forwardPayload,
            forwardTonAmount: forwardAmount,
            excessTo,
        }.toCell(),
    }).send(mode);
}