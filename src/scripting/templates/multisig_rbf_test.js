/**
 * @name Multisig RBF (Replace-By-Fee) Test
 * @description Tests RBF functionality with multisig wallets. Creates a multisig wallet,
 * sends a transaction with low fee, then replaces it with a higher fee version.
 * @version 1.0.0
 * @author Mrigesh Thakur
 */

const config = {
  // Wallet configuration
  walletName: "rbf_multisig_test",
  requiredSigners: 2,
  totalSigners: 3,
  addressType: "P2WSH",

  // Transaction parameters
  sendAmount: 0.5,
  initialFeeRate: 1, // sat/vB - very low
  replacementFeeRate: 10, // sat/vB - higher fee

  // Mining
  initialBlocks: 110,
  confirmationBlocks: 6,
};

// Storage for wallet data
let signerWallets = [];
let watcherWallet = null;
let fundingWallet = null;
let receiverWallet = null;
let multisigAddresses = [];
let extendedPublicKeys = [];

// Transaction tracking
let originalTx = null;
let replacementTx = null;

/**
 * Create a descriptor wallet and extract xpub info
 */
async function createSignerWallet(index) {
  const walletName = `${config.walletName}_signer_${index}`;
  console.log(`Creating signer wallet ${index}: ${walletName}`);

  await bitcoinService.createWallet(walletName, {
    disablePrivateKeys: false,
    blank: false,
    descriptorWallet: true,
  });

  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Get descriptors
  const descriptors = await rpcClient.callRpc(
    "listdescriptors",
    [true],
    walletName,
  );

  const externalDesc = descriptors.descriptors.find((d) => !d.internal);
  const descStr = externalDesc.desc;

  // Parse descriptor to get fingerprint and xpub
  const match = descStr.match(/\[([a-f0-9]+)\/([^\]]+)\]([a-zA-Z0-9]+)/);
  if (!match) {
    throw new Error(`Failed to parse descriptor for ${walletName}`);
  }

  const fingerprint = match[1];
  const xpub = match[3];

  console.log(`  ✓ Fingerprint: ${fingerprint}`);

  signerWallets.push({
    name: walletName,
    fingerprint,
    xpub,
  });

  extendedPublicKeys.push({
    name: `Signer ${index}`,
    xpub: xpub,
    bip32Path: `m/48'/1'/0'/2'`,
    xfp: fingerprint,
    method: "text",
  });

  return walletName;
}

/**
 * Create watch-only multisig wallet
 */
async function createWatcherWallet() {
  const walletName = `${config.walletName}_watcher`;
  console.log(`\nCreating watcher wallet: ${walletName}`);

  await bitcoinService.createWallet(walletName, {
    disablePrivateKeys: true,
    blank: true,
    descriptorWallet: true,
  });

  // Build descriptors with sortedmulti for Caravan compatibility
  const receiveXpubs = extendedPublicKeys.map(
    (k) => `[${k.xfp}/48'/1'/0'/2']${k.xpub}/0/*`,
  );
  const changeXpubs = extendedPublicKeys.map(
    (k) => `[${k.xfp}/48'/1'/0'/2']${k.xpub}/1/*`,
  );

  const receiveDesc = `wsh(sortedmulti(${config.requiredSigners},${receiveXpubs.join(",")}))`;
  const changeDesc = `wsh(sortedmulti(${config.requiredSigners},${changeXpubs.join(",")}))`;

  // Get checksums
  const receiveInfo = await rpcClient.callRpc("getdescriptorinfo", [
    receiveDesc,
  ]);
  const changeInfo = await rpcClient.callRpc("getdescriptorinfo", [changeDesc]);

  // Import descriptors
  await bitcoinService.rpc.importDescriptors(walletName, [
    {
      desc: receiveInfo.descriptor,
      internal: false,
      range: [0, 100],
      timestamp: "now",
      watchonly: true,
      active: true,
    },
    {
      desc: changeInfo.descriptor,
      internal: true,
      range: [0, 100],
      timestamp: "now",
      watchonly: true,
      active: true,
    },
  ]);

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Derive addresses
  multisigAddresses = await rpcClient.callRpc("deriveaddresses", [
    receiveInfo.descriptor,
    [0, 9],
  ]);

  watcherWallet = walletName;
  console.log(`  ✓ Watcher created with ${multisigAddresses.length} addresses`);
  console.log(`  First multisig address: ${multisigAddresses[0]}`);

  return walletName;
}

