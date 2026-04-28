import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://ton:ton@localhost:5432/ton_nft_loan',
});

export async function initDb() {
    await pool.query(`
        create table if not exists loans (
            network text not null,
            address text not null,
            status integer not null,
            nft_address text not null,
            jetton_address text,
            borrower_address text not null,
            money_giver_address text,
            amount text not null,
            duration integer not null,
            interest_nominator integer not null,
            interest_denominator integer not null,
            started_at bigint not null,
            nft_name text,
            nft_image text,
            nft_collection text,
            updated_at timestamptz not null default now(),
            primary key (network, address)
        );

        create table if not exists banks (
            network text not null,
            address text not null,
            owner_address text not null,
            ton_balance text not null default '0',
            updated_at timestamptz not null default now(),
            primary key (network, address)
        );

        create table if not exists offers (
            network text not null,
            bank_address text not null,
            owner_address text not null,
            loan_address text not null,
            amount text not null,
            duration integer not null,
            interest_nominator integer not null,
            interest_denominator integer not null,
            expiration_date bigint not null,
            jetton_wallet text,
            active boolean not null default true,
            updated_at timestamptz not null default now(),
            primary key (network, bank_address, loan_address)
        );

        create index if not exists loans_network_status_idx on loans(network, status);
        create index if not exists loans_borrower_idx on loans(network, borrower_address);
        create index if not exists offers_loan_idx on offers(network, loan_address);
        create index if not exists offers_bank_idx on offers(network, bank_address);
        create index if not exists offers_owner_idx on offers(network, owner_address);
    `);
}
