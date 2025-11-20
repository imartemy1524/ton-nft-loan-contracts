import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import { giveMoneyBody, Main, repayBody } from '../wrappers/Main';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { NftItem } from '../build/Nft/tact_NftItem';
import { deployJetton, deployNft } from './_utils';
import { JettonMaster } from '../build/Jetton/tact_JettonMaster';
import { JettonWallet } from '../build/Jetton/tact_JettonWallet';

describe('MainJetton', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('Main');
    });

    let blockchain: Blockchain;
    let borrower: SandboxContract<TreasuryContract>;
    let moneyGiver: SandboxContract<TreasuryContract>;
    let main: SandboxContract<Main>;
    let nft: SandboxContract<NftItem>;

    let jettonMaster: SandboxContract<JettonMaster>;
    let moneyGiverJetton: SandboxContract<JettonWallet>;
    let borrowerJetton: SandboxContract<JettonWallet>;
    let mainJetton: SandboxContract<JettonWallet>;
    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = 1;
        moneyGiver = await blockchain.treasury('moneyGiver');
        borrower = await blockchain.treasury('deployer');
        nft = await deployNft(blockchain, borrower);
        jettonMaster = await deployJetton(blockchain, moneyGiver);
        moneyGiverJetton = blockchain.openContract(
            JettonWallet.fromAddress(await jettonMaster.getGetWalletAddress(moneyGiver.address))!,
        );
        borrowerJetton = blockchain.openContract(
            JettonWallet.fromAddress(await jettonMaster.getGetWalletAddress(borrower.address))!,
        );
        await moneyGiverJetton.send(
            moneyGiver.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'TokenTransfer',
                query_id: 0n,
                amount: toNano(500),
                destination: borrower.address,
                response_destination: moneyGiver.address,
                custom_payload: null,
                forward_ton_amount: 1n,
                forward_payload: beginCell().storeUint(0, 1).endCell().asSlice(),
            },
        );
        {
            const { balance } = await borrowerJetton.getGetWalletData();
            expect(balance).toBe(toNano(500));
        }
        {
            const { balance } = await moneyGiverJetton.getGetWalletData();
            expect(balance).toBe(toNano(500));
        }

        main = blockchain.openContract(
            Main.createFromConfig(
                {
                    ownerAddresses: {
                        moneyGiver: null,
                        borrower: borrower.address,
                    },
                    loanParams: {
                        interestPerDay: { nominator: 1, denominator: 100 },
                        duration: 86400 * 7,
                        amount: toNano('1'),
                    },
                    startedAt: 15,
                    jettonAddress: null,
                    nftAddress: nft.address,
                    status: 0,
                },
                code,
            ),
        );
        mainJetton = blockchain.openContract(
            JettonWallet.fromAddress(await jettonMaster.getGetWalletAddress(main.address))!,
        );
        const deployResult = await main.sendDeploy(borrower.getSender(), toNano('0.05'), mainJetton.address);

        await nft.send(
            borrower.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'Transfer',
                query_id: 0n,
                new_owner: main.address,
                response_destination: borrower.address,
                custom_payload: null,
                forward_amount: 0n,
                forward_payload: beginCell().endCell().asSlice(),
            },
        );
        const { owner_address } = await nft.getGetNftData();
        expect(owner_address).toEqualAddress(main.address);
        expect(deployResult.transactions).toHaveTransaction({
            from: borrower.address,
            to: main.address,
            deploy: true,
            success: true,
        });
    });
    it('should give money', async () => {
        {
            const {
                status,
                ownerAddresses: { moneyGiver },
            } = await main.getData();
            expect(status).toBe(4); // waiting for money
            expect(moneyGiver).toBeNull();
        }
        const { loanParams } = await main.getData();
        const { transactions } = await moneyGiverJetton.send(
            moneyGiver.getSender(),
            { value: toNano('0.15') },
            {
                $$type: 'TokenTransfer',
                query_id: 0n,
                amount: toNano(1),
                destination: main.address,
                response_destination: moneyGiver.address,
                custom_payload: null,
                forward_ton_amount: toNano(0.1),
                forward_payload: beginCell().storeUint(0, 1).storeRef(giveMoneyBody(loanParams)).endCell().asSlice(),
            },
        );
        // const { transactions } = await main.sendGiveLoan(moneyGiver.getSender(), toNano('1'));
        printTransactionFees(transactions);
        const {
            status,
            ownerAddresses: { moneyGiver: moneyGiverAddress },
        } = await main.getData();
        {
            const { balance } = await moneyGiverJetton.getGetWalletData();
            expect(balance).toBe(toNano(499));
        }
        {
            const { balance } = await mainJetton.getGetWalletData();
            expect(balance).toBe(toNano(0));
        }
        {
            const { balance } = await borrowerJetton.getGetWalletData();
            expect(balance).toBe(toNano(501));
        }
        expect(status).toBe(3); // in progress
        expect(moneyGiverAddress).toEqualAddress(moneyGiver.address);
    });
    it('should repay', async () => {
        const { loanParams } = await main.getData();
        // give the loan
        {
            const { transactions } = await moneyGiverJetton.send(
                moneyGiver.getSender(),
                { value: toNano('0.15') },
                {
                    $$type: 'TokenTransfer',
                    query_id: 0n,
                    amount: toNano(1),
                    destination: main.address,
                    response_destination: moneyGiver.address,
                    custom_payload: null,
                    forward_ton_amount: toNano(0.1),
                    forward_payload: beginCell()
                        .storeUint(0, 1)
                        .storeRef(giveMoneyBody(loanParams))
                        .endCell()
                        .asSlice(),
                },
            );
            const { balance } = await moneyGiverJetton.getGetWalletData();
            expect(balance).toBe(toNano(499));
            const { status } = await main.getData();
            expect(status).toBe(3); // in progress
        }
        blockchain.now = 25;
        const { transactions } = await borrowerJetton.send(
            borrower.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'TokenTransfer',
                query_id: 0n,
                amount: toNano('1.01'),
                destination: main.address,
                response_destination: borrower.address,
                custom_payload: null,
                forward_ton_amount: toNano('0.2') + 1n,
                forward_payload: beginCell()
                    .storeUint(0, 1)
                    .storeRef(repayBody(beginCell().endCell(), 1n))
                    .endCell()
                    .asSlice(),
            },
        );
        // const { transactions } = await main.sendRepayLoan(borrower.getSender(), {
        //     value: toNano('1.06') + 1n,
        //     forwardPayload: beginCell().storeStringTail('repayment succees').endCell(),
        //     forwardAmount: 1n,
        // });
        printTransactionFees(transactions);
        expect(transactions).toHaveTransaction({
            from: mainJetton.address,
            to: main.address,
            success: true,
        });

        {
            const { balance } = await moneyGiverJetton.getGetWalletData();
            expect(balance).toBe(toNano(500.01));
            const { balance: balanceBorrower } = await borrowerJetton.getGetWalletData();
            expect(balanceBorrower).toBe(toNano(499.99));
            const { balance: balanceMain } = await mainJetton.getGetWalletData();
            expect(balanceMain).toBe(0n);
        }
        const { owner_address } = await nft.getGetNftData();
        expect(owner_address).toEqualAddress(borrower.address);
    });
});
