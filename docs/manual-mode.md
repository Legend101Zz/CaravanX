# Manual Mode Guide

> 📹 **Video walkthrough:** _Coming soon_

Manual mode connects Caravan-X to your own running Bitcoin Core instance. Use this when you want full control over your node configuration or are running Bitcoin Core outside of Docker.

---

## Prerequisites

You need Bitcoin Core installed and configured for regtest mode.

### Minimal bitcoin.conf

Create or edit `~/.bitcoin/bitcoin.conf`:
```ini
# Global settings (MUST be at root level, not in a section)
rpcuser=your_username
rpcpassword=your_password
server=1

# Regtest-specific settings (MUST be in [regtest] section)
[regtest]
rpcport=18443
rpcbind=0.0.0.0
rpcallowip=127.0.0.1
```

> ⚠️ **Important:** Bitcoin Core v0.17+ requires network-specific settings like `rpcport` and `rpcbind` to be inside the `[regtest]` section. Auth credentials (`rpcuser`, `rpcpassword`) must remain at the global level.

### Start Bitcoin Core
```bash
bitcoind -regtest -daemon
```

Verify it's running:
```bash
bitcoin-cli -regtest getblockchaininfo
```

---

## Setting Up Manual Mode

**Step 1:** Launch Caravan-X: `caravan-x`

**Step 2:** Select **Manual Mode**

**Step 3:** Enter connection details:
- **RPC Host:** `127.0.0.1` (default)
- **RPC Port:** `18443` (default regtest port)
- **RPC Username:** must match `bitcoin.conf`
- **RPC Password:** must match `bitcoin.conf`
- **Bitcoin Data Directory:** path to your Bitcoin Core data directory (e.g., `~/.bitcoin`)

**Step 4:** Name your profile (e.g., "Local Node")

Caravan-X tests the connection and you're ready to go.

---

## Limitations of Manual Mode

- **One profile only** — Since all Manual profiles share the same `bitcoind` instance, Caravan-X limits you to one Manual profile. Use Docker mode for multiple simultaneous environments.
- **No Docker Management** — The Docker Management menu is not available
- **No Snapshots** — Snapshot create/restore requires Docker control over the data directory
- **No nginx proxy** — You need to configure CORS yourself if using Caravan's web UI
- **No Environment sharing** — `.caravan-env` export/import requires Docker

---

## Configuring CORS for Caravan (Manual Mode)

If you want to use the Caravan web UI with Manual mode, you need to set up a CORS proxy yourself. The simplest approach:

### Option A: Use nginx

Create an nginx config that proxies to Bitcoin Core with CORS headers:
```nginx
server {
    listen 8080;
    location / {
        proxy_pass http://127.0.0.1:18443;
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'POST, GET, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type' always;
        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }
}
```

### Option B: Use Docker Mode Instead

Docker mode sets up the nginx CORS proxy automatically. If you need Caravan integration, Docker mode is strongly recommended.

---

## Available Features in Manual Mode

Even without Docker, you get the full suite of wallet and transaction tools:

- ✅ Bitcoin Wallets (create, view, fund, send)
- ✅ Caravan Multisig (create, fund, spend, sign PSBTs)
- ✅ Transactions (PSBT creation, signing, broadcasting)
- ✅ Blockchain Scripts (scripting engine)
- ✅ Test Scenarios
- ✅ Visualization (blockchain activity viewer — Manual mode exclusive)
- ❌ Docker Management
- ❌ Snapshots
- ❌ Environment Sharing
