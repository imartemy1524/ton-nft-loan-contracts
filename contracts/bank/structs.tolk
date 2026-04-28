import "../global-structs"
import "../structs"

// Bank owner adds a lending offer for a specific loan contract
struct (0xBA000001) AddOffer {
    loanAddress: address;
    loanParams: LoanParams;
    expirationDate: uint64;
    jettonWallet: address?; // bank's own jetton wallet (null = TON loan)
}
// add text comment
struct (0x00000000616464) AddMoney{}
// Bank owner removes an offer by loan address
struct (0xBA000002) RemoveOffer {
    loanAddress: address;
}

// Bank owner withdraws TON from the bank balance
struct (0xBA000003) WithdrawTon {
    amount: coins;
}

// Bank owner withdraws an NFT held by the bank
struct (0xBA000004) WithdrawNft {
    nftAddress: address;
    forwardPayload: cell;
}

// Bank owner withdraws jettons via a bank-owned jetton wallet
struct (0xBA000005) WithdrawJetton {
    jettonWallet: address;
    amount: coins;
    forwardPayload: cell?;
}

// Sent by a loan contract after borrower calls AcceptOffer on the loan
struct (0xBA000006) BankRequestFunds {
    loanParams: LoanParams;
}

// External message — anyone can remove an expired offer to free dict space
struct (0xBA000010) RemoveExpiredOffer {
    loanAddress: address;
}
