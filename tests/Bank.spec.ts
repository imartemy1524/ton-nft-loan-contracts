import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, fromNano, toNano } from '@ton/core';
import { Cell } from '@ton/core';
import { Main, LoanStatus } from '../wrappers/Main';
import { Bank } from '../wrappers/Bank';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { NftItem } from '../build/Nft/tact_NftItem';
import { JettonMaster } from '../build/Jetton/tact_JettonMaster';
import { JettonWallet } from '../build/Jetton/tact_JettonWallet';
import { deployNft, deployJetton } from './_utils';
import { giveMoneyBody } from '../wrappers/Main';

const LOAN_PARAMS = {
    interestPerDay: { nominator: 1, denominator: 100 },
    duration: 86400 * 7,
    amount: toNano('1'),
};

const EXPIRATION_FAR_FUTURE = BigInt(86400 * 365 * 10); // 10 years from now

// helpers
async function getBankData(bank: SandboxContract<Bank>) {
    return await bank.getData();
}

async function getOffer(bank: SandboxContract<Bank>, loanAddress: Address) {
    return (await bank.getData()).offers.get(loanAddress) ?? null;
}

async function getJettonBalance(wallet: SandboxContract<JettonWallet>) {
    try {
        return (await wallet.getGetWalletData()).balance;
    } catch (error) {
        if (error instanceof Error && error.message.includes('non-active contract')) {
            return 0n;
        }
        throw error;
    }
}

async function deployLoan(
    blockchain: Blockchain,
    code: Cell,
    borrower: SandboxContract<TreasuryContract>,
    nft: SandboxContract<NftItem>,
    jettonWalletAddress?: SandboxContract<JettonWallet>,
) {
    const main = blockchain.openContract(
        Main.createFromConfig(
            {
                ownerAddresses: { moneyGiver: null, borrower: borrower.address },
                loanParams: LOAN_PARAMS,
                startedAt: 0,
                jettonAddress: null,
                nftAddress: nft.address,
                status: 0,
            },
            code,
        ),
    );

    await main.sendDeploy(
        borrower.getSender(),
        toNano('0.05'),
        jettonWalletAddress?.address ?? null,
    );

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
    return main;
}

