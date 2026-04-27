import {
    Address,
    beginCell,
    Builder,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Dictionary,
    Sender,
    SendMode,
    Slice,
    toNano,
    TupleItemSlice,
} from '@ton/core';
import { LoanParams, storeLoanParams } from './Main';

export type BankConfig = {
    owner: Address;
};

export type BankOffer = {
    loanParams: LoanParams;
    expirationDate: bigint;
    jettonWallet: Address | null;
};

export const BankOpcodes = {
    ADD_OFFER: 0xba000001,
    REMOVE_OFFER: 0xba000002,
    WITHDRAW_TON: 0xba000003,
    WITHDRAW_NFT: 0xba000004,
    WITHDRAW_JETTON: 0xba000005,
    BANK_REQUEST_FUNDS: 0xba000006,
    REMOVE_EXPIRED_OFFER: 0xba000010,
};

export function bankConfigToCell(config: BankConfig): Cell {
    return beginCell()
        .storeAddress(config.owner)
        .storeMaybeRef(null) // empty offers dict
        .endCell();
}

export function bankOfferFromCell(cell: Cell): BankOffer {
    const s = cell.beginParse();
    const duration = s.loadUint(32);
    const interestNominator = s.loadUint(16);
    const interestDenominator = s.loadUint(16);
    const amount = s.loadCoins();
    const expirationDate = s.loadUintBig(64);
    const jettonWallet = s.loadMaybeAddress();
    return {
        loanParams: {
            duration,
            interestPerDay: { nominator: interestNominator, denominator: interestDenominator },
            amount,
        },
        expirationDate,
        jettonWallet,
    };
}
export function bankOfferToCell(offer: BankOffer){
    return beginCell()
        .storeWritable(storeLoanParams(offer.loanParams))
        .storeUint(offer.expirationDate, 64)
        .storeAddress(offer.jettonWallet)
        .endCell()
}

export function addOfferBody(
    loanAddress: Address,
    loanParams: LoanParams,
    expirationDate: bigint,
    jettonWallet: Address | null,
): Cell {
    return beginCell()
        .storeUint(BankOpcodes.ADD_OFFER, 32)
        .storeAddress(loanAddress)
        .store(storeLoanParams(loanParams))
        .storeUint(expirationDate, 64)
        .storeAddress(jettonWallet)
        .endCell();
}

export class Bank implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new Bank(address);
    }

    static createFromConfig(config: BankConfig, code: Cell, workchain = 0) {
        const data = bankConfigToCell(config);
        const init = { code, data };
        return new Bank(contractAddress(workchain, init), init);
    }

    // Deploy: just send value to trigger contract creation
    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0, 32).storeStringTail("add").endCell(),
        });
    }

    async sendAddOffer(
        provider: ContractProvider,
        via: Sender,
        loanAddress: Address,
        loanParams: LoanParams,
        expirationDate: bigint,
        jettonWallet: Address | null = null,
    ) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: addOfferBody(loanAddress, loanParams, expirationDate, jettonWallet),
        });
    }

    async sendRemoveOffer(provider: ContractProvider, via: Sender, loanAddress: Address) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(BankOpcodes.REMOVE_OFFER, 32)
                .storeAddress(loanAddress)
                .endCell(),
        });
    }

    async sendWithdrawTon(provider: ContractProvider, via: Sender, amount: bigint) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(BankOpcodes.WITHDRAW_TON, 32).storeCoins(amount).endCell(),
        });
    }

    async sendWithdrawNft(
        provider: ContractProvider,
        via: Sender,
        nftAddress: Address,
        forwardPayload: Cell = beginCell().endCell(),
    ) {
        await provider.internal(via, {
            value: toNano('0.1'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(BankOpcodes.WITHDRAW_NFT, 32)
                .storeAddress(nftAddress)
                .storeRef(forwardPayload)
                .endCell(),
        });
    }

    async sendWithdrawJetton(
        provider: ContractProvider,
        via: Sender,
        jettonWallet: Address,
        amount: bigint,
    ) {
        await provider.internal(via, {
            value: toNano('0.1'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(BankOpcodes.WITHDRAW_JETTON, 32)
                .storeAddress(jettonWallet)
                .storeCoins(amount)
                .endCell(),
        });
    }

    // External message — anyone can prune an expired offer
    async sendRemoveExpiredOffer(provider: ContractProvider, loanAddress: Address) {
        await provider.external(
            beginCell()
                .storeUint(BankOpcodes.REMOVE_EXPIRED_OFFER, 32)
                .storeAddress(loanAddress)
                .endCell(),
        );
    }

    async getData(provider: ContractProvider): Promise<{
        version: number;
        owner: Address;
        offers: Dictionary<Address, BankOffer>;
    }> {
        const result = await provider.get('data', []);
        const version = result.stack.readNumber();
        if(version !== 0){
            throw "Invalid contract version"
        }
        const owner = result.stack.readAddress();
        const offersCell = result.stack.readCellOpt();
        const offers = Dictionary.loadDirect<Address, BankOffer>(
            Dictionary.Keys.Address(),
            {
                parse(src: Slice): BankOffer {
                    return bankOfferFromCell(src.loadRef());
                },
                serialize(src: BankOffer, builder: Builder) {
                    builder.storeRef(bankOfferToCell(src));
                },
            },
            offersCell,
        );
        return { version, owner, offers };
    }


}
