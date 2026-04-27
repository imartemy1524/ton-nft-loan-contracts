import "data"
import "structs"
import "../global-structs"
import "../structs"
import "../utils"
import "@stdlib/common"
import "@stdlib/gas-payments"
tolk 1.3

const bankReserveAmount: coins = ton("0.005");

const bankNotOwnerError = 150;
const bankOfferNotFoundError = 151;
const bankOfferExpiredError = 152;
const bankOfferMismatchError = 153;

type AllowedBankMessage = AddMoney
    | AddOffer
    | RemoveOffer
    | WithdrawTon
    | WithdrawNft
    | WithdrawJetton
    | BankRequestFunds
    | OwnershipAssigned
    | TokenNotification;

type ExternalBankMessage = RemoveExpiredOffer;

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedBankMessage.fromSlice(in.body);

    match (msg) {
        // -- owner: invest money
        AddMoney =>{
            // do nothing
        }
        // ── Owner: add a lending offer ──────────────────────────────────────
        AddOffer => {
            var storage = lazy BankStorage.load();
            assert (in.senderAddress == storage.owner) throw bankNotOwnerError;
            storage.setOffer(msg.loanAddress, BankOffer{
                loanParams: msg.loanParams,
                expirationDate: msg.expirationDate,
                jettonWallet: msg.jettonWallet,
            });
            storage.save();

            createMessage({
                bounce: false,
                value: 0,
                dest: in.senderAddress,
                body: (0 as uint32, "offer added successfully"),
            }).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        }

        // ── Owner: remove an offer by loan address ──────────────────────────
        RemoveOffer => {
            var storage = lazy BankStorage.load();
            assert (in.senderAddress == storage.owner) throw bankNotOwnerError;
            storage.deleteOffer(msg.loanAddress);
            storage.save();
            createMessage({
                bounce: false,
                value: 0,
                dest: in.senderAddress,
                body: createEmptyCell(),
            }).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_IGNORE_ERRORS);
        }

        // ── Owner: withdraw TON ─────────────────────────────────────────────
        WithdrawTon => {
            var storage = lazy BankStorage.load();
            assert (in.senderAddress == storage.owner) throw bankNotOwnerError;
            createMessage({
                bounce: false,
                value: msg.amount,
                dest: storage.owner,
                body: (0 as uint32, "withdraw"),
            }).send(SEND_MODE_PAY_FEES_SEPARATELY);
        }

        // ── Owner: withdraw an NFT held by the bank ─────────────────────────
        WithdrawNft => {
            var storage = lazy BankStorage.load();
            assert (in.senderAddress == storage.owner) throw bankNotOwnerError;
            nftTransfer(
                msg.nftAddress,
                storage.owner,
                storage.owner,
                msg.forwardPayload,
                1,
                SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_IGNORE_ERRORS
            );
        }

        // ── Owner: withdraw jettons from a bank-owned wallet ────────────────
        WithdrawJetton => {
            var storage = lazy BankStorage.load();
            assert (in.senderAddress == storage.owner) throw bankNotOwnerError;
            jettonTransfer(
                msg.jettonWallet,
                storage.owner,
                msg.amount,
                storage.owner,
                createEmptyCell(),
                1,
                SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE
            );
        }

        // ── Loan contract: request funding after borrower accepted offer ─────
        BankRequestFunds => {
            var storage = lazy BankStorage.load();
            // Verify this loan address has a registered offer
            var offer1 = storage.getOffer(in.senderAddress);
            assert (offer1.isFound) throw bankOfferNotFoundError;
            var offer = offer1.loadValue().load();
            // Check offer is still valid
            assert (blockchain.now() < offer.expirationDate) throw bankOfferExpiredError;
            // Check the loan's params match what the bank owner offered
            assert (msg.loanParams.equals(offer.loanParams)) throw bankOfferMismatchError;

            // Consume the offer (one-time use)
            storage.deleteOffer(in.senderAddress);
            storage.save();

            if (offer.jettonWallet == null) {
                // TON loan: send GiveFunds directly to the loan with the amount attached.
                // SEND_MODE_PAY_FEES_SEPARATELY ensures the loan receives the full value.
                createMessage({
                    bounce: true,
                    value: offer.loanParams.amount + networkComissionTon,
                    dest: in.senderAddress,
                    body: GiveFunds{loanParams: offer.loanParams, owner: storage.owner}.toCell(),
                }).send(SEND_MODE_PAY_FEES_SEPARATELY);
            } else {
                // Jetton loan: instruct bank's jetton wallet to transfer tokens to the
                // loan contract, forwarding GiveFunds as the notification payload.
                // The loan's jetton wallet delivers TokenNotification with GiveFunds.
                jettonTransfer(
                    offer.jettonWallet!,
                    in.senderAddress,          // destination = loan contract
                    offer.loanParams.amount,
                    storage.owner,             // excess TON back to owner
                    GiveFunds{loanParams: offer.loanParams, owner: storage.owner}.toCell(),
                    networkComissionTonJettonRepay + ton("0.05"), // forward ≥ 0.1 TON required by loan
                    SEND_MODE_PAY_FEES_SEPARATELY,
                    networkComissionTonJettonRepay + ton("0.1"),  // attached for jetton wallet gas
                );
            }
        }

        // ── Deposit: accept incoming NFT (bank holds it) ────────────────────
        OwnershipAssigned => {
            // NFT is now owned by this bank; no further action needed
        }

        // ── Deposit: accept incoming jettons (wallet holds balance) ─────────
        TokenNotification => {
            // Jettons credited to the bank's jetton wallet; no further action needed
        }

        else => {
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

// External message handler: anyone can prune an expired offer from the dict
fun onExternalMessage(in: slice) {
    val msg = lazy ExternalBankMessage.fromSlice(in);
    match (msg) {
        RemoveExpiredOffer => {
            var storage = lazy BankStorage.load();
            var offer1 = storage.getOffer(msg.loanAddress);
            assert (offer1.isFound) throw bankOfferNotFoundError;
            var offer = offer1.loadValue().load();
            // Only expired offers may be pruned externally
            assert (blockchain.now() >= offer.expirationDate) throw bankOfferExpiredError;
            // Charge gas to contract balance after all checks pass
            acceptExternalMessage();
            storage.deleteOffer(msg.loanAddress);
            storage.save();
        }
        else => {
            throw 0xFFFF;
        }
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    // Bounced GiveFunds (TON loans): TON is automatically returned to this contract.
    // Bounced JettonTransfer: handled by the jetton wallet standard.
    // The offer has already been consumed; no state restoration needed.
}

// ── GET methods ─────────────────────────────────────────────────────────────

struct BankVersionedStorage {
    version: uint8 = 0;
    storage: BankStorage;
}

get fun data(): BankVersionedStorage {
    var storage = lazy BankStorage.load();
    return BankVersionedStorage{storage};
}
