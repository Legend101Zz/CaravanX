import { CaravanService } from "../core/caravan";
import { BitcoinService } from "../core/bitcoin";
import { BitcoinRpcClient } from "../core/rpc";
import {
  CaravanWalletConfig,
  ExtendedPublicKey,
  AddressType,
  Network,
} from "../types/caravan";
import { input, confirm, select, number } from "@inquirer/prompts";
import * as fs from "fs/promises";
import crypto from "crypto";

import chalk from "chalk";

/**
 * Commands for managing Caravan multisig wallets
 */
export class MultisigCommands {
  private readonly caravanService: CaravanService;
  private readonly bitcoinService: BitcoinService;
  private readonly bitcoinRpcClient: BitcoinRpcClient;

  constructor(
    caravanService: CaravanService,
    bitcoinService: BitcoinService,
    bitcoinRpcClient: BitcoinRpcClient,
  ) {
    this.caravanService = caravanService;
    this.bitcoinService = bitcoinService;
    this.bitcoinRpcClient = bitcoinRpcClient;
  }

  /**
   * List all Caravan wallet configurations
   */
  async listCaravanWallets(): Promise<CaravanWalletConfig[]> {
    console.log(chalk.cyan("\n=== Caravan Wallets ==="));

    try {
      const wallets = await this.caravanService.listCaravanWallets();

      if (wallets.length === 0) {
        console.log(chalk.yellow("No Caravan wallet configurations found."));
        return [];
      }

      wallets.forEach((wallet, index) => {
        console.log(chalk.green(`${index + 1}. ${wallet.name}`));
        console.log(`   Network: ${wallet.network}`);
        console.log(`   Address Type: ${wallet.addressType}`);
        console.log(
          `   Quorum: ${wallet.quorum.requiredSigners} of ${wallet.quorum.totalSigners}`,
        );
      });

      return wallets;
    } catch (error) {
      console.error(chalk.red("Error listing Caravan wallets:"), error);
      return [];
    }
  }

