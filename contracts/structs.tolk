struct Decimal {
    nominator: uint16;  // up to 9 decimal places
    denominator: uint16; // up to 9 decimal places
}
fun Decimal.apply(self, to: int) {
    return mulDivFloor(self.nominator, to, self.denominator)
}

struct LoanParams {
    duration: uint32; // duration of the loan in seconds
    interestPerDay: Decimal;
    amount: coins;     // amount of tokens borrowed
}

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
struct OwnerAddresses{
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

fun Storage.enoughRepaymentReceived(self, receivedAmount: coins) {
    var interest = self.loanParams.interestPerDay.apply(self.loanParams.amount * divc((blockchain.now() - self.startedAt), 86400));
    var totalRepayment = self.loanParams.amount + interest;
    return receivedAmount >= totalRepayment;
}

struct (0x5fcc3d14) NftTransfer<T> {
    queryId: uint64;
    newOwner: address;
    excessTo: address;
    customPayload: cell? = null;
    forwardAmount: coins;
    forwardPayload: T;
}
struct (0x0f8a7ea5) JettonTransfer<T> {
    queryId: uint64 = 0;
    amount: coins;
    destination: address;
    excessTo: address;
    customPayload: cell? = null;
    forwardTonAmount: coins;
    forwardPayload: T;
}





const reserveAmount: coins = ton("0.01");
const minCoinsWithdrawNFT : coins = ton("0.05");
const networkComissionTon : coins = ton("0.05");
const networkComissionTonJettonRepay : coins = ton("0.1");

const alreadyInitializedError = 136;
const notEnoughTonError = 137;
const loanNotExpiredError = 138;
const invalidStatusError = 139;
const notJettonLoanError = 140;
const notEnoughJettonError = 141;
const loanParamsMismatchError = 142;