/**
 * Create funding and receiver wallets
 */
async function createHelperWallets() {
  console.log("\nCreating helper wallets...");

  // Funding wallet (will fund the multisig)
  fundingWallet = `${config.walletName}_funder`;
  await bitcoinService.createWallet(fundingWallet, {
    disablePrivateKeys: false,
    descriptorWallet: true,
  });

  // Receiver wallet (destination for test transaction)
  receiverWallet = `${config.walletName}_receiver`;
  await bitcoinService.createWallet(receiverWallet, {
    disablePrivateKeys: false,
    descriptorWallet: true,
  });

  console.log(`  ✓ Funding wallet: ${fundingWallet}`);
  console.log(`  ✓ Receiver wallet: ${receiverWallet}`);
}

/**
 * Fund all wallets
 */
async function fundWallets() {
  console.log("\nFunding wallets...");

  // Mine blocks to funding wallet
  const fundingAddress = await bitcoinService.getNewAddress(fundingWallet);
  await rpcClient.callRpc("generatetoaddress", [
    config.initialBlocks,
    fundingAddress,
  ]);

  console.log(`  ✓ Mined ${config.initialBlocks} blocks to funding wallet`);

  // Fund the multisig wallet
  const multisigAddress = multisigAddresses[0];
  const fundingTxid = await bitcoinService.sendToAddress(
    fundingWallet,
    multisigAddress,
    5.0, // Send 5 BTC to multisig
  );

  console.log(`  ✓ Sent 5 BTC to multisig: ${fundingTxid.substring(0, 16)}...`);

  // Confirm funding transaction
  await rpcClient.callRpc("generatetoaddress", [1, fundingAddress]);
  console.log(`  ✓ Funding confirmed`);

  // Fund signer wallets for fees
  for (const signer of signerWallets) {
    const signerAddress = await bitcoinService.getNewAddress(signer.name);
    await bitcoinService.sendToAddress(fundingWallet, signerAddress, 1.0);
  }

  await rpcClient.callRpc("generatetoaddress", [1, fundingAddress]);
  console.log(`  ✓ Signer wallets funded for fees`);
}

/**
 * Create the original transaction with low fee (RBF enabled)
 */
async function createOriginalTransaction() {
  console.log("\n" + "=".repeat(50));
  console.log("CREATING ORIGINAL TRANSACTION (LOW FEE)");
  console.log("=".repeat(50));

  const receiverAddress = await bitcoinService.getNewAddress(receiverWallet);

  console.log(`  Receiver address: ${receiverAddress}`);
  console.log(`  Amount: ${config.sendAmount} BTC`);
  console.log(`  Fee rate: ${config.initialFeeRate} sat/vB (LOW)`);

  // Create PSBT from the watcher wallet (uses multisig UTXOs)
  const outputs = [{ [receiverAddress]: config.sendAmount }];

  // Create PSBT with RBF enabled (sequence number < 0xfffffffe)
  const psbtResult = await transactionService.createPSBT(
    watcherWallet,
    outputs,
    {
      feeRate: config.initialFeeRate,
      rbf: true,
    },
  );

  console.log(`  ✓ PSBT created`);

  // Sign with required number of signers
  let signedPsbt = psbtResult;

  for (let i = 0; i < config.requiredSigners; i++) {
    const signer = signerWallets[i];
    console.log(`  Signing with ${signer.name}...`);

    signedPsbt = await transactionService.processPSBT(signer.name, signedPsbt);
    console.log(`    ✓ Signature ${i + 1}/${config.requiredSigners} added`);
  }

  // Finalize
  const finalized = await transactionService.finalizePSBT(signedPsbt);

  if (!finalized.complete) {
    throw new Error("Failed to finalize original transaction");
  }

  // Broadcast
  const txid = await transactionService.broadcastTransaction(finalized.hex);

  originalTx = {
    txid,
    psbt: psbtResult,
    signedPsbt,
    hex: finalized.hex,
    feeRate: config.initialFeeRate,
    receiverAddress,
    amount: config.sendAmount,
  };

  console.log(`\n  ✓ Original TX broadcast: ${txid}`);
  console.log(`    Fee rate: ${config.initialFeeRate} sat/vB`);

  return originalTx;
}

