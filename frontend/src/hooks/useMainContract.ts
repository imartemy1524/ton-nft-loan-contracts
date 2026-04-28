import { useTonConnectUI } from '@tonconnect/ui-react';
import { Address, beginCell, toNano, storeStateInit, Sender, SenderArguments } from '@ton/core';
import { Main, MainConfig, LoanStatus } from './contracts/Main';
import { contractCode } from './contracts/code';
import { createTonClient } from './contracts/utils';
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
                        stateInit:
                            args.init
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

        const deployBody = beginCell()
            .storeUint(0x94f712fc, 32)
            .storeAddress(jettonAddress)
            .endCell();

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

    const sendGiveLoan = async (contractAddress: string, loanParams: LoanParams) => {
        const contract = tonclient.open(Main.createFromAddress(Address.parse(contractAddress)));
        await contract.sendGiveLoan(sender, loanParams.amount + toNano('0.1'), loanParams);
    };

    const sendRepayLoan = async (contractAddress: string, value: bigint) => {
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

    const sendAcceptOffer = async (contractAddress: string, bankAddress: string, loanParams: LoanParams) => {
        const contract = tonclient.open(Main.createFromAddress(Address.parse(contractAddress)));
        await contract.sendAcceptOffer(sender, Address.parse(bankAddress), loanParams);
    };

    const getData = async (contractAddress: string) => {
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
