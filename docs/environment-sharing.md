# Environment Sharing Guide

> 📹 **Video walkthrough:** _Coming soon_

Environment sharing is Caravan-X's solution to the "works on my machine" problem. Package your entire regtest environment into a `.caravan-env` archive and hand it to anyone on your team.

---

## What Gets Shared

A `.caravan-env` archive contains:

- **Blockchain data** — The complete `blocks/` and `chainstate/` directories (binary data)
- **Wallet descriptors** — All wallet configurations with optional private keys
- **Caravan wallet configs** — JSON files for multisig wallets
- **Key files** — Private key storage for signer wallets
- **Replay script** — A step-by-step reconstruction script (for when binary data isn't available)
- **Manifest** — Metadata including block height, wallet list, Bitcoin Core version, checksums

---

## Accessing Environment Sharing

From the main menu: **System → Environment Sharing**

Or via CLI:
```bash
caravan-x env export ...
caravan-x env import ...
caravan-x env inspect ...
```

---

## Exporting an Environment

**TUI:** System → Environment Sharing → Export Environment

### Step-by-step:

1. **Name your environment** — e.g., "team-setup-2025"
2. **Add a description** — Optional, but helpful for teammates
3. **Your name/handle** — Identifies who created the export
4. **Include blockchain data?** — Recommended for exact replication. Without it, only the replay script is available.
5. **Include private keys?** — Required if teammates need to sign transactions. Omit for watch-only sharing.
6. **Generate replay script?** — Creates a step-by-step reconstruction script as a fallback.
7. **Filter wallets** — Choose specific wallets or export all.
8. **Output file path** — Where to save the `.caravan-env` file.

### CLI Example:
```bash
caravan-x env export \
  --name "team-setup" \
  --description "2-of-3 multisig with funded wallets" \
  --output ./team-setup.caravan-env
```

---

## Importing an Environment

**TUI:** System → Environment Sharing → Import Environment

Importing creates a **brand new Docker profile** with its own isolated container, blockchain data, and wallet files.

### Step-by-step:

1. **Provide the archive path** — e.g., `./team-setup.caravan-env`
2. **Inspect the archive** — Caravan-X shows you the manifest: block height, wallets, creation date, checksums
3. **Choose import method:**
   - **Auto** — Uses binary data if available, falls back to replay
   - **Binary** — Direct copy of blockchain data (fastest, exact replica)
   - **Replay** — Reconstructs the environment step by step (slower, but works without binary data)
4. **Name the new profile** — e.g., "Team Setup (imported)"
5. **Skip verification?** — Set to false for safety (verifies checksums)
6. **Confirm and import**

Caravan-X then:
- Creates a new profile directory
- Sets up a Docker container with unique ports
- Imports the blockchain data or runs the replay script
- Copies wallet configs and key files
- Sets the new profile as active

### CLI Example:
```bash
caravan-x env import ./team-setup.caravan-env
```

---

## Inspecting an Archive

**TUI:** System → Environment Sharing → Inspect Environment

View the contents of a `.caravan-env` archive without importing it:
```bash
caravan-x env inspect ./team-setup.caravan-env
```

Displays:
- Environment name, description, creator
- Block height and best block hash
- Bitcoin Core version used
- Wallet list with types and address counts
- Whether private keys are included
- Archive size and checksums

---

## Sharing Workflow

### Typical Team Workflow

1. **Developer A** sets up the regtest environment with specific wallets, transactions, and blockchain state
2. **Developer A** exports: `caravan-x env export --name "bug-repro-123" --output ./bug-repro.caravan-env`
3. **Developer A** shares `bug-repro.caravan-env` via Slack, email, or Git LFS
4. **Developer B** imports: `caravan-x env import ./bug-repro.caravan-env`
5. **Developer B** now has the exact same blockchain state, wallets, and keys
6. Both developers can reproduce the same bugs and test the same scenarios
