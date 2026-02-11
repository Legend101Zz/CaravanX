# Basic Wallet Operations

> 📹 **Video walkthrough:** _Coming soon_

This guide covers everything you can do with basic Bitcoin wallets in Caravan-X.

---

## Accessing Wallet Features

From the main menu, select **🏦 Bitcoin Wallets**:
```
List all wallets
Create new wallet
View wallet details
Send funds between wallets
Fund wallet with regtest coins
```

---

## Listing Wallets

**TUI:** Bitcoin Wallets → List all wallets
**CLI:** `caravan-x list-wallets`

Displays all wallets loaded in your Bitcoin Core node, including their type (regular, watch-only, blank) and balance.

---

## Creating a New Wallet

**TUI:** Bitcoin Wallets → Create new wallet
**CLI:** `caravan-x create-wallet --name <name>`

### Step-by-step:

1. Enter a wallet name (e.g., `alice`)
2. Choose the wallet type:
   - **Regular wallet** — Has private keys, can sign transactions
   - **Watch-only wallet** — No private keys, can only monitor addresses
   - **Blank wallet** — Empty wallet, no HD seed (advanced use)
3. Wallet is created instantly

All wallets are descriptor wallets (modern Bitcoin Core format) with `load_on_startup = true`.

### CLI Examples:
```bash
# Regular wallet
caravan-x create-wallet --name alice

# Watch-only wallet
caravan-x create-wallet --name my_watch --watch-only
```

---

## Viewing Wallet Details

**TUI:** Bitcoin Wallets → View wallet details

Select a wallet to see:
- **Balance** (confirmed + unconfirmed)
- **Addresses** (generated so far)
- **UTXOs** (unspent transaction outputs)
- **Wallet type** and descriptor information

---

## Funding a Wallet with Regtest Coins

**TUI:** Bitcoin Wallets → Fund wallet with regtest coins
**CLI:** `caravan-x fund-wallet --name <wallet> --blocks <n>`

In regtest mode, you can mine blocks directly to a wallet's address. Each block produces a 50 BTC coinbase reward (which requires 100 block confirmations to become spendable).

### Step-by-step:

1. Select the wallet to fund
2. Enter the number of blocks to mine (default: 1)
3. Caravan-X generates a new address from the wallet and mines blocks to it
4. If this is the first funding, mine at least 101 blocks so the first coinbase becomes spendable

### Quick funding:
```bash
# Mine 10 blocks to alice (gives 500 BTC, first coinbase spendable after 101 total blocks)
caravan-x fund-wallet --name alice --blocks 10
```

---

## Sending Funds Between Wallets

**TUI:** Bitcoin Wallets → Send funds between wallets
**CLI:** `caravan-x send --from <wallet_a> --to <wallet_b> --amount <btc>`

### Step-by-step:

1. Select the **source wallet** (must have a balance)
2. Select or enter the **destination wallet**
3. Enter the **amount** in BTC
4. Caravan-X creates, signs, and broadcasts the transaction
5. Optionally mine a block to confirm the transaction immediately

### CLI Example:
```bash
caravan-x send --from alice --to bob --amount 1.5
```

> **Tip:** In regtest mode, transactions stay unconfirmed until you mine a block. Caravan-X offers to mine one automatically after sending.
