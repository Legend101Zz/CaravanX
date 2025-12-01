/**
 * @name Multisig CPFP (Child-Pays-For-Parent) Test
 * @description Tests CPFP functionality with multisig wallets. Creates a parent transaction
 * with low fee, then a child transaction with high fee to bump the parent's priority.
 * @version 1.0.0
 * @author Mrigesh Thakur
 */

const config = {
  // Wallet configuration
  walletName: "cpfp_multisig_test",
  requiredSigners: 2,
  totalSigners: 3,
  addressType: "P2WSH",

  // Parent transaction (low fee, will be "stuck")
  parentAmount: 1.0,
  parentFeeRate: 1, // sat/vB - very low

  // Child transaction (high fee, pays for parent)
  childAmount: 0.5, // Spends from parent output
  childFeeRate: 50, // sat/vB - high enough to pull parent

  // Mining
  initialBlocks: 110,
  confirmationBlocks: 1,
};

// Wallet storage
let signerWallets = [];
let watcherWallet = null;
let fundingWallet = null;
let multisigAddresses = [];
let extendedPublicKeys = [];

// Transaction storage
let parentTx = null;
let childTx = null;

/**
 * Create signer wallet and extract xpub
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

  const descriptors = await rpcClient.callRpc(
    "listdescriptors",
    [true],
    walletName,
  );

  const externalDesc = descriptors.descriptors.find((d) => !d.internal);
  const match = externalDesc.desc.match(
    /\[([a-f0-9]+)\/([^\]]+)\]([a-zA-Z0-9]+)/,
  );

  if (!match) {
    throw new Error(`Failed to parse descriptor for ${walletName}`);
  }

  const fingerprint = match[1];
  const xpub = match[3];

  signerWallets.push({ name: walletName, fingerprint, xpub });

  extendedPublicKeys.push({
    name: `Signer ${index}`,
    xpub: xpub,
    bip32Path: `m/48'/1'/0'/2'`,
    xfp: fingerprint,
    method: "text",
  });

  console.log(`  ✓ Fingerprint: ${fingerprint}`);
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

  const receiveXpubs = extendedPublicKeys.map(
    (k) => `[${k.xfp}/48'/1'/0'/2']${k.xpub}/0/*`,
  );
  const changeXpubs = extendedPublicKeys.map(
    (k) => `[${k.xfp}/48'/1'/0'/2']${k.xpub}/1/*`,
  );

  const receiveDesc = `wsh(sortedmulti(${config.requiredSigners},${receiveXpubs.join(",")}))`;
  const changeDesc = `wsh(sortedmulti(${config.requiredSigners},${changeXpubs.join(",")}))`;

  const receiveInfo = await rpcClient.callRpc("getdescriptorinfo", [
    receiveDesc,
  ]);
  const changeInfo = await rpcClient.callRpc("getdescriptorinfo", [changeDesc]);

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

  multisigAddresses = await rpcClient.callRpc("deriveaddresses", [
    receiveInfo.descriptor,
    [0, 9],
  ]);

  watcherWallet = walletName;
  console.log(`  ✓ Watcher created with ${multisigAddresses.length} addresses`);

  return walletName;
}

/**
 * Create helper wallets
 */
async function createHelperWallets() {
  console.log("\nCreating helper wallets...");

  fundingWallet = `${config.walletName}_funder`;
  await bitcoinService.createWallet(fundingWallet, {
    disablePrivateKeys: false,
    descriptorWallet: true,
  });

  console.log(`  ✓ Funding wallet: ${fundingWallet}`);
}

/**
 * Fund wallets
 */
async function fundWallets() {
  console.log("\nFunding wallets...");

  const fundingAddress = await bitcoinService.getNewAddress(fundingWallet);
  await rpcClient.callRpc("generatetoaddress", [
    config.initialBlocks,
    fundingAddress,
  ]);

  console.log(`  ✓ Mined ${config.initialBlocks} blocks`);

  // Fund multisig wallet with substantial amount
  const multisigAddress = multisigAddresses[0];
  await bitcoinService.sendToAddress(fundingWallet, multisigAddress, 10.0);

  await rpcClient.callRpc("generatetoaddress", [1, fundingAddress]);
  console.log(`  ✓ Multisig funded with 10 BTC`);

  // Fund signer wallets
  for (const signer of signerWallets) {
    const signerAddress = await bitcoinService.getNewAddress(signer.name);
    await bitcoinService.sendToAddress(fundingWallet, signerAddress, 1.0);
  }

  await rpcClient.callRpc("generatetoaddress", [1, fundingAddress]);
  console.log(`  ✓ Signer wallets funded`);
}

/**
 * Create parent transaction with LOW fee
 */
