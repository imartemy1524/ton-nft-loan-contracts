# Test Plan — TON NFT Loans

## 1. Overview

This document describes the test strategy and coverage for the TON NFT Loans platform, covering unit tests for frontend utility functions as well as manually-verified integration flows aligned with the BDD scenarios from `SPECIFICATION.md`.

Test framework: **Vitest** (via `npm test` in the `frontend/` directory).

---

## 2. Test Files

| File | Module under test | Tests |
|---|---|---|
| `src/utils/__tests__/amounts.test.ts` | `utils/amounts.ts` | 14 |
| `src/utils/__tests__/percentToDecimal.test.ts` | `utils/percentToDecimal.ts` | 8 |
| `src/utils/__tests__/tokens.test.ts` | `utils/tokens.ts` | 5 |
| `src/constants/__tests__/jettons.test.ts` | `constants/jettons.ts` | 6 |

Total: **33 automated tests**

---

## 3. Unit Test Scenarios

### 3.1 Amount Formatting (`amounts.ts`)

The `scaleAmount` and `formatAmount` functions handle the critical conversion between human-readable token amounts and on-chain integer representations. Errors here would result in users sending wrong amounts to the smart contract.

#### `scaleAmount(amount: string, decimals: number): bigint`

| # | Description | Input | Expected |
|---|---|---|---|
| A-01 | Integer TON (9 dec) | `'1', 9` | `1_000_000_000n` |
| A-02 | Fractional TON | `'1.5', 9` | `1_500_000_000n` |
| A-03 | Integer USDT (6 dec) | `'100', 6` | `100_000_000n` |
| A-04 | Fractional USDT | `'1.5', 6` | `1_500_000n` |
| A-05 | Truncates excess decimals | `'1.123456', 6` | `1_123_456n` |
| A-06 | Zero — 6 dec | `'0', 6` | `0n` |
| A-07 | Zero — 9 dec | `'0', 9` | `0n` |
| A-08 | Integer string, 6 dec | `'50', 6` | `50_000_000n` |

#### `formatAmount(amount: bigint, decimals: number): string`

| # | Description | Input | Expected |
|---|---|---|---|
| A-09 | 1 TON | `1_000_000_000n, 9` | `'1'` |
| A-10 | Fractional TON | `1_500_000_000n, 9` | `'1.5'` |
| A-11 | 100 USDT | `100_000_000n, 6` | `'100'` |
| A-12 | Fractional USDT | `1_500_000n, 6` | `'1.5'` |
| A-13 | Zero | `0n, 6` | `'0'` |
| A-14 | Roundtrip: scaleAmount → formatAmount | various | same string |

---

### 3.2 Percentage Conversion (`percentToDecimal.ts`)

Used when a borrower or lender sets the daily interest rate. The contract stores the rate as a fraction (nominator/denominator). An error here causes the wrong interest to be applied on-chain.

| # | Description | Input | Expected |
|---|---|---|---|
| P-01 | Integer percent | `'1'` | `{ nominator:1, denominator:100 }` |
| P-02 | Fraction value check | `'1'` | ratio ≈ 0.01 |
| P-03 | 1 decimal place | `'1.5'` | ratio ≈ 0.015 |
| P-04 | 2 decimal places | `'0.25'` | ratio ≈ 0.0025 |
| P-05 | Trailing zero | `'1.50'` same as `'1.5'` | same ratio |
| P-06 | Negative input | `'-1'` | `{ nominator:0, denominator:1 }` |
| P-07 | Non-numeric input | `'abc'` | `{ nominator:0, denominator:1 }` |
| P-08 | 100% | `'100'` | ratio ≈ 1 |

---

### 3.3 Offer Token Resolution (`tokens.ts`)

`resolveOfferTokens` maps Bank offers to `JettonInfo` objects by querying the jetton master address from the chain. Incorrect mapping would display the wrong currency for an offer.

| # | Description | Expected |
|---|---|---|
| T-01 | `jettonWallet = null` → TON | Returns TON `JettonInfo` |
| T-02 | Wallet resolves to whitelisted master | Returns matching `JettonInfo` (e.g. USDT) |
| T-03 | Master not in whitelist | Returns `null` |
| T-04 | `getJettonMasterAddress` throws | Returns `null` (graceful fallback) |
| T-05 | Multiple offers resolved concurrently | Each mapped independently and correctly |

