import { useCallback, useMemo } from 'react';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { Address, beginCell, Cell, Contract, ContractProvider, Sender, SenderArguments, storeStateInit, toNano, TupleItemSlice } from '@ton/core';
import { Bank, BankOffer } from './contracts/Bank';
import { LoanParams } from './contracts/Main';
import { bankCode } from './contracts/code';
import { buildJettonTransfer, createTonClient } from './contracts/utils';
import { useNetwork } from '../network';

export type BankJettonAsset = {
    walletAddress: string;
    masterAddress: string;
    symbol: string;
    name: string;
    decimals: number;
    balance: bigint;
};

export type BankNftAsset = {
    address: string;
    name: string;
    collection?: string;
};

function readAddress(value: unknown) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && 'address' in value) {
        return String((value as { address?: unknown }).address || '');
    }
    return '';
}

export function getBankContract(ownerAddress: string) {
    return Bank.createFromConfig({ owner: Address.parse(ownerAddress) }, bankCode);
}

class JettonWallet implements Contract {
    constructor(readonly address: Address) {}

    static createFromAddress(address: Address) {
        return new JettonWallet(address);
    }

    async getBalance(provider: ContractProvider) {
        const result = await provider.get('get_wallet_data', []);
        return result.stack.readBigNumber();
    }

    // TEP-74: get_wallet_data → (balance, owner, jetton_master, wallet_code)
    async getMasterAddress(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_wallet_data', []);
        result.stack.readBigNumber(); // balance
        result.stack.readAddress();   // owner
        return result.stack.readAddress(); // jetton_master
    }
}

class JettonMaster implements Contract {
    constructor(readonly address: Address) {}

    static createFromAddress(address: Address) {
        return new JettonMaster(address);
    }

    async getWalletAddress(provider: ContractProvider, ownerAddress: Address): Promise<Address> {
        const ownerSlice: TupleItemSlice = {
            type: 'slice',
            cell: beginCell().storeAddress(ownerAddress).endCell(),
        };
        const result = await provider.get('get_wallet_address', [ownerSlice]);
        return result.stack.readAddress();
    }
}