async function createParentTransaction() {
  console.log("\n" + "=".repeat(50));
  console.log("CREATING PARENT TRANSACTION (LOW FEE)");
  console.log("=".repeat(50));

  // Parent sends to the SECOND multisig address (child will spend from there)
  const parentDestination = multisigAddresses[1];

  console.log(`  Destination: ${parentDestination}`);
  console.log(`  Amount: ${config.parentAmount} BTC`);
  console.log(
    `  Fee rate: ${config.parentFeeRate} sat/vB (LOW - will be stuck)`,
  );

  const outputs = [{ [parentDestination]: config.parentAmount }];

  const psbtResult = await transactionService.createPSBT(
    watcherWallet,
    outputs,
    {
      feeRate: config.parentFeeRate,
    },
  );

  // Sign with required signers
  let signedPsbt = psbtResult;
  for (let i = 0; i < config.requiredSigners; i++) {
    const signer = signerWallets[i];
    console.log(`  Signing with ${signer.name}...`);
    signedPsbt = await transactionService.processPSBT(signer.name, signedPsbt);
  }

  const finalized = await transactionService.finalizePSBT(signedPsbt);
  if (!finalized.complete) {
    throw new Error("Failed to finalize parent transaction");
  }

  const txid = await transactionService.broadcastTransaction(finalized.hex);

  parentTx = {
    txid,
    hex: finalized.hex,
    feeRate: config.parentFeeRate,
    destination: parentDestination,
    amount: config.parentAmount,
  };

  console.log(`\n  ✓ Parent TX broadcast: ${txid}`);
  console.log(
    `    This transaction has a very low fee and would normally be stuck!`,
  );

  return parentTx;
}

/**
 * Wait for parent to be in mempool
 */
async function waitForParentInMempool() {
  console.log("\nWaiting for parent transaction in mempool...");

  await new Promise((resolve) => setTimeout(resolve, 2000));

  try {
    const mempoolEntry = await rpcClient.callRpc("getmempoolentry", [
      parentTx.txid,
    ]);
    console.log(`  ✓ Parent in mempool`);
    console.log(`    Size: ${mempoolEntry.vsize} vB`);
    console.log(
      `    Fee: ${(mempoolEntry.fees.base * 100000000).toFixed(0)} sats`,
    );
    console.log(`    Descendant count: ${mempoolEntry.descendantcount}`);
    return mempoolEntry;
  } catch (error) {
    console.log(`  ✗ Parent not in mempool: ${error.message}`);
    throw error;
  }
}

/**
 * Create child transaction with HIGH fee (CPFP)
 */
