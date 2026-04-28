import {
    Address,
    beginCell,
    Builder,
    Cell,
    Contract,
    ContractProvider,
    Dictionary,
    Slice,
    TupleItemSlice,
} from '@ton/core';

export enum LoanStatus {
    NOT_INITIALIZED = 0,
    NOT_REPAYED = 1,
    REPAYED = 2,
    IN_PROGRESS = 3,
    WAITING_FOR_FUNDS = 4,
    CANCELLED = 5,
}

export type Decimal = { nominator: number; denominator: number };
export type LoanParams = {
    duration: number;
    interestPerDay: Decimal;
    amount: bigint;
};

export type MainConfig = {
    status: LoanStatus;
    nftAddress: Address;
    jettonAddress: Address | null;
    ownerAddresses: {
        moneyGiver: Address | null;
        borrower: Address;
    };
    loanParams: LoanParams;
    startedAt: number;
};

export type BankOffer = {
    loanParams: LoanParams;
    expirationDate: bigint;
    jettonWallet: Address | null;
};

function loadOwnerAddresses(ownerAddressesCell: Cell) {
    const slice = ownerAddressesCell.beginParse();
    return {
        moneyGiver: slice.loadMaybeAddress(),
        borrower: slice.loadAddress(),
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

export function bankOfferToCell(offer: BankOffer) {
    return beginCell()
        .storeWritable(storeLoanParams(offer.loanParams))
        .storeUint(offer.expirationDate, 64)
        .storeAddress(offer.jettonWallet)
        .endCell();
}

export class Main implements Contract {
    constructor(readonly address: Address) {}

    static createFromAddress(address: Address) {
        return new Main(address);
    }

    async getData(provider: ContractProvider): Promise<MainConfig> {
        const result = await provider.get('data', []);
        const version = result.stack.readNumber();
        if (version !== 0) throw new Error(`Unsupported loan data version: ${version}`);

        const status: LoanStatus = result.stack.readNumber();
        const nftAddress = result.stack.readAddress();
        const jettonAddress = result.stack.readAddressOpt();
        const ownerAddressesCell = result.stack.readCell();
        const duration = result.stack.readNumber();
        const interestNominator = result.stack.readNumber();
        const interestDenominator = result.stack.readNumber();
        const amount = result.stack.readBigNumber();
        const startedAt = result.stack.readNumber();

        return {
            status,
            nftAddress,
            jettonAddress,
            ownerAddresses: loadOwnerAddresses(ownerAddressesCell),
            loanParams: {
                duration,
                interestPerDay: {
                    nominator: interestNominator,
                    denominator: interestDenominator,
                },
                amount,
            },
            startedAt,
        };
    }
}

export class Bank implements Contract {
    constructor(readonly address: Address) {}

    static createFromAddress(address: Address) {
        return new Bank(address);
    }

    async getData(provider: ContractProvider): Promise<{
        version: number;
        owner: Address;
        offers: Dictionary<Address, BankOffer>;
    }> {
        const result = await provider.get('data', []);
        const version = result.stack.readNumber();
        if (version !== 0) throw new Error(`Unsupported bank data version: ${version}`);

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

export class JettonWallet implements Contract {
    constructor(readonly address: Address) {}

    static createFromAddress(address: Address) {
        return new JettonWallet(address);
    }

    async getData(provider: ContractProvider): Promise<{
        balance: bigint;
        owner: Address;
        master: Address;
    }> {
        const result = await provider.get('get_wallet_data', []);
        return {
            balance: result.stack.readBigNumber(),
            owner: result.stack.readAddress(),
            master: result.stack.readAddress(),
        };
    }
}

export class JettonMaster implements Contract {
    constructor(readonly address: Address) {}

    static createFromAddress(address: Address) {
        return new JettonMaster(address);
    }

    async getWalletAddress(provider: ContractProvider, owner: Address): Promise<Address> {
        const ownerSlice: TupleItemSlice = {
            type: 'slice',
            cell: beginCell().storeAddress(owner).endCell(),
        };
        const result = await provider.get('get_wallet_address', [ownerSlice]);
        return result.stack.readAddress();
    }
}
