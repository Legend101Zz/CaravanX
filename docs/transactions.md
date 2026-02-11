# Transactions Guide

> 📹 **Video walkthrough:** _Coming soon_

This guide covers PSBT (Partially Signed Bitcoin Transaction) creation, signing, and broadcasting.

---

## Accessing Transaction Features

From the main menu, select **💸 Transactions**:
```
Create new PSBT
Sign PSBT with wallet
Sign PSBT with private key
Analyze and decode PSBT
Finalize and broadcast PSBT
```

---

## Creating a PSBT

**TUI:** Transactions → Create new PSBT
**CLI:** `caravan-x create-psbt`

### Step-by-step:

1. **Select source wallet** — The wallet that owns the UTXOs you want to spend
2. **Add outputs** — Specify recipient address(es) and amount(s)
3. **Configure options:**
   - **Fee rate** (sat/vB) — Set the transaction fee rate
   - **RBF enabled** — Allow Replace-By-Fee for later fee bumping
4. **PSBT is generated** — Displayed as a Base64 string, ready for signing

---

## Signing a PSBT

### With a Wallet

**TUI:** Transactions → Sign PSBT with wallet

1. Provide the PSBT (paste, file, or clipboard)
2. Select which wallet to sign with
3. The signed PSBT is returned

### With a Private Key

**TUI:** Transactions → Sign PSBT with private key

1. Provide the PSBT
2. Enter the private key in WIF format
3. The signed PSBT is returned

---

## Analyzing a PSBT

**TUI:** Transactions → Analyze and decode PSBT

Decodes a PSBT and displays:
- Number of inputs and outputs
- Fee amount and fee rate
- Signing status (which signatures are present/missing)
- Output addresses and amounts
- Script types

---

## Finalizing and Broadcasting

**TUI:** Transactions → Finalize and broadcast PSBT

1. Provide the fully-signed PSBT
2. Caravan-X finalizes it (assembles all signatures)
3. Broadcasts the raw transaction to the network
4. Returns the transaction ID (txid)
5. Optionally mine a block to confirm

> **Note:** Finalization only works when all required signatures are present. For multisig wallets, ensure you've collected M-of-N signatures before finalizing.
