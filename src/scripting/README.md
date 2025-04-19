# 📜 Caravan-X Scripting Engine

**Create, test, and automate complex Bitcoin scenarios in regtest mode.**

![Caravan-X Script Engine Banner](../../assets/Caravan-X.png)

## 📋 Table of Contents

- [Introduction](#-introduction)
- [Getting Started](#-getting-started)
- [How the Script Engine Works](#-how-the-script-engine-works)
- [Writing Scripts](#-writing-scripts)
  - [JavaScript Scripts](#javascript-scripts)
  - [JSON Declarative Scripts](#json-declarative-scripts)
  - [Variables and References](#variables-and-references)
  - [Available Actions](#available-actions)
- [Running Scripts](#-running-scripts)
- [Example Templates](#-example-templates)
- [Advanced Usage](#-advanced-usage)
- [Troubleshooting](#-troubleshooting)

## 🚀 Introduction

The Caravan-X Script Engine allows you to create and run complex Bitcoin scenarios in regtest mode. Whether you're learning about Bitcoin transaction mechanics, testing wallet implementations, or exploring advanced features like Replace-by-Fee (RBF) and Child-Pays-For-Parent (CPFP), the Script Engine makes it easy to automate and visualize these scenarios.

### Why Use the Script Engine?

- **🎓 Learning**: Understand Bitcoin transaction mechanics through practical examples
- **🧪 Testing**: Test wallet implementations and Bitcoin features in a controlled environment
- **🔄 Automation**: Automate complex testing scenarios that would be tedious to perform manually
- **📊 Visualization**: See how transactions flow through the Bitcoin network
- **🔁 Reproducibility**: Create repeatable test environments and scenarios

## 🏁 Getting Started

To get started with the Script Engine, launch Caravan-X and select "Blockchain Scripts" from the main menu:

```
┌───────────────────────────────────────────────────────────┐
│                    Caravan-X Main Menu                    │
├───────────────────────────────────────────────────────────┤
│  🏦 Bitcoin Wallets                                       │
│  🔐 Caravan Multisig                                      │
│  💸 Transactions                                          │
│  📜 Blockchain Scripts  <-- Select this option            │
│  🌐 Visualization                                         │
│  ⚙️ System                                               │
│  ❓ Help                                                  │
│  🚪 Exit                                                  │
└───────────────────────────────────────────────────────────┘
```

From the Blockchain Scripts menu, you can:

1. **Browse script templates**: Explore pre-made scripts for common scenarios
2. **Create a new script**: Build your own custom scenario
3. **Run a script**: Execute a script from a file
4. **Manage saved scripts**: View, edit, and delete your saved scripts

Try running a simple template first to see how the system works!

## 🔄 How the Script Engine Works

The Script Engine executes a series of actions in sequence, with each action performing a specific operation on the Bitcoin regtest network. Here's a visual representation of how it works:

```
┌─────────────────────┐
│     Script File     │
│  (JS or JSON format)│
└──────────┬──────────┘
           │
           ▼
┌──────────────────────┐
│    Script Loader     │
│ Reads and parses the │
│      script file     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Script Validator    │
│ Checks for errors in │
│    script format     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Execution Context   │
│ Sets up environment  │
│ and variable space   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐      ┌───────────────────┐
│   Action Executor    │      │  Bitcoin Core     │
│ Processes each action│<────>│  (regtest mode)   │
│    in sequence       │      │                   │
└──────────┬───────────┘      └───────────────────┘
           │
           ▼
┌──────────────────────┐
│   Result Collector   │
│ Gathers and presents │
│     final results    │
└──────────────────────┘
```

During execution, the Script Engine:

1. **Loads** the script (either JavaScript or JSON format)
2. **Validates** the script structure and parameters
3. **Initializes** an execution context with Bitcoin Core connection
4. **Executes** each action in sequence, updating the context
5. **Processes** variables and references between actions
6. **Collects** results and presents them to the user

## ✍️ Writing Scripts

Caravan-X supports two types of script formats:

### JavaScript Scripts

JavaScript scripts provide maximum flexibility and control. They allow you to write custom logic, looping, conditionals, and more. These scripts have direct access to the Bitcoin services through a sandbox environment.

Here's a simple example of a JavaScript script:

```javascript
/**
 * @name My First Bitcoin Script
 * @description This script creates a wallet, funds it, and sends a transaction
 * @version 1.0.0
 * @author Your Name
 */

// Configuration
const config = {
  walletName: 'my_test_wallet',
  fundAmount: 5,
  sendAmount: 1
};

// Main function
async function runScript() {
  try {
    console.log('Creating wallet...');

    // Create a wallet
    await bitcoinService.createWallet(config.walletName, {
      disablePrivateKeys: false
    });

    // Fund the wallet with mining
    const address = await bitcoinService.getNewAddress(config.walletName);
    const blocks = await bitcoinService.generateToAddress(config.fundAmount, address);

    console.log(`Mined ${blocks.length} blocks to fund wallet`);

    // Create a recipient wallet
    await bitcoinService.createWallet(config.walletName + '_receiver');
    const receiverAddress = await bitcoinService.getNewAddress(config.walletName + '_receiver');

    // Send a transaction
    const txid = await bitcoinService.sendToAddress(
      config.walletName,
      receiverAddress,
      config.sendAmount
    );

    console.log(`Transaction sent: ${txid}`);

    return {
      wallet: config.walletName,
      txid: txid,
      receiverAddress: receiverAddress
    };
  } catch (error) {
    console.error(`Error: ${error.message}`);
    throw error;
  }
}

// Run the script
runScript()
  .then(result => {
    console.log('Script completed successfully!');
    console.log(result);
  })
  .catch(error => {
    console.error('Script failed:', error.message);
  });
```

### JSON Declarative Scripts

JSON scripts provide a more structured and straightforward approach. They consist of a series of predefined actions with parameters. While less flexible than JavaScript, they are easier to write and less error-prone.

Here's an example of a JSON script:

```json
{
  "name": "Simple Transaction Demo",
  "description": "Creates a wallet, mines some coins, and sends a transaction",
  "version": "1.0.0",
  "variables": {
    "walletName": "json_test_wallet",
    "amount": 1.0
  },
  "actions": [
    {
      "type": "CREATE_WALLET",
      "description": "Create a test wallet",
      "params": {
        "name": "${walletName}",
        "options": {
          "disablePrivateKeys": false
        },
        "variableName": "wallet"
      }
    },
    {
      "type": "CREATE_WALLET",
      "description": "Create a receiver wallet",
      "params": {
        "name": "${walletName}_receiver",
        "variableName": "receiverWallet"
      }
    },
    {
      "type": "MINE_BLOCKS",
      "description": "Mine blocks to fund the wallet",
      "params": {
        "toWallet": "${walletName}",
        "count": 5,
        "variableName": "blocks"
      }
    },
    {
      "type": "CUSTOM",
      "description": "Get receiver address",
      "params": {
        "code": "return await context.bitcoinService.getNewAddress(context.variables.walletName + '_receiver');",
        "variableName": "receiverAddress"
      }
    },
    {
      "type": "CREATE_TRANSACTION",
      "description": "Send transaction to receiver",
      "params": {
        "fromWallet": "${walletName}",
        "outputs": [
          {
            "${receiverAddress}": "${amount}"
          }
        ],
        "variableName": "tx"
      }
    },
    {
      "type": "SIGN_TRANSACTION",
      "description": "Sign the transaction",
      "params": {
        "txid": "${tx.txid}",
        "wallet": "${walletName}"
      }
    },
    {
      "type": "BROADCAST_TRANSACTION",
      "description": "Broadcast the transaction",
      "params": {
        "txid": "${tx.txid}",
        "variableName": "broadcastTxid"
      }
    },
    {
      "type": "MINE_BLOCKS",
      "description": "Mine a block to confirm the transaction",
      "params": {
        "toWallet": "${walletName}",
        "count": 1
      }
    }
  ]
}
```

### Variables and References

Both script types support variables that can be referenced throughout the script:

- In **JavaScript scripts**, variables are managed directly in your code
- In **JSON scripts**, variables are defined in the `variables` section and referenced using `${variableName}` syntax

Variables can be:

- **Predefined**: Set in the `variables` section of JSON scripts
- **Action-generated**: Created by actions using the `variableName` parameter
- **Custom-generated**: Created by CUSTOM actions in JSON scripts

Example of variable references in a JSON script:

```json
{
  "variables": {
    "walletName": "my_wallet"
  },
  "actions": [
    {
      "type": "CREATE_WALLET",
      "params": {
        "name": "${walletName}",
        "variableName": "wallet"
      }
    },
    {
      "type": "MINE_BLOCKS",
      "params": {
        "toWallet": "${walletName}",
        "count": 5,
        "variableName": "blocks"
      }
    }
  ]
}
```

### Available Actions

The following actions are available in JSON scripts:

| Action Type | Description | Required Parameters | Optional Parameters |
|-------------|-------------|---------------------|---------------------|
| `CREATE_WALLET` | Creates a new wallet | `name` | `options`, `variableName` |
| `MINE_BLOCKS` | Mines a specified number of blocks | `count`, and either `toWallet` or `toAddress` | `variableName` |
| `CREATE_TRANSACTION` | Creates a new transaction (PSBT) | `fromWallet`, `outputs` | `feeRate`, `rbf`, `variableName` |
| `SIGN_TRANSACTION` | Signs a transaction | `txid` and either `wallet` or `privateKey` | `variableName` |
| `BROADCAST_TRANSACTION` | Broadcasts a transaction | either `txid` or `psbt` | `variableName` |
| `REPLACE_TRANSACTION` | Replaces a transaction with a higher fee (RBF) | `txid` | `newOutputs`, `newFeeRate`, `variableName` |
| `CREATE_MULTISIG` | Creates a multisig wallet | `name`, `requiredSigners`, `totalSigners`, `addressType` | `variableName` |
| `WAIT` | Pauses execution for a specified time | `seconds` | None |
| `ASSERT` | Verifies a condition is true | `condition`, `message` | None |
| `CUSTOM` | Executes custom JavaScript code | `code` | `variableName` |

Each action also accepts a `description` parameter that helps document what the action does.

## 🚗 Running Scripts

### From the Terminal UI

To run a script from the Caravan-X terminal UI:

1. Select "Blockchain Scripts" from the main menu
2. Choose "Run a script" or "Browse script templates"
3. Select the script you want to run
4. Configure execution options:
   - **Dry Run**: Preview what will happen without executing
   - **Verbose**: Show detailed logging during execution
   - **Interactive**: Confirm each step before executing

### From the Command Line

You can also run scripts directly from the command line:

```bash
caravan-regtest run-script --file path/to/script.json
```

Or run a template:

```bash
caravan-regtest run-script --template "Replace-By-Fee Transaction Example"
```

Command line options:

```
Options:
  -f, --file <path>    Path to script file
  -t, --template <n>   Name of template to run
  -d, --dry-run        Run in dry-run mode (no actual execution)
  -v, --verbose        Enable verbose logging
  -i, --interactive    Run in interactive mode (confirm each step)
```

## 📚 Example Templates

Caravan-X includes several script templates that demonstrate common Bitcoin scenarios:

### Replace-By-Fee (RBF)

```
┌─────────────────────────────────────────────────────────────┐
│                Replace-By-Fee (RBF) Workflow                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Create Wallets                       │
│                  (source and destination)                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Mine Blocks for Funding                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               Create Transaction with Low Fee               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Broadcast Transaction                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│          Create Replacement Transaction with Higher Fee     │
│                   (reuses same inputs)                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                Broadcast Replacement Transaction            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               Mine Block to Confirm Transaction             │
└─────────────────────────────────────────────────────────────┘
```

This template demonstrates how to replace an unconfirmed transaction with a higher-fee version using the Replace-by-Fee (RBF) mechanism.

### Child-Pays-For-Parent (CPFP)

```
┌─────────────────────────────────────────────────────────────┐
│              Child-Pays-For-Parent Workflow                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Create Wallets                       │
│              (parent, child, and receiver)                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Mine Blocks for Funding                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│             Create Parent Transaction with Low Fee          │
│              (sends funds to child wallet)                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Broadcast Transaction                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               Create Child Transaction with High Fee        │
│            (spends output from parent transaction)          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Broadcast Transaction                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│        Mine Block to Confirm Both Transactions Together     │
└─────────────────────────────────────────────────────────────┘
```

This template demonstrates how a child transaction can pay a higher fee to incentivize miners to include both it and its parent transaction in a block.

### Timelock Transactions

```
┌─────────────────────────────────────────────────────────────┐
│                Timelock Transaction Workflow                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Create Wallets                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Mine Blocks for Funding                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│            Create Transaction with nLockTime                │
│        (can't be mined until specific block height)         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│          Try to Broadcast (should fail due to locktime)     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│             Mine Blocks Until Timelock Expires              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│          Broadcast Transaction (should succeed now)         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               Mine Block to Confirm Transaction             │
└─────────────────────────────────────────────────────────────┘
```

This template demonstrates absolute timelocks (nLockTime) that prevent a transaction from being mined until a specific block height.

### Multisig Wallet Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                Multisig Wallet Workflow                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Create Signer Wallets                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│             Extract Public Keys from Signers                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                Create Multisig Configuration                │
│               (e.g., 2-of-3 multisig wallet)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Create Watch-Only Wallet                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Fund Multisig Address                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│          Create Transaction from Multisig Wallet            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│             Collect Signatures from Signers                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│            Finalize and Broadcast Transaction               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               Mine Block to Confirm Transaction             │
└─────────────────────────────────────────────────────────────┘
```

This template demonstrates a complete multisig wallet workflow, from creating signer wallets to spending funds using multiple signatures.

### Mempool Stress Test

```
┌─────────────────────────────────────────────────────────────┐
│                  Mempool Stress Test Workflow               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Create Wallets                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Mine Blocks for Funding                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│            Create Many Transactions with Varying Fees       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Analyze Mempool State                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Mine One Block                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│           Analyze Which Transactions Were Included          │
│              (based on fee priority)                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Mine More Blocks to Clear Mempool              │
└─────────────────────────────────────────────────────────────┘
```

This template demonstrates how transactions are prioritized in the mempool based on their fee rates.

## 🔧 Advanced Usage

### Custom Actions

The `CUSTOM` action type allows you to execute arbitrary JavaScript code within your JSON scripts:

```json
{
  "type": "CUSTOM",
  "description": "Calculate transaction fee",
  "params": {
    "code": "const txSize = 250; const feeRate = 5; return txSize * feeRate / 1000;",
    "variableName": "calculatedFee"
  }
}
```

This is useful for complex calculations, conditional logic, or accessing Bitcoin RPC methods not directly exposed through the standard actions.

### The Execution Context

In both JavaScript scripts and CUSTOM actions, you have access to several services through the execution context:

- `bitcoinService`: For wallet and blockchain operations
- `transactionService`: For transaction creation and manipulation
- `caravanService`: For multisig wallet operations
- `rpcClient`: For direct RPC calls to Bitcoin Core
- `variables`: For storing and accessing variables
- `console.log()`: For logging information

Example of using these services in a CUSTOM action:

```json
{
  "type": "CUSTOM",
  "params": {
    "code": "const chainInfo = await context.rpcClient.callRpc('getblockchaininfo'); const balance = await context.bitcoinService.getWalletInfo(context.variables.walletName).balance; return { height: chainInfo.blocks, balance };",
    "variableName": "blockchainState"
  }
}
```

### Assertions

Use `ASSERT` actions to verify that your script is working as expected:

```json
{
  "type": "ASSERT",
  "description": "Verify transaction was confirmed",
  "params": {
    "condition": "context.variables.txInfo.confirmations > 0",
    "message": "Transaction was not confirmed"
  }
}
```

If the condition evaluates to false, the script will fail with the specified message.

## 🩺 Troubleshooting

### Common Issues

| Issue | Possible Solutions |
|-------|-------------------|
| Script fails to validate | Check JSON syntax or JavaScript syntax errors |
| Variable not found | Ensure the variable is defined before being referenced |
| Transaction creation fails | Check wallet balance and fee rate |
| Signing fails | Ensure the wallet has the private keys for the inputs |
| Bitcoin Core connection error | Verify that Bitcoin Core is running in regtest mode |

### Error Messages

The Script Engine provides detailed error messages to help diagnose issues:

- **Validation errors**: Problems with the script format or parameters
- **Execution errors**: Problems during script execution
- **RPC errors**: Problems communicating with Bitcoin Core

### Debugging Tips

1. **Use verbose mode**: Run scripts with the `--verbose` flag to see detailed logs
2. **Add console.log statements**: In JavaScript scripts and CUSTOM actions
3. **Use dry-run mode**: Preview script execution without making actual changes
4. **Use assertions**: Add ASSERT actions to verify intermediate states
5. **Check Caravan-X logs**: For more detailed information about RPC calls

## 📝 Contributing

We welcome contributions to the Caravan-X Script Engine! Whether you're adding new features, fixing bugs, or creating new templates, here's how you can contribute:

1. **Create new templates**: Share your useful Bitcoin scenarios
2. **Improve documentation**: Help make this guide even better
3. **Add new action types**: Extend the JSON script capabilities
4. **Fix bugs**: Help improve the Script Engine's reliability

For more information, see the main Caravan-X contribution guidelines.

---

Happy scripting! 🚀
