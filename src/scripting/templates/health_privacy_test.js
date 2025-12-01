/**
 * @name Caravan Health Privacy Test
 * @description Creates multisig wallets with different privacy levels to test Caravan's health package.
 * Generates wallets with good (no UTXO mixing, no address reuse), moderate (some UTXO mixing),
 * and bad (UTXO mixing + address reuse) privacy patterns.
 * @version 1.0.0
 * @author Mrigesh Thakur
 */

// Configuration for privacy test scenarios
const config = {
  // Base name for wallets
  baseName: "health_test",

  // Number of transactions per wallet
  transactionsPerWallet: 15,

  // Multisig configuration
  requiredSigners: 2,
  totalSigners: 3,

  // Address type: P2WSH, P2SH-P2WSH, or P2SH
  addressType: "P2WSH",

  // Initial funding amount per signer wallet
  initialFunding: 50,

  // Amount ranges for transactions (in BTC)
  amounts: {
    small: 0.001,
    medium: 0.01,
    large: 0.1,
  },

  // Blocks to mine between operations
  confirmationBlocks: 1,
};

// Storage for created wallets and addresses
const createdWallets = {
  good: { signers: [], watcher: null, addresses: [], config: null },
  moderate: { signers: [], watcher: null, addresses: [], config: null },
  bad: { signers: [], watcher: null, addresses: [], config: null },
};

// Track all transactions for reporting
const transactionHistory = {
  good: [],
  moderate: [],
  bad: [],
};

/**
 * Create a single signer wallet and extract its xpub
 */
async function createSignerWallet(name, index) {
  const walletName = `${name}_signer_${index}`;

  console.log(`Creating signer wallet: ${walletName}`);

  await bitcoinService.createWallet(walletName, {
    disablePrivateKeys: false,
    blank: false,
    descriptorWallet: true,
  });

  // Wait for wallet to initialize
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Get wallet descriptors to extract xpub and fingerprint
  const descriptors = await rpcClient.callRpc(
    "listdescriptors",
    [true],
    walletName,
  );

  // Find external descriptor (not internal/change)
  const externalDesc = descriptors.descriptors.find((d) => !d.internal);

  if (!externalDesc) {
    throw new Error(`Could not find external descriptor for ${walletName}`);
  }

  // Extract fingerprint and xpub from descriptor
  // Format: wpkh([fingerprint/path]xpub.../0/*)
  const descStr = externalDesc.desc;
  const match = descStr.match(/\[([a-f0-9]+)\/([^\]]+)\]([a-zA-Z0-9]+)/);

  if (!match) {
    throw new Error(`Could not parse descriptor: ${descStr}`);
  }

  const fingerprint = match[1];
  const derivationPath = match[2];
  const xpub = match[3];

  console.log(`  Fingerprint: ${fingerprint}`);
  console.log(`  XPub: ${xpub.substring(0, 20)}...`);

  return {
    walletName,
    fingerprint,
    derivationPath,
    xpub,
    // Full extended public key info for Caravan config
    extendedPublicKey: {
      name: `Signer ${index}`,
      xpub: xpub,
      bip32Path: `m/48'/1'/0'/2'`, // Standard BIP48 path for P2WSH multisig
      xfp: fingerprint,
      method: "text",
    },
  };
}

/**
 * Create watch-only wallet with imported descriptors
 */
