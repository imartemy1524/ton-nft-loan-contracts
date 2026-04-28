# TON NFT Loans

A decentralised peer-to-peer lending protocol on the TON blockchain where borrowers collateralise their NFTs to receive instant crypto loans (TON, USDT, or NOT) without selling their assets.

---

## How it Works

1. **Borrower** deploys a Loan smart contract, locking their NFT as collateral and specifying the desired loan amount, token, duration, and daily interest rate.
2. **Lender** reviews open loan requests and funds one by sending the requested amount (TON or Jetton).
3. **Borrower** repays principal + accrued interest before the deadline to reclaim the NFT.
4. If the borrower **defaults**, the lender can claim the collateral NFT automatically via the smart contract.

All logic is trustless and on-chain — neither party relies on a custodian.

---

## Repository Structure

```
contracts/       Tolk smart contracts (Main loan + Bank/wallet contracts)
wrappers/        TypeScript wrappers for contract deployment & interaction
tests/           Blueprint (Sandbox) integration tests for smart contracts
scripts/         Deployment & utility scripts
frontend/        React + Vite web application (TonConnect 2.0)
backend/         Node.js indexer — watches the chain and serves a REST API
docs/            Project documentation
  SPECIFICATION.md  Full specification (user stories, use cases, BDD scenarios, C4 architecture)
  TESTS.md          Test plan and test coverage description
```

---

## Smart Contracts

| Contract | Description |
|---|---|
| `Main` | Loan lifecycle: deploy → fund → repay / claim. Holds the NFT during the loan. |
| `Bank` | Trusted lender wallet that stores funds and accepts/manages loan offers. |

Contracts are written in **Tolk** and tested with Blueprint + Sandbox ([@ton/sandbox](https://github.com/ton-org/sandbox)).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contracts | Tolk, Blueprint, @ton/sandbox |
| Frontend | React 19, TypeScript, Vite, TailwindCSS, TonConnect 2.0 |
| Backend indexer | Node.js, TypeScript, PostgreSQL, TonAPI |
| Blockchain | TON (mainnet + testnet) |

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (for the backend database)

### Smart Contracts

```bash
# Install dependencies
npm install

# Build contracts
npx blueprint build

# Run contract tests
npx blueprint test
```

### Frontend

```bash
cd frontend
npm install

# Start dev server
npm run dev

# Run unit tests
npm test

# Build for production
npm run build
```

### Backend

```bash
cd backend
npm install

# Start PostgreSQL (Docker)
docker-compose up -d

# Start the indexer + API server
npm run dev
```

---

## Documentation

- [Specification](docs/SPECIFICATION.md) — user stories, use cases, functional/non-functional requirements, BDD scenarios, C4 architecture diagrams
- [Tests](docs/TESTS.md) — test plan, unit test scenarios, manual integration scenarios

---

## Frontend Dev Notes

See [FRONTEND.md](FRONTEND.md) for notes on the frontend architecture.
