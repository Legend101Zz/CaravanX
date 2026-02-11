# Test Scenarios Guide

> 📹 **Video walkthrough:** _Coming soon_

Caravan-X ships with pre-configured test scenarios that set up complete Bitcoin workflows automatically.

---

## Accessing Scenarios

From the main menu, select the relevant options:

- **📜 Blockchain Scripts → Run Health Privacy Test**
- **📜 Blockchain Scripts → Run Multisig RBF Test**
- **📜 Blockchain Scripts → Run Multisig CPFP Test**

Or use the generic scenario runner: **Blockchain Scripts → Browse script templates**

---

## Built-in Scenarios

### Basic RBF (Replace-By-Fee)

**What it sets up:**
- Two wallets: `alice` (funded with 50+ BTC) and `bob` (empty)
- A low-fee transaction from alice to bob (RBF-enabled)
- The transaction sits unconfirmed in the mempool

**What you can test:**
- Creating a replacement transaction with a higher fee
- Verifying the original transaction is replaced
- How RBF is displayed in wallet UIs

### CPFP (Child-Pays-For-Parent)

**What it sets up:**
- Two wallets: `alice` (funded) and `bob` (empty)
- A very low-fee "stuck" transaction from alice to bob (5 BTC)
- A second transaction from bob spending the unconfirmed output with a high fee

**What you can test:**
- How child transactions can bump parent fees
- Mempool behavior with dependent transactions
- CPFP handling in wallet implementations

### Multisig 2-of-3 Setup

**What it sets up:**
- A 2-of-3 multisig wallet with three signer wallets
- A watch-only wallet for monitoring
- Initial funding to the multisig address

**What you can test:**
- Multi-party signing workflows
- PSBT creation and signature collection
- Caravan integration with multisig wallets

### Health Privacy Test

**What it sets up:**
- Three multisig wallets with different privacy profiles:
  - **Good Privacy:** Clean UTXO management, no address reuse
  - **Moderate Privacy:** Some UTXO mixing
  - **Bad Privacy:** Address reuse and UTXO mixing

**What you can test:**
- Privacy scoring algorithms
- UTXO analysis tools
- Caravan's health check features

### Multisig RBF Test

**What it sets up:**
- A 2-of-3 multisig wallet, funded
- An original low-fee transaction
- A replacement transaction with a higher fee
- Proper multi-signature collection for both transactions

### Multisig CPFP Test

**What it sets up:**
- A 2-of-3 multisig wallet, funded
- A stuck parent transaction with very low fees
- A child transaction that pays enough fee to bump the parent
