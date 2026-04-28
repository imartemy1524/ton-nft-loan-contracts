import "global-structs"
struct LoanParams {
    duration: uint32; // duration of the loan in seconds
    interestPerDay: Decimal;
    amount: coins;     // amount of tokens borrowed
}
@inline
fun LoanParams.equals(self, other: LoanParams): bool {
    return self.duration == other.duration
    && self.interestPerDay.nominator == other.interestPerDay.nominator
    && self.interestPerDay.denominator == other.interestPerDay.denominator
    && self.amount == other.amount;
}
enum Status: uint3 {
    NOT_INITIALIZED = 0,
    NOT_REPAYED = 1,
    REPAYED = 2,
    IN_PROGRESS = 3,
    WAITING_FOR_FUNDS = 4,
    CANCELLED = 5,
}
struct (0x94f712fe) GiveFunds {
    loanParams: LoanParams;
    owner: address?;
}

struct OwnerAddresses {
    moneyGiver: address?;       // owner of the contract (who gived the money)
    borrower: address;      // owner of the NFT (who took the loan)
}
struct Storage {
    status: Status; // current status of the loan
    nftAddress: address;  // address of the NFT collection
    jettonAddress: address?; // address of the Jetton, in which loan is given
    ownerAddresses: Cell<OwnerAddresses>; // addresses of the contract owners
    loanParams: LoanParams;
    startedAt: uint64;     // timestamp when the loan was started
}
@pure
fun divc(a: int, b: int): int asm "DIVC";

@inline
fun Storage.ensureLoanExpired(self) {
    var currentTime = blockchain.now();
    var loanEndTime = self.startedAt + self.loanParams.duration;
    assert (currentTime >= loanEndTime) throw loanNotExpiredError;
}
// load contract data from the persistent storage
fun Storage.load() {
    return Storage.fromCell(contract.getData())
}

// save contract data into the persistent storage
fun Storage.save(self) {
    contract.setData(self.toCell())
}

@inline_ref
fun Storage.enoughRepaymentReceived(self, receivedAmount: coins) {
    var interest = self.loanParams.interestPerDay.apply(self.loanParams.amount * divc((blockchain.now() - self.startedAt), 86400));
    var totalRepayment = self.loanParams.amount + interest;
    return receivedAmount >= totalRepayment;
}



@inline
fun unknownErrorHappendString(): cell asm """<b 0 32 u, "unknown error happened" $, b> PUSHREF""";
@inline
fun unknownMessageString(): cell asm """<b 0 32 u, "unknown message received" $, b> PUSHREF""";

@inline
fun loanRepayedString(): cell asm """<b 0 32 u, "loan repayed successfully" $, b> PUSHREF""";

@inline
fun loanStartedString(): cell asm """<b 0 32 u, "loan started successfully" $, b> PUSHREF""";