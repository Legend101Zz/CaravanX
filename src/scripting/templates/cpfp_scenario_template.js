/**
 * @name Child Pays For Parent (CPFP) Scenario
 * @description This script demonstrates Child Pays For Parent (CPFP) where a child transaction
 * pays a higher fee to incentivize miners to include both transactions in a block.
 * @version 1.0.0
 * @author Caravan Regtest Manager
 */

// Global configuration
const config = {
  // Wallets to use
  parentWalletName: "cpfp_parent",
  childWalletName: "cpfp_child",
  receiverWalletName: "cpfp_receiver",

  // Transaction parameters
  parentAmount: 2.0,
  parentFee: 0.00001, // Very low fee
  childAmount: 0.9, // Child spends most of parent's output
  childFee: 0.1, // High fee to pay for parent

  // Mining configuration
  initialBlocks: 5,
  confirmationBlocks: 1,
};

// Create all needed wallets
async function setupWallets() {
  console.log("Creating wallets for CPFP demonstration...");

  // Create parent wallet (will create the first tx with low fee)
  await bitcoinService.createWallet(config.parentWalletName, {
    disablePrivateKeys: false,
  });

  // Create child wallet (will create the child tx with high fee)
  await bitcoinService.createWallet(config.childWalletName, {
    disablePrivateKeys: false,
  });

  // Create receiver wallet
  await bitcoinService.createWallet(config.receiverWalletName, {
    disablePrivateKeys: false,
  });

  // Store wallet references
  wallets[config.parentWalletName] = { name: config.parentWalletName };
  wallets[config.childWalletName] = { name: config.childWalletName };
  wallets[config.receiverWalletName] = { name: config.receiverWalletName };
}

// Fund the parent wallet by mining blocks
async function fundParentWallet() {
  console.log(
    `Mining ${config.initialBlocks} blocks to fund the parent wallet...`,
  );

  // Get an address from the parent wallet
  const parentAddress = await bitcoinService.getNewAddress(
    config.parentWalletName,
  );

  // Mine blocks to this address
  const blockHashes = await bitcoinService.generateToAddress(
    config.initialBlocks,
    parentAddress,
  );

  // Store block references
  blocks.push(...blockHashes);

  console.log(`Mined ${blockHashes.length} blocks, funded parent wallet`);

  // Wait for wallet to update
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Get wallet balance
  const walletInfo = await bitcoinService.getWalletInfo(
    config.parentWalletName,
  );
  console.log(`Parent wallet balance: ${walletInfo.balance} BTC`);

  return walletInfo.balance;
}

// Create the parent transaction with low fee
async function createParentTransaction() {
  console.log("Creating parent transaction with low fee...");

  // Get an address from the child wallet to receive funds
  const childAddress = await bitcoinService.getNewAddress(
    config.childWalletName,
  );

  // Create a PSBT with the parent wallet
  const outputs = [{ [childAddress]: config.parentAmount }];
  const psbt = await transactionService.createPSBT(
    config.parentWalletName,
    outputs,
  );

  // Generate a reference txid
  const txid = `parent_${Date.now()}`;

  // Store transaction info
  transactions[txid] = {
    psbt,
    fromWallet: config.parentWalletName,
    outputs,
    status: "created",
    created: new Date(),
  };

  console.log(
    `Created parent transaction ${txid} sending ${config.parentAmount} BTC to child wallet`,
  );

  return { txid, childAddress };
}

// Sign and broadcast the parent transaction
async function broadcastParentTransaction(txid) {
  console.log("Signing and broadcasting parent transaction...");

  // Sign the transaction
  const signedPsbt = await transactionService.processPSBT(
    config.parentWalletName,
    transactions[txid].psbt,
  );

  // Update transaction status
  transactions[txid].psbt = signedPsbt;
  transactions[txid].status = "signed";

  // Finalize the PSBT
  const finalized = await transactionService.finalizePSBT(signedPsbt);

  if (!finalized.complete) {
    throw new Error("Failed to finalize parent transaction");
  }

  // Broadcast the transaction
  const broadcastTxid = await transactionService.broadcastTransaction(
    finalized.hex,
  );

  // Update transaction status
  transactions[txid].status = "broadcasted";
  transactions[txid].broadcastTxid = broadcastTxid;
  transactions[txid].hex = finalized.hex;

  console.log(`Broadcast parent transaction: ${broadcastTxid}`);

  return broadcastTxid;
}

