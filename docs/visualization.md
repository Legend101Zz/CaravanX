# Visualization Guide

> 📹 **Video walkthrough:** _Coming soon_

Caravan-X includes a blockchain visualization feature for watching regtest activity in real-time.

> ℹ️ Visualization is currently available in **Manual mode only**.

---

## Accessing Visualization

From the main menu (Manual mode), select **₿ Visualization**:
```
Start blockchain visualization
Stop blockchain visualization
Simulate blockchain activity
```

---

## Starting the Visualization

**TUI:** Visualization → Start blockchain visualization

Launches a real-time visualization of your regtest blockchain, showing:
- New blocks as they're mined
- Transaction flow between addresses
- Mempool activity

---

## Simulating Blockchain Activity

**TUI:** Visualization → Simulate blockchain activity
**CLI:** `caravan-x simulate --blocks 5 --transactions 3`

Generates realistic blockchain activity for the visualization:
- Creates random wallets and transactions
- Mines blocks at intervals
- Shows the full lifecycle of transactions (creation → mempool → confirmation)

---

## Future Improvements

The visualization system is being enhanced (Phase 2 roadmap) to include:
- Mempool.space-style block visualization
- Transaction flow diagrams
- Real-time UTXO tracking
- Fee estimation displays
