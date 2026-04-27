import "../global-structs"

struct CollectionData{
    collectionAddress: address;
    calculateChildAddressFunction: cell;
}
struct PoolStorage {
    loanDays: uint8;
    loanInterest: Decimal;
    collectionData: Cell<CollectionData>;
    investedAmount: coins;
    // how much TON does one coin costs
    currentPrice: Decimal;
    // how much does one get when he sends the NFT
    floorPrice: coins;

}

// load contract data from the persistent storage
fun PoolStorage.load() {
    return PoolStorage.fromCell(contract.getData())
}
// save contract data into the persistent storage
fun PoolStorage.save(self) {
    contract.setData(self.toCell())
}
