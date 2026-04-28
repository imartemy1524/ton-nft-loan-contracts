import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { Address } from '@ton/core';
import { parseNetwork } from './config.js';
import { initDb, pool } from './db.js';
import { refreshBank, refreshLoan } from './refresh.js';

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true }));
app.use(express.json());

const refreshSchema = z.object({
    address: z.string().min(1),
    network: z.enum(['mainnet', 'testnet']).optional(),
});

function networkFromQuery(value: unknown) {
    return parseNetwork(typeof value === 'string' ? value : process.env.DEFAULT_NETWORK);
}

function normalizeAddress(address: string | null): string | null {
    if (!address) return null;
    try {
        return Address.parse(address).toString();
    } catch {
        return address;
    }
}

function mapOffer(row: Record<string, unknown>) {
    return {
        id: `${row.bank_address}:${row.loan_address}`,
        network: row.network,
        bankAddress: normalizeAddress(String(row.bank_address)),
        ownerAddress: normalizeAddress(String(row.owner_address)),
        loanAddress: normalizeAddress(String(row.loan_address)),
        amount: row.amount,
        duration: row.duration,
        interestNominator: row.interest_nominator,
        interestDenominator: row.interest_denominator,
        expirationDate: String(row.expiration_date),
        jettonWallet: normalizeAddress(row.jetton_wallet ? String(row.jetton_wallet) : null),
        jettonAddress: normalizeAddress(row.jetton_address ? String(row.jetton_address) : null),
        tokenSymbol: row.token_symbol ?? (row.jetton_wallet ? 'Undefined token' : 'TON'),
        tokenName: row.token_name ?? (row.jetton_wallet ? 'Undefined token' : 'Toncoin'),
        tokenDecimals: Number(row.token_decimals ?? 9),
        active: row.active,
        updatedAt: row.updated_at,
    };
}

function mapLoan(row: Record<string, unknown>) {
    return {
        network: row.network,
        address: normalizeAddress(String(row.address)),
        status: row.status,
        nftAddress: normalizeAddress(String(row.nft_address)),
        jettonAddress: normalizeAddress(row.jetton_address ? String(row.jetton_address) : null),
        borrowerAddress: normalizeAddress(String(row.borrower_address)),
        moneyGiverAddress: normalizeAddress(row.money_giver_address ? String(row.money_giver_address) : null),
        amount: row.amount,
        duration: row.duration,
        interestNominator: row.interest_nominator,
        interestDenominator: row.interest_denominator,
        startedAt: String(row.started_at),
        nftName: row.nft_name,
        nftDescription: row.nft_description,
        nftImage: row.nft_image,
        nftCollection: row.nft_collection,
        nftCollectionAddress: normalizeAddress(row.nft_collection_address ? String(row.nft_collection_address) : null),
        codeHash: row.code_hash,
        valid: row.valid,
        tokenAddress: normalizeAddress(row.token_address ? String(row.token_address) : null),
        tokenSymbol: row.token_symbol ?? (row.jetton_address ? 'Undefined token' : 'TON'),
        tokenName: row.token_name ?? (row.jetton_address ? 'Undefined token' : 'Toncoin'),
        tokenDecimals: Number(row.token_decimals ?? 9),
        offersCount: Number(row.offers_count ?? 0),
        bestOfferAmount: row.best_offer_amount,
        updatedAt: row.updated_at,
    };
}

app.get('/health', (_req, res) => {
    res.json({ ok: true });
});

app.post('/api/refresh/loan', async (req, res, next) => {
    try {
        const input = refreshSchema.parse(req.body);
        const loan = await refreshLoan(parseNetwork(input.network), input.address);
        res.json({ loan });
    } catch (error) {
        next(error);
    }
});

app.post('/api/refresh/bank', async (req, res, next) => {
    try {
        const input = refreshSchema.parse(req.body);
        const bank = await refreshBank(parseNetwork(input.network), input.address);
        res.json({ bank });
    } catch (error) {
        next(error);
    }
});

app.get('/api/offers', async (req, res, next) => {
    try {
        const network = networkFromQuery(req.query.network);
        const params: unknown[] = [network];
        const where = ['network = $1'];

        for (const [queryKey, column] of [
            ['loanAddress', 'loan_address'],
            ['bankAddress', 'bank_address'],
            ['ownerAddress', 'owner_address'],
        ] as const) {
            const value = req.query[queryKey];
            if (typeof value === 'string' && value) {
                const normalizedValue = normalizeAddress(value);
                if (normalizedValue) {
                    params.push(normalizedValue);
                    where.push(`${column} = $${params.length}`);
                }
            }
        }

        if (req.query.active !== 'false') {
            where.push('active = true');
        }

        const limit = Math.min(Number(req.query.limit || 100), 250);
        params.push(limit);

        const result = await pool.query(
            `
                select *
                from offers
                where ${where.join(' and ')}
                order by updated_at desc
                limit $${params.length}
            `,
            params,
        );
        res.json({ offers: result.rows.map(mapOffer) });
    } catch (error) {
        next(error);
    }
});

