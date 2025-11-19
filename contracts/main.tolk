import "structs"
import "utils"

tolk 1.0

struct (0x7362d09c) TokenNotification<T> {
    queryId: uint64;
    amount: coins;
    from: address;
    byte: bool;
    forwardPayload: T;
}

// the struct uses a 32-bit opcode prefix for message identification
struct (0x94f712fc) CreateLoan {
    queryId: uint64
}

struct (0x94f712fa) RepayLoan {
    forwardPayload: cell;
    forwardAmount: coins;
}

struct (0x94f712fa) LoanNotRepayedWithdrawNFT {
    forwardPayload: cell;
    forwardAmount: coins;
}
// using unions to represent available messages
// this allows processing them with pattern matching
type AllowedMessage = CreateLoan | RepayLoan | LoanNotRepayedWithdrawNFT | TokenNotification<RepayLoan>;

// the main entrypoint: called when a contract receives an message from other contracts
fun onInternalMessage(in: InMessage) {
    // use `lazy` to defer loading fields until they are accessed
    val msg = lazy AllowedMessage.fromSlice(in.body);

    match (msg) {
        CreateLoan => {
            var storage = lazy Storage.load();
            assert (storage.status == Status.NOT_INITIALIZED) throw alreadyInitializedError;
            storage.status = Status.IN_PROGRESS;
            storage.save();
            reserveToncoinsOnBalance(reserveAmount, 0);
            createMessage({
                bounce: false,
                value: 0,
                dest: in.senderAddress,
                body: createEmptyCell(),
            }).send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_IGNORE_ERRORS);
        }

        RepayLoan => {
            var storage = lazy Storage.load();
            assert (createAddressNone() == storage.jettonAddress) throw notJettonLoanError;
            assert (storage.status == Status.IN_PROGRESS) throw invalidStatusError;
            assert (storage.enoughRepaymentReceived(in.valueCoins - networkComissionTon - msg.forwardAmount)) throw notEnoughTonError;
            storage.status = Status.REPAYED;
            storage.save();
            var addresses = lazy storage.ownerAddresses.load();
            createMessage({
                bounce: false,
                value: 0,
                dest: addresses.moneyGiver,
                body: createEmptyCell(),
            }).send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_IGNORE_ERRORS);
            nftTransfer(storage.nftAddress, addresses.borrower, in.senderAddress, msg.forwardPayload, msg.forwardAmount, SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL, ton("0.04") + msg.forwardAmount);
        }
        TokenNotification<RepayLoan> => {
            var storage = lazy Storage.load();
            assert (in.senderAddress == storage.nftAddress) throw notJettonLoanError;
            assert (storage.status == Status.IN_PROGRESS) throw invalidStatusError;
            assert (storage.enoughRepaymentReceived(msg.amount)) throw notEnoughTonError;
            assert (in.valueCoins > msg.forwardPayload.forwardAmount + networkComissionTonJettonRepay) throw notEnoughTonError;
            storage.status = Status.REPAYED;
            storage.save();
            var addresses = lazy storage.ownerAddresses.load();
            nftTransfer(storage.nftAddress, addresses.borrower, msg.from, msg.forwardPayload.forwardPayload, msg.forwardPayload.forwardAmount, SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL, ton("0.04") + msg.forwardPayload.forwardAmount);
            jettonTransfer(storage.jettonAddress, addresses.moneyGiver, in.valueCoins, msg.from, beginCell().storeRef("loan repay".toCell()).endCell());
        }

        LoanNotRepayedWithdrawNFT => {
            var storage = lazy Storage.load();
            assert (storage.status == Status.IN_PROGRESS) throw invalidStatusError;
            assert (in.valueCoins > minCoinsWithdrawNFT + msg.forwardAmount) throw notEnoughTonError;
            storage.ensureLoanExpired();

            storage.status = Status.NOT_REPAYED;

            // save updated storage
            storage.save();
            var addresses = lazy storage.ownerAddresses.load();
            nftTransfer(storage.nftAddress, addresses.moneyGiver, in.senderAddress, msg.forwardPayload, msg.forwardAmount);
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

get fun data(): Storage {
    return Storage.load();
}