describe('Bank — TON loans', () => {
    let loanCode: Cell;
    let bankCode: Cell;

    beforeAll(async () => {
        [loanCode, bankCode] = await Promise.all([compile('Main'), compile('Bank')]);
    });

    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let borrower: SandboxContract<TreasuryContract>;
    let stranger: SandboxContract<TreasuryContract>;
    let bank: SandboxContract<Bank>;
    let loan: SandboxContract<Main>;
    let nft: SandboxContract<NftItem>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = 1000;

        owner = await blockchain.treasury('owner');
        borrower = await blockchain.treasury('borrower');
        stranger = await blockchain.treasury('stranger');

        nft = await deployNft(blockchain, borrower);

        bank = blockchain.openContract(
            Bank.createFromConfig({ owner: owner.address }, bankCode),
        );
        // Fund bank with enough TON to give a loan
        await bank.sendDeploy(owner.getSender(), toNano('10'));

        loan = await deployLoan(blockchain, loanCode, borrower, nft);
    });

    // ── Deployment ──────────────────────────────────────────────────────────

    it('deploys and stores owner', async () => {
        const { owner: storedOwner } = await getBankData(bank);
        expect(storedOwner).toEqualAddress(owner.address);
        const { balance } = await blockchain.getContract(bank.address);
        expect(+fromNano(balance)).toBeCloseTo(10)
    });

    // ── AddOffer ────────────────────────────────────────────────────────────

    it('owner can add an offer', async () => {
        await bank.sendAddOffer(
            owner.getSender(),
            loan.address,
            LOAN_PARAMS,
            EXPIRATION_FAR_FUTURE,
        );
        const offer = await getOffer(bank, loan.address);
        expect(offer).not.toBeNull();
        expect(offer!.loanParams.amount).toBe(LOAN_PARAMS.amount);
        expect(offer!.loanParams.duration).toBe(LOAN_PARAMS.duration);
        expect(offer!.loanParams.interestPerDay.nominator).toBe(LOAN_PARAMS.interestPerDay.nominator);
        expect(offer!.loanParams.interestPerDay.denominator).toBe(LOAN_PARAMS.interestPerDay.denominator);
        expect(offer!.expirationDate).toBe(EXPIRATION_FAR_FUTURE);
    });

    it('non-owner cannot add offer', async () => {
        const { transactions } = await bank.sendAddOffer(
            stranger.getSender(),
            loan.address,
            LOAN_PARAMS,
            EXPIRATION_FAR_FUTURE,
        );
        expect(transactions).toHaveTransaction({
            to: bank.address,
            success: false,
            exitCode: 150, // bankNotOwnerError
        });
    });

    // ── RemoveOffer ─────────────────────────────────────────────────────────

    it('owner can remove an offer', async () => {
        await bank.sendAddOffer(owner.getSender(), loan.address, LOAN_PARAMS, EXPIRATION_FAR_FUTURE);
        expect(await getOffer(bank, loan.address)).not.toBeNull();

        await bank.sendRemoveOffer(owner.getSender(), loan.address);
        expect(await getOffer(bank, loan.address)).toBeNull();
    });

    it('non-owner cannot remove offer', async () => {
        await bank.sendAddOffer(owner.getSender(), loan.address, LOAN_PARAMS, EXPIRATION_FAR_FUTURE);
        const { transactions } = await bank.sendRemoveOffer(stranger.getSender(), loan.address);
        expect(transactions).toHaveTransaction({
            to: bank.address,
            success: false,
            exitCode: 150, // bankNotOwnerError
        });
    });

    // ── Full AcceptOffer flow (TON loan) ────────────────────────────────────

    it('borrower can accept a bank offer (TON loan, full flow)', async () => {
        // 1. Bank owner creates an offer for this specific loan
        await bank.sendAddOffer(owner.getSender(), loan.address, LOAN_PARAMS, EXPIRATION_FAR_FUTURE);
        expect(await getOffer(bank, loan.address)).not.toBeNull();

        const borrowerBalanceBefore = await borrower.getBalance();

        // 2. Borrower accepts the offer on the loan contract
        const { transactions } = await loan.sendAcceptOffer(
            borrower.getSender(),
            bank.address,
            LOAN_PARAMS,
        );
        printTransactionFees(transactions);

        // Loan → Bank: BankRequestFunds
        expect(transactions).toHaveTransaction({
            from: loan.address,
            to: bank.address,
            success: true,
        });
        // Bank → Loan: GiveFunds (with loan amount attached)
        expect(transactions).toHaveTransaction({
            from: bank.address,
            to: loan.address,
            success: true,
            value: (v) => v! >= LOAN_PARAMS.amount,
        });
        // Loan → Borrower: loan started notification with carry-all balance
        expect(transactions).toHaveTransaction({
            from: loan.address,
            to: borrower.address,
            success: true,
            value: (v) => v! >= LOAN_PARAMS.amount,
        });

        // Loan status must be IN_PROGRESS
        const data = await loan.getData();
        expect(data.status).toBe(LoanStatus.IN_PROGRESS);
        // moneyGiver is the separate bank wallet that owns the bank contract.
        expect(data.ownerAddresses.moneyGiver).toEqualAddress(owner.address);

        // Borrower must have received at least the loan amount net of gas
        const borrowerBalanceAfter = await borrower.getBalance();
        expect(borrowerBalanceAfter - borrowerBalanceBefore).toBeGreaterThan(
            LOAN_PARAMS.amount - toNano('0.15'),
        );

        // Offer was consumed
        expect(await getOffer(bank, loan.address)).toBeNull();
    });

    it('bank rejects request if loan params mismatch', async () => {
        const differentParams = { ...LOAN_PARAMS, amount: toNano('2') };
        await bank.sendAddOffer(owner.getSender(), loan.address, differentParams, EXPIRATION_FAR_FUTURE);

        // Borrower tries to accept with wrong params (original LOAN_PARAMS, not differentParams)
        const { transactions } = await loan.sendAcceptOffer(
            borrower.getSender(),
            bank.address,
            LOAN_PARAMS,
        );
        expect(transactions).toHaveTransaction({
            from: loan.address,
            to: bank.address,
            success: false,
            exitCode: 153, // bankOfferMismatchError
        });
    });

    it('bank rejects request if offer not found', async () => {
        // No offer added — bank has empty dict
        const { transactions } = await loan.sendAcceptOffer(
            borrower.getSender(),
            bank.address,
            LOAN_PARAMS,
        );
        expect(transactions).toHaveTransaction({
            from: loan.address,
            to: bank.address,
            success: false,
            exitCode: 151, // bankOfferNotFoundError
        });
    });

    it('bank rejects expired offer', async () => {
        const expiredAt = BigInt(blockchain.now! - 1); // already expired
        await bank.sendAddOffer(owner.getSender(), loan.address, LOAN_PARAMS, expiredAt);

        const { transactions } = await loan.sendAcceptOffer(
            borrower.getSender(),
            bank.address,
            LOAN_PARAMS,
        );
        expect(transactions).toHaveTransaction({
            from: loan.address,
            to: bank.address,
            success: false,
            exitCode: 152, // bankOfferExpiredError
        });
    });

    it('only borrower can call AcceptOffer on loan', async () => {
        await bank.sendAddOffer(owner.getSender(), loan.address, LOAN_PARAMS, EXPIRATION_FAR_FUTURE);

        const { transactions } = await loan.sendAcceptOffer(
            stranger.getSender(), // not the borrower
            bank.address,
            LOAN_PARAMS,
        );
        expect(transactions).toHaveTransaction({
            to: loan.address,
            success: false,
            exitCode: 5,
        });
    });

    // ── WithdrawTon ─────────────────────────────────────────────────────────

    it('owner can withdraw TON', async () => {
        const ownerBalanceBefore = await owner.getBalance();
        const { transactions } = await bank.sendWithdrawTon(owner.getSender(), toNano('5'));
        expect(transactions).toHaveTransaction({ from: bank.address, to: owner.address, success: true });
        expect(await owner.getBalance()).toBeGreaterThan(ownerBalanceBefore + toNano('4.9'));
    });

    it('non-owner cannot withdraw TON', async () => {
        const { transactions } = await bank.sendWithdrawTon(stranger.getSender(), toNano('1'));
        expect(transactions).toHaveTransaction({
            to: bank.address,
            success: false,
            exitCode: 150,
        });
    });

    // ── WithdrawNft ─────────────────────────────────────────────────────────

    it('owner can withdraw NFT from bank', async () => {
        const bankNftOwner = await blockchain.treasury('bankNftOwner');
        const bankNft = await deployNft(blockchain, bankNftOwner);

        // First send NFT to bank
        await bankNft.send(
            bankNftOwner.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'Transfer',
                query_id: 1n,
                new_owner: bank.address,
                response_destination: bankNftOwner.address,
                custom_payload: null,
                forward_amount: 0n,
                forward_payload: beginCell().endCell().asSlice(),
            },
        );
        expect((await bankNft.getGetNftData()).owner_address).toEqualAddress(bank.address);

        const { transactions } = await bank.sendWithdrawNft(owner.getSender(), bankNft.address);
        expect(transactions).toHaveTransaction({
            from: bank.address,
            to: bankNft.address,
            success: true,
        });
        expect((await bankNft.getGetNftData()).owner_address).toEqualAddress(owner.address);
    });

    // ── External: RemoveExpiredOffer ─────────────────────────────────────────

    it('anyone can remove expired offer via external message', async () => {
        const expiredAt = BigInt(blockchain.now! +5);
        await bank.sendAddOffer(owner.getSender(), loan.address, LOAN_PARAMS, expiredAt);
        expect(await getOffer(bank, loan.address)).not.toBeNull();
        blockchain.now = Number(expiredAt+1n)
        await bank.sendRemoveExpiredOffer(loan.address);
        expect(await getOffer(bank, loan.address)).toBeNull();
    });

    it('cannot externally remove non-expired offer', async () => {
        await bank.sendAddOffer(owner.getSender(), loan.address, LOAN_PARAMS, EXPIRATION_FAR_FUTURE);

        await expect(bank.sendRemoveExpiredOffer(loan.address)).rejects.toThrow();
    });

    it('external removal fails if offer not found', async () => {
        await expect(bank.sendRemoveExpiredOffer(loan.address)).rejects.toThrow();
    });
});

