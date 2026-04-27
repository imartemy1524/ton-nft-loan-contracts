ТЗ:

Сделай полноценныф фронтенд с бэкендом на 
реакте для заимствования NFT на тоновских смарт-контрактах.

Используй tailwind.


Workflow:

User opens the page, main page with some information; on the top header there are links to "Give a loan", "Get a loan", button "tonconnect", in the profile there should be some statistics like "bought" "in progress" and etc; make the same interface as "https://app.nftfi.com".

Use the next interface to communicate with smart contract:
```typescript
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
        const version = result.stack.readNumber();
        if (version !== 0) {
            throw new Error(`Unsupported data version: ${version}`);
        }
        const status: LoanStatus = result.stack.readNumber();
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
```



