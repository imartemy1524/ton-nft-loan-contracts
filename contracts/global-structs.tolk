struct Decimal {
    nominator: uint16;  // up to 9 decimal places
    denominator: uint16; // up to 9 decimal places
}
@inline
fun Decimal.apply(self, to: int) {
    return mulDivFloor(self.nominator, to, self.denominator)
}

@inline
fun gcd(a: int, b: int) {
    while (a % b != 0) {
        (b, a) = (a % b, b);
    }
    return b;
}

fun Decimal.mul(self, to: Decimal): Decimal {
    var newNominator = to.nominator * self.nominator;
    var newDenominator = to.denominator * self.denominator;
    var divideBy = gcd(newNominator, newDenominator);
    newDenominator /= divideBy;
    newNominator /= divideBy;
    // crop the decimal
    while (newNominator > (1 << 160)) {
        newNominator >>= 1;
        newDenominator >>= 1;
    }
    return Decimal{
        nominator: newNominator,
        denominator: newDenominator,
    }
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

struct (0x7362d09c) TokenNotification {
    queryId: uint64;
    amount: coins;
    from: address;
    // byte: bool;
    forwardPayload: cell;
}
struct (0x05138d91) OwnershipAssigned {
    queryId: uint64;
    prevOwner: address;
    forwardPayload: cell;
}


const reserveAmount: coins = ton("0.01");
const minCoinsWithdrawNFT : coins = ton("0.05");
const networkComissionTon : coins = ton("0.05");
const networkComissionTonJettonRepay : coins = ton("0.1");
const minAmountGetTheLoan = ton("0.1");



const alreadyInitializedError = 136;
const notEnoughTonError = 137;
const notEnoughTonOnContractError = 137;
const loanNotExpiredError = 138;
const invalidStatusError = 139;
const notJettonLoanError = 140;
const notEnoughJettonError = 141;
const loanParamsMismatchError = 142;
const argumentsChangedError = 137;