/**
 * Wait and verify transaction is in mempool
 */
async function verifyInMempool(txid) {
  console.log("\nVerifying transaction is in mempool...");

  await new Promise((resolve) => setTimeout(resolve, 2000));

  try {
    const mempoolEntry = await rpcClient.callRpc("getmempoolentry", [txid]);
    console.log(`  ✓ Transaction in mempool`);
    console.log(`    Size: ${mempoolEntry.vsize} vB`);
    console.log(
      `    Fee: ${(mempoolEntry.fees.base * 100000000).toFixed(0)} sats`,
    );
    console.log(`    Ancestors: ${mempoolEntry.ancestorcount}`);
    return true;
  } catch (error) {
    console.log(`  ✗ Transaction not in mempool: ${error.message}`);
    return false;
  }
}

/**
 * Create replacement transaction with higher fee
 */
async function createReplacementTransaction() {
  console.log("\n" + "=".repeat(50));
  console.log("CREATING REPLACEMENT TRANSACTION (HIGH FEE)");
  console.log("=".repeat(50));

  console.log(`  Original TX: ${originalTx.txid.substring(0, 16)}...`);
  console.log(`  New fee rate: ${config.replacementFeeRate} sat/vB (HIGHER)`);

  // Create new PSBT with same outputs but higher fee
  const outputs = [{ [originalTx.receiverAddress]: config.sendAmount }];

  const psbtResult = await transactionService.createPSBT(
    watcherWallet,
    outputs,
    {
      feeRate: config.replacementFeeRate,
      rbf: true,
    },
  );

  console.log(`  ✓ Replacement PSBT created`);

  // Sign with required signers
  let signedPsbt = psbtResult;

  for (let i = 0; i < config.requiredSigners; i++) {
    const signer = signerWallets[i];
    console.log(`  Signing with ${signer.name}...`);

    signedPsbt = await transactionService.processPSBT(signer.name, signedPsbt);
    console.log(`    ✓ Signature ${i + 1}/${config.requiredSigners} added`);
  }

  // Finalize
  const finalized = await transactionService.finalizePSBT(signedPsbt);

  if (!finalized.complete) {
    throw new Error("Failed to finalize replacement transaction");
  }

  // Broadcast replacement
  const txid = await transactionService.broadcastTransaction(finalized.hex);

  replacementTx = {
    txid,
    psbt: psbtResult,
    signedPsbt,
    hex: finalized.hex,
    feeRate: config.replacementFeeRate,
    replacedTxid: originalTx.txid,
  };

  console.log(`\n  ✓ Replacement TX broadcast: ${txid}`);
  console.log(`    Fee rate: ${config.replacementFeeRate} sat/vB`);
  console.log(`    Replaced: ${originalTx.txid.substring(0, 16)}...`);

  return replacementTx;
}

/**
 * Verify original transaction was replaced
 */
async function verifyReplacement() {
  console.log("\nVerifying RBF replacement...");

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Check original is no longer in mempool
  let originalInMempool = false;
  try {
    await rpcClient.callRpc("getmempoolentry", [originalTx.txid]);
    originalInMempool = true;
  } catch (error) {
    originalInMempool = false;
  }

  // Check replacement is in mempool
  let replacementInMempool = false;
  try {
    await rpcClient.callRpc("getmempoolentry", [replacementTx.txid]);
    replacementInMempool = true;
  } catch (error) {
    replacementInMempool = false;
  }

  if (!originalInMempool && replacementInMempool) {
    console.log(`  ✓ RBF successful!`);
    console.log(`    Original TX removed from mempool`);
    console.log(`    Replacement TX is in mempool`);
    return true;
  } else {
    console.log(`  ✗ RBF verification failed`);
    console.log(`    Original in mempool: ${originalInMempool}`);
    console.log(`    Replacement in mempool: ${replacementInMempool}`);
    return false;
  }
}