async function createWatcherWallet(name, extendedPublicKeys) {
  const watcherName = `${name}_watcher`;

  console.log(`Creating watcher wallet: ${watcherName}`);

  await bitcoinService.createWallet(watcherName, {
    disablePrivateKeys: true,
    blank: true,
    descriptorWallet: true,
  });

  // Build Caravan-compatible descriptors using sortedmulti
  const receiveXpubs = extendedPublicKeys.map(
    (key) => `[${key.xfp}/48'/1'/0'/2']${key.xpub}/0/*`,
  );
  const changeXpubs = extendedPublicKeys.map(
    (key) => `[${key.xfp}/48'/1'/0'/2']${key.xpub}/1/*`,
  );

  let receiveDescriptor, changeDescriptor;

  switch (config.addressType) {
    case "P2WSH":
      receiveDescriptor = `wsh(sortedmulti(${config.requiredSigners},${receiveXpubs.join(",")}))`;
      changeDescriptor = `wsh(sortedmulti(${config.requiredSigners},${changeXpubs.join(",")}))`;
      break;
    case "P2SH-P2WSH":
      receiveDescriptor = `sh(wsh(sortedmulti(${config.requiredSigners},${receiveXpubs.join(",")})))`;
      changeDescriptor = `sh(wsh(sortedmulti(${config.requiredSigners},${changeXpubs.join(",")})))`;
      break;
    case "P2SH":
      receiveDescriptor = `sh(sortedmulti(${config.requiredSigners},${receiveXpubs.join(",")}))`;
      changeDescriptor = `sh(sortedmulti(${config.requiredSigners},${changeXpubs.join(",")}))`;
      break;
    default:
      throw new Error(`Unsupported address type: ${config.addressType}`);
  }

  // Get checksums for descriptors
  const receiveInfo = await rpcClient.callRpc("getdescriptorinfo", [
    receiveDescriptor,
  ]);
  const changeInfo = await rpcClient.callRpc("getdescriptorinfo", [
    changeDescriptor,
  ]);

  const receiveWithChecksum = receiveInfo.descriptor;
  const changeWithChecksum = changeInfo.descriptor;

  console.log(
    `  Receive descriptor checksum: ${receiveWithChecksum.split("#")[1]}`,
  );
  console.log(
    `  Change descriptor checksum: ${changeWithChecksum.split("#")[1]}`,
  );

  // Import descriptors
  const descriptors = [
    {
      desc: receiveWithChecksum,
      internal: false,
      range: [0, 1000],
      timestamp: "now",
      watchonly: true,
      active: true,
    },
    {
      desc: changeWithChecksum,
      internal: true,
      range: [0, 1000],
      timestamp: "now",
      watchonly: true,
      active: true,
    },
  ];

  const importResult = await bitcoinService.rpc.importDescriptors(
    watcherName,
    descriptors,
  );

  const success = Array.isArray(importResult)
    ? importResult.every((r) => r.success)
    : false;

  if (!success) {
    console.error("Warning: Some descriptors may not have imported correctly");
  }

  // Wait for descriptors to become active
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return {
    watcherName,
    receiveDescriptor: receiveWithChecksum,
    changeDescriptor: changeWithChecksum,
  };
}

/**
 * Derive addresses from the watcher wallet
 */
async function deriveAddresses(watcherName, receiveDescriptor, count) {
  console.log(`Deriving ${count} addresses from watcher wallet...`);

  const addresses = await rpcClient.callRpc("deriveaddresses", [
    receiveDescriptor,
    [0, count - 1],
  ]);

  console.log(`  Derived ${addresses.length} addresses`);
  console.log(`  First address: ${addresses[0]}`);
  console.log(`  Last address: ${addresses[addresses.length - 1]}`);

  return addresses;
}

/**
 * Fund signer wallets by mining
 */
async function fundSignerWallets(signerWallets) {
  console.log("Funding signer wallets...");

  for (const signer of signerWallets) {
    const address = await bitcoinService.getNewAddress(signer.walletName);
    await rpcClient.callRpc("generatetoaddress", [10, address]);
  }

  // Mine additional blocks to mature coinbase
  const maturityAddress = await bitcoinService.getNewAddress(
    signerWallets[0].walletName,
  );
  await rpcClient.callRpc("generatetoaddress", [101, maturityAddress]);

  console.log("  Signer wallets funded and coinbase matured");
}

/**
 * Create Caravan-compatible wallet config
 */