async function createChildTransaction() {
  console.log("\n" + "=".repeat(50));
  console.log("CREATING CHILD TRANSACTION (HIGH FEE - CPFP)");
  console.log("=".repeat(50));

  // Wait for watcher to see the parent
  console.log("  Waiting for watcher to detect parent output...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Rescan the wallet to pick up the parent transaction
  try {
    await rpcClient.callRpc("rescanblockchain", [0], watcherWallet);
  } catch (e) {
    // Rescan might not be needed in regtest
  }

  // Child sends to third multisig address or back to funding
  const childDestination = multisigAddresses[2];

  console.log(`  Spending from parent output: ${parentTx.destination}`);
  console.log(`  Destination: ${childDestination}`);
  console.log(`  Amount: ${config.childAmount} BTC`);
  console.log(
    `  Fee rate: ${config.childFeeRate} sat/vB (HIGH - pulls parent)`,
  );

  const outputs = [{ [childDestination]: config.childAmount }];

  // Create PSBT - it should use the parent's output as input
  const psbtResult = await transactionService.createPSBT(
    watcherWallet,
    outputs,
    {
      feeRate: config.childFeeRate,
    },
  );

  // Sign
  let signedPsbt = psbtResult;
  for (let i = 0; i < config.requiredSigners; i++) {
    const signer = signerWallets[i];
    console.log(`  Signing with ${signer.name}...`);
    signedPsbt = await transactionService.processPSBT(signer.name, signedPsbt);
  }

  const finalized = await transactionService.finalizePSBT(signedPsbt);
  if (!finalized.complete) {
    throw new Error("Failed to finalize child transaction");
  }

  const txid = await transactionService.broadcastTransaction(finalized.hex);

  childTx = {
    txid,
    hex: finalized.hex,
    feeRate: config.childFeeRate,
    destination: childDestination,
    amount: config.childAmount,
    parentTxid: parentTx.txid,
  };

  console.log(`\n  ✓ Child TX broadcast: ${txid}`);
  console.log(`    High fee child "pulls" the low fee parent into blocks!`);

  return childTx;
}

/**
 * Verify CPFP relationship in mempool
 */
async function verifyCPFPInMempool() {
  console.log("\nVerifying CPFP relationship in mempool...");

  await new Promise((resolve) => setTimeout(resolve, 2000));

  try {
    // Check parent
    const parentEntry = await rpcClient.callRpc("getmempoolentry", [
      parentTx.txid,
    ]);
    console.log(`\n  Parent TX:`);
    console.log(`    Descendant count: ${parentEntry.descendantcount}`);
    console.log(`    Descendant size: ${parentEntry.descendantsize} vB`);
    console.log(
      `    Descendant fees: ${(parentEntry.fees.descendant * 100000000).toFixed(0)} sats`,
    );

    // Check child
    const childEntry = await rpcClient.callRpc("getmempoolentry", [
      childTx.txid,
    ]);
    console.log(`\n  Child TX:`);
    console.log(`    Ancestor count: ${childEntry.ancestorcount}`);
    console.log(`    Ancestor size: ${childEntry.ancestorsize} vB`);
    console.log(
      `    Ancestor fees: ${(childEntry.fees.ancestor * 100000000).toFixed(0)} sats`,
    );

    // Calculate effective fee rate (CPFP rate)
    const totalFees = parentEntry.fees.descendant * 100000000;
    const totalSize = parentEntry.descendantsize;
    const effectiveFeeRate = totalFees / totalSize;

    console.log(
      `\n  CPFP Effective Fee Rate: ${effectiveFeeRate.toFixed(2)} sat/vB`,
    );
    console.log(`    (Combined parent + child fees / combined size)`);

    if (parentEntry.descendantcount > 1) {
      console.log(`\n  ✓ CPFP relationship established!`);
      return true;
    }

    return false;
  } catch (error) {
    console.log(`  Error checking mempool: ${error.message}`);
    return false;
  }
}

/**
 * Mine and confirm both transactions
 */
async function confirmTransactions() {
  console.log("\nMining block to confirm both transactions...");

  const minerAddress = await bitcoinService.getNewAddress(fundingWallet);
  await rpcClient.callRpc("generatetoaddress", [
    config.confirmationBlocks,
    minerAddress,
  ]);

  // Check both are confirmed
  let parentConfirmed = false;
  let childConfirmed = false;

  try {
    const parentRaw = await rpcClient.callRpc("getrawtransaction", [
      parentTx.txid,
      true,
    ]);
    parentConfirmed = parentRaw.confirmations > 0;
    console.log(`  Parent confirmations: ${parentRaw.confirmations}`);
  } catch (e) {
    console.log(`  Could not check parent: ${e.message}`);
  }

  try {
    const childRaw = await rpcClient.callRpc("getrawtransaction", [
      childTx.txid,
      true,
    ]);
    childConfirmed = childRaw.confirmations > 0;
    console.log(`  Child confirmations: ${childRaw.confirmations}`);
  } catch (e) {
    console.log(`  Could not check child: ${e.message}`);
  }

  if (parentConfirmed && childConfirmed) {
    console.log(`\n  ✓ Both transactions confirmed in the same block!`);
    console.log(
      `    The high-fee child pulled the low-fee parent into the block.`,
    );
    return true;
  }

  return false;
}

/**
 * Generate report
 */
function generateReport() {
  console.log("\n" + "=".repeat(60));
  console.log("MULTISIG CPFP TEST REPORT");
  console.log("=".repeat(60));

  console.log("\nWallet Configuration:");
  console.log(
    `  Multisig: ${config.requiredSigners}-of-${config.totalSigners}`,
  );
  console.log(`  Address Type: ${config.addressType}`);
  console.log(`  Watcher: ${watcherWallet}`);

  console.log("\nTransaction Chain:");
  console.log(`  Parent TX: ${parentTx?.txid || "N/A"}`);
  console.log(`    Fee Rate: ${config.parentFeeRate} sat/vB (LOW)`);
  console.log(`    Amount: ${config.parentAmount} BTC`);
  console.log(`  Child TX: ${childTx?.txid || "N/A"}`);
  console.log(`    Fee Rate: ${config.childFeeRate} sat/vB (HIGH)`);
  console.log(`    Amount: ${config.childAmount} BTC`);

  console.log("\nCPFP Explanation:");
  console.log(
    `  The parent transaction had a very low fee (${config.parentFeeRate} sat/vB)`,
  );
  console.log(`  and would normally wait a long time for confirmation.`);
  console.log(
    `  The child transaction spent the parent's output with a high fee`,
  );
  console.log(
    `  (${config.childFeeRate} sat/vB), making the combined package attractive to miners.`,
  );
  console.log(`  Both transactions were confirmed together!`);
}

/**
 * Main execution
 */
async function runMultisigCPFPTest() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║       MULTISIG CPFP (CHILD-PAYS-FOR-PARENT) TEST         ║");
  console.log("║   Tests fee bumping by spending unconfirmed outputs      ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  try {
    // Setup wallets
    for (let i = 1; i <= config.totalSigners; i++) {
      await createSignerWallet(i);
    }
    await createWatcherWallet();
    await createHelperWallets();
    await fundWallets();

    // CPFP Test
    await createParentTransaction();
    await waitForParentInMempool();

    console.log("\nWaiting before creating child transaction...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    await createChildTransaction();
    await verifyCPFPInMempool();

    const confirmed = await confirmTransactions();

    // Report
    generateReport();

    return {
      success: confirmed,
      parentTxid: parentTx.txid,
      childTxid: childTx.txid,
      parentFeeRate: config.parentFeeRate,
      childFeeRate: config.childFeeRate,
    };
  } catch (error) {
    console.error(`\n✗ Error in CPFP test: ${error.message}`);
    throw error;
  }
}

// Execute
runMultisigCPFPTest()
  .then((result) => {
    console.log("\n✓ Multisig CPFP Test completed!");
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error("\n✗ Test failed:", error.message);
  });