app.get('/api/loans', async (req, res, next) => {
    try {
        const network = networkFromQuery(req.query.network);
        const params: unknown[] = [network];
        const where = ['l.network = $1'];

        for (const [queryKey, column] of [
            ['loanAddress', 'l.address'],
            ['borrowerAddress', 'l.borrower_address'],
            ['moneyGiverAddress', 'l.money_giver_address'],
            ['nftAddress', 'l.nft_address'],
            ['collectionAddress', 'l.nft_collection_address'],
        ] as const) {
            const value = req.query[queryKey];
            if (typeof value === 'string' && value) {
                const normalizedValue = normalizeAddress(value);
                if (normalizedValue) {
                    params.push(normalizedValue);
                    where.push(`${column} = $${params.length}`);
                }
            }
        }

        if (typeof req.query.collection === 'string' && req.query.collection) {
            params.push(`%${req.query.collection}%`);
            where.push(`(l.nft_collection ilike $${params.length} or l.nft_collection_address ilike $${params.length})`);
        }

        if (typeof req.query.status === 'string' && req.query.status !== '') {
            params.push(Number(req.query.status));
            where.push(`l.status = $${params.length}`);
        }

        if (req.query.includeInvalid !== 'true') {
            where.push('l.valid = true');
        }

        if (req.query.hasOffers === 'true') {
            where.push('coalesce(o.offers_count, 0) > 0');
        }

        const limit = Math.min(Number(req.query.limit || 100), 250);
        params.push(limit);

        const result = await pool.query(
            `
                select
                    l.*,
                    tw.master_address as token_address,
                    tw.token_symbol,
                    tw.token_name,
                    tw.token_decimals,
                    coalesce(o.offers_count, 0) as offers_count,
                    o.best_offer_amount
                from loans l
                left join token_wallets tw
                    on tw.network = l.network
                    and tw.owner_address = l.address
                    and tw.wallet_address = l.jetton_address
                left join (
                    select
                        network,
                        loan_address,
                        count(*) as offers_count,
                        min(amount::numeric)::text as best_offer_amount
                    from offers
                    where active = true
                    group by network, loan_address
                ) o on o.network = l.network and o.loan_address = l.address
                where ${where.join(' and ')}
                order by l.updated_at desc
                limit $${params.length}
            `,
            params,
        );

        const loans = result.rows.map(mapLoan);
        
        // Trigger async refresh for loans with null jettonAddress
        const loansToRefresh = result.rows.filter((row) => !row.jetton_address);
        if (loansToRefresh.length > 0) {
            Promise.all(loansToRefresh.map((row) => refreshLoan(network, row.address).catch((err) => {
                console.warn(`Failed to refresh loan ${row.address}:`, err);
            }))).catch((err) => {
                console.warn('Error refreshing loans with null jettonAddress:', err);
            });
        }

        res.json({ loans });
    } catch (error) {
        next(error);
    }
});

app.get('/api/stats', async (req, res, next) => {
    try {
        const network = networkFromQuery(req.query.network);
        const counts = await pool.query(
            `
                select
                    count(*)::int as total_loans,
                    count(*) filter (where status = 3)::int as active_loans,
                    count(distinct nft_address) filter (where status in (3, 4))::int as nfts_locked
                from loans
                where network = $1 and valid = true
            `,
            [network],
        );
        const volumes = await pool.query(
            `
                select
                    token_symbol,
                    token_name,
                    token_decimals,
                    sum(amount)::text as amount
                from (
                    select
                        l.amount::numeric as amount,
                        coalesce(tw.token_symbol, case when l.jetton_address is null then 'TON' else 'Undefined token' end) as token_symbol,
                        coalesce(tw.token_name, case when l.jetton_address is null then 'Toncoin' else 'Undefined token' end) as token_name,
                        coalesce(tw.token_decimals, 9) as token_decimals
                    from loans l
                    left join token_wallets tw
                        on tw.network = l.network
                        and tw.owner_address = l.address
                        and tw.wallet_address = l.jetton_address
                    where l.network = $1
                        and l.valid = true
                        and (l.jetton_address is null or tw.master_address is not null)
                ) normalized
                group by token_symbol, token_name, token_decimals
                order by sum(amount) desc
            `,
            [network],
        );

        const row = counts.rows[0] ?? {};
        res.json({
            stats: {
                network,
                totalLoans: Number(row.total_loans ?? 0),
                activeLoans: Number(row.active_loans ?? 0),
                nftsLocked: Number(row.nfts_locked ?? 0),
                totalVolume: volumes.rows.map((volume) => ({
                    tokenSymbol: volume.token_symbol,
                    tokenName: volume.token_name,
                    tokenDecimals: Number(volume.token_decimals ?? 9),
                    amount: volume.amount ?? '0',
                })),
            },
        });
    } catch (error) {
        next(error);
    }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    res.status(400).json({ error: message });
});

const port = Number(process.env.PORT || 3001);

await initDb();
app.listen(port, () => {
    console.log(`Backend listening on :${port}`);
});
