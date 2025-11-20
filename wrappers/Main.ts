import {
    Address,
    beginCell,
    Builder,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode, toNano,
} from '@ton/core';

enum Status {
    NOT_INITIALIZED = 0,
    NOT_REPAYED = 1,
    REPAYED = 2,
    IN_PROGRESS = 3,
}
type Decimal = { nominator: number; denominator: number };
type LoanParams = {
    duration: number; // duration of the loan in seconds
    interestPerDay: Decimal;
    amount: bigint;
};
type OwnerAddresses = {
    moneyGiver: Address | null; // owner of the contract (who gived the money)
    borrower: Address; // owner of the NFT (who took the loan)
};
export type MainConfig = {
    status: Status; // current status of the loan
    nftAddress: Address; // address of the NFT collection
    jettonAddress: Address | null; // address of the Jetton, in which loan is given
    ownerAddresses: OwnerAddresses; // addresses of the contract owners
    loanParams: LoanParams;
    startedAt: number; // timestamp when the loan was started
};
export function storeOwnerAddresses(addresses: OwnerAddresses) {
    return (builder: Builder) => {
        builder.storeAddress(addresses.moneyGiver);
        builder.storeAddress(addresses.borrower);
    };
}
export function storeDecimal(decimal: Decimal) {
    return (builder: Builder) => {
        builder.storeUint(decimal.nominator, 16);
        builder.storeUint(decimal.denominator, 16);
    };
}
export function storeLoanParams(params: LoanParams) {
    return (builder: Builder) => {
        builder.storeUint(params.duration, 32);
        builder.store(storeDecimal(params.interestPerDay));
        builder.storeCoins(params.amount);
    };
}
export function mainConfigToCell(config: MainConfig): Cell {
    return beginCell()
        .storeUint(config.status, 3)
        .storeAddress(config.nftAddress)
        .storeAddress(config.jettonAddress)
        .storeRef(beginCell().store(storeOwnerAddresses(config.ownerAddresses)).endCell())
        .store(storeLoanParams(config.loanParams))
        .storeUint(config.startedAt, 64)
        .endCell();
}
export function cellToMainConfig(cell: Cell): MainConfig {
    const slice = cell.beginParse();
    const status: Status = slice.loadUint(3);
    const nftAddress = slice.loadAddress()!;
    const jettonAddress = slice.loadMaybeAddress()!;
    const ownerAddressesCell = slice.loadRef()!;
    const duration = slice.loadUint(32);
    const interestNominator = slice.loadUint(16);
    const interestDenominator = slice.loadUint(16);
    const amount = slice.loadCoins();
    const startedAt = slice.loadUint(64);
    return {
        nftAddress,
        jettonAddress,
        status,
        ownerAddresses: loadOwnerAddresses(ownerAddressesCell),
        startedAt,
        loanParams: {
            duration,
            interestPerDay: {
                denominator: interestDenominator,
                nominator: interestNominator,
            },
            amount,
        },
    };
}
export function giveMoneyBody(data: LoanParams): Cell {
    return beginCell().storeUint(Opcodes.OP_GIVE_MONEY, 32).store(
        storeLoanParams(data)
    ).endCell()
}
export function repayBody(forwardPayload: Cell, forwardAmount: bigint): Cell {
    return beginCell()
        .storeUint(Opcodes.OP_REPAY_LOAN, 32)
        .storeRef(forwardPayload)
        .storeCoins(forwardAmount)
        .endCell()
}
export const Opcodes = {
    OP_REPAY_LOAN: 0x94f712fa,
    OP_LOAN_NOT_REPAYED_WITHDRAW_NFT: 0x94f712fb,
    OP_DEPLOY: 0x94f712fc,
    OP_GIVE_MONEY: 0x94f712fe,
    OP_CHANGE_LOAN_PARAMS: 0x94f712fd,
    OP_CANCEL_BEFORE_START: 0x94f712ff,
};

function loadOwnerAddresses(ownerAddressesCell: Cell): OwnerAddresses {
    const slice = ownerAddressesCell.beginParse();
    const moneyGiver = slice.loadMaybeAddress()!;
    const borrower = slice.loadAddress()!;
    return {
        moneyGiver,
        borrower,
    };
}

export class Main implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new Main(address);
    }

    static createFromConfig(config: MainConfig, code: Cell, workchain = 0) {
        const data = mainConfigToCell(config);
        const init = { code, data };
        return new Main(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint, jettonAddress?: Address | null) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(Opcodes.OP_DEPLOY, 32).storeAddress(jettonAddress).endCell(),
        });
    }
    async sendGiveLoan(provider: ContractProvider, via: Sender, value: bigint, data: LoanParams) {

        return await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: giveMoneyBody(data),
        });
    }

    async sendRepayLoan(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            forwardPayload: Cell;
            forwardAmount: bigint;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: repayBody(opts.forwardPayload, opts.forwardAmount),
        });
    }
    async sendChangeLoanParams(
        provider: ContractProvider,
        via: Sender,
        newParams: LoanParams,
    ) {
        await provider.internal(via, {
            value: toNano("0.05"),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.OP_CHANGE_LOAN_PARAMS, 32) // OP_CHANGE_LOAN_PARAMS
                .store(storeLoanParams(newParams))
                .endCell(),
        });
    }

    async sendCancelBeforeStart(
        provider: ContractProvider,
        via: Sender,
    ) {
        return await provider.internal(via, {
            value: toNano("0.05"),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.OP_CANCEL_BEFORE_START, 32)
                .endCell(),
        });
    }
    //
    // async sendReset(
    //     provider: ContractProvider,
    //     via: Sender,
    //     opts: {
    //         value: bigint;
    //         queryID?: number;
    //     },
    // ) {
    //     await provider.internal(via, {
    //         value: opts.value,
    //         sendMode: SendMode.PAY_GAS_SEPARATELY,
    //         body: beginCell()
    //             .storeUint(Opcodes.OP_RESET, 32)
    //             .storeUint(opts.queryID ?? 0, 64)
    //             .endCell(),
    //     });
    // }
    async sendWithdrawNftNotRepaid(
        provider: ContractProvider,
        via: Sender,
    ) {
        return await provider.internal(via, {
            value: toNano("0.06"),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.OP_LOAN_NOT_REPAYED_WITHDRAW_NFT, 32)
                .storeRef(beginCell().storeStringTail("Loan not repayed, withdrawing NFT").endCell())
                .storeCoins(1n)
                .endCell(),
        });
    }

    async getData(provider: ContractProvider): Promise<MainConfig> {
        const result = await provider.get('data', []);

        // const ansCell = result.stack.readCell();
        // return cellToMainConfig(ansCell);

        const status: Status = result.stack.readNumber();
        const nftAddress = result.stack.readAddress()!;
        const jettonAddress = result.stack.readAddressOpt();
        const ownerAddressesCell = result.stack.readCell()!;
        const duration = result.stack.readNumber();
        const interestNominator = result.stack.readNumber();
        const interestDenominator = result.stack.readNumber();
        const amount = result.stack.readBigNumber();
        const startedAt = result.stack.readNumber();
        return {
            nftAddress,
            jettonAddress,
            status,
            ownerAddresses: loadOwnerAddresses(ownerAddressesCell),
            startedAt,
            loanParams: {
                duration,
                interestPerDay: {
                    denominator: interestDenominator,
                    nominator: interestNominator,
                },
                amount,
            },
        };
    }
}
