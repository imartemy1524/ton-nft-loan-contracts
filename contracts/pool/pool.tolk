import "data"
import "structs"
import "../global-structs"
import "@stdlib/common"

type AllowedMessagePool = OwnershipAssigned;
type OwnershipAssignedMessages = NftGetLoan;

@inline
fun parseOwnershipAssignedMessage(msg: cell, inCoins: coins) {
    var storage = lazy PoolStorage.load();
    var msg = OwnershipAssignedMessages.fromCell(msg);
    match (msg) {
        NftGetLoan => {
            assert (inCoins >= minAmountGetTheLoan) throw notEnoughTonError;
            assert (msg.minReceivedAmount >= storage.floorPrice) throw argumentsChangedError;
            assert (contract.getOriginalBalance() >= storage.floorPrice + reserveAmount) throw notEnoughTonOnContractError;

        }
    }
}

fun onInternalMessage(in: InMessage) {
    // use `lazy` to defer loading fields until they are accessed
    val msg = lazy AllowedMessagePool.fromSlice(in.body);

    match (msg) {
        OwnershipAssigned => {
            var message = msg.forwardPayload;
            parseOwnershipAssignedMessage(message, in.valueCoins);
        }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

// a handler for bounced messages (not used here, may be ommited)
fun onBouncedMessage(in: InMessageBounced) {
}
