import { useTonConnectUI } from '@tonconnect/ui-react';
import { Address, beginCell, Cell, Sender, SenderArguments, storeStateInit, toNano } from '@ton/core';
import { giveMoneyBody, LoanStatus, Main, MainConfig, repayBody } from './contracts/Main';
import { contractCode } from './contracts/code';
import { buildJettonTransfer, createTonClient, resolveJettonWalletAddress } from './contracts/utils';
import { buildNftTransferBody } from './contracts/nft';
import { useNetwork } from '../network';

export type LoanParams = MainConfig['loanParams'];

export function useMainContract() {
    const [tonConnectUI] = useTonConnectUI();
    const { network } = useNetwork();
    const tonclient = createTonClient(network);

    const sender: Sender = {
        send: async (args: SenderArguments) => {
            await tonConnectUI.sendTransaction({
                validUntil: Math.floor(Date.now() / 1000) + 360,
                messages: [
                    {
                        address: args.to.toString(),
                        amount: args.value.toString(),
                        payload: args.body?.toBoc().toString('base64'),
                        stateInit: args.init
                            ? beginCell().storeWritable(storeStateInit(args.init)).endCell().toBoc().toString('base64')
                            : undefined,
                    },
                ],
            });
        },
    };

    const deployLoanContract = async (
        nftAddress: Address,
        borrowerAddress: Address,
        loanParams: LoanParams,
        jettonAddress: Address | null,
    ) => {
        const config: MainConfig = {
            status: LoanStatus.NOT_INITIALIZED,
            nftAddress,
            jettonAddress: null,
            ownerAddresses: {
                moneyGiver: null,
                borrower: borrowerAddress,
            },
            loanParams,
            startedAt: 0,
        };

        const contract = Main.createFromConfig(config, contractCode);

        // Resolve the loan's own jetton wallet address (not the master or the owner's wallet).
        // The loan contract address is deterministic from the config above (jettonAddress: null),
        // so we can derive the child wallet before sending any transaction.
        let loanJettonWallet: Address | null = null;
        if (jettonAddress) {
            loanJettonWallet = await resolveJettonWalletAddress(tonclient, jettonAddress, contract.address);
        }

        const deployBody = beginCell().storeUint(0x94f712fc, 32).storeAddress(loanJettonWallet).endCell();

        const deployInit = beginCell()
            .storeWritable(storeStateInit(contract.init!))
            .endCell()
            .toBoc()
            .toString('base64');

        const nftTransferBody = buildNftTransferBody(contract.address, borrowerAddress);

        await tonConnectUI.sendTransaction({
            validUntil: Math.floor(Date.now() / 1000) + 360,
            messages: [
                {
                    address: contract.address.toString(),
                    amount: toNano('0.05').toString(),
                    payload: deployBody.toBoc().toString('base64'),
                    stateInit: deployInit,
                },
                {
                    address: nftAddress.toString(),
                    amount: toNano('0.05').toString(),
                    payload: nftTransferBody.toBoc().toString('base64'),
                },
            ],
        });

        // Poll until the contract appears on-chain
        for (let i = 0; i < 60; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            if (await tonclient.isContractDeployed(contract.address)) break;
        }

        return contract.address;
    };

    const sendGiveLoan = async (
        contractAddress: string,
        loanParams: LoanParams,
        jetton?: { walletAddress: string; responseAddress: string },
        ownerAddress?: Address | null,
    ) => {
        if (jetton) {
            await sender.send({
                to: Address.parse(jetton.walletAddress),
                value: toNano('0.25'),
                body: buildJettonTransfer({
                    amount: loanParams.amount,
                    destination: Address.parse(contractAddress),
                    responseDestination: Address.parse(jetton.responseAddress),
                    forwardAmount: toNano('0.2') + 1n,
                    forwardPayload: giveMoneyBody(loanParams, ownerAddress ?? null),
                }),
            });
            return;
        }
        const contract = tonclient.open(Main.createFromAddress(Address.parse(contractAddress)));
        await contract.sendGiveLoan(sender, loanParams.amount, loanParams);
    };

    const sendRepayLoan = async (
        contractAddress: string,
        value: bigint,
        jetton?: {
            walletAddress: string;
            responseAddress: string;
        },
    ) => {
        if (jetton) {
            await sender.send({
                to: Address.parse(jetton.walletAddress),
                value: toNano('0.25'),
                body: buildJettonTransfer({
                    amount: value,
                    destination: Address.parse(contractAddress),
                    responseDestination: Address.parse(jetton.responseAddress),
                    forwardAmount: toNano('0.2') + 1n,
                    forwardPayload: repayBody(beginCell().endCell(), 1n),
                }),
            });
            return;
        }

        const contract = tonclient.open(Main.createFromAddress(Address.parse(contractAddress)));
        await contract.sendRepayLoan(sender, {
            value: value + toNano('0.1'),
            forwardPayload: beginCell().storeStringTail('Repaying loan').endCell(),
            forwardAmount: 1n,
        });
    };

    const sendChangeLoanParams = async (contractAddress: string, newParams: LoanParams) => {
        const contract = tonclient.open(Main.createFromAddress(Address.parse(contractAddress)));
        await contract.sendChangeLoanParams(sender, newParams);
    };

    const sendCancelBeforeStart = async (contractAddress: string) => {
        const contract = tonclient.open(Main.createFromAddress(Address.parse(contractAddress)));
        await contract.sendCancelBeforeStart(sender);
    };

    const sendWithdrawNftNotRepaid = async (contractAddress: string) => {
        const contract = tonclient.open(Main.createFromAddress(Address.parse(contractAddress)));
        await contract.sendWithdrawNftNotRepaid(sender);
    };

    const sendAcceptOffer = async (
        contractAddress: string,
        bankAddress: string,
        loanParams: LoanParams,
        jettonAddress: Address | null = null,
    ) => {
        const contract = tonclient.open(Main.createFromAddress(Address.parse(contractAddress)));
        await contract.sendAcceptOffer(sender, Address.parse(bankAddress), loanParams, jettonAddress);
    };

    const ensureLoanContractCode = async (contractAddress: string) => {
        const state = await tonclient.getContractState(Address.parse(contractAddress));
        const codeHash = state.code ? Cell.fromBoc(state.code)[0]?.hash().toString('hex') : null;
        const expectedHash = contractCode.hash().toString('hex');
        if (codeHash !== expectedHash) {
            throw new Error(
                `Address is not a supported loan contract: code hash ${codeHash ?? 'missing'} does not match ${expectedHash}`,
            );
        }
    };

    const getData = async (contractAddress: string) => {
        await ensureLoanContractCode(contractAddress);
        const contract = tonclient.open(Main.createFromAddress(Address.parse(contractAddress)));
        return await contract.getData();
    };

    return {
        deployLoanContract,
        sendGiveLoan,
        sendRepayLoan,
        sendChangeLoanParams,
        sendCancelBeforeStart,
        sendWithdrawNftNotRepaid,
        sendAcceptOffer,
        getData,
    };
}
