# TON NFT Loans — Product Specification

**Version:** 1.0  
**Date:** 2026-04-28  
**Course:** Artificial Intelligence Lab CSAI362 — CSAI 2026 Spring

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [User Stories](#2-user-stories)
3. [Use Cases](#3-use-cases)
4. [Functional Requirements](#4-functional-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [BDD Scenarios](#6-bdd-scenarios)
7. [Architecture by Levels (C4)](#7-architecture-by-levels-c4)

---

## 1. Executive Summary

### Problem Statement

Owners of NFTs on the TON blockchain often need liquidity but do not want to sell their digital assets. At the same time, crypto holders look for ways to earn yield beyond passive holding. Traditional lending markets require trust in a centralised intermediary — a single point of failure that can freeze funds, misappropriate collateral, or become insolvent.

### Solution

**TON NFT Loans** is a fully on-chain, trustless lending platform. Borrowers lock their NFT inside a smart contract that acts as a self-enforcing escrow; lenders deposit funds directly into a verified on-chain "trusted wallet" contract. No intermediary ever touches either party's assets. The terms of every loan — amount, duration, interest rate, token — are written into the contract at creation time and cannot be changed unilaterally.

### Core Value Propositions

| Stakeholder | Value |
|---|---|
| Borrower | Get instant crypto liquidity without selling the NFT; recover it by repaying on time |
| Lender | Earn fixed interest secured by a real on-chain asset; funds never leave the blockchain |
| Platform | Fully permissionless — no KYC, no custody, no backend wallets |

---

## 2. User Stories

### US-01 — Borrower: Secure Collateralised Loan

> As an NFT owner who needs liquidity, I need to be able to lock my NFT as collateral and receive a crypto loan directly into my wallet, knowing that my NFT is held inside an immutable smart contract that no one — not even the platform developers — can access or transfer without my repayment or my explicit cancellation.

**Acceptance criteria:**
- The NFT is transferred to the loan contract, not to any third party
- The loan amount, duration, and interest rate are set by the borrower before any lender joins
- The borrower can cancel and retrieve the NFT at any time before the loan is funded
- Once funded, the NFT is released only when the full repayment (principal + interest) is received

---

### US-02 — Lender: Trustless Yield on Crypto

> As a crypto holder who wants to earn interest, I need to be able to browse open loan requests, verify that the collateral NFT is genuinely locked on-chain, fund a loan from my verified trusted wallet contract, and be certain that if the borrower does not repay on time, I can claim the NFT — all without trusting the borrower or the platform.

**Acceptance criteria:**
- Lender can see all open loan requests with NFT metadata, amount, duration, and interest rate
- Lender can verify the NFT is currently held by the loan contract (not the borrower)
- Lender funds from a dedicated on-chain trusted wallet, never a hot EOA
- If the borrower repays, the lender automatically receives principal + interest
- If the borrower defaults, the lender can trigger NFT withdrawal

---

### US-03 — Lender: Non-Custodial Offer System

> As a lender, I need to be able to pre-create loan offers for specific loan contracts — specifying the exact amount, duration, interest, and token I am willing to lend — so that borrowers can browse and accept my offer without me being online at that moment, and without my funds leaving my trusted wallet until the offer is accepted on-chain.

**Acceptance criteria:**
- Offers are stored in the lender's on-chain bank contract, not off-chain
- Funds remain in the lender's wallet until the borrower explicitly accepts the offer
- Offers can be cancelled by the lender at any time before acceptance
- Accepted offers trigger an atomic on-chain transfer of funds to the loan contract

---

### US-04 — Borrower: Multi-Token Loan Support

> As a borrower, I need to choose whether I want my loan in TON (the native currency) or in a supported stablecoin (e.g., USDT), so that I can avoid exposure to TON price volatility and plan my repayment in stable terms.

**Acceptance criteria:**
- At loan creation the borrower selects TON, USDT, or another whitelisted token
- The loan contract stores the token's jetton wallet address, not just the master
- Repayment must be made in the same token the loan was funded in
- The UI correctly parses token decimals (USDT = 6, TON = 9)

---

### US-05 — Both Parties: Transparent On-Chain State

> As either a borrower or a lender, I need to be able to inspect the current state of any loan contract at any time — what token is locked, what the repayment amount is, who the parties are, and when the loan started — so that I can make informed decisions without relying on any off-chain database.

**Acceptance criteria:**
- The loan detail page reads live data directly from the TON blockchain
- If the indexed (cached) data is stale, the system automatically re-fetches from chain
- All addresses link to a block explorer (Tonviewer) for independent verification
- NFT titles link to GetGems so the lender can assess collateral value

---

### US-06 — Borrower: Safe NFT Collateral

> As a borrower, I need confidence that my NFT cannot be stolen even if the lender or platform is malicious, because the smart contract only releases the NFT when I repay in full — or returns it to me if I cancel before funding — so that I can use the platform without counterparty risk.

**Acceptance criteria:**
- The loan smart contract code hash is verified on every interaction
- The contract only allows NFT withdrawal by the lender after the loan period expires without repayment
- Cancellation before funding returns the NFT to the borrower's address, not any third party
- The contract is immutable once deployed (no admin upgrade keys)

---

## 3. Use Cases

### UC-01: Create Loan Contract

**Actor:** Borrower  
**Preconditions:** Wallet connected; borrower owns the NFT  
**Main Flow:**
1. Borrower selects an NFT from their wallet
2. Borrower sets loan amount, duration (days), interest rate (% per day), and token (TON/USDT/NOT)
3. System computes the loan contract address deterministically (from borrower address + NFT + params)
4. System resolves the jetton wallet address for the loan contract (for non-TON loans)
5. Borrower signs two transactions: deploy the loan contract + transfer the NFT to it
6. System polls the chain until the contract is deployed
7. Borrower is redirected to the loan detail page

**Alternative Flow A — User cancels before signing:** No on-chain state changes.  
**Alternative Flow B — Contract not deployed within timeout:** User is notified; the NFT transfer can be retried.

---

### UC-02: Fund a Loan Directly

**Actor:** Lender  
**Preconditions:** Loan is in `WAITING_FOR_FUNDS` status; lender has sufficient balance  
**Main Flow:**
1. Lender opens the loan detail page
2. Lender verifies NFT, amount, duration, interest
3. Lender clicks "Fund"
4. For TON loans: lender sends `amount + gas` TON to the contract
5. For jetton loans: lender sends a jetton transfer to their own jetton wallet, forwarding `giveMoneyBody` to the loan contract
6. Contract changes status to `IN_PROGRESS`, records lender address and start timestamp

---

### UC-03: Accept a Pre-Created Offer

**Actor:** Borrower  
**Preconditions:** Loan is in `WAITING_FOR_FUNDS`; at least one valid offer exists  
**Main Flow:**
1. Borrower views offers on the loan detail page
2. System verifies each offer on-chain (terms match, funds available, not expired)
3. Borrower clicks "Accept" on a specific offer
4. System resolves the loan's jetton wallet address for the offer token
5. Borrower signs `acceptOffer` transaction referencing the bank contract and loan params
6. Bank contract atomically transfers funds to the loan contract
7. Loan transitions to `IN_PROGRESS`

---

### UC-04: Repay Loan

**Actor:** Borrower  
**Preconditions:** Loan is `IN_PROGRESS`; borrower has sufficient token balance  
**Main Flow:**
1. Borrower opens loan page; sees total repayment (principal + interest × days)
2. Borrower clicks "Repay"
3. For TON: sends `totalRepayment + gas` TON to contract
4. For jetton: sends jetton transfer from borrower's wallet to borrower's jetton wallet, forwarding `repayBody` to loan contract
5. Contract releases NFT to borrower, sends repayment to lender
6. Loan transitions to `REPAYED`

---

### UC-05: Withdraw NFT After Default

**Actor:** Lender  
**Preconditions:** Loan is `IN_PROGRESS`; loan duration has expired; repayment not received  
**Main Flow:**
1. Lender opens loan page; sees "Defaulted" status
2. Lender clicks "Withdraw NFT"
3. Contract verifies duration expired and no repayment received
4. Contract transfers NFT to lender address
5. Loan transitions to `NOT_REPAYED`

---

### UC-06: Create/Cancel Offer

**Actor:** Lender  
**Main Flow (Create):**
1. Lender navigates to loan page
2. Lender fills offer form: amount, duration, interest, token, expiry
3. Lender signs `addOffer` transaction against their bank contract
4. Offer is stored on-chain in the bank contract and indexed in the backend

**Main Flow (Cancel):**
1. Lender clicks "Remove" on their existing offer
2. Lender signs `removeOffer` transaction
3. Offer is removed from bank contract; backend marks it inactive

---

## 4. Functional Requirements

### FR-01 — Loan Contract Lifecycle
- The system SHALL support the following loan states: `NOT_INITIALIZED`, `WAITING_FOR_FUNDS`, `IN_PROGRESS`, `REPAYED`, `NOT_REPAYED`, `CANCELLED`
- State transitions SHALL be enforced exclusively by the on-chain smart contract

### FR-02 — Token Support
- The system SHALL support TON (native), USDT (6 decimals), and NOT (9 decimals) as loan currencies
- The system SHALL correctly scale amounts by each token's decimals at all input and display points
- The system SHALL resolve the loan contract's own jetton wallet address before deploying, using `get_wallet_address` on the master contract

### FR-03 — Offer System
- Lenders SHALL be able to create, browse, and cancel offers without the borrower being online
- Offer validity SHALL be verified on-chain before the borrower can accept
- The system SHALL check: offer exists, terms match, not expired, lender balance is sufficient

### FR-04 — Indexing and Caching
- A backend indexer SHALL cache loan and offer data from the blockchain into a PostgreSQL database
- The frontend SHALL detect stale or unresolved data and trigger a backend refresh automatically
- If the backend token data is `Undefined token`, the frontend SHALL retry resolution from the API

### FR-05 — Block Explorer Integration
- Every address (borrower, lender, token) SHALL link to `tonviewer.com` (or `testnet.tonviewer.com`)
- Every NFT title SHALL link to `getgems.io/collection/{collection}/{nft}` (or testnet equivalent)
- Every collection name SHALL link to `getgems.io/collection/{collection}`

### FR-06 — Network Support
- The system SHALL support both TON Mainnet and Testnet
- The user SHALL be able to toggle between networks from the header
- All chain reads, smart contract addresses, and API calls SHALL use the correct network configuration

### FR-07 — Wallet Integration
- The system SHALL integrate with TON wallets via TonConnect 2.0
- The system SHALL NOT require any server-side wallet or custody of user funds

---

## 5. Non-Functional Requirements

### NFR-01 — Security
- Smart contract code hash SHALL be verified on every interaction (no impersonation)
- No private keys or API secrets SHALL be committed to version control
- All user funds are held exclusively in user-owned on-chain contracts

### NFR-02 — Performance
- Loan list pages SHALL load within 3 seconds on a standard connection (data served from indexed DB)
- On-chain reads SHALL complete within 10 seconds under normal TON network conditions

### NFR-03 — Availability
- The backend indexer SHALL retry failed chain reads with exponential backoff
- The frontend SHALL degrade gracefully if the backend is unavailable (show chain data directly)

### NFR-04 — Usability
- The UI SHALL display human-readable amounts using correct token decimals at all times
- Unknown tokens SHALL display as `???` with a tonviewer link rather than crashing
- The UI SHALL be responsive and usable on mobile screen widths

### NFR-05 — Testability
- All business logic (amount scaling, token matching, loan state transitions) SHALL be unit-testable without a live blockchain connection
- BDD scenarios SHALL map 1-to-1 to implemented test cases

---

## 6. BDD Scenarios

### Feature: Create Loan Contract

```gherkin
Scenario: Borrower creates a TON loan
  Given the borrower has a connected TON wallet
  And the borrower owns NFT "Apes #42"
  When the borrower selects the NFT and sets amount=10 TON, duration=7 days, interest=1%/day
  And the borrower submits the form
  Then the system resolves a deterministic contract address
  And two transactions are sent: deploy contract + transfer NFT
  And the borrower is redirected to the loan detail page
  And the loan status is "WAITING_FOR_FUNDS"

Scenario: Borrower creates a USDT loan
  Given the borrower selects USDT as the loan currency
  When the borrower submits the form with amount=100 USDT
  Then the system calls get_wallet_address on the USDT master contract with the loan address as owner
  And the loan contract is deployed with the resolved jetton wallet address, not the master address
  And the stored amount uses 6 decimal places (100 USDT = 100_000_000 base units)
```

### Feature: Fund a Loan

```gherkin
Scenario: Lender funds a TON loan directly
  Given a loan is in WAITING_FOR_FUNDS status with amount=10 TON
  And the lender has 15 TON in their wallet
  When the lender clicks "Fund"
  Then the system sends amount + 0.1 TON gas to the loan contract
  And the loan status changes to IN_PROGRESS
  And the lender address is recorded in the contract

Scenario: Lender funds a USDT loan directly
  Given a loan is in WAITING_FOR_FUNDS status with amount=100 USDT
  When the lender clicks "Fund"
  Then the system resolves the lender's USDT jetton wallet address
  And sends a jetton transfer carrying giveMoneyBody as the forward payload
  And the loan status changes to IN_PROGRESS
```

### Feature: Repay Loan

```gherkin
Scenario: Borrower repays a TON loan on time
  Given a loan is IN_PROGRESS with principal=10 TON, interest=1%/day, duration=7 days
  And 3 days have elapsed since the loan started
  When the borrower clicks "Repay"
  Then the total repayment is calculated as 10 + (10 × 0.01 × 7) = 10.7 TON
  And the transaction sends 10.7 + 0.1 TON gas to the contract
  And the loan status changes to REPAYED
  And the NFT is returned to the borrower

Scenario: Borrower repays a USDT loan
  Given a loan is IN_PROGRESS denominated in USDT
  When the borrower clicks "Repay"
  Then the system resolves the borrower's USDT jetton wallet address
  And sends a jetton transfer with repayBody as the forward payload
  And the NFT is returned to the borrower
```

### Feature: Token Resolution

```gherkin
Scenario: Token is known (USDT)
  Given a loan has jettonAddress pointing to a USDT wallet
  When the frontend resolves the token
  Then the token symbol displayed is "USDT"
  And the decimals used are 6
  And the token name links to tonviewer

Scenario: Token is unknown locally but resolved by backend
  Given a loan has a jettonAddress the frontend cannot match to a known jetton
  And the backend has resolved it as tokenSymbol="USDT", tokenDecimals=6
  When the frontend displays the loan
  Then it falls back to the backend token data
  And displays "USDT" with correct decimals

Scenario: Token is completely unresolved
  Given a loan has a jettonAddress that neither frontend nor backend can resolve
  When the frontend displays the loan
  Then the token symbol is displayed as "???"
  And a tonviewer link is shown for the jetton wallet address
```

### Feature: Offer Validity Check

```gherkin
Scenario: Valid offer can be accepted
  Given an offer exists in the lender's bank contract
  And the offer terms match the loan parameters
  And the offer has not expired
  And the lender's bank balance >= offered amount
  When the borrower views the offer
  Then the offer is marked as fundable
  And the "Accept" button is enabled

Scenario: Expired offer cannot be accepted
  Given an offer's expiration timestamp is in the past
  When the borrower views the offer
  Then the offer is marked as not fundable with reason "Offer is expired on-chain"
  And the "Accept" button is disabled

Scenario: Offer with insufficient balance cannot be accepted
  Given a lender's bank TON balance is less than the offered amount + gas reserve
  When the borrower views the offer
  Then the offer is marked as not fundable with reason containing "balance is below"
```

### Feature: NFT Default / Lender Claim

```gherkin
Scenario: Lender claims NFT after borrower defaults
  Given a loan is IN_PROGRESS
  And the loan duration has expired without repayment
  When the lender clicks "Withdraw NFT"
  Then the contract transfers the NFT to the lender address
  And the loan status changes to NOT_REPAYED

Scenario: Lender cannot claim NFT before duration expires
  Given a loan is IN_PROGRESS
  And the loan duration has NOT yet expired
  When the lender attempts to withdraw the NFT
  Then the transaction is rejected by the contract
  And the NFT remains with the loan contract
```

---

## 7. Architecture by Levels (C4)

### Level 1 — System Context

```
┌─────────────────────────────────────────────────────────────┐
│                        TON NFT Loans                        │
│                                                             │
│  ┌──────────┐    uses    ┌───────────────────────────────┐  │
│  │ Borrower │───────────▶│     Web Application (React)   │  │
│  └──────────┘            └──────────────┬────────────────┘  │
│                                         │                   │
│  ┌──────────┐    uses                   │ reads/writes      │
│  │  Lender  │───────────────────────────┘                   │
│  └──────────┘                           │                   │
│                               ┌─────────▼──────────┐        │
│                               │  Backend Indexer   │        │
│                               │  (Node.js + PG)    │        │
│                               └─────────┬──────────┘        │
│                                         │ reads              │
│                               ┌─────────▼──────────┐        │
│                               │   TON Blockchain   │        │
│                               │  (smart contracts) │        │
│                               └────────────────────┘        │
└─────────────────────────────────────────────────────────────┘

External systems:
  - TON Blockchain (Mainnet / Testnet)
  - TonConnect 2.0 (wallet bridge)
  - TonAPI (NFT metadata, account balances)
  - Toncenter (on-chain read/write via JSON-RPC)
  - GetGems (NFT marketplace — linked for collateral inspection)
  - Tonviewer (block explorer — linked for all addresses)
```

---

### Level 2 — Containers

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (User Device)                                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Frontend SPA (React + Vite + TailwindCSS)               │  │
│  │                                                          │  │
│  │  • Pages: Home, Get Loan, Give Loan, Loan Detail,        │  │
│  │           Profile                                        │  │
│  │  • Hooks: useLoan, useBankContract, useMainContract,     │  │
│  │           useTokenPrices, useNetwork                     │  │
│  │  • Wallet: TonConnect UI React                           │  │
│  │  • Chain reads: @ton/ton TonClient (Toncenter RPC)       │  │
│  └────────────────────┬────────┬─────────────────────────┘  │
│                       │ REST   │ TonConnect                  │
└───────────────────────┼────────┼─────────────────────────────┘
                        │        │
            ┌───────────▼──┐  ┌──▼──────────────┐
            │   Backend    │  │  User's TON      │
            │  REST API    │  │  Wallet App      │
            │  (Node.js /  │  │  (Tonkeeper etc) │
            │   Express)   │  └─────────────────-┘
            └───────┬──────┘
                    │ SQL
            ┌───────▼──────┐
            │  PostgreSQL  │
            │  Database    │
            └───────┬──────┘
                    │ (indexer reads)
            ┌───────▼──────────────────────────────────┐
            │          TON Blockchain                  │
            │                                          │
            │  ┌────────────┐  ┌──────────────────┐   │
            │  │ Main (Loan)│  │ Bank (Trusted     │   │
            │  │  Contract  │  │  Wallet) Contract │   │
            │  └────────────┘  └──────────────────┘   │
            │  ┌────────────┐  ┌──────────────────┐   │
            │  │  Jetton    │  │  NFT Contract    │   │
            │  │  Wallet    │  │  (TEP-62)        │   │
            │  └────────────┘  └──────────────────┘   │
            └──────────────────────────────────────────┘
```

---

### Level 3 — Components

#### Frontend Components

```
frontend/src/
├── pages/
│   ├── Home           — stats overview, hero CTA
│   ├── GetLoan        — NFT picker + loan parameters form
│   ├── GiveLoan       — loan browser + filter
│   ├── Loan           — loan detail, params card, actions, offers
│   └── Profile        — wallet management, active loans, offers
│
├── components/
│   ├── Header         — nav, network toggle, wallet connect
│   ├── loan/
│   │   ├── LoanActionsCard  — repay / fund / cancel / withdraw buttons
│   │   └── LoanOffersCard   — offer list + create offer form
│   └── bank/
│       ├── BankTonSection   — TON deposit/withdraw
│       ├── BankJettonsSection — jetton balances
│       └── BankNftsSection  — NFTs in bank
│
├── hooks/
│   ├── useMainContract   — deployLoan, sendGiveLoan, sendRepayLoan, ...
│   ├── useBankContract   — bank CRUD, getJettonWalletAddress, ...
│   ├── useLoan           — full loan page state machine
│   ├── useBankData       — profile-page bank state
│   ├── useTokenPrices    — CoinGecko price feed
│   └── useNetwork        — mainnet/testnet toggle + config
│
└── hooks/contracts/
    ├── Main.ts   — loan contract wrapper (TEP: custom)
    ├── Bank.ts   — bank contract wrapper
    ├── utils.ts  — jetton transfer builder, TonClient factory,
    │               resolveJettonWalletAddress
    └── nft.ts    — NFT transfer builder
```

#### Backend Components

```
backend/src/
├── server.ts      — Express HTTP server
│                    GET  /api/loans   — filtered loan list
│                    GET  /api/offers  — filtered offer list
│                    GET  /api/stats   — aggregated stats
│                    POST /api/refresh/loan  — force re-index a loan
│                    POST /api/refresh/bank  — force re-index a bank
│
├── refresh.ts     — refreshLoan(), refreshBank()
│                    reads chain state → upserts to PostgreSQL
│
├── chain.ts       — thin wrappers over @ton/ton
│                    getLoanData, getBankData, getNftMeta,
│                    getVerifiedJettonMaster, getJettonWalletAddress
│
├── token-cache.ts — resolveTokenWallet()
│                    1. getVerifiedJettonMaster (on-chain verification)
│                    2. USDT-specific fallback (get_wallet_address)
│                    3. general whitelist loop
│                    4. cache result in token_wallets table
│
├── tokens.ts      — TOKEN_DEFINITIONS (TON, USDT, NOT)
│                    getWhitelistedTokens(), findWhitelistedToken()
│
├── db.ts          — PostgreSQL connection pool
└── config.ts      — network config, RPC URLs, TonAPI URL
```

#### Smart Contracts (On-Chain)

```
Main (Loan) Contract
  State: status, nftAddress, jettonAddress, borrowerAddress,
         moneyGiverAddress, loanParams, startedAt
  Messages accepted:
    OP_DEPLOY          (0x94f712fc) — set jetton wallet, activate
    OP_GIVE_MONEY      (0x94f712fe) — lender funds loan (TON or jetton forward)
    OP_REPAY_LOAN      (0x94f712fa) — borrower repays (TON or jetton forward)
    OP_CANCEL_BEFORE_START (0x94f712ff) — borrower cancels, NFT returned
    OP_CHANGE_LOAN_PARAMS  (0x94f712fd) — borrower updates params pre-funding
    OP_ACCEPT_OFFER    (0x94f712f0) — borrower accepts bank offer
    OP_LOAN_NOT_REPAYED_WITHDRAW_NFT (0x94f712fb) — lender claims after default

Bank (Trusted Wallet) Contract
  State: owner, offers (dict<loanAddress, BankOffer>), ton_balance
  Each BankOffer: loanParams, expirationDate, jettonWallet (optional)
  Messages accepted:
    add_offer    — lender creates an offer for a specific loan
    remove_offer — lender cancels an offer
    withdraw_ton — lender withdraws TON balance
    withdraw_jetton — lender withdraws jetton balance
    withdraw_nft — lender withdraws an NFT received as default collateral
```

---

*All source code is available at: [GitHub repository link]*