---

### 3.4 Jetton Configuration (`jettons.ts`)

`getJettons` returns the correct token list for mainnet vs. testnet. Wrong addresses would cause all token operations to fail on-chain.

| # | Description | Expected |
|---|---|---|
| J-01 | USDT mainnet address | `EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs` |
| J-02 | USDT testnet address | `kQD0GKBM8ZbryVk2aESmzfU6b9b_8era_IkvBSELujFZPsyy` |
| J-03 | TON address is null on both networks | `null` |
| J-04 | All jettons have required fields | `symbol`, `name`, `decimals` present |
| J-05 | USDT decimals | `6` |
| J-06 | TON decimals | `9` |

---

## 4. BDD Integration Scenarios (Manual Verification)

The following scenarios are derived from `SPECIFICATION.md` and are validated manually against the deployed contracts on TON testnet. They cannot be automated without a full Sandbox/Blockchain emulator setup.

### Scenario: Borrower Creates a Loan (UC-01)

```gherkin
Given a connected wallet with at least one NFT
When the borrower fills in loan amount, token (TON/USDT/NOT), duration, and interest rate
And clicks "Create Loan"
Then the TonConnect modal appears
And on approval the Loan contract is deployed
And the contract address appears in the borrower's Profile
And contract status is WAITING_FOR_FUNDS
```

**Verification steps:**
1. Open the app on testnet.
2. Connect a wallet that holds an NFT.
3. Go to "Get a Loan", select the NFT, fill in parameters, submit.
4. Approve in TonConnect.
5. Navigate to Profile and confirm the loan appears with status "Waiting for Funds".

---

### Scenario: Lender Funds a TON Loan (UC-02)

```gherkin
Given a Loan contract in WAITING_FOR_FUNDS state expecting TON
When a lender opens the loan and clicks "Fund"
Then TonConnect sends exactly `loan.amount` TON to the contract
And contract status changes to IN_PROGRESS
And the borrower's wallet receives the loan amount
```

---

### Scenario: Lender Funds a USDT Loan (UC-02b)

```gherkin
Given a Loan contract in WAITING_FOR_FUNDS state expecting USDT
When a lender clicks "Fund"
Then TonConnect sends a Jetton Transfer message to the lender's USDT wallet
And the transfer forward_payload is OP_GIVE_MONEY with the loan params
And contract status changes to IN_PROGRESS
```

---

### Scenario: Borrower Repays a Loan (UC-03)

```gherkin
Given a Loan contract in IN_PROGRESS state
When the borrower clicks "Repay" before the deadline
Then TonConnect sends the repayment (principal + accrued interest)
And the NFT is transferred back to the borrower
And contract status becomes REPAYED
```

---

### Scenario: Lender Claims NFT After Default (UC-05)

```gherkin
Given a Loan contract in IN_PROGRESS state
And the loan deadline has passed
When the lender clicks "Claim NFT"
Then TonConnect sends OP_LOAN_NOT_REPAYED_WITHDRAW_NFT
And the NFT is transferred to the lender's wallet
And contract status becomes NOT_REPAYED
```

---

### Scenario: Token Resolution Fallback (UC-06)

```gherkin
Given a loan was created with a USDT jetton wallet
And the backend token-cache initially fails to resolve the token
When the backend retries and finds the wallet is a USDT child
Then the loan is indexed with symbol "USDT" and 6 decimals
And the frontend displays the correct amount and symbol
```

---

## 5. Running Tests

```bash
cd frontend

# Run all tests once
npm test

# Run in watch mode during development
npm run test:watch

# Run with coverage report
npm run test:coverage
```

---

## 6. Test Coverage Notes

The automated suite focuses on pure utility functions — the parts most likely to cause silent financial errors (wrong amounts, wrong decimals, wrong token addresses). Smart contract interaction (message building, TonConnect flows, on-chain state transitions) is verified manually on testnet because it requires a live blockchain or a Sandbox emulator environment beyond the scope of this project.