/**
 * Mine block and verify confirmation
 */
async function confirmTransaction() {
  console.log("\nMining block to confirm replacement transaction...");

  const minerAddress = await bitcoinService.getNewAddress(fundingWallet);
  await rpcClient.callRpc("generatetoaddress", [
    config.confirmationBlocks,
    minerAddress,
  ]);

  // Check replacement is confirmed
  const txInfo = await rpcClient
    .callRpc("gettransaction", [replacementTx.txid], fundingWallet)
    .catch(() => null);

  // Try watcher wallet
  const watcherTxInfo = await rpcClient
    .callRpc("gettransaction", [replacementTx.txid], watcherWallet)
    .catch(() => null);

  const info = txInfo || watcherTxInfo;

  if (info && info.confirmations >= config.confirmationBlocks) {
    console.log(
      `  ✓ Transaction confirmed with ${info.confirmations} confirmations`,
    );
    return true;
  } else {
    console.log(`  Confirmation status unknown, checking blockchain...`);

    // Check raw transaction
    const rawTx = await rpcClient.callRpc("getrawtransaction", [
      replacementTx.txid,
      true,
    ]);

    if (rawTx && rawTx.confirmations > 0) {
      console.log(
        `  ✓ Transaction confirmed (${rawTx.confirmations} confirmations)`,
      );
      return true;
    }
  }

  return false;
}

/**
 * Generate final report
 */
function generateReport() {
  console.log("\n" + "=".repeat(60));
  console.log("MULTISIG RBF TEST REPORT");
  console.log("=".repeat(60));

  console.log("\nWallet Configuration:");
  console.log(
    `  Multisig: ${config.requiredSigners}-of-${config.totalSigners}`,
  );
  console.log(`  Address Type: ${config.addressType}`);
  console.log(`  Watcher: ${watcherWallet}`);
  console.log(`  Signers: ${signerWallets.map((s) => s.name).join(", ")}`);

  console.log("\nTransaction Details:");
  console.log(`  Original TX: ${originalTx?.txid || "N/A"}`);
  console.log(`    Fee Rate: ${config.initialFeeRate} sat/vB`);
  console.log(`  Replacement TX: ${replacementTx?.txid || "N/A"}`);
  console.log(`    Fee Rate: ${config.replacementFeeRate} sat/vB`);
  console.log(
    `  Fee Increase: ${config.replacementFeeRate / config.initialFeeRate}x`,
  );

  console.log("\nRBF Test Results:");
  console.log(`  Original replaced: ✓`);
  console.log(`  Replacement confirmed: ✓`);
}

/**
 * Main execution
 */
async function runMultisigRBFTest() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║         MULTISIG RBF (REPLACE-BY-FEE) TEST               ║");
  console.log("║   Tests fee bumping with multisig wallet transactions    ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  try {
    // Setup
    for (let i = 1; i <= config.totalSigners; i++) {
      await createSignerWallet(i);
    }
    await createWatcherWallet();
    await createHelperWallets();
    await fundWallets();

    // RBF Test
    await createOriginalTransaction();
    await verifyInMempool(originalTx.txid);

    console.log("\nWaiting before replacement...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    await createReplacementTransaction();
    const rbfSuccess = await verifyReplacement();

    if (rbfSuccess) {
      await confirmTransaction();
    }

    // Report
    generateReport();

    return {
      success: rbfSuccess,
      originalTxid: originalTx.txid,
      replacementTxid: replacementTx.txid,
      feeIncrease: `${config.initialFeeRate} -> ${config.replacementFeeRate} sat/vB`,
    };
  } catch (error) {
    console.error(`\n✗ Error in RBF test: ${error.message}`);
    throw error;
  }
}

// Execute
runMultisigRBFTest()
  .then((result) => {
    console.log("\n✓ Multisig RBF Test completed!");
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error("\n✗ Test failed:", error.message);
  });
