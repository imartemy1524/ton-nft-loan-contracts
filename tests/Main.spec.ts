import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import { Main } from '../wrappers/Main';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { NftItem } from '../build/Nft/tact_NftItem';
import { deployNft } from './_utils';

describe('Main', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('Main');
    });

    let blockchain: Blockchain;
    let borrower: SandboxContract<TreasuryContract>;
    let moneyGiver: SandboxContract<TreasuryContract>;
    let main: SandboxContract<Main>;
    let nft: SandboxContract<NftItem>;
    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = 1;
        moneyGiver = await blockchain.treasury('moneyGiver');
        borrower = await blockchain.treasury('deployer');
        nft = await deployNft(blockchain, borrower);
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

        const deployResult = await main.sendDeploy(borrower.getSender(), toNano('0.05'), null);
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
        const { transactions } = await main.sendGiveLoan(moneyGiver.getSender(), toNano('1'), loanParams);
        printTransactionFees(transactions);
        const {
            status,
            ownerAddresses: { moneyGiver: moneyGiverAddress },
        } = await main.getData();
        expect(status).toBe(3); // in progress
        expect(moneyGiverAddress).toEqualAddress(moneyGiver.address);
    });
    it('should change load params before start', async () => {
        const { loanParams: oldParams } = await main.getData();
        {
            expect(oldParams.amount).toBe(toNano('1'));
            expect(oldParams.duration).toBe(86400 * 7);
            expect(oldParams.interestPerDay.nominator).toBe(1);
            expect(oldParams.interestPerDay.denominator).toBe(100);
        }
        const newParams = {
            interestPerDay: { nominator: 2, denominator: 100 },
            duration: 86400 * 14,
            amount: toNano('2'),
        };
        const { transactions } = await main.sendChangeLoanParams(borrower.getSender(), newParams);
        printTransactionFees(transactions);
        const { loanParams } = await main.getData();
        expect(loanParams.amount).toBe(newParams.amount);
        expect(loanParams.duration).toBe(newParams.duration);
        expect(loanParams.interestPerDay.nominator).toBe(newParams.interestPerDay.nominator);
        expect(loanParams.interestPerDay.denominator).toBe(newParams.interestPerDay.denominator);
        // should not start if loan params mismatch
        {
            const { transactions } = await main.sendGiveLoan(moneyGiver.getSender(), toNano('1'), oldParams);
            expect(transactions).toHaveTransaction({
                to: main.address,
                success: false,
                exitCode: 142,
            });
        }
    });
    it('should withdraw NFT before start', async () => {
        {
            const { owner_address } = await nft.getGetNftData();
            expect(owner_address).toEqualAddress(main.address);
        }
        const { transactions } = await main.sendCancelBeforeStart(borrower.getSender());
        printTransactionFees(transactions);
        const { owner_address } = await nft.getGetNftData();
        expect(owner_address).toEqualAddress(borrower.address);
        const { status } = await main.getData();
        expect(status).toBe(5); // cancelled
    });
    it('should deploy', async () => {
        const { loanParams } = await main.getData();
        await main.sendGiveLoan(moneyGiver.getSender(), toNano('1'), loanParams);
        const data = await main.getData();
        expect(data.ownerAddresses.moneyGiver).toEqualAddress(moneyGiver.address);
        expect(data.ownerAddresses.borrower).toEqualAddress(borrower.address);
        // the check is done inside beforeEach
        // blockchain and main are ready to use
    });
    it('should repay', async () => {
        const { loanParams } = await main.getData();
        await main.sendGiveLoan(moneyGiver.getSender(), toNano('1'), loanParams);
        blockchain.now = 25;
        const { transactions } = await main.sendRepayLoan(borrower.getSender(), {
            value: toNano('1.06') + 1n,
            forwardPayload: beginCell().storeStringTail('repayment succees').endCell(),
            forwardAmount: 1n,
        });
        expect(transactions).toHaveTransaction({
            from: borrower.address,
            to: main.address,
            success: true,
        });
        expect(transactions).toHaveTransaction({
            from: main.address,
            to: moneyGiver.address,
            success: true,
            value: (i) => i! > toNano('1.01'),
        });
        printTransactionFees(transactions);
        const { owner_address } = await nft.getGetNftData();
        expect(owner_address).toEqualAddress(borrower.address);
    });
    it('should withdraw NFT not repayed', async () => {
        {
            const { owner_address } = await nft.getGetNftData();
            expect(owner_address).toEqualAddress(main.address);
        }
        const { loanParams } = await main.getData();
        await main.sendGiveLoan(moneyGiver.getSender(), toNano('1'), loanParams);
        blockchain.now = 86400 * 7 + 30;
        const { transactions } = await main.sendWithdrawNftNotRepaid(moneyGiver.getSender());
        expect(transactions).toHaveTransaction({
            to: main.address,
            success: true,
        });
        const { owner_address } = await nft.getGetNftData();
        expect(owner_address).toEqualAddress(moneyGiver.address);
    });
});
