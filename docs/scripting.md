# Scripting Engine Guide

> 📹 **Video walkthrough:** _Coming soon_

The scripting engine lets you automate complex Bitcoin scenarios using JavaScript or JSON declarative scripts.

---

## Accessing the Scripting Engine

From the main menu, select **📜 Blockchain Scripts**:
```
Browse script templates
Create a new script
Run a script
Manage saved scripts
Run Health Privacy Test
Run Multisig RBF Test
Run Multisig CPFP Test
```

---

## Why Use Scripts?

- **Learning** — Understand Bitcoin transaction mechanics through runnable examples
- **Testing** — Automate wallet and transaction testing
- **Reproducibility** — Run the exact same scenario every time
- **Complexity** — Orchestrate multi-step workflows (create wallets → fund → send → RBF → CPFP)

---

## Script Formats

### JavaScript Scripts

Full access to Caravan-X services:
```javascript
// Available globals: bitcoinService, transactionService, rpcClient, caravanService, config

// Create wallets
await bitcoinService.createWallet("alice");
await bitcoinService.createWallet("bob");

// Fund alice
const address = await bitcoinService.getNewAddress("alice");
await rpcClient.callRpc("generatetoaddress", [101, address]);

// Send to bob
const bobAddr = await bitcoinService.getNewAddress("bob");
await bitcoinService.sendToAddress("alice", bobAddr, 5.0);

// Mine to confirm
await rpcClient.callRpc("generatetoaddress", [1, address]);

console.log("Done! Bob has 5 BTC.");
```

### JSON Declarative Scripts

Step-by-step actions in JSON format:
```json
{
  "name": "Simple Transfer",
  "description": "Create two wallets and transfer funds",
  "steps": [
    { "action": "CREATE_WALLET", "params": { "name": "alice" } },
    { "action": "CREATE_WALLET", "params": { "name": "bob" } },
    { "action": "MINE_BLOCKS", "params": { "count": 101, "toWallet": "alice" } },
    { "action": "CREATE_TRANSACTION", "params": {
        "fromWallet": "alice",
        "outputs": [{ "bob_address": 5.0 }]
    }},
    { "action": "MINE_BLOCKS", "params": { "count": 1, "toWallet": "alice" } }
  ]
}
```

---

## Running Scripts

### From TUI

1. Select **Run a script**
2. Choose execution options:
   - **Dry Run** — Preview without executing
   - **Verbose** — Detailed logging
   - **Interactive** — Confirm each step

### From CLI
```bash
# Run a script
caravan-x run-script --file my_scenario.js

# Verbose mode
caravan-x run-script --file my_scenario.js --verbose

# Dry run
caravan-x run-script --file my_scenario.js --dry-run

# Run a template
caravan-x run-script --template "Replace-By-Fee Transaction Example"
```

---

## Built-in Templates

### Replace-By-Fee (RBF)

Creates a low-fee transaction, then replaces it with a higher-fee version. Demonstrates RBF mechanics.

### Child-Pays-For-Parent (CPFP)

Creates a stuck low-fee parent transaction, then a high-fee child transaction that bumps both through.

### Multisig RBF Test

Sets up a 2-of-3 multisig wallet, funds it, creates a low-fee transaction, then replaces it with a higher-fee RBF transaction — all with proper multi-signature collection.

### Multisig CPFP Test

Similar to Multisig RBF, but uses the CPFP fee-bumping strategy instead.

### Health Privacy Test

Creates three multisig wallets with different privacy profiles (good, moderate, bad) and populates them with realistic transaction patterns for testing privacy analysis tools.

---

## Creating New Scripts

**TUI:** Blockchain Scripts → Create a new script

1. Enter a script name
2. Choose type: JavaScript or JSON
3. Edit the script in your default editor
4. Save to the profile's `scenarios/` directory

For comprehensive scripting documentation, see the [Scripting Engine README](../src/scripting/README.md).