  /**
   * Create a new Caravan wallet configuration
   */
  async createCaravanWallet(): Promise<CaravanWalletConfig | null> {
    console.log(chalk.cyan("\n=== Create New Caravan Multisig Wallet ==="));

    try {
      // Basic wallet information
      const name = await input({
        message: "Enter a name for the wallet:",
        validate: (input: string) =>
          input.trim() !== "" ? true : "Please enter a valid name",
      });

      const addressType = await select({
        message: "Select address type:",
        choices: [
          { name: "P2WSH (Native SegWit)", value: AddressType.P2WSH },
          {
            name: "P2SH-P2WSH (Nested SegWit)",
            value: AddressType.P2SH_P2WSH,
          },
          { name: "P2SH (Legacy)", value: AddressType.P2SH },
        ],
        default: AddressType.P2WSH,
      });

      // We'll focus on regtest for now
      const network = Network.REGTEST;

      console.log(chalk.cyan(`Using network: ${network}`));

      // Quorum information
      const requiredSigners = await number({
        message: "Enter the number of required signatures (M):",
        validate: (input: number | undefined) =>
          input !== undefined && input > 0
            ? true
            : "Number must be greater than 0",
        default: 2,
      });

      const totalSigners = await number({
        message: "Enter the total number of signers (N):",
        validate: (input: number | undefined) =>
          input !== undefined && input > 0
            ? true
            : "Number must be greater than 0",

        default: 3,
      });

      // Create watcher wallet for Caravan
      const watcherWalletName = `${name.replace(/\s+/g, "_").toLowerCase()}_watcher`;
      console.log(
        chalk.cyan(
          `\nCreating watch-only wallet "${watcherWalletName}" for Caravan...`,
        ),
      );

      try {
        await this.bitcoinService.createWallet(watcherWalletName, {
          disablePrivateKeys: true,
          blank: false,
          descriptorWallet: true,
        });
        console.log(
          chalk.green(
            `Watch-only wallet "${watcherWalletName}" created successfully!`,
          ),
        );
      } catch (error: any) {
        console.error(
          chalk.red(`Error creating watch wallet: ${error.message}`),
        );
        return null;
      }

      // Ask how to add wallets for signers
      const createMethod = await select({
        message: "How would you like to create signer wallets?",
        choices: [
          { name: "Create new wallets for each signer", value: "new" },
          { name: "Use existing wallets", value: "existing" },
        ],
      });

      // Array to store extended public keys
      const extendedPublicKeys: ExtendedPublicKey[] = [];
      const signerWallets: string[] = [];

      // Map of address types to BIP paths and descriptor types
      const formatInfo = {
        [AddressType.P2WSH]: { path: "84'/1'/0'", descriptorPrefix: "wpkh" },
        [AddressType.P2SH_P2WSH]: {
          path: "49'/1'/0'",
          descriptorPrefix: "sh(wpkh",
        },
        [AddressType.P2SH]: { path: "44'/1'/0'", descriptorPrefix: "pkh" },
      };

      // The BIP path to use based on address type
      const bipPath = formatInfo[addressType].path;
      // Convert BIP path format from 84'/1'/0' to m/84'/1'/0' for display
      const displayBipPath = `m/${bipPath}`;

      if (createMethod === "new") {
        // Create new wallets for each signer
        for (let i = 0; i < totalSigners!; i++) {
          const signerName = `${name.replace(/\s+/g, "_").toLowerCase()}_signer_${i + 1}`;
          signerWallets.push(signerName);

          console.log(
            chalk.cyan(`\nCreating wallet for signer ${i + 1}: ${signerName}`),
          );

          try {
            // Create wallet without descriptor option as it may not be supported in all versions
            await this.bitcoinService.createWallet(signerName, {
              disablePrivateKeys: false,
              blank: false,
              descriptorWallet: false, // Use legacy wallet format for compatibility
            });

            console.log(
              chalk.green(`Wallet "${signerName}" created successfully!`),
            );

            // Get descriptors from the wallet
            const descriptors = await this.getWalletDescriptors(signerName);

            if (!descriptors) {
              throw new Error(
                `Could not get descriptors for wallet ${signerName}`,
              );
            }

            // Find the appropriate descriptor based on the address type
            const desiredDescType = formatInfo[addressType].descriptorPrefix;
            let matchingDesc = null;

            for (const desc of descriptors) {
              if (
                desc.desc.startsWith(desiredDescType) &&
                desc.desc.includes(bipPath) &&
                !desc.internal
              ) {
                matchingDesc = desc;
                break;
              }
            }

            if (!matchingDesc) {
              console.log(
                chalk.yellow(
                  `Could not find matching descriptor for ${addressType} in wallet ${signerName}`,
                ),
              );
              // Try to find any descriptor that contains the BIP path
              for (const desc of descriptors) {
                if (desc.desc.includes(bipPath) && !desc.internal) {
                  matchingDesc = desc;
                  break;
                }
              }

              if (!matchingDesc) {
                throw new Error(
                  `No suitable descriptor found for wallet ${signerName}`,
                );
              }
            }

            // Extract xpub and fingerprint from the descriptor
            const descStr = matchingDesc.desc;
            const xpubMatch = descStr.match(
              /\[([a-f0-9]+)\/.*?\](.*?)\/[0-9]+\/\*\)/,
            );

            if (!xpubMatch) {
              throw new Error(
                `Could not extract xpub from descriptor: ${descStr}`,
              );
            }

            const fingerprint = xpubMatch[1];
            const xpub = xpubMatch[2];

            console.log(chalk.green(`\nExtracted xpub for signer ${i + 1}:`));
            console.log(`Fingerprint: ${fingerprint}`);
            console.log(`XPub: ${xpub}`);
            console.log(`Path: ${displayBipPath}`);

            // Add to extended public keys
            extendedPublicKeys.push({
              name: `Extended Public Key ${i + 1} (${signerName})`,
              xpub: xpub,
              bip32Path: displayBipPath,
              xfp: fingerprint,
              method: "text",
            });
          } catch (error) {
            console.error(
              chalk.red(`Error setting up signer ${i + 1}: ${error}`),
            );
            return null;
          }
        }
      } else {
        // Use existing wallets
        console.log(
          chalk.yellow(
            "\nUsing existing wallets requires manual steps to extract xpubs.",
          ),
        );
        console.log(
          chalk.yellow(
            `For ${addressType} wallets, use BIP path ${displayBipPath}`,
          ),
        );

        const wallets = await this.bitcoinService.listWallets();

        for (let i = 0; i < totalSigners!; i++) {
          console.log(chalk.cyan(`\nSigner ${i + 1} of ${totalSigners}`));

          // Let user choose existing wallet
          const signerWallet = await select({
            message: `Select wallet for signer ${i + 1}:`,
            choices: wallets.map((w) => ({ name: w, value: w })),
          });

          signerWallets.push(signerWallet);

          try {
            // Get descriptors from the wallet
            const descriptors = await this.getWalletDescriptors(signerWallet);

            if (!descriptors) {
              throw new Error(
                `Could not get descriptors for wallet ${signerWallet}`,
              );
            }

            // Show descriptors and let user select
            const descriptorChoices = descriptors
              .filter((d) => !d.internal) // Only show external address descriptors
              .map((d, idx) => {
                const shortDesc =
                  d.desc.substring(0, 100) + (d.desc.length > 100 ? "..." : "");
                return {
                  name: `${idx + 1}. ${shortDesc}`,
                  value: idx,
                };
              });

            console.log(
              chalk.green(`\nAvailable descriptors for ${signerWallet}:`),
            );
            const selectedIdx = await select({
              message: "Select the appropriate descriptor:",
              choices: descriptorChoices,
            });

            const selectedDesc = descriptors.filter((d) => !d.internal)[
              selectedIdx
            ];

            // Extract xpub and fingerprint from the descriptor
            const descStr = selectedDesc.desc;
            const xpubMatch = descStr.match(
              /\[([a-f0-9]+)\/.*?\](.*?)\/[0-9]+\/\*\)/,
            );

            if (!xpubMatch) {
              throw new Error(
                `Could not extract xpub from descriptor: ${descStr}`,
              );
            }

            const fingerprint = xpubMatch[1];
            const xpub = xpubMatch[2];

            console.log(chalk.green(`\nExtracted information:`));
            console.log(`Fingerprint: ${fingerprint}`);
            console.log(`XPub: ${xpub}`);

            // Ask for BIP32 path
            const path = await input({
              message: "Enter the BIP32 derivation path:",
              default: displayBipPath,
            });

            // Add to extended public keys
            extendedPublicKeys.push({
              name: `Extended Public Key ${i + 1} (${signerWallet})`,
              xpub: xpub,
              bip32Path: path,
              xfp: fingerprint,
              method: "text",
            });
          } catch (error) {
            console.error(
              chalk.red(`Error processing wallet ${signerWallet}: ${error}`),
            );
            return null;
          }
        }
      }

