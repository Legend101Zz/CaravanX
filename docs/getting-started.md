# Getting Started with Caravan-X

> 📹 **Video walkthrough:** _Coming soon_

This guide walks you through your first Caravan-X session — from installation to creating your first wallet and sending a transaction.

---

## Prerequisites

Before you begin, make sure you have:

- **Node.js v22+** — Check with `node --version`
- **Docker Desktop** (for Docker mode) — [Install Docker](https://docs.docker.com/get-docker/)
- **A terminal** — macOS Terminal, iTerm2, Windows Terminal, or any Linux terminal

## Step 1: Install Caravan-X
```bash
npm install -g caravan-x
```

Verify it installed correctly:
```bash
caravan-x --version
```

## Step 2: Launch Caravan-X
```bash
caravan-x
```

You'll see the Caravan-X ASCII art banner and be prompted to choose a base directory and operating mode.

## Step 3: Choose Your Base Directory

Caravan-X asks where to store its data. The default is `~/.caravan-x`. Press Enter to accept or type a custom path.
```
? Where should Caravan-X store its data? (~/.caravan-x)
```

## Step 4: Choose a Mode
```
? How would you like to connect to Bitcoin Core?
❯ 🐳 Docker Mode (Recommended)
  ⚙️  Manual Mode
```

- **Docker Mode** — Caravan-X handles everything. Recommended for most users.
- **Manual Mode** — Connect to your own running Bitcoin Core instance.

For this guide, select **Docker Mode**.

## Step 5: Configure Docker Mode

The setup wizard asks for:

1. **RPC username** (default: `caravan_user`)
2. **RPC password** (default: `caravan_pass`)
3. **Container name** (default: `caravan-x-bitcoin`)
4. **nginx port** (default: `8080`)

Accept the defaults by pressing Enter, or customize as needed.

## Step 6: Name Your Profile
```
? Name for this configuration: (Docker Config)
```

Give it a descriptive name like "My Dev Setup" or accept the default.

## Step 7: Wait for Setup

Caravan-X will now:
- Pull the Bitcoin Core Docker image (first time only, ~500MB)
- Create and start the container
- Configure nginx with CORS headers
- Generate 101 initial blocks
- Create a mining wallet and watch-only wallet

This takes about 30-60 seconds on first run.

## Step 8: You're In!

Once setup completes, you'll see the main menu:
```
🏦 Bitcoin Wallets
🔐 Caravan Multisig
💸 Transactions
📜 Blockchain Scripts
🐳 Docker Management
📸 Snapshots
⚙️  System
❓ Help
🚪 Exit
```

Navigate with arrow keys and press Enter to select.

## Step 9: Try Your First Actions

### List wallets

Go to **Bitcoin Wallets → List all wallets**. You should see `mining_wallet` and a watch-only wallet already created.

### Create a wallet

Go to **Bitcoin Wallets → Create new wallet**. Enter a name like `alice`. A new descriptor wallet is created instantly.

### Fund the wallet

Go to **Bitcoin Wallets → Fund wallet with regtest coins**. Select `alice` and mine 5 blocks. Each block rewards 50 BTC (in regtest), so you'll have 250 BTC.

### Send funds

Go to **Bitcoin Wallets → Send funds between wallets**. Select `alice` as sender, enter a recipient wallet, and specify an amount.

---

## What's Next?

- [Docker Mode Guide](./docker-mode.md) — Learn about multiple profiles and container management
- [Basic Wallets Guide](./basic-wallets.md) — Deep dive into wallet operations
- [Caravan Multisig Guide](./caravan-multisig.md) — Create and manage multisig wallets
- [Working with Caravan](./caravan-integration.md) — Connect to the Caravan web UI
