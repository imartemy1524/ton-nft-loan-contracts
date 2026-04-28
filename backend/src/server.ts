import cors from 'cors';
import express from 'express';
import { z } from 'zod';
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

function mapOffer(row: Record<string, unknown>) {
    return {
        id: `${row.bank_address}:${row.loan_address}`,
        network: row.network,
        bankAddress: row.bank_address,
        ownerAddress: row.owner_address,
        loanAddress: row.loan_address,
        amount: row.amount,
        duration: row.duration,
        interestNominator: row.interest_nominator,
        interestDenominator: row.interest_denominator,
        expirationDate: String(row.expiration_date),
        jettonWallet: row.jetton_wallet,
        active: row.active,
        updatedAt: row.updated_at,
    };
}

function mapLoan(row: Record<string, unknown>) {
    return {
        network: row.network,
        address: row.address,
        status: row.status,
        nftAddress: row.nft_address,
        jettonAddress: row.jetton_address,
        borrowerAddress: row.borrower_address,
        moneyGiverAddress: row.money_giver_address,
        amount: row.amount,
        duration: row.duration,
        interestNominator: row.interest_nominator,
        interestDenominator: row.interest_denominator,
        startedAt: String(row.started_at),
        nftName: row.nft_name,
        nftImage: row.nft_image,
        nftCollection: row.nft_collection,
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
                params.push(value);
                where.push(`${column} = $${params.length}`);
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
            ['borrowerAddress', 'l.borrower_address'],
            ['moneyGiverAddress', 'l.money_giver_address'],
            ['nftAddress', 'l.nft_address'],
        ] as const) {
            const value = req.query[queryKey];
            if (typeof value === 'string' && value) {
                params.push(value);
                where.push(`${column} = $${params.length}`);
            }
        }

        if (typeof req.query.status === 'string' && req.query.status !== '') {
            params.push(Number(req.query.status));
            where.push(`l.status = $${params.length}`);
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
                    coalesce(o.offers_count, 0) as offers_count,
                    o.best_offer_amount
                from loans l
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

        res.json({ loans: result.rows.map(mapLoan) });
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
