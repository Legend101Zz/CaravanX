# Snapshots Guide

> 📹 **Video walkthrough:** _Coming soon_

Snapshots let you save and restore complete blockchain states. Think of them as "save games" for your regtest environment.

> ⚠️ Snapshots are only available in **Docker mode**.

---

## Accessing Snapshots

From the main menu, select **📸 Snapshots**:
```
Create Snapshot
List Snapshots
Restore Snapshot
Compare Snapshots
Delete Snapshot
```

---

## Creating a Snapshot

**TUI:** Snapshots → Create Snapshot

### Step-by-step:

1. **Name your snapshot** — e.g., "before-rbf-test"
2. **Add a description** — Optional context about the blockchain state
3. **Add tags** — Optional labels for organization
4. **Select wallets to include** — Choose specific wallets or all

Caravan-X captures:
- Current block height and hash
- Complete `regtest/` directory (blocks, chainstate, wallets)
- Wallet list and balances
- SHA-256 checksum for integrity verification

Snapshots are saved as compressed `.tar.gz` archives in the profile's `snapshots/` directory.

---

## Listing Snapshots

**TUI:** Snapshots → List Snapshots

Shows all saved snapshots with:
- Name and description
- Block height at time of capture
- Creation date
- File size
- Tags

---

## Restoring a Snapshot

**TUI:** Snapshots → Restore Snapshot

### Step-by-step:

1. Select the snapshot to restore
2. Caravan-X stops Bitcoin Core
3. Current blockchain data is backed up
4. Snapshot data replaces the current `regtest/` directory
5. Bitcoin Core is restarted
6. Connection is verified

> ⚠️ Restoring replaces your current blockchain state. The current state is automatically backed up before restoration.

---

## Comparing Snapshots

**TUI:** Snapshots → Compare Snapshots

Select two snapshots to see the differences:
- Block height difference
- Wallets added or removed
- Time elapsed between snapshots

Useful for understanding what changed between different states of your testing.

---

## Deleting Snapshots

**TUI:** Snapshots → Delete Snapshot

Removes the snapshot file and its metadata. This action is permanent.