      // Create the Caravan wallet configuration
      const caravanConfig: CaravanWalletConfig = {
        name,
        addressType,
        network: "regtest", // Always regtest for this tool
        quorum: {
          requiredSigners: requiredSigners!,
          totalSigners: totalSigners!,
        },
        extendedPublicKeys,
        startingAddressIndex: 0,
        uuid: crypto.randomBytes(16).toString("hex"),
        client: {
          type: "private",
          url: this.bitcoinRpcClient?.baseUrl || "http://127.0.0.1:18443",
          username: this.bitcoinRpcClient?.auth.username || "user",
          walletName: watcherWalletName,
        },
      };

      // Save the configuration
      const savedFileName =
        await this.caravanService.saveCaravanWalletConfig(caravanConfig);
      console.log(
        chalk.green(
          `\nCaravan wallet "${name}" created and saved successfully!`,
        ),
      );

      // Generate multisig descriptors and import them to watch wallet
      console.log(
        chalk.cyan(
          `\nImporting multisig descriptors to watch wallet "${watcherWalletName}"...`,
        ),
      );

      try {
        await this.importMultisigToWatchWallet(
          caravanConfig,
          watcherWalletName,
        );
        console.log(chalk.green(`Multisig descriptors imported successfully!`));
      } catch (error) {
        console.error(
          chalk.red(`Error importing multisig descriptors: ${error}`),
        );
        console.log(
          chalk.yellow(
            "Watch wallet may not be fully configured for the multisig setup.",
          ),
        );
      }

      // Ask if user wants to create a test transaction
      const createTestTx = await confirm({
        message:
          "Would you like to create a test transaction for this multisig wallet?",
        default: true,
      });

      if (createTestTx) {
        await this.createTestTransaction(
          caravanConfig,
          watcherWalletName,
          signerWallets[0],
        );
      }

