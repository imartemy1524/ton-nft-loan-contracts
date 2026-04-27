import "../global-structs"
import "../structs"

// Per-offer data stored as a dict value
struct BankOffer {
    loanParams: LoanParams;
    expirationDate: uint64;
    jettonWallet: address?; // bank's own jetton wallet, null = TON offer
}

// Top-level persistent storage of the bank contract
struct BankStorage {
    owner: address;
    offers: map<address, Cell<BankOffer>>;
    // offers: cell?; // udict256: uint256(loan_addr_hash) -> ref Cell<BankOffer>
}


// --- BankStorage methods ---

fun BankStorage.load() {
    return BankStorage.fromCell(contract.getData())
}

fun BankStorage.save(self) {
    contract.setData(self.toCell())
}

@inline
fun BankStorage.getOffer(self, loanAddress: address): MapLookupResult<Cell<BankOffer>> {
    return self.offers.get(loanAddress);

}

@inline
fun BankStorage.setOffer(mutate self, loanAddress: address, offer: BankOffer) {
    self.offers.set(loanAddress, offer.toCell());
}

@inline
fun BankStorage.deleteOffer(mutate self, loanAddress: address): bool {
    return self.offers.delete(loanAddress);
}
