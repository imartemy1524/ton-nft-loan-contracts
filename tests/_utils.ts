import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { NftCollection } from '../build/Nft/tact_NftCollection';
import { NftItem } from '../build/Nft/tact_NftItem';
import { JettonMaster } from '../build/Jetton/tact_JettonMaster';
import { JettonWallet } from '../build/Jetton/tact_JettonWallet';

export async function deployNft(blockchain: Blockchain, owner: SandboxContract<TreasuryContract>) {
    const collection = blockchain.openContract(
        await NftCollection.fromInit(owner.address, Cell.EMPTY, {
            $$type: 'RoyaltyParams',
            numerator: 1n,
            denominator: 100n,
            destination: owner.address,
        }),
    );
    await collection.send(owner.getSender(), { value: toNano('0.15') }, 'Mint');
    const nftAddress = await collection.getGetNftAddressByIndex(0n);
    const ans = blockchain.openContract(NftItem.fromAddress(nftAddress!));
    const data = await ans.getGetNftData();
    return ans;
}

export async function deployJetton(
    blockchain: Blockchain,
    owner: SandboxContract<TreasuryContract>,
) {
    const master = blockchain.openContract(
        await JettonMaster.fromInit()
    )
    await master.send(owner.getSender(), {value: toNano("0.1")}, "mint");
    const ownerAddress = await master.getGetWalletAddress(owner.address);
    const jetton = blockchain.openContract(JettonWallet.fromAddress(ownerAddress!));
    const { balance } = await jetton.getGetWalletData();
    expect(balance).toBe(toNano(1000));
    return master;
}