function createCaravanConfig(name, extendedPublicKeys, watcherName) {
  return {
    name: name,
    addressType: config.addressType,
    network: "regtest",
    quorum: {
      requiredSigners: config.requiredSigners,
      totalSigners: config.totalSigners,
    },
    extendedPublicKeys: extendedPublicKeys,
    startingAddressIndex: 0,
    uuid: `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
    client: {
      type: "private",
      url: "http://127.0.0.1:18443",
      username: "user",
      walletName: watcherName,
    },
  };
}

/**
 * Create a complete multisig wallet setup
 */
async function createMultisigWallet(privacyLevel) {
  const name = `${config.baseName}_${privacyLevel}`;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Creating ${privacyLevel.toUpperCase()} privacy wallet: ${name}`);
  console.log(`${"=".repeat(60)}`);

  // Create signer wallets
  const signers = [];
  for (let i = 1; i <= config.totalSigners; i++) {
    const signer = await createSignerWallet(name, i);
    signers.push(signer);
  }

  // Extract extended public keys
  const extendedPublicKeys = signers.map((s) => s.extendedPublicKey);

  // Create watcher wallet
  const watcher = await createWatcherWallet(name, extendedPublicKeys);

  // Derive addresses
  const addressCount =
    privacyLevel === "bad" ? 5 : config.transactionsPerWallet + 5;
  const addresses = await deriveAddresses(
    watcher.watcherName,
    watcher.receiveDescriptor,
    addressCount,
  );

  // Fund signer wallets
  await fundSignerWallets(signers);

  // Create Caravan config
  const caravanConfig = createCaravanConfig(
    name,
    extendedPublicKeys,
    watcher.watcherName,
  );

  // Store wallet info
  createdWallets[privacyLevel] = {
    signers,
    watcher,
    addresses,
    config: caravanConfig,
  };

  console.log(
    `✓ ${privacyLevel.toUpperCase()} privacy wallet created successfully`,
  );

  return createdWallets[privacyLevel];
}

/**
 * Create transactions with GOOD privacy patterns
 * - No address reuse
 * - No UTXO mixing (simple spends with single inputs)
 * - Varied amounts
 */
