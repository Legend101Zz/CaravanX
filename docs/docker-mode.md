# Docker Mode Guide

> 📹 **Video walkthrough:** _Coming soon_

Docker mode is the recommended way to use Caravan-X. It gives you a fully isolated, reproducible regtest environment with zero manual configuration.

---

## What Docker Mode Sets Up

When you create a Docker profile, Caravan-X automatically:

1. **Creates a Docker network** (`caravan-x-network`) for container communication
2. **Checks port availability** — If ports 18443 (RPC), 18444 (P2P), or 8080 (nginx) are taken, it auto-assigns alternatives
3. **Generates `bitcoin.conf`** with your RPC credentials and regtest settings
4. **Starts Bitcoin Core** (`bitcoin/bitcoin:27.0`) with proper volume mounts
5. **Starts nginx** with CORS headers so Caravan can talk to your node from the browser
6. **Generates 101 blocks** — Coinbase outputs need 100 confirmations to be spendable
7. **Creates wallets** — A `mining_wallet` (for block rewards) and a watch-only wallet

### Container Architecture
```
Host Machine
├── Port 8080 ──→ nginx container ──→ bitcoind:18443 (internal)
├── Port 18443 ──→ bitcoind RPC (direct, for CLI access)
└── Port 18444 ──→ bitcoind P2P
```

Both containers share the `caravan-x-network` Docker network. nginx talks to Bitcoin Core on the internal port (always 18443), while host-side ports are dynamically assigned if there are conflicts.

---

## Running Multiple Docker Profiles Simultaneously

This is one of Caravan-X's most powerful features. Each Docker profile gets its own:

- Bitcoin Core container (unique name and ports)
- Blockchain data directory
- Wallet files, keys, snapshots
- nginx proxy on a different port

### Creating Multiple Profiles

**Step 1:** Launch Caravan-X and select Docker Mode

**Step 2:** If you already have a Docker profile, you'll be asked:
```
? Found 1 existing Docker config(s). What would you like to do?
❯ 📂 Use: My Dev Setup
  ➕ Create a new Docker configuration
  🗑️  Delete and start fresh
```

**Step 3:** Select **"Create a new Docker configuration"**

**Step 4:** The setup wizard runs again. Use different RPC credentials or container name if you want (Caravan-X will auto-resolve port conflicts either way).

**Step 5:** Name the profile (e.g., "Fee Bumping Tests")

Caravan-X now creates a second container with different host ports:
```
Profile 1: "My Dev Setup"        → nginx on :8080, RPC on :18443
Profile 2: "Fee Bumping Tests"   → nginx on :8081, RPC on :18445
```

### Switching Between Profiles

Go to **Settings → Switch Mode** or **Settings → Manage Profiles** to switch the active profile. When you switch, Caravan-X loads that profile's configuration and connects to its container.

> ⚠️ After switching profiles, restart Caravan-X for the change to take effect.

### Managing Profiles

Go to **Settings → Manage Profiles** to:

- **Set as Active** — Switch to this profile
- **Rename** — Give it a more descriptive name
- **Delete** — Removes the profile directory AND its Docker containers

### Viewing All Configurations

Go to **Settings → View All Configurations** to see all Docker and Manual profiles side by side, including which one is currently active.

---

## Docker Container Management

From the main menu, select **Docker Management**:

| Action | Description |
|--------|-------------|
| **View container status** | Shows whether Bitcoin Core is running, port mappings, container ID |
| **Start container** | Starts the Bitcoin Core container (and nginx) if stopped |
| **Stop container** | Gracefully shuts down both containers |
| **View logs** | Streams Bitcoin Core's stdout for debugging |
| **Troubleshoot port issues** | Diagnoses and resolves port conflicts |
| **Advanced options** | Force remove containers, clean up volumes |

### Checking Container Health
```bash
# Outside Caravan-X, you can verify containers:
docker ps --filter "name=caravan-x"

# Check Bitcoin Core is responding:
curl --user caravan_user:caravan_pass \
     --data-binary '{"jsonrpc":"1.0","method":"getblockchaininfo","params":[]}' \
     -H 'content-type: text/plain;' \
     http://localhost:8080
```

---

## Port Conflict Resolution

Caravan-X automatically handles port conflicts:

1. Before starting containers, it checks if ports 18443, 18444, and 8080 are free
2. If any are taken, it scans upward from the default port to find alternatives
3. The assigned ports are saved to the profile's config
4. nginx always talks to Bitcoin Core on the internal Docker network port (18443), regardless of host-side mapping

If automatic resolution fails, go to **Docker Management → Troubleshoot Port Issues** for manual diagnostics.

---

## Apple Silicon (M1/M2/M3) Note

The official Bitcoin Core Docker image is AMD64. On Apple Silicon Macs, Caravan-X automatically adds the `--platform linux/amd64` flag. Docker Desktop's Rosetta emulation handles the rest. It works correctly but may be slightly slower than native.