describe('Bank — Jetton loans', () => {
    let loanCode: Cell;
    let bankCode: Cell;

    beforeAll(async () => {
        [loanCode, bankCode] = await Promise.all([compile('Main'), compile('Bank')]);
    });

    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let borrower: SandboxContract<TreasuryContract>;
    let bank: SandboxContract<Bank>;
    let loan: SandboxContract<Main>;
    let nft: SandboxContract<NftItem>;
    let jettonMaster: SandboxContract<JettonMaster>;
    let ownerJetton: SandboxContract<JettonWallet>;
    let borrowerJetton: SandboxContract<JettonWallet>;
    let bankJetton: SandboxContract<JettonWallet>;
    let loanJetton: SandboxContract<JettonWallet>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = 1000;

        owner = await blockchain.treasury('owner');
        borrower = await blockchain.treasury('borrower');

        nft = await deployNft(blockchain, borrower);
        jettonMaster = await deployJetton(blockchain, owner);

        ownerJetton = blockchain.openContract(
            JettonWallet.fromAddress(await jettonMaster.getGetWalletAddress(owner.address))!,
        );
        borrowerJetton = blockchain.openContract(
            JettonWallet.fromAddress(await jettonMaster.getGetWalletAddress(borrower.address))!,
        );

        bank = blockchain.openContract(
            Bank.createFromConfig({ owner: owner.address }, bankCode),
        );
        await bank.sendDeploy(owner.getSender(), toNano('5'));

        bankJetton = blockchain.openContract(
            JettonWallet.fromAddress(await jettonMaster.getGetWalletAddress(bank.address))!,
        );

        // Deploy loan with jetton address = loan's own jetton wallet
        // We need the loan address first so we can compute its jetton wallet
        loan = blockchain.openContract(
            Main.createFromConfig(
                {
                    ownerAddresses: { moneyGiver: null, borrower: borrower.address },
                    loanParams: LOAN_PARAMS,
                    startedAt: 0,
                    jettonAddress: null,
                    nftAddress: nft.address,
                    status: 0,
                },
                loanCode,
            ),
        );
        loanJetton = blockchain.openContract(
            JettonWallet.fromAddress(await jettonMaster.getGetWalletAddress(loan.address))!,
        );

        // Deploy loan, setting jettonAddress = loan's own jetton wallet
        await loan.sendDeploy(borrower.getSender(), toNano('0.05'), loanJetton.address);
        await nft.send(
            borrower.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'Transfer',
                query_id: 0n,
                new_owner: loan.address,
                response_destination: borrower.address,
                custom_payload: null,
                forward_amount: 0n,
                forward_payload: beginCell().endCell().asSlice(),
            },
        );

        // Deposit jettons into the bank (so it can lend them)
        await ownerJetton.send(
            owner.getSender(),
            { value: toNano('0.1') },
            {
                $$type: 'TokenTransfer',
                query_id: 0n,
                amount: toNano(100),
                destination: bank.address,
                response_destination: owner.address,
                custom_payload: null,
                forward_ton_amount: 1n,
                forward_payload: beginCell().storeUint(0, 1).endCell().asSlice(),
            },
        );
        expect((await bankJetton.getGetWalletData()).balance).toBe(toNano(100));
    });

    it('borrower can accept a bank offer (jetton loan, full flow)', async () => {
        // Bank owner adds offer specifying bank's jetton wallet
        await bank.sendAddOffer(
            owner.getSender(),
            loan.address,
            LOAN_PARAMS,
            EXPIRATION_FAR_FUTURE,
            bankJetton.address, // bank's jetton wallet for this offer
        );

        const borrowerJettonBefore = await getJettonBalance(borrowerJetton);

        // Borrower accepts the offer
        const { transactions } = await loan.sendAcceptOffer(
            borrower.getSender(),
            bank.address,
            LOAN_PARAMS,
        );
        printTransactionFees(transactions);

        // Loan → Bank: BankRequestFunds
        expect(transactions).toHaveTransaction({
            from: loan.address,
            to: bank.address,
            success: true,
        });
        // Bank → bankJetton wallet: JettonTransfer
        expect(transactions).toHaveTransaction({
            from: bank.address,
            to: bankJetton.address,
            success: true,
        });
        // bankJetton → loanJetton: tokens moved
        expect(transactions).toHaveTransaction({
            from: bankJetton.address,
            to: loanJetton.address,
            success: true,
        });
        // loanJetton → loan: TokenNotification with GiveFunds payload
        expect(transactions).toHaveTransaction({
            from: loanJetton.address,
            to: loan.address,
            success: true,
        });
        // loan → borrowerJetton: tokens forwarded to borrower
        expect(transactions).toHaveTransaction({
            from: loanJetton.address,
            to: borrowerJetton.address,
            success: true,
        });

        // Loan must be IN_PROGRESS
        const data = await loan.getData();
        expect(data.status).toBe(LoanStatus.IN_PROGRESS);
        expect(data.ownerAddresses.moneyGiver).toEqualAddress(owner.address);

        // Borrower received the jettons
        const borrowerJettonAfter = await getJettonBalance(borrowerJetton);
        expect(borrowerJettonAfter - borrowerJettonBefore).toBe(LOAN_PARAMS.amount);

        // Bank's jetton balance reduced
        const bankJettonBalance = (await bankJetton.getGetWalletData()).balance;
        expect(bankJettonBalance).toBe(toNano(100) - LOAN_PARAMS.amount);

        // Offer was consumed
        expect(await getOffer(bank, loan.address)).toBeNull();
    });

    it('owner can withdraw jettons', async () => {
        const ownerBalanceBefore = (await ownerJetton.getGetWalletData()).balance;

        const { transactions } = await bank.sendWithdrawJetton(
            owner.getSender(),
            bankJetton.address,
            toNano(50),
        );
        expect(transactions).toHaveTransaction({
            from: bank.address,
            to: bankJetton.address,
            success: true,
        });
        const ownerBalanceAfter = (await ownerJetton.getGetWalletData()).balance;
        expect(ownerBalanceAfter - ownerBalanceBefore).toBe(toNano(50));
    });
});