async function createGoodPrivacyTransactions(walletData) {
  console.log("\nCreating GOOD privacy transactions...");
  console.log("  Pattern: Single input, unique addresses, varied amounts");

  const { signers, addresses } = walletData;
  let addressIndex = 0;

  for (let i = 0; i < config.transactionsPerWallet; i++) {
    // Use different signer for each transaction
    const signerIndex = i % signers.length;
    const signer = signers[signerIndex];

    // Always use a fresh address (no reuse)
    const toAddress = addresses[addressIndex++];

    // Vary the amounts to improve spread factor
    const amountVariants = [
      config.amounts.small * (1 + Math.random()),
      config.amounts.medium * (1 + Math.random() * 0.5),
      config.amounts.large * (0.5 + Math.random() * 0.5),
    ];
    const amount = amountVariants[i % 3];

    try {
      const txid = await bitcoinService.sendToAddress(
        signer.walletName,
        toAddress,
        parseFloat(amount.toFixed(8)),
      );

      transactionHistory.good.push({
        index: i,
        txid,
        from: signer.walletName,
        to: toAddress,
        amount,
        type: "simple_spend",
      });

      console.log(
        `  TX ${i + 1}: ${amount.toFixed(8)} BTC -> ${toAddress.substring(0, 20)}...`,
      );

      // Mine a block occasionally for confirmations
      if (i > 0 && i % 5 === 0) {
        await rpcClient.callRpc("generatetoaddress", [
          1,
          await bitcoinService.getNewAddress(signer.walletName),
        ]);
      }
    } catch (error) {
      console.log(`  Warning: TX ${i + 1} failed: ${error.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  // Mine final confirmation
  await rpcClient.callRpc("generatetoaddress", [
    config.confirmationBlocks,
    await bitcoinService.getNewAddress(signers[0].walletName),
  ]);

  console.log(
    `✓ Created ${transactionHistory.good.length} good privacy transactions`,
  );
}

/**
 * Create transactions with MODERATE privacy patterns
 * - No address reuse
 * - Some UTXO mixing (multiple inputs sometimes)
 * - Consolidation transactions
 */
async function createModeratePrivacyTransactions(walletData) {
  console.log("\nCreating MODERATE privacy transactions...");
  console.log("  Pattern: Some consolidation, no address reuse");

  const { signers, addresses } = walletData;
  let addressIndex = 0;

  for (let i = 0; i < config.transactionsPerWallet; i++) {
    const signerIndex = i % signers.length;
    const signer = signers[signerIndex];

    // Always use fresh address
    const toAddress = addresses[addressIndex++];

    // Mix of amounts
    let amount;
    let txType;

    if (i % 4 === 0 && i > 0) {
      // Consolidation-style transaction (larger amounts)
      amount = config.amounts.large * (1 + Math.random());
      txType = "consolidation";
    } else if (i % 3 === 0) {
      // Fragmentation-style (smaller amounts)
      amount = config.amounts.small * (0.5 + Math.random());
      txType = "fragmentation";
    } else {
      // Normal spend
      amount = config.amounts.medium * (0.8 + Math.random() * 0.4);
      txType = "simple_spend";
    }

    try {
      const txid = await bitcoinService.sendToAddress(
        signer.walletName,
        toAddress,
        parseFloat(amount.toFixed(8)),
      );

      transactionHistory.moderate.push({
        index: i,
        txid,
        from: signer.walletName,
        to: toAddress,
        amount,
        type: txType,
      });

      console.log(
        `  TX ${i + 1} (${txType}): ${amount.toFixed(8)} BTC -> ${toAddress.substring(0, 20)}...`,
      );

      if (i > 0 && i % 4 === 0) {
        await rpcClient.callRpc("generatetoaddress", [
          1,
          await bitcoinService.getNewAddress(signer.walletName),
        ]);
      }
    } catch (error) {
      console.log(`  Warning: TX ${i + 1} failed: ${error.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  await rpcClient.callRpc("generatetoaddress", [
    config.confirmationBlocks,
    await bitcoinService.getNewAddress(signers[0].walletName),
  ]);

  console.log(
    `✓ Created ${transactionHistory.moderate.length} moderate privacy transactions`,
  );
}

/**
 * Create transactions with BAD privacy patterns
 * - Heavy address reuse
 * - UTXO mixing
 * - Predictable amounts (round numbers)
 */
async function createBadPrivacyTransactions(walletData) {
  console.log("\nCreating BAD privacy transactions...");
  console.log("  Pattern: Address reuse, UTXO mixing, round amounts");

  const { signers, addresses } = walletData;

  // Use only a few addresses repeatedly (bad privacy!)
  const reusedAddresses = addresses.slice(0, 3);

  for (let i = 0; i < config.transactionsPerWallet; i++) {
    const signerIndex = i % signers.length;
    const signer = signers[signerIndex];

    // Reuse addresses heavily
    const toAddress = reusedAddresses[i % reusedAddresses.length];

    // Use round amounts (bad for privacy)
    const roundAmounts = [0.01, 0.05, 0.1, 0.001, 0.005];
    const amount = roundAmounts[i % roundAmounts.length];

    try {
      const txid = await bitcoinService.sendToAddress(
        signer.walletName,
        toAddress,
        amount,
      );

      transactionHistory.bad.push({
        index: i,
        txid,
        from: signer.walletName,
        to: toAddress,
        amount,
        type: "reuse",
        addressReused: true,
      });

      console.log(
        `  TX ${i + 1} (REUSED): ${amount} BTC -> ${toAddress.substring(0, 20)}...`,
      );

      // Create additional "mixing" transaction back to same address
      if (i % 2 === 0 && i > 0) {
        try {
          const mixTxid = await bitcoinService.sendToAddress(
            signer.walletName,
            toAddress,
            roundAmounts[(i + 1) % roundAmounts.length],
          );

          transactionHistory.bad.push({
            index: `${i}-mix`,
            txid: mixTxid,
            from: signer.walletName,
            to: toAddress,
            amount: roundAmounts[(i + 1) % roundAmounts.length],
            type: "mixing",
            addressReused: true,
          });

          console.log(`  TX ${i + 1}-MIX: Additional to same address (BAD!)`);
        } catch (mixError) {
          // Ignore mix errors
        }
      }

      if (i > 0 && i % 5 === 0) {
        await rpcClient.callRpc("generatetoaddress", [
          1,
          await bitcoinService.getNewAddress(signer.walletName),
        ]);
      }
    } catch (error) {
      console.log(`  Warning: TX ${i + 1} failed: ${error.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  await rpcClient.callRpc("generatetoaddress", [
    config.confirmationBlocks,
    await bitcoinService.getNewAddress(signers[0].walletName),
  ]);

  console.log(
    `✓ Created ${transactionHistory.bad.length} bad privacy transactions`,
  );
}

/**
 * Save Caravan configs to files
 */
async function saveCaravanConfigs() {
  console.log("\nSaving Caravan wallet configurations...");

  const fs = require("fs-extra");
  const path = require("path");
  const configDir = path.join(
    process.env.HOME || "~",
    ".caravan-regtest",
    "caravan-wallets",
  );

  await fs.ensureDir(configDir);

  for (const [level, data] of Object.entries(createdWallets)) {
    if (data.config) {
      const filename = `${config.baseName}_${level}_config.json`;
      const filepath = path.join(configDir, filename);
      await fs.writeJson(filepath, data.config, { spaces: 2 });
      console.log(`  Saved: ${filepath}`);
    }
  }
}

/**
 * Generate summary report
 */
function generateReport() {
  console.log("\n" + "=".repeat(60));
  console.log("HEALTH PRIVACY TEST SUMMARY");
  console.log("=".repeat(60));

  for (const [level, txs] of Object.entries(transactionHistory)) {
    const wallet = createdWallets[level];
    console.log(`\n${level.toUpperCase()} Privacy Wallet:`);
    console.log(`  Watcher: ${wallet.watcher?.watcherName || "N/A"}`);
    console.log(
      `  Signers: ${wallet.signers?.map((s) => s.walletName).join(", ") || "N/A"}`,
    );
    console.log(`  Addresses derived: ${wallet.addresses?.length || 0}`);
    console.log(`  Transactions created: ${txs.length}`);

    if (level === "bad") {
      const reusedCount = txs.filter((t) => t.addressReused).length;
      console.log(`  Address reuse count: ${reusedCount}`);
    }

    // Count transaction types
    const typeCounts = {};
    txs.forEach((tx) => {
      typeCounts[tx.type] = (typeCounts[tx.type] || 0) + 1;
    });
    console.log(`  Transaction types: ${JSON.stringify(typeCounts)}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("EXPECTED HEALTH SCORES:");
  console.log("=".repeat(60));
  console.log("  GOOD Privacy:     Score should be ~0.7-0.9 (healthy)");
  console.log("  MODERATE Privacy: Score should be ~0.4-0.6 (some concerns)");
  console.log("  BAD Privacy:      Score should be ~0.1-0.3 (poor)");
  console.log(
    "\nImport the configs into Caravan to analyze with Health Package!",
  );
}

/**
 * Main execution function
 */
async function runHealthPrivacyTest() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║       CARAVAN HEALTH PRIVACY TEST SCENARIO               ║");
  console.log("║  Creates wallets with different privacy characteristics  ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  try {
    // Create all three wallet types
    await createMultisigWallet("good");
    await createMultisigWallet("moderate");
    await createMultisigWallet("bad");

    // Create transactions for each
    await createGoodPrivacyTransactions(createdWallets.good);
    await createModeratePrivacyTransactions(createdWallets.moderate);
    await createBadPrivacyTransactions(createdWallets.bad);

    // Save configs
    await saveCaravanConfigs();

    // Generate report
    generateReport();

    return {
      success: true,
      wallets: {
        good: createdWallets.good.config?.name,
        moderate: createdWallets.moderate.config?.name,
        bad: createdWallets.bad.config?.name,
      },
      transactions: {
        good: transactionHistory.good.length,
        moderate: transactionHistory.moderate.length,
        bad: transactionHistory.bad.length,
      },
    };
  } catch (error) {
    console.error(`\nError in health privacy test: ${error.message}`);
    throw error;
  }
}

// Execute the test
runHealthPrivacyTest()
  .then((result) => {
    console.log("\n✓ Health Privacy Test completed successfully!");
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error("\n✗ Health Privacy Test failed:", error.message);
  });