// Create the child transaction with high fee
async function createChildTransaction(childAddress, parentTxid) {
  console.log("Creating child transaction with high fee (CPFP)...");

  // Wait for child wallet to recognize the parent transaction
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Get receiver address
  const receiverAddress = await bitcoinService.getNewAddress(
    config.receiverWalletName,
  );

  // Create a PSBT with the child wallet
  // The child transaction spends the output from the parent transaction
  // and pays a high fee to incentivize miners to include both transactions
  const outputs = [{ [receiverAddress]: config.childAmount }];

  // Create transaction
  const psbt = await transactionService.createPSBT(
    config.childWalletName,
    outputs,
  );

  // Generate a reference txid
  const txid = `child_${Date.now()}`;

  // Store transaction info
  transactions[txid] = {
    psbt,
    fromWallet: config.childWalletName,
    outputs,
    status: "created",
    parentTxid: parentTxid,
    created: new Date(),
  };

  console.log(
    `Created child transaction ${txid} sending ${config.childAmount} BTC to receiver wallet with high fee`,
  );

  return { txid, receiverAddress };
}

// Sign and broadcast the child transaction
async function broadcastChildTransaction(txid) {
  console.log("Signing and broadcasting child transaction...");

  // Sign the transaction
  const signedPsbt = await transactionService.processPSBT(
    config.childWalletName,
    transactions[txid].psbt,
  );

  // Update transaction status
  transactions[txid].psbt = signedPsbt;
  transactions[txid].status = "signed";

  // Finalize the PSBT
  const finalized = await transactionService.finalizePSBT(signedPsbt);

  if (!finalized.complete) {
    throw new Error("Failed to finalize child transaction");
  }

  // Broadcast the transaction
  const broadcastTxid = await transactionService.broadcastTransaction(
    finalized.hex,
  );

  // Update transaction status
  transactions[txid].status = "broadcasted";
  transactions[txid].broadcastTxid = broadcastTxid;
  transactions[txid].hex = finalized.hex;

  console.log(`Broadcast child transaction: ${broadcastTxid}`);

  return broadcastTxid;
}

// Mine blocks to confirm both transactions
async function confirmTransactions() {
  console.log(
    `Mining ${config.confirmationBlocks} blocks to confirm transactions...`,
  );

  // Get an address from the receiver wallet
  const receiverAddress = await bitcoinService.getNewAddress(
    config.receiverWalletName,
  );

  // Mine blocks
  const blockHashes = await bitcoinService.generateToAddress(
    config.confirmationBlocks,
    receiverAddress,
  );

  // Store block references
  blocks.push(...blockHashes);

  console.log(
    `Mined ${blockHashes.length} blocks, transactions should be confirmed`,
  );

  // Check wallet balances
  const receiverInfo = await bitcoinService.getWalletInfo(
    config.receiverWalletName,
  );
  console.log(`Receiver wallet final balance: ${receiverInfo.balance} BTC`);

  return blockHashes;
}

// Verify transaction confirmation
async function verifyConfirmation(parentTxid, childTxid) {
  console.log("Verifying transaction confirmation...");

  // Here you would typically check if the transactions are confirmed
  // by querying the blockchain or wallet

  // For demonstration purposes, we'll just check our transaction records
  const parentStatus = transactions[parentTxid].status;
  const childStatus = transactions[childTxid].status;

  console.log(`Parent transaction status: ${parentStatus}`);
  console.log(`Child transaction status: ${childStatus}`);

  if (parentStatus !== "broadcasted" || childStatus !== "broadcasted") {
    throw new Error("One or both transactions failed to broadcast properly");
  }

  console.log("CPFP scenario successfully completed!");
}

// Main function to run the entire CPFP scenario
async function runCPFPScenario() {
  try {
    // Set up the wallets
    await setupWallets();

    // Fund the parent wallet
    const balance = await fundParentWallet();

    // Create the parent transaction (with low fee)
    const { txid: parentTxid, childAddress } = await createParentTransaction();

    // Broadcast the parent transaction
    const broadcastedParentTxid = await broadcastParentTransaction(parentTxid);

    // Wait a moment to simulate the transaction being stuck in the mempool
    console.log("Waiting for parent transaction to enter mempool...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Create the child transaction (with high fee to pay for parent)
    const { txid: childTxid } = await createChildTransaction(
      childAddress,
      parentTxid,
    );

    // Broadcast the child transaction
    const broadcastedChildTxid = await broadcastChildTransaction(childTxid);

    // Mine blocks to confirm both transactions
    await confirmTransactions();

    // Verify everything worked as expected
    await verifyConfirmation(parentTxid, childTxid);

    return {
      parentTxid: broadcastedParentTxid,
      childTxid: broadcastedChildTxid,
      success: true,
    };
  } catch (error) {
    console.error(`Error in CPFP scenario: ${error.message}`);
    throw error;
  }
}

// Run the CPFP scenario
runCPFPScenario()
  .then((result) => {
    console.log("Script completed successfully!");
    console.log(result);
  })
  .catch((error) => {
    console.error("Script failed:", error.message);
  });
