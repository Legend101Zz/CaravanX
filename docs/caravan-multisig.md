# Caravan Multisig Wallets

> 📹 **Video walkthrough:** _Coming soon_

The Caravan Multisig section is the heart of Caravan-X. Here you create, manage, fund, and spend from multisig wallets that are fully compatible with the Caravan web UI.

---

## Accessing Multisig Features

From the main menu, select **🔐 Caravan Multisig**:
```
List Caravan wallets
Create new Caravan multisig wallet
Spend from Caravan multisig wallet
Sign Caravan PSBT for import
Fund Caravan multisig wallet
View Caravan wallet details
Create watch-only wallet for Caravan
Create test multisig wallets (Privacy Levels)
```

---

## Creating a Caravan Multisig Wallet

**TUI:** Caravan Multisig → Create new Caravan multisig wallet
**CLI:** `caravan-x create-caravan`

This interactive wizard walks you through the full setup:

### Step 1: Choose a Name

Enter a descriptive name for your multisig wallet (e.g., "Team Treasury").

### Step 2: Select Address Type
```
? Select address type:
❯ P2WSH (Native SegWit - recommended)
  P2SH-P2WSH (Nested SegWit)
  P2SH (Legacy)
```

- **P2WSH** — Recommended. Lower fees, modern standard.
- **P2SH-P2WSH** — Compatible with older wallets that don't support native SegWit.
- **P2SH** — Legacy format. Use only for specific compatibility needs.

### Step 3: Set Quorum (M-of-N)

- **Required signatures (M):** How many signatures are needed to spend (e.g., 2)
- **Total signers (N):** How many total key holders exist (e.g., 3)

Common setups: 2-of-3, 3-of-5, 1-of-2

### Step 4: Create or Import Signers

For each signer, Caravan-X either:
- **Creates a new signer wallet** — Generates an HD wallet with xpub and private keys, stored in the profile's `keys/` directory
- **Imports an existing xpub** — For hardware wallet signers or external keys

### What Gets Generated

Caravan-X produces:
- `sortedmulti` descriptors with proper `[fingerprint/48'/1'/0'/2']xpub` format
- Checksums obtained from Bitcoin Core via `getdescriptorinfo`
- Both receive (`/0/*`) and change (`/1/*`) descriptor paths
- A JSON configuration file saved to the profile's `wallets/` directory
- A watch-only wallet imported into Bitcoin Core for address monitoring

---

## Funding a Caravan Multisig Wallet

**TUI:** Caravan Multisig → Fund Caravan multisig wallet

### Step-by-step:

1. Select which Caravan wallet to fund
2. Select a source wallet (one with a balance, like `mining_wallet`)
3. Enter the amount of BTC to send
4. The transaction is created, signed, and broadcast
5. Optionally mine a block to confirm immediately

The funded coins now appear in the multisig wallet's UTXOs and can be viewed in both Caravan-X and the Caravan web UI.

---

## Spending from a Caravan Multisig Wallet

**TUI:** Caravan Multisig → Spend from Caravan multisig wallet

This creates a multi-signature spending transaction:

### Step 1: Select the Caravan wallet

### Step 2: Create a PSBT with outputs

Specify the recipient address and amount.

### Step 3: Collect signatures

For each required signer (based on your M-of-N quorum), choose how to sign:

- **Sign with wallet** — Use one of the signer wallets created by Caravan-X
- **Sign with private key** — Paste a WIF-format private key
- **Import from Caravan** — If you signed in the Caravan web UI, paste the PSBT back

### Step 4: Finalize and broadcast

Once enough signatures are collected, the PSBT is finalized and broadcast to the network.

---

## Signing a Caravan PSBT for Import

**TUI:** Caravan Multisig → Sign Caravan PSBT for import
**CLI:** `caravan-x sign-caravan-psbt --file <psbt_file> --key`

This is for the workflow where you create a transaction in Caravan's web UI and need to sign it with keys managed by Caravan-X.

### Step 1: Provide the PSBT

Three ways to input the PSBT:
- **Load from file** — Provide a file path
- **Paste Base64 string** — Copy-paste from Caravan
- **Read from clipboard** — Auto-reads your clipboard

### Step 2: Caravan-X analyzes the PSBT

It detects which Caravan wallet the PSBT belongs to, shows the quorum requirements, and displays transaction details (inputs, outputs, fee).

### Step 3: Sign with available keys

For each required signature, select a signer wallet or provide a private key.

### Step 4: Export the signature

The generated signature JSON is:
- **Copied to clipboard** (default) — Ready to paste into Caravan
- **Displayed in terminal** — For manual copying
- **Saved to file** — For archival

### Importing into Caravan:

1. In Caravan, go to your transaction in the **Spend** tab
2. Under **Signature**, click **Import**
3. Select **Paste JSON** and paste the clipboard content
4. Click **Add Signature**

---

## Viewing Caravan Wallet Details

**TUI:** Caravan Multisig → View Caravan wallet details

Shows comprehensive information about a multisig wallet:
- Wallet name, address type, quorum
- Signer xpubs and fingerprints
- Generated addresses (receive + change)
- UTXOs and their confirmation status
- Descriptor strings

---

## Creating Test Wallets (Privacy Levels)

**TUI:** Caravan Multisig → Create test multisig wallets

Creates three pre-configured wallets with different privacy characteristics for testing Caravan's health/privacy analysis tools:

- **🔒 Good Privacy** — No UTXO mixing, no address reuse
- **⚠️ Moderate Privacy** — Some UTXO mixing, no address reuse
- **❌ Bad Privacy** — UTXO mixing with address reuse

Each wallet is populated with realistic transaction patterns, making them ideal for testing privacy scoring algorithms.