      return caravanConfig;
    } catch (error) {
      console.error(chalk.red("\nError creating Caravan wallet:"), error);
      return null;
    }
  }

  /**
   * Get descriptors from a wallet
   */
  private async getWalletDescriptors(
    walletName: string,
  ): Promise<any[] | null> {
    try {
      const result: any = await this.bitcoinService.rpc.callRpc(
        "listdescriptors",
        [],
        walletName,
      );

      return result.descriptors;
    } catch (error) {
      console.error(
        chalk.red(`Error getting descriptors for ${walletName}:`),
        error,
      );
      return null;
    }
  }

  /**
   * Import multisig descriptors to watch wallet
   */
  private async importMultisigToWatchWallet(
    caravanConfig: CaravanWalletConfig,
    watchWalletName: string,
  ): Promise<boolean> {
    try {
      const { quorum, extendedPublicKeys, addressType } = caravanConfig;
      const { requiredSigners } = quorum;

      // Create descriptor strings for the wallet
      // First, prepare the xpubs with their paths for both receive (0/*) and change (1/*)
      const xpubsReceive = extendedPublicKeys.map((key) => `${key.xpub}/0/*`);

      const xpubsChange = extendedPublicKeys.map((key) => `${key.xpub}/1/*`);

      // Create descriptors based on address type
      let receiveDescriptor: string;
      let changeDescriptor: string;

      switch (addressType) {
        case AddressType.P2WSH:
          receiveDescriptor = `wsh(multi(${requiredSigners},${xpubsReceive.join(",")}))`;
          changeDescriptor = `wsh(multi(${requiredSigners},${xpubsChange.join(",")}))`;
          break;
        case AddressType.P2SH_P2WSH:
          receiveDescriptor = `sh(wsh(multi(${requiredSigners},${xpubsReceive.join(",")})))`;
          changeDescriptor = `sh(wsh(multi(${requiredSigners},${xpubsChange.join(",")})))`;
          break;
        case AddressType.P2SH:
          receiveDescriptor = `sh(multi(${requiredSigners},${xpubsReceive.join(",")}))`;
          changeDescriptor = `sh(multi(${requiredSigners},${xpubsChange.join(",")}))`;
          break;
        default:
          throw new Error(`Unsupported address type: ${addressType}`);
      }

      // Create descriptor objects
      const descriptors = [
        {
          desc: receiveDescriptor,
          timestamp: "now",
          active: true,
          internal: false,
          range: [0, 999],
        },
        {
          desc: changeDescriptor,
          timestamp: "now",
          active: true,
          internal: true,
          range: [0, 999],
        },
      ];

      // Import descriptors to watch wallet
      const importResult = await this.bitcoinService.rpc.importDescriptors(
        watchWalletName,
        descriptors,
      );

      // Check if import was successful
      const success = importResult.every((result: any) => result.success);

      return success;
    } catch (error) {
      console.error(`Error importing multisig descriptors:`, error);
      throw error;
    }
  }

  /**
   * Create a test transaction for the multisig wallet
   */
  private async createTestTransaction(
    caravanConfig: CaravanWalletConfig,
    watchWalletName: string,
    signerWalletName: string,
  ): Promise<void> {
    console.log(
      chalk.cyan(
        `\n=== Creating Test Transaction for ${caravanConfig.name} ===`,
      ),
    );

    try {
      // Fund the multisig wallet first
      console.log(
        chalk.cyan(`\nFirst, we need to fund the multisig wallet...`),
      );

      // Get an address from the watch wallet
      const multisigAddress =
        await this.bitcoinService.getNewAddress(watchWalletName);
      console.log(
        chalk.green(`Generated multisig address: ${multisigAddress}`),
      );

      // See if signer wallet has funds
      const signerInfo =
        await this.bitcoinService.getWalletInfo(signerWalletName);

      if (signerInfo.balance <= 0) {
        console.log(
          chalk.yellow(
            `\nSigner wallet ${signerWalletName} has no funds. Mining some coins...`,
          ),
        );

        // Mine some blocks to fund the signer wallet
        const signerAddress =
          await this.bitcoinService.getNewAddress(signerWalletName);
        await this.bitcoinService.generateToAddress(6, signerAddress);
        console.log(chalk.green(`Mined 6 blocks to fund ${signerWalletName}`));

        // Wait a moment for wallet to update
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Send funds from signer wallet to multisig address
      const fundAmount = 1.0; // 1 BTC
      console.log(
        chalk.cyan(`\nSending ${fundAmount} BTC to multisig address...`),
      );

      const fundTxid = await this.bitcoinService.sendToAddress(
        signerWalletName,
        multisigAddress,
        fundAmount,
      );

      console.log(
        chalk.green(`Funding transaction created! TXID: ${fundTxid}`),
      );

      // Mine a block to confirm the funding transaction
      console.log(
        chalk.cyan(`\nMining a block to confirm the funding transaction...`),
      );
      const address = await this.bitcoinService.getNewAddress(signerWalletName);
      await this.bitcoinService.generateToAddress(1, address);
      console.log(chalk.green(`Block mined to confirm funding transaction`));

      // Wait a moment for wallet to update
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Create a PSBT to spend from the multisig wallet
      console.log(
        chalk.cyan(`\nCreating a test PSBT to spend from multisig wallet...`),
      );

      // Get a destination address from the signer wallet
      const destAddress =
        await this.bitcoinService.getNewAddress(signerWalletName);

      // Create outputs
      const outputs = [{ [destAddress]: 0.5 }]; // Send 0.5 BTC back to signer wallet

      const psbt = await this.bitcoinService.rpc.createPSBT(
        watchWalletName,
        outputs,
      );

      if (!psbt) {
        throw new Error("Failed to create PSBT");
      }

      console.log(chalk.green(`\nTest PSBT created successfully!`));
      console.log(chalk.green(`PSBT Base64: ${psbt.psbt}`));

      // Save PSBT to a file
      const psbtFileName = `${caravanConfig.name.replace(/\s+/g, "_").toLowerCase()}_test_psbt.txt`;
      await fs.writeFile(psbtFileName, psbt.psbt);
      console.log(chalk.green(`PSBT saved to ${psbtFileName}`));

      console.log(chalk.cyan(`\nTo complete the test transaction:`));
      console.log(`1. Open Caravan`);
      console.log(`2. Import your wallet configuration`);
      console.log(`3. Go to "Spend" tab`);
      console.log(`4. Load the saved PSBT file`);
      console.log(`5. Sign using your available keys`);
      console.log(`6. Broadcast the transaction`);
    } catch (error) {
      console.error(chalk.red(`Error creating test transaction: ${error}`));
    }
  }

  /**
   * Create a watch-only wallet for a Caravan configuration
   */
  async createWatchWallet(
    caravanConfig?: CaravanWalletConfig,
  ): Promise<string | null> {
    if (!caravanConfig) {
      const wallets = await this.caravanService.listCaravanWallets();

      if (wallets.length === 0) {
        console.log(chalk.yellow("\nNo Caravan wallets found."));
        return null;
      }

      const walletIndex = await select({
        message: "Select a Caravan wallet:",
        choices: wallets.map((w, i) => ({ name: w.name, value: i })),
      });

      caravanConfig = wallets[walletIndex];
    }

    console.log(
      chalk.cyan(
        `\n=== Creating Watch-Only Wallet for ${caravanConfig.name} ===`,
      ),
    );

    try {
      const walletName =
        await this.caravanService.createWatchWalletForCaravan(caravanConfig);

      console.log(
        chalk.green(
          `\nWatch-only wallet "${walletName}" created successfully!`,
        ),
      );

      // Get an address from the wallet for testing
      try {
        const bitcoindWallets = await this.bitcoinService.listWallets();
        if (bitcoindWallets.includes(walletName)) {
          const testAddress =
            await this.bitcoinService.getNewAddress(walletName);
          console.log(chalk.green(`\nGenerated test address: ${testAddress}`));
        }
      } catch (error) {
        console.error(
          chalk.yellow("\nCould not generate test address:"),
          error,
        );
      }

      return walletName;
    } catch (error) {
      console.error(chalk.red("\nError creating watch-only wallet:"), error);
      return null;
    }
  }

  /**
   * Show details of a Caravan wallet
   */
  async showCaravanWalletDetails(): Promise<CaravanWalletConfig | null> {
    const wallets = await this.caravanService.listCaravanWallets();

    if (wallets.length === 0) {
      console.log(chalk.yellow("\nNo Caravan wallets found."));
      return null;
    }

    const walletIndex = await select({
      message: "Select a Caravan wallet:",
      choices: wallets.map((w, i) => ({ name: w.name, value: i })),
    });

    const selectedWallet = wallets[walletIndex];

    console.log(
      chalk.cyan(`\n=== Caravan Wallet Details: ${selectedWallet.name} ===`),
    );
    console.log(chalk.green("\nBasic Information:"));
    console.log(`Network: ${selectedWallet.network}`);
    console.log(`Address Type: ${selectedWallet.addressType}`);
    console.log(
      `Quorum: ${selectedWallet.quorum.requiredSigners} of ${selectedWallet.quorum.totalSigners}`,
    );
    console.log(`UUID: ${selectedWallet.uuid || "Not set"}`);
    console.log(
      `Starting Address Index: ${selectedWallet.startingAddressIndex || 0}`,
    );

    console.log(chalk.green("\nExtended Public Keys:"));
    selectedWallet.extendedPublicKeys.forEach((key, index) => {
      console.log(`\n${index + 1}. ${key.name || `Key ${index + 1}`}`);
      console.log(`   XPub: ${key.xpub}`);
      console.log(`   BIP32 Path: ${key.bip32Path}`);
      console.log(`   Root Fingerprint: ${key.xfp || "Not set"}`);
    });

    // Check if a watch wallet exists
    const safeWalletName = `${selectedWallet.name.replace(/\s+/g, "_").toLowerCase()}_watch`;
    const bitcoindWallets = await this.bitcoinService.listWallets();

    if (bitcoindWallets.includes(safeWalletName)) {
      console.log(chalk.green(`\nWatch Wallet: ${safeWalletName} (Available)`));

      // Get wallet info
      try {
        const walletInfo =
          await this.bitcoinService.getWalletInfo(safeWalletName);
        console.log(`Balance: ${walletInfo.balance} BTC`);
        console.log(`Unconfirmed: ${walletInfo.unconfirmed_balance} BTC`);
        console.log(`TX Count: ${walletInfo.txcount}`);
      } catch (error) {
        console.log(chalk.yellow("Could not get wallet info."));
      }

      // Ask if user wants to see addresses
      const showAddresses = await confirm({
        message: "Generate and show addresses from this wallet?",
        default: true,
      });

      if (showAddresses) {
        try {
          const addressCount = await number({
            message: "How many addresses do you want to see?",
            default: 3,
          });

          console.log(chalk.green("\nGenerating addresses:"));

          for (let i = 0; i < addressCount!; i++) {
            const address =
              await this.bitcoinService.getNewAddress(safeWalletName);
            console.log(`${i + 1}. ${address}`);
          }
        } catch (error) {
          console.error(chalk.yellow("Could not generate addresses:"), error);
        }
      }
    } else {
      console.log(
        chalk.yellow("\nNo watch wallet found for this Caravan wallet."),
      );

      // Ask if user wants to create a watch wallet
      const createWatch = await confirm({
        message: "Create a watch-only wallet for this Caravan wallet?",
        default: true,
      });

      if (createWatch) {
        await this.createWatchWallet(selectedWallet);
      }
    }

    return selectedWallet;
  }

  /**
   * Fund a Caravan wallet
   */
  async fundCaravanWallet(): Promise<any | null> {
    const wallets = await this.caravanService.listCaravanWallets();

    if (wallets.length === 0) {
      console.log(chalk.yellow("\nNo Caravan wallets found."));
      return null;
    }

    const walletIndex = await select({
      message: "Select a Caravan wallet to fund:",
      choices: wallets.map((w, i) => ({ name: w.name, value: i })),
    });

    const selectedWallet = wallets[walletIndex];

    // Check if a watch wallet exists
    const safeWalletName = `${selectedWallet.name.replace(/\s+/g, "_").toLowerCase()}_watch`;
    const bitcoindWallets = await this.bitcoinService.listWallets();

    if (!bitcoindWallets.includes(safeWalletName)) {
      console.log(
        chalk.yellow(`\nNo watch wallet found for ${selectedWallet.name}.`),
      );

      const createWallet = await confirm({
        message: "Create a watch-only wallet first?",
        default: true,
      });

      if (createWallet) {
        await this.createWatchWallet(selectedWallet);
      } else {
        return null;
      }
    }

    console.log(
      chalk.cyan(`\n=== Funding Caravan Wallet: ${selectedWallet.name} ===`),
    );

    // Get wallet balance before
    try {
      const walletInfo =
        await this.bitcoinService.getWalletInfo(safeWalletName);
      console.log(chalk.green(`Current balance: ${walletInfo.balance} BTC`));
    } catch (error) {
      console.error(chalk.yellow("Could not get wallet info."));
    }

    // Get a new address from the watch wallet
    try {
      const address = await this.bitcoinService.getNewAddress(safeWalletName);
      console.log(chalk.green(`\nGenerated address: ${address}`));

      // Ask how to fund the wallet
      const fundMethod = await select({
        message: "How would you like to fund this wallet?",
        choices: [
          { name: "Send from another wallet", value: "send" },
          { name: "Mine directly to this address", value: "mine" },
        ],
      });

      if (fundMethod === "send") {
        // List source wallets
        const sourceWallets = bitcoindWallets.filter(
          (w) => w !== safeWalletName,
        );

        if (sourceWallets.length === 0) {
          console.log(
            chalk.yellow(
              "\nNo source wallets found. Create another wallet first.",
            ),
          );
          return null;
        }

        const sourceWallet = await select({
          message: "Select source wallet:",
          choices: sourceWallets.map((w) => ({ name: w, value: w })),
        });

        const sourceInfo =
          await this.bitcoinService.getWalletInfo(sourceWallet);

        if (sourceInfo.balance <= 0) {
          console.log(
            chalk.yellow("\nSource wallet has no funds. Please fund it first."),
          );
          return null;
        }

        // Ask for amount
        const amount = await number({
          message: "Enter amount to send (BTC):",
          validate: (input: number | undefined) => {
            if (input === undefined || isNaN(input) || input <= 0) {
              return "Please enter a valid positive amount";
            }
            if (input > sourceInfo.balance) {
              return `Amount exceeds balance (${sourceInfo.balance} BTC)`;
            }
            return true;
          },
          default: Math.min(1, sourceInfo.balance),
        });

        console.log(
          chalk.cyan(
            `\nSending ${amount} BTC from ${sourceWallet} to ${address}...`,
          ),
        );

        // Send the transaction
        const txid = await this.bitcoinService.sendToAddress(
          sourceWallet,
          address,
          amount!,
        );

        console.log(chalk.green(`\nTransaction sent successfully!`));
        console.log(chalk.green(`Transaction ID: ${txid}`));

        // Ask if user wants to mine a block to confirm the transaction
        const mine = await confirm({
          message: "Mine a block to confirm the transaction?",
          default: true,
        });

        if (mine) {
          // Use the source wallet for mining
          const mineAddress =
            await this.bitcoinService.getNewAddress(sourceWallet);
          const blockHashes = await this.bitcoinService.generateToAddress(
            1,
            mineAddress,
          );

          console.log(
            chalk.green(`\nMined 1 block to confirm the transaction!`),
          );
          console.log(chalk.green(`Block hash: ${blockHashes[0]}`));
        }

        // Check new balance
        const newWalletInfo =
          await this.bitcoinService.getWalletInfo(safeWalletName);
        console.log(chalk.green(`\nNew balance: ${newWalletInfo.balance} BTC`));

        return { txid };
      } else {
        // Mine directly to address
        const blocks = await number({
          message: "How many blocks to mine?",
          default: 1,
          validate: (input: number | undefined) =>
            input !== undefined && input > 0
              ? true
              : "Please enter a positive number",
        });

        console.log(
          chalk.cyan(`\nMining ${blocks} block(s) to address ${address}...`),
        );

        const blockHashes = await this.bitcoinService.generateToAddress(
          blocks!,
          address,
        );

        console.log(
          chalk.green(`\nSuccessfully mined ${blockHashes.length} block(s)!`),
        );
        console.log(
          chalk.green(
            `Latest block hash: ${blockHashes[blockHashes.length - 1]}`,
          ),
        );

        // Check new balance
        const newWalletInfo =
          await this.bitcoinService.getWalletInfo(safeWalletName);
        console.log(chalk.green(`\nNew balance: ${newWalletInfo.balance} BTC`));

        return { blockHashes };
      }
    } catch (error) {
      console.error(chalk.red("\nError funding wallet:"), error);
      return null;
    }
  }
}
