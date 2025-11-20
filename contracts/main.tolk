import "structs"
import "utils"
import "@stdlib/common"
tolk 1.0

struct (0x7362d09c) TokenNotification {
    queryId: uint64;
    amount: coins;
    from: address;
    // byte: bool;
    forwardPayload: cell;

}

// the struct uses a 32-bit opcode prefix for message identification
struct (0x94f712fc) CreateLoan {
    jettonAddress: address? = null;
}

struct (0x94f712fa) RepayLoan {
    forwardPayload: cell;
    forwardAmount: coins;
}

struct (0x94f712fb) LoanNotRepayedWithdrawNFT {
    forwardPayload: cell;
    forwardAmount: coins;
}
struct (0x94f712fd) ChangeLoanParams {
    newLoanParams: LoanParams;
}
struct (0x94f712fe) GiveFunds {
    loanParams: LoanParams;
}
struct (0x94f712ff) CancelLoadBeforeStart {

}


// this allows processing them with pattern matching
type AllowedMessage = CreateLoan | RepayLoan | LoanNotRepayedWithdrawNFT | TokenNotification | ChangeLoanParams | GiveFunds | CancelLoadBeforeStart;
type TokenNotificationType = GiveFunds | RepayLoan;
// the main entrypoint: called when a contract receives an message from other contracts
fun onInternalMessage(in: InMessage) {
    // use `lazy` to defer loading fields until they are accessed
    val msg = lazy AllowedMessage.fromSlice(in.body);

    match (msg) {
        CreateLoan => {
            var storage = lazy Storage.load();
            assert (storage.status == Status.NOT_INITIALIZED) throw alreadyInitializedError;
            storage.status = Status.WAITING_FOR_FUNDS;
            storage.jettonAddress = msg.jettonAddress;
            storage.save();
            reserveToncoinsOnBalance(reserveAmount, RESERVE_MODE_AT_MOST);
            var msg = createMessage({
                bounce: false,
                value: 0,
                dest: in.senderAddress,
                body: beginCell().storeRef("loan created".toCell()).endCell(),
            });
            msg.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_IGNORE_ERRORS);
        }
        ChangeLoanParams => {
            var storage = lazy Storage.load();
            assert (storage.status == Status.WAITING_FOR_FUNDS) throw alreadyInitializedError;
            var addresses = lazy storage.ownerAddresses.load();
            assert (in.senderAddress == addresses.borrower) throw 5;
            storage.loanParams = msg.newLoanParams;
            storage.save();
            reserveToncoinsOnBalance(reserveAmount, 0);
            createMessage({
                bounce: false,
                value: 0,
                dest: in.senderAddress,
                body: beginCell().storeRef("loan params changed".toCell()).endCell(),
            }).send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_IGNORE_ERRORS);
        }
        CancelLoadBeforeStart => {
            var storage = lazy Storage.load();
            assert (storage.status == Status.WAITING_FOR_FUNDS) throw invalidStatusError;
            assert (in.valueCoins >= minCoinsWithdrawNFT) throw notEnoughTonError;
            var addresses = lazy storage.ownerAddresses.load();
            assert (in.senderAddress == addresses.borrower) throw 5;
            storage.status = Status.CANCELLED;
            storage.save();
            nftTransfer(
                storage.nftAddress, addresses.borrower, addresses.borrower, createEmptyCell(), 1,
            );
        }
        GiveFunds => {
            var storage = lazy Storage.load();
            assert (storage.status == Status.WAITING_FOR_FUNDS) throw invalidStatusError;
            assert (storage.jettonAddress == null) throw notJettonLoanError;
            assert (msg.loanParams.equals(storage.loanParams)) throw loanParamsMismatchError;
            assert (in.valueCoins >= storage.loanParams.amount) throw notEnoughTonError;
            storage.status = Status.IN_PROGRESS;
            storage.startedAt = blockchain.now();
            var addresses = lazy storage.ownerAddresses.load();
            addresses.moneyGiver = in.senderAddress;
            storage.ownerAddresses = addresses.toCell();
            storage.save();
            reserveToncoinsOnBalance(reserveAmount, 0);
            createMessage({
                bounce: false,
                value: 0,
                dest: addresses.borrower,
                body: beginCell().storeRef("loan started".toCell()).endCell(),
            }).send(SEND_MODE_CARRY_ALL_BALANCE);
        }
        TokenNotification => {
            var ref = lazy TokenNotificationType.fromCell(msg.forwardPayload);
            match (ref) {
                GiveFunds => {
                    debug.printString("TokenNotification<GiveFunds>");
                    try {
                        var storage = lazy Storage.load();
                        assert (ref.loanParams.equals(storage.loanParams)) throw loanParamsMismatchError;
                        assert (storage.status == Status.WAITING_FOR_FUNDS) throw invalidStatusError;
                        assert (in.senderAddress == storage.jettonAddress!) throw notJettonLoanError;
                        assert (msg.amount >= storage.loanParams.amount) throw notEnoughJettonError;
                        assert (in.valueCoins >= networkComissionTonJettonRepay) throw notEnoughTonError;
                        storage.status = Status.IN_PROGRESS;
                        storage.startedAt = blockchain.now();
                        var addresses = lazy storage.ownerAddresses.load();
                        addresses.moneyGiver = msg.from;
                        storage.ownerAddresses = addresses.toCell();
                        storage.save();
                        reserveToncoinsOnBalance(reserveAmount, 0);
                        jettonTransfer(in.senderAddress!, addresses.borrower, msg.amount, msg.from, beginCell().storeRef("loan started".toCell()).endCell());
                    } catch (e) {
                        debug.print(e);
                        reserveToncoinsOnBalance(reserveAmount, 0);
                        jettonTransfer(in.senderAddress!, msg.from, msg.amount, msg.from, beginCell().storeRef("unknown error happened".toCell()).endCell());
                    }
                }
                RepayLoan => {
                    debug.printString("TokenNotification<RepayLoan>");
                    try {
                        var storage = lazy Storage.load();
                        assert (in.senderAddress == storage.jettonAddress!) throw notJettonLoanError;
                        assert (storage.status == Status.IN_PROGRESS) throw invalidStatusError;
                        assert (storage.enoughRepaymentReceived(msg.amount)) throw notEnoughTonError;
                        assert (in.valueCoins >= ref.forwardAmount + networkComissionTonJettonRepay) throw notEnoughTonError;
                        storage.status = Status.REPAYED;
                        storage.save();
                        var addresses = lazy storage.ownerAddresses.load();
                        reserveToncoinsOnBalance(ton("0.001"), RESERVE_MODE_AT_MOST);
                        nftTransfer(storage.nftAddress, addresses.borrower, msg.from, ref.forwardPayload, ref.forwardAmount, SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL, ton("0.04") + ref.forwardAmount);
                        jettonTransfer(storage.jettonAddress!, addresses.moneyGiver!, msg.amount, msg.from, beginCell().storeRef("loan repay".toCell()).endCell());
                    } catch (e) {
                        debug.print(e);
                        reserveToncoinsOnBalance(reserveAmount, 0);
                        jettonTransfer(in.senderAddress!, msg.from, msg.amount, msg.from, beginCell().storeRef("unknown error happened".toCell()).endCell());
                    }
                }
                else => {
                    debug.printString("Invalid message received in TokenNotification");
                    reserveToncoinsOnBalance(reserveAmount, 0);
                    jettonTransfer(in.senderAddress!, msg.from, msg.amount, msg.from, beginCell().storeRef("unknown message received".toCell()).endCell());
                }
            }

        }

        RepayLoan => {
            var storage = lazy Storage.load();
            assert (storage.jettonAddress == null || createAddressNone() == storage.jettonAddress!) throw notJettonLoanError;
            assert (storage.status == Status.IN_PROGRESS) throw invalidStatusError;
            assert (storage.enoughRepaymentReceived(in.valueCoins - networkComissionTon - msg.forwardAmount)) throw notEnoughTonError;
            storage.status = Status.REPAYED;
            storage.save();
            var addresses = lazy storage.ownerAddresses.load();
            reserveToncoinsOnBalance(ton("0.001"), RESERVE_MODE_AT_MOST);
            nftTransfer(storage.nftAddress, addresses.borrower, in.senderAddress, msg.forwardPayload, msg.forwardAmount, SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL, ton("0.04") + msg.forwardAmount);
            createMessage({
                bounce: false,
                value: 0,
                dest: addresses.moneyGiver!,
                body: createEmptyCell(),
            }).send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_IGNORE_ERRORS);
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
            nftTransfer(storage.nftAddress, addresses.moneyGiver!, in.senderAddress, msg.forwardPayload, msg.forwardAmount);
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
    // return contract.getData();
    var ans = lazy Storage.load();
    return ans;
    // debug.printString("a1");
    // debug.print(ans.status.toCell());
    // debug.print(ans.nftAddress.toCell());
    // debug.print(ans.jettonAddress.toCell());
    // debug.print(ans.ownerAddresses.toCell());
    // debug.print(ans.loanParams.toCell());
    // debug.print(ans.startedAt.toCell());
    // debug.print(ans.amount.toCell());
    // return ans;
}
