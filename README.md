# Caravan-X

A terminal-based utility for Bitcoin developers who are tired of the "it works on my machine" problem. Caravan-X creates reproducible regtest environments, manages Caravan-compatible multisig wallets, and lets you share exact blockchain states with your team.

![Caravan-X](./assets/Caravan-X.png)

---

### Video tutorial on how to use caravan-x along with caravan-coordinator :

### [demo](https://drive.google.com/file/d/1AMB_MrrsPz8UXJzlDaIeZdcf38sbBRFW/view?usp=sharing)

---

## Table of Contents

- [What is Caravan-X](#what-is-caravan-x)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Modes of Operation](#modes-of-operation)
  - [Docker Mode](#docker-mode)
  - [Manual Mode](#manual-mode)
  - [Switching Between Modes](#switching-between-modes)
- [Using the TUI (Terminal User Interface)](#using-the-tui-terminal-user-interface)
  - [Main Menu Categories](#main-menu-categories)
  - [Bitcoin Wallets](#bitcoin-wallets)
  - [Caravan Multisig](#caravan-multisig)
  - [Transactions](#transactions)
  - [Blockchain Scripts](#blockchain-scripts)
  - [Docker Management](#docker-management)
  - [Snapshots](#snapshots)
  - [Test Scenarios](#test-scenarios)
- [CLI Commands](#cli-commands)
- [Configuration](#configuration)
- [Pre-configured Test Scenarios](#pre-configured-test-scenarios)
- [Scripting Engine](#scripting-engine)
- [Working with Caravan](#working-with-caravan)
- [Roadmap](#roadmap)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## What is Caravan-X

Caravan-X solves a real pain point in Bitcoin development: environment consistency. When you're building Bitcoin applications, testing multisig setups, or debugging transaction issues, you need everyone on your team working with the same blockchain state. Caravan-X makes this possible by:

- Spinning up identical regtest environments with Docker (or connecting to your existing node)
- Creating Caravan-compatible multisig wallets that work seamlessly with the Caravan web interface
- Packaging complete blockchain states into shareable archives
- Providing pre-built test scenarios for common patterns like RBF and CPFP
- Offering both an interactive TUI and direct CLI commands

Whether you're testing privacy analysis tools, simulating fee bumping scenarios, or just need a clean regtest environment, Caravan-X has you covered.

---

## Installation

You'll need Node.js v22 or later. Then install globally via npm:
```bash
npm install -g caravan-x
```

That's it. Run `caravan-x` and you're off to the races.

For development (if you want to contribute or modify):
```bash
git clone https://github.com/Legend101Zz/CaravanX.git
cd CaravanX
npm install
npm run build
npm link  # Makes caravan-x available globally
```

---

## Quick Start

### The Fast Track (Docker Mode)

If you have Docker installed and just want to get going:
```bash
caravan-x
```

1. Select "Docker Mode (Recommended)" when prompted
2. Accept the default settings or customize as needed
3. Wait for the Bitcoin Core container to spin up
4. You're now running a fully configured regtest environment

The setup wizard handles everything: creating the container, configuring RPC authentication, setting up nginx proxy, generating initial blocks, and creating a watch-only wallet.

### Already Have Bitcoin Core Running (Manual Mode)

If you prefer managing your own node:
```bash
caravan-x
```

1. Select "Manual Mode"
2. Enter your Bitcoin Core RPC connection details
3. Start using all the wallet and transaction features immediately

---

## Modes of Operation

### Docker Mode

This is the recommended approach for most developers. Docker mode automatically:

- Pulls and runs the official Bitcoin Core image (v27.0)
- Creates a dedicated Docker network for Caravan-X
- Sets up an nginx reverse proxy with CORS headers (so Caravan can talk to your node)
- Configures RPC authentication
- Generates 101 initial blocks (so you have spendable coins)
- Creates a watch-only wallet for Caravan integration
- Handles port conflicts automatically

All data is stored in `~/.caravan-x` by default, but you can customize the location during setup.

**What Gets Created:**
```
~/.caravan-x/
├── config.json           # Main configuration
├── docker-data/          # Bitcoin Core data directory
├── wallets/              # Caravan wallet configurations
├── keys/                 # Private key storage
├── snapshots/            # Blockchain snapshots
└── scenarios/            # Custom test scenarios
```

**Accessing Bitcoin Core:**

Once Docker mode is running, your node is accessible at `http://localhost:8080` (via nginx proxy). This is the URL you'll use in Caravan's settings.

### Manual Mode

For developers who want full control over their Bitcoin Core setup. You provide:

- RPC host and port (default: 127.0.0.1:18443)
- RPC username and password
- Bitcoin data directory path

Manual mode gives you access to all Caravan-X features except Docker management and nginx proxy (since you're handling that yourself).

**Requirements for Manual Mode:**

Your Bitcoin Core must be running in regtest mode. A minimal `bitcoin.conf`:
```ini
# Global settings
rpcuser=your_username
rpcpassword=your_password
server=1

# Regtest-specific settings
[regtest]
rpcport=18443
```

Start Bitcoin Core with:
```bash
bitcoind -regtest -daemon
```

### Switching Between Modes

From the TUI, go to Settings and select "Switch Mode." This updates your configuration and restarts Caravan-X in the new mode. Your wallet configurations and snapshots are preserved.

---

## Using the TUI (Terminal User Interface)

Launch Caravan-X without arguments to enter the interactive interface:
```bash
caravan-x
```

You'll see a nice ASCII banner and the main menu. Navigate with arrow keys and Enter.

### Main Menu Categories

The menu adapts based on your mode. In Docker mode you'll see Docker Management and Snapshots. In Manual mode you'll see the Visualization option instead.

**Available in Both Modes:**
- Bitcoin Wallets
- Caravan Multisig
- Transactions
- Blockchain Scripts
- Test Scenarios
- System
- Settings
- Help

**Docker Mode Only:**
- Docker Management
- Snapshots

**Manual Mode Only:**
- Visualization

### Bitcoin Wallets

Everything you need for basic wallet operations:

| Option | What It Does |
|--------|--------------|
| List all wallets | Shows every wallet in your node with type and balance |
| Create new wallet | Makes a new wallet (regular, watch-only, or blank) |
| View wallet details | Deep dive into a specific wallet's addresses and UTXOs |
| Send funds between wallets | Move coins from one wallet to another |
| Fund wallet with regtest coins | Mine blocks directly to a wallet's address |

### Caravan Multisig

The heart of Caravan-X. This is where you create and manage multisig setups:

| Option | What It Does |
|--------|--------------|
| List Caravan wallets | Shows all your multisig configurations |
| Create new Caravan multisig wallet | Interactive wizard for M-of-N setups |
| Spend from Caravan multisig wallet | Create spending transactions |
| Sign Caravan PSBT for import | Sign PSBTs and export signatures for Caravan |
| Fund Caravan multisig wallet | Send regtest coins to your multisig |
| View Caravan wallet details | See addresses, UTXOs, and configuration |
| Create watch-only wallet for Caravan | Set up address monitoring |
| Create test multisig wallets | Generate wallets with different privacy profiles |

**Creating a Multisig Wallet:**

The wizard walks you through:

1. Choosing a name
2. Selecting address type (P2WSH, P2SH-P2WSH, or P2SH)
3. Setting required signatures (M) and total signers (N)
4. Creating or importing signer wallets

Caravan-X generates proper `sortedmulti` descriptors with fingerprints and derivation paths that Caravan expects. No more descriptor format headaches.

### Transactions

| Option | What It Does |
|--------|--------------|
| Create PSBT | Build a new Partially Signed Bitcoin Transaction |
| Sign PSBT | Add signatures to an existing PSBT |
| Finalize and broadcast PSBT | Complete signing and send to network |
| View transaction | Decode and inspect any transaction |
| Get raw transaction | Fetch hex for a transaction by txid |

### Blockchain Scripts

Caravan-X includes a scripting engine for automating complex scenarios:

| Option | What It Does |
|--------|--------------|
| Browse templates | Pre-made scripts for common patterns |
| Create new script | Start a fresh JavaScript or JSON script |
| Run script | Execute a script file |
| Manage saved scripts | View, edit, delete your scripts |

### Docker Management

(Docker mode only)

| Option | What It Does |
|--------|--------------|
| View container status | See if Bitcoin Core is running |
| Start container | Boot up the regtest environment |
| Stop container | Gracefully shut down |
| View logs | Check Bitcoin Core output |
| Troubleshoot port issues | Diagnose networking problems |
| Advanced options | Clean up containers, force restart |

### Snapshots

(Docker mode only)

Save and restore complete blockchain states:

| Option | What It Does |
|--------|--------------|
| Create Snapshot | Package current state with a name |
| List Snapshots | See all saved states with block heights |
| Restore Snapshot | Roll back to a previous state |
| Compare Snapshots | Diff two snapshots to see changes |
| Delete Snapshot | Remove old snapshots |

### Test Scenarios

Run pre-configured test setups:

| Option | What It Does |
|--------|--------------|
| List scenarios | See built-in and custom scenarios |
| Run scenario | Execute a scenario end-to-end |
| Create scenario | Build your own test scenario |

---

## CLI Commands

Every TUI feature is also available as a direct command. Useful for scripting and CI/CD.

### Basic Commands
```bash
# Start interactive mode (default)
caravan-x start

# List all wallets
caravan-x list-wallets

# Create a new wallet
caravan-x create-wallet --name my_wallet
caravan-x create-wallet --name my_watch --watch-only

# Fund a wallet (mine blocks to it)
caravan-x fund-wallet --name my_wallet --blocks 10

# Send between wallets
caravan-x send --from wallet_a --to wallet_b --amount 1.5

# Mine blocks
caravan-x mine --blocks 6 --wallet my_wallet
```

### Multisig Commands
```bash
# Create a multisig wallet (interactive)
caravan-x create-caravan

# List Caravan wallets
caravan-x list-caravan

# Sign a PSBT for Caravan import
caravan-x sign-caravan-psbt --file transaction.psbt --key
```

### Script Commands
```bash
# Run a script
caravan-x run-script --file my_scenario.js

# Run with verbose output
caravan-x run-script --file my_scenario.js --verbose

# Dry run (preview without executing)
caravan-x run-script --file my_scenario.js --dry-run

# Create a new script
caravan-x create-script --name "my_test" --type js
```

### Other Useful Commands
```bash
# View system info
caravan-x system-info

# Import a Caravan wallet configuration
caravan-x import-caravan --file wallet_config.json

# Simulate blockchain activity
caravan-x simulate --blocks 5 --transactions 3
```

---

## Configuration

Configuration lives at `~/.caravan-x/config.json`. Here's what a Docker mode config looks like:
```json
{
  "mode": "docker",
  "bitcoin": {
    "protocol": "http",
    "host": "localhost",
    "port": 8080,
    "user": "caravan_user",
    "pass": "caravan_pass",
    "dataDir": "~/.caravan-x/docker-data"
  },
  "docker": {
    "enabled": true,
    "image": "bitcoin/bitcoin:27.0",
    "containerName": "caravan-x-bitcoin",
    "ports": {
      "rpc": 18443,
      "p2p": 18444,
      "nginx": 8080
    }
  },
  "snapshots": {
    "enabled": true,
    "directory": "~/.caravan-x/snapshots",
    "autoSnapshot": false
  }
}
```

You can edit this file directly or use the Settings menu in the TUI.

---

## Pre-configured Test Scenarios

Caravan-X ships with several built-in scenarios:

### Basic RBF (Replace-By-Fee)

Creates an unconfirmed transaction that can be replaced with a higher-fee version. Perfect for testing RBF handling in your application.
```
Wallets: alice (funded), bob (empty)
Transaction: alice -> bob, 1 BTC, RBF enabled, low fee
```

### CPFP (Child-Pays-For-Parent)

Demonstrates fee bumping via a child transaction. Creates a stuck parent transaction and a child that pays enough fee to get both confirmed.
```
Wallets: alice (funded), bob (empty)
Transactions:
  1. alice -> bob, 5 BTC, very low fee (stuck)
  2. bob -> alice, 1 BTC, high fee (bumps parent)
```

### Multisig 2-of-3 Setup

A ready-to-use 2-of-3 multisig configuration with initial funding.
```
Wallets: funder (100 BTC), multisig_2of3 (10 BTC)
Configuration: 2 signatures required, 3 total signers
```

### Timelock Test

For testing time-locked transactions with CSV and CLTV.

---

## Scripting Engine

For complex testing scenarios, write scripts in JavaScript or JSON.

### JavaScript Example
```javascript
/**
 * @name Fee Escalation Test
 * @description Tests progressively increasing transaction fees
 * @version 1.0.0
 */

async function runScript() {
  // Create test wallets
  await bitcoinService.createWallet('fee_sender', { disablePrivateKeys: false });
  await bitcoinService.createWallet('fee_receiver', { disablePrivateKeys: false });

  // Fund the sender
  const address = await bitcoinService.getNewAddress('fee_sender');
  await bitcoinService.generateToAddress(10, address);

  // Create transactions at different fee rates
  const feeRates = [1, 2, 5, 10, 20];

  for (const rate of feeRates) {
    const receiverAddr = await bitcoinService.getNewAddress('fee_receiver');
    const txid = await bitcoinService.sendToAddress('fee_sender', receiverAddr, 0.1);
    console.log(`Created tx at ${rate} sat/vB: ${txid}`);
  }

  return { success: true };
}

runScript();
```

### JSON Declarative Example
```json
{
  "name": "Simple Wallet Test",
  "description": "Creates wallets and moves funds",
  "version": "1.0.0",
  "variables": {
    "walletName": "test_wallet",
    "fundingBlocks": 5
  },
  "actions": [
    {
      "type": "CREATE_WALLET",
      "params": {
        "name": "${walletName}",
        "options": { "disablePrivateKeys": false }
      }
    },
    {
      "type": "MINE_BLOCKS",
      "params": {
        "toWallet": "${walletName}",
        "count": "${fundingBlocks}"
      }
    }
  ]
}
```

---

## Working with Caravan

Caravan-X is designed to work seamlessly with Caravan (the web-based multisig coordinator).

### Setting Up Caravan to Talk to Your Node

1. Start Caravan-X in Docker mode
2. In Caravan's settings, set the Bitcoin node URL to `http://localhost:8080`
3. Use the same RPC credentials you configured in Caravan-X

### Importing Multisig Wallets

When you create a multisig wallet in Caravan-X:

1. A configuration file is saved to `~/.caravan-x/wallets/`
2. In Caravan, go to Wallet > Import
3. Load the configuration JSON file
4. Caravan will recognize the descriptors and show your addresses

### Signing Transactions

1. Create a spending transaction in Caravan
2. Export the PSBT
3. In Caravan-X, go to Caravan Multisig > Sign Caravan PSBT
4. Sign with the appropriate key
5. The signature JSON is copied to clipboard
6. In Caravan, import the signature

---

## Roadmap

Here's where Caravan-X is headed. Check marks show what's already built.

### Phase 1: Core Testing Tool (Current)

- [x] Docker mode with automated Bitcoin Core setup
- [x] Manual mode for existing installations
- [x] Shared configuration format
- [x] nginx proxy with CORS for Caravan integration
- [x] Pre-configured test scenarios (RBF, CPFP, Multisig)
- [x] Snapshot and restore for blockchain states
- [x] Identical multisig wallet generation for team sharing
- [x] Caravan-compatible descriptors (sortedmulti with proper paths)
- [x] Privacy profile testing (good/moderate/bad wallets)
- [x] JavaScript and JSON scripting engine

### Phase 2: Terminal UI Improvements (In Progress)

- [x] Interactive setup wizard
- [x] Mode-specific menus
- [ ] Improved mempool.space-style visualization
- [ ] Better transaction flow diagrams
- [ ] Real-time UTXO updates

### Phase 3: Environment Sharing (Planned)

- [x] Basic snapshot export
- [ ] .caravan-env archive format for complete environments
- [ ] One-command environment import
- [ ] Version-controlled environment definitions

### Phase 4: AI Integration (Brainstorming)

- [ ] Natural language commands via LLM integration
- [ ] Support for OpenRouter, Claude, OpenAI, Ollama
- [ ] Generate scripts from descriptions
- [ ] Automated scenario creation

Example: "Create a sequence of CPFP transactions using my multisig wallet" and the system builds and executes it.

---

## Troubleshooting

### Docker Container Won't Start

**Port Already in Use:**

Caravan-X tries to handle this automatically, but if port 8080 is taken:
```bash
# Find what's using the port
lsof -i :8080

# Or let Caravan-X try a different port
# Go to Docker Management > Troubleshoot Port Issues
```

**Docker Not Running:**

Make sure Docker Desktop is running (macOS/Windows) or the Docker daemon is started (Linux).

### Can't Connect to Bitcoin Core (Manual Mode)

- Verify Bitcoin Core is running: `bitcoin-cli -regtest getblockchaininfo`
- Check your RPC credentials match `bitcoin.conf`
- Ensure `server=1` is set in your config
- Check the port matches (default regtest RPC is 18443)

### Caravan Can't See My Wallet

- Make sure you're using Docker mode with nginx proxy, or have CORS configured manually
- Verify the RPC URL in Caravan matches your Caravan-X setup
- Check that the watch-only wallet was created successfully

### Descriptors Not Importing

- Caravan-X uses `sortedmulti` which requires Bitcoin Core v0.17+
- Make sure you're using descriptor wallets (not legacy)
- Check that fingerprints and derivation paths are correct

### Snapshot Restore Failed

- Stop Bitcoin Core before restoring
- Ensure you have enough disk space
- Try the restore again with Docker Management > Stop Container first

---

## Contributing

Caravan-X is open source and contributions are welcome. Here's how to get involved:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run lint` and `npm test`
5. Submit a pull request

**Areas where help is appreciated:**
- Additional test scenario templates
- Improved mempool visualization
- Documentation and examples
- Bug fixes and edge case handling

Report issues at: https://github.com/Legend101Zz/CaravanX/issues

---

## License

MIT License - see LICENSE file for details.

---

Built with care for the Bitcoin development community.
