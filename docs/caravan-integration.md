# Working with Caravan

> 📹 **Video walkthrough:** _Coming soon_

This guide explains how to connect Caravan-X to the Caravan web UI for a complete multisig development workflow.

---

## Overview

Caravan-X provides the backend (Bitcoin Core + wallets), and Caravan provides the frontend (web-based multisig coordinator). Together they give you a full-stack development environment for Bitcoin multisig applications.

---

## Setting Up the Connection

### Step 1: Start Caravan-X in Docker Mode

Docker mode includes the nginx CORS proxy that Caravan needs to communicate with Bitcoin Core from the browser.

### Step 2: Note Your Connection Details

After Caravan-X starts, note:
- **Node URL:** `http://localhost:8080` (or the port assigned by Caravan-X)
- **RPC Username:** The username you configured (default: `caravan_user`)
- **RPC Password:** The password you configured (default: `caravan_pass`)

### Step 3: Configure Caravan

In Caravan's web UI:
1. Go to **Settings**
2. Set the **Bitcoin node URL** to `http://localhost:8080`
3. Enter the same **RPC username and password** from Caravan-X
4. Select **Regtest** as the network

### Step 4: Verify the Connection

Caravan should now show blockchain information from your regtest node. If you see "Connection refused" or CORS errors, verify Docker containers are running: `docker ps`.

---

## Importing Multisig Wallets

When you create a multisig wallet in Caravan-X, a JSON configuration file is saved to the profile's `wallets/` directory.

### In Caravan:

1. Go to **Wallet → Import**
2. Load the configuration JSON file from `~/.caravan-x/profiles/<id>/wallets/`
3. Caravan recognizes the descriptors and shows your addresses

---

## The Signing Workflow

### Creating a Transaction in Caravan

1. In Caravan, go to the **Spend** tab
2. Enter recipient address and amount
3. Click **Create Transaction** to generate a PSBT
4. Copy the PSBT string

### Signing in Caravan-X

1. Go to **Caravan Multisig → Sign Caravan PSBT for import**
2. Paste the PSBT from Caravan
3. Sign with the appropriate signer wallet(s)
4. The signature JSON is copied to your clipboard

### Importing the Signature Back to Caravan

1. In Caravan, go to your transaction in the **Spend** tab
2. Under **Signature**, click **Import**
3. Select **Paste JSON** and paste the clipboard content
4. Click **Add Signature**
5. Repeat for additional required signatures
6. Once all signatures are collected, broadcast the transaction

---

## Bidirectional Workflow

You can create transactions in either direction:

**Caravan → Caravan-X → Caravan:**
1. Create PSBT in Caravan's web UI
2. Sign in Caravan-X (using stored keys)
3. Import signature back to Caravan

**Caravan-X → Caravan:**
1. Create and fully sign in Caravan-X
2. Broadcast from Caravan-X
3. View the confirmed transaction in Caravan

**Caravan-X only:**
1. Create, sign, finalize, and broadcast entirely in Caravan-X
2. No Caravan web UI needed
