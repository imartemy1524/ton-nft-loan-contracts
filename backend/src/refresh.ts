import { Address } from '@ton/core';
import { pool } from './db.js';
import { getAccountBalance, getBankData, getLoanData, getNftMeta } from './chain.js';
import { Network } from './config.js';

export async function refreshLoan(network: Network, address: string) {
    const parsedAddress = Address.parse(address).toString();
    const data = await getLoanData(network, parsedAddress);
    const nft = await getNftMeta(network, data.nftAddress.toString());

    const row = {
        network,
        address: parsedAddress,
        status: data.status,
        nftAddress: data.nftAddress.toString(),
        jettonAddress: data.jettonAddress?.toString() ?? null,
        borrowerAddress: data.ownerAddresses.borrower.toString(),
        moneyGiverAddress: data.ownerAddresses.moneyGiver?.toString() ?? null,
        amount: data.loanParams.amount.toString(),
        duration: data.loanParams.duration,
        interestNominator: data.loanParams.interestPerDay.nominator,
        interestDenominator: data.loanParams.interestPerDay.denominator,
        startedAt: data.startedAt,
        nftName: nft.name,
        nftImage: nft.image,
        nftCollection: nft.collection,
    };

    await pool.query(
        `
            insert into loans (
                network, address, status, nft_address, jetton_address, borrower_address,
                money_giver_address, amount, duration, interest_nominator,
                interest_denominator, started_at, nft_name, nft_image, nft_collection, updated_at
            )
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
            on conflict (network, address) do update set
                status = excluded.status,
                nft_address = excluded.nft_address,
                jetton_address = excluded.jetton_address,
                borrower_address = excluded.borrower_address,
                money_giver_address = excluded.money_giver_address,
                amount = excluded.amount,
                duration = excluded.duration,
                interest_nominator = excluded.interest_nominator,
                interest_denominator = excluded.interest_denominator,
                started_at = excluded.started_at,
                nft_name = excluded.nft_name,
                nft_image = excluded.nft_image,
                nft_collection = excluded.nft_collection,
                updated_at = now()
        `,
        [
            row.network,
            row.address,
            row.status,
            row.nftAddress,
            row.jettonAddress,
            row.borrowerAddress,
            row.moneyGiverAddress,
            row.amount,
            row.duration,
            row.interestNominator,
            row.interestDenominator,
            row.startedAt,
            row.nftName,
            row.nftImage,
            row.nftCollection,
        ],
    );

    return row;
}

export async function refreshBank(network: Network, address: string) {
    const bankAddress = Address.parse(address).toString();
    const data = await getBankData(network, bankAddress);
    const ownerAddress = data.owner.toString();
    const balance = await getAccountBalance(network, bankAddress).catch(async (error) => {
        console.warn(`Failed to refresh bank balance for ${bankAddress}:`, error);
        const cached = await pool.query(
            'select ton_balance from banks where network = $1 and address = $2',
            [network, bankAddress],
        );
        return BigInt(cached.rows[0]?.ton_balance ?? 0);
    });
    const seenLoans: string[] = [];

    await pool.query(
        `
            insert into banks (network, address, owner_address, ton_balance, updated_at)
            values ($1, $2, $3, $4, now())
            on conflict (network, address) do update set
                owner_address = excluded.owner_address,
                ton_balance = excluded.ton_balance,
                updated_at = now()
        `,
        [network, bankAddress, ownerAddress, balance.toString()],
    );

    for (const loanAddress of data.offers.keys()) {
        const offer = data.offers.get(loanAddress);
        if (!offer) continue;
        const loan = loanAddress.toString();
        seenLoans.push(loan);
        await pool.query(
            `
                insert into offers (
                    network, bank_address, owner_address, loan_address, amount, duration,
                    interest_nominator, interest_denominator, expiration_date, jetton_wallet,
                    active, updated_at
                )
                values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,now())
                on conflict (network, bank_address, loan_address) do update set
                    owner_address = excluded.owner_address,
                    amount = excluded.amount,
                    duration = excluded.duration,
                    interest_nominator = excluded.interest_nominator,
                    interest_denominator = excluded.interest_denominator,
                    expiration_date = excluded.expiration_date,
                    jetton_wallet = excluded.jetton_wallet,
                    active = true,
                    updated_at = now()
            `,
            [
                network,
                bankAddress,
                ownerAddress,
                loan,
                offer.loanParams.amount.toString(),
                offer.loanParams.duration,
                offer.loanParams.interestPerDay.nominator,
                offer.loanParams.interestPerDay.denominator,
                offer.expirationDate.toString(),
                offer.jettonWallet?.toString() ?? null,
            ],
        );

        try {
            await refreshLoan(network, loan);
        } catch {
            // The offer is still useful even if the loan get-method is unavailable.
        }
    }

    if (seenLoans.length > 0) {
        await pool.query(
            `
                update offers
                set active = false, updated_at = now()
                where network = $1 and bank_address = $2 and not (loan_address = any($3::text[]))
            `,
            [network, bankAddress, seenLoans],
        );
    } else {
        await pool.query(
            'update offers set active = false, updated_at = now() where network = $1 and bank_address = $2',
            [network, bankAddress],
        );
    }

    return {
        network,
        address: bankAddress,
        ownerAddress,
        tonBalance: balance.toString(),
        offersCount: seenLoans.length,
    };
}