export function useBankContract() {
    const [tonConnectUI] = useTonConnectUI();
    const { config, network, isTestnet } = useNetwork();
    const tonclient = createTonClient(network);

    const tonapiBaseUrl = useMemo(() => config.tonapiUrl.replace(/\/$/, ''), [config.tonapiUrl]);

    const tonviewerUrl = useCallback(
        (address: string) => `${isTestnet ? 'https://testnet.tonviewer.com' : 'https://tonviewer.com'}/${address}`,
        [isTestnet],
    );

    const sendTransaction = useCallback(
        async (args: SenderArguments) => {
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
        [tonConnectUI],
    );

    const getBankAddress = useCallback((ownerAddress: string) => getBankContract(ownerAddress).address, []);

    const getBankBalance = useCallback(
        async (bankAddress: string) => {
            return tonclient.getBalance(Address.parse(bankAddress));
        },
        [tonclient],
    );

    const getBankJettons = useCallback(
        async (bankAddress: string): Promise<BankJettonAsset[]> => {
            const res = await fetch(`${tonapiBaseUrl}/accounts/${bankAddress}/jettons`);
            if (!res.ok) return [];
            const data = await res.json();
            const balances = (data.balances || []) as Array<Record<string, unknown>>;
            return balances
                .map((wallet) => {
                    const jetton = (wallet.jetton || wallet.jetton_master || {}) as Record<string, unknown>;
                    const metadata = (jetton.metadata || {}) as Record<string, unknown>;
                    const walletAddress = readAddress(wallet.wallet_address || wallet.address);
                    const masterAddress = readAddress(jetton.address || jetton.jetton_address || wallet.jetton_address);
                    const decimals = Number(metadata.decimals ?? jetton.decimals ?? 9);
                    return {
                        walletAddress,
                        masterAddress,
                        symbol: String(metadata.symbol || jetton.symbol || 'JETTON'),
                        name: String(metadata.name || jetton.name || 'Jetton'),
                        decimals: Number.isFinite(decimals) ? decimals : 9,
                        balance: BigInt(String(wallet.balance ?? 0)),
                    };
                })
                .filter((asset) => asset.walletAddress && asset.balance > 0n)
                .sort((a, b) => (a.balance === b.balance ? 0 : a.balance < b.balance ? 1 : -1))
                .slice(0, 3);
        },
        [tonapiBaseUrl],
    );

    const getJettonWalletBalance = useCallback(
        async (jettonWalletAddress: string) => {
            const wallet = tonclient.open(JettonWallet.createFromAddress(Address.parse(jettonWalletAddress)));
            return wallet.getBalance();
        },
        [tonclient],
    );

    const getJettonMasterAddress = useCallback(
        async (jettonWalletAddress: string): Promise<Address> => {
            const wallet = tonclient.open(JettonWallet.createFromAddress(Address.parse(jettonWalletAddress)));
            return wallet.getMasterAddress();
        },
        [tonclient],
    );

    const getBankNfts = useCallback(
        async (bankAddress: string): Promise<BankNftAsset[]> => {
            const res = await fetch(`${tonapiBaseUrl}/accounts/${bankAddress}/nfts?limit=3&indirect_ownership=false`);
            if (!res.ok) return [];
            const data = await res.json();
            const items = (data.nft_items || []) as Array<Record<string, unknown>>;
            return items
                .map((item) => {
                    const metadata = (item.metadata || {}) as Record<string, unknown>;
                    const collection = (item.collection || {}) as Record<string, unknown>;
                    return {
                        address: String(item.address || ''),
                        name: String(metadata.name || item.name || `NFT #${item.index ?? '?'}`),
                        collection: collection.name ? String(collection.name) : undefined,
                    };
                })
                .filter((asset) => asset.address)
                .slice(0, 3);
        },
        [tonapiBaseUrl],
    );

    const sendDepositTon = useCallback(
        async (ownerAddress: string, amount: string) => {
            const bank = getBankContract(ownerAddress);
            await sendTransaction({
                to: bank.address,
                value: toNano(amount),
                body: beginCell().storeUint(0, 32).storeStringTail('add').endCell(),
                init: bank.init,
            });
        },
        [sendTransaction],
    );

    const sender: Sender = useMemo(() => ({
        send: sendTransaction,
    }), [sendTransaction]);

    const sendWithdrawTon = useCallback(
        async (ownerAddress: string, amount: string) => {
            const bank = tonclient.open(getBankContract(ownerAddress));
            await bank.sendWithdrawTon(sender, toNano(amount));
        },
        [sender, tonclient],
    );

    const getJettonWalletAddress = useCallback(
        async (ownerAddress: string, jettonMasterAddress: string): Promise<Address> => {
            const master = tonclient.open(JettonMaster.createFromAddress(Address.parse(jettonMasterAddress)));
            return master.getWalletAddress(Address.parse(ownerAddress));
        },
        [tonclient],
    );

    const sendDepositJetton = useCallback(
        async (ownerAddress: string, jettonMasterAddress: string, amount: bigint) => {
            const bankAddress = getBankContract(ownerAddress).address;
            const userJettonWallet = await getJettonWalletAddress(ownerAddress, jettonMasterAddress);
            await sendTransaction({
                to: userJettonWallet,
                value: toNano('0.1'),
                body: buildJettonTransfer({
                    amount,
                    destination: bankAddress,
                    responseDestination: Address.parse(ownerAddress),
                    forwardAmount: 1n
                }),
            });
        },
        [sendTransaction, getJettonWalletAddress],
    );

    const sendAddOffer = useCallback(
        async (ownerAddress: string, loanAddress: string, loanParams: LoanParams, expirationDate: bigint, jettonWallet: Address | null = null) => {
            const bank = tonclient.open(getBankContract(ownerAddress));
            await bank.sendAddOffer(sender, Address.parse(loanAddress), loanParams, expirationDate, jettonWallet);
        },
        [sender, tonclient],
    );

    const sendRemoveOffer = useCallback(
        async (ownerAddress: string, loanAddress: string) => {
            const bank = tonclient.open(getBankContract(ownerAddress));
            await bank.sendRemoveOffer(sender, Address.parse(loanAddress));
        },
        [sender, tonclient],
    );

    const sendWithdrawJetton = useCallback(
        async (ownerAddress: string, jettonWallet: string, amount: bigint) => {
            const bank = tonclient.open(getBankContract(ownerAddress));
            await bank.sendWithdrawJetton(sender, Address.parse(jettonWallet), amount);
        },
        [sender, tonclient],
    );

    const sendWithdrawNft = useCallback(
        async (ownerAddress: string, nftAddress: string) => {
            const bank = tonclient.open(getBankContract(ownerAddress));
            await bank.sendWithdrawNft(sender, Address.parse(nftAddress));
        },
        [sender, tonclient],
    );

    const getData = useCallback(
        async (bankAddress: string) => {
            const bank = tonclient.open(Bank.createFromAddress(Address.parse(bankAddress)));
            return bank.getData();
        },
        [tonclient],
    );

    return {
        getBankAddress,
        getBankBalance,
        getBankJettons,
        getJettonWalletBalance,
        getJettonWalletAddress,
        getJettonMasterAddress,
        getBankNfts,
        tonviewerUrl,
        sendDepositTon,
        sendDepositJetton,
        sendWithdrawTon,
        sendWithdrawJetton,
        sendWithdrawNft,
        sendAddOffer,
        sendRemoveOffer,
        getData,
    };
}

export type { BankOffer };
