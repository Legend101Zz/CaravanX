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
import crypto from "crypto";
import chalk from "chalk";
import * as fs from "fs-extra";
import * as path from "path";
import ora from "ora";
import {
  colors,
  displayCommandTitle,
  formatBitcoin,
  truncate,
  createTable,
  formatSuccess,
  formatWarning,
  formatError,
  boxText,
  keyValue,
  divider,
  caravanLogo,
} from "../utils/terminal";

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
    displayCommandTitle("Caravan Wallets");

    try {
      const spinner = ora("Loading Caravan wallet configurations...").start();
      const wallets = await this.caravanService.listCaravanWallets();
      spinner.succeed("Wallet configurations loaded");

      if (wallets.length === 0) {
        console.log(formatWarning("No Caravan wallet configurations found."));
        return [];
      }

      // Prepare data for table
      const tableRows = wallets.map((wallet, index) => [
        (index + 1).toString(),
        colors.highlight(wallet.name),
        colors.info(wallet.network),
        colors.info(wallet.addressType),
        colors.info(
          `${wallet.quorum.requiredSigners} of ${wallet.quorum.totalSigners}`,
        ),
      ]);

      // Display table
      console.log(
        createTable(
          ["#", "Wallet Name", "Network", "Address Type", "Quorum"],
          tableRows,
        ),
      );

      console.log(
        `\nTotal wallets: ${colors.highlight(wallets.length.toString())}`,
      );

      return wallets;
    } catch (error) {
      console.error(formatError("Error listing Caravan wallets:"), error);
      return [];
    }
  }

  /**
   * Create a new Caravan wallet configuration
   */
  async createCaravanWallet(): Promise<CaravanWalletConfig | null> {
    displayCommandTitle("Create New Caravan Multisig Wallet");

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
          {
            name: colors.highlight("P2WSH (Native SegWit)"),
            value: AddressType.P2WSH,
          },
          {
            name: colors.highlight("P2SH-P2WSH (Nested SegWit)"),
            value: AddressType.P2SH_P2WSH,
          },
          { name: colors.highlight("P2SH (Legacy)"), value: AddressType.P2SH },
        ],
        default: AddressType.P2WSH,
      });

      // We'll focus on regtest for now
      const network = Network.REGTEST;

      console.log(colors.info(`Using network: ${network}`));

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
        validate: (input: number | undefined) => {
          if (input === undefined || input <= 0) {
            return "Number must be greater than 0";
          }
          if (input < requiredSigners!) {
            return `Total signers must be at least ${requiredSigners}`;
          }
          return true;
        },
        default: 3,
      });

      console.log(
        boxText(
          `Wallet: ${colors.highlight(name)}\n` +
            `Address Type: ${colors.highlight(addressType)}\n` +
            `Network: ${colors.highlight(network)}\n` +
            `Quorum: ${colors.highlight(`${requiredSigners} of ${totalSigners}`)}`,
          { title: "Wallet Configuration", titleColor: colors.info },
        ),
      );

      // Create watcher wallet for Caravan
      const watcherWalletName = `${name.replace(/\s+/g, "_").toLowerCase()}_watcher`;
      console.log(
        colors.info(
          `\nCreating watch-only wallet "${watcherWalletName}" for Caravan...`,
        ),
      );

      try {
        const spinner = ora(
          `Creating watch-only wallet ${watcherWalletName}...`,
        ).start();
        await this.bitcoinService.createWallet(watcherWalletName, {
          disablePrivateKeys: true,
          blank: false,
          descriptorWallet: true,
        });
        spinner.succeed(
          `Watch-only wallet "${watcherWalletName}" created successfully!`,
        );
      } catch (error: any) {
        console.error(
          formatError(`Error creating watch wallet: ${error.message}`),
        );
        return null;
      }

      // Ask how to add wallets for signers
      const createMethod = await select({
        message: "How would you like to create signer wallets?",
        choices: [
          {
            name: colors.highlight("Create new wallets for each signer"),
            value: "new",
          },
          { name: colors.highlight("Use existing wallets"), value: "existing" },
        ],
      });

      // Array to store extended public keys
      const extendedPublicKeys: ExtendedPublicKey[] = [];
      const signerWallets: string[] = [];

      // Map of address types to BIP paths and descriptor types
      const formatInfo = {
        [AddressType.P2WSH]: { path: "84h/1h/0h", descriptorPrefix: "wpkh" },
        [AddressType.P2SH_P2WSH]: {
          path: "49h/1h/0h",
          descriptorPrefix: "sh(wpkh",
        },
        [AddressType.P2SH]: { path: "44h/1h/0h", descriptorPrefix: "pkh" },
      };

      // The BIP path to use based on address type
      const bipPath = formatInfo[addressType].path;
      // Convert BIP path format from 84'/1'/0' to m/84'/1'/0' for display
      const displayBipPath = `m/${bipPath}`;

      if (createMethod === "new") {
        // Create new wallets for each signer
        console.log(
          colors.info(`\nCreating ${totalSigners} wallet(s) for signers...`),
        );

        for (let i = 0; i < totalSigners!; i++) {
          const signerName = `${name.replace(/\s+/g, "_").toLowerCase()}_signer_${i + 1}`;
          signerWallets.push(signerName);

          console.log(
            colors.info(`\nCreating wallet for signer ${i + 1}: ${signerName}`),
          );

          try {
            // Create wallet WITH descriptor support
            const createSpinner = ora(
              `Creating wallet ${signerName}...`,
            ).start();
            await this.bitcoinService.createWallet(signerName, {
              disablePrivateKeys: false,
              blank: false,
              descriptorWallet: true,
            });
            createSpinner.succeed(
              `Wallet "${signerName}" created successfully!`,
            );

            // Give the wallet some time to initialize
            const initSpinner = ora(
              "Initializing wallet descriptors...",
            ).start();
            await new Promise((resolve) => setTimeout(resolve, 1000));
            initSpinner.succeed("Wallet initialized");

            // Get descriptors from the wallet
            const descSpinner = ora("Retrieving wallet descriptors...").start();
            const descriptors = await this.getWalletDescriptors(signerName);
            descSpinner.succeed("Descriptors retrieved");

            if (!descriptors) {
              throw new Error(
                `Could not get descriptors for wallet ${signerName}`,
              );
            }

            // Find the appropriate descriptor based on the address type
            const desiredDescType = formatInfo[addressType].descriptorPrefix;
            let matchingDesc = null;
            console.log(
              colors.info(
                `Looking for descriptor: ${colors.code(desiredDescType)} with path: ${colors.code(bipPath)}`,
              ),
            );

            const matchSpinner = ora(
              "Matching descriptor to wallet type...",
            ).start();
            for (const desc of descriptors) {
              // Try different matching strategies
              const startsWithPrefix = desc.desc.startsWith(desiredDescType);
              const includesPath = desc.desc.includes(bipPath);
              const isExternal = !desc.internal;

              if (startsWithPrefix && includesPath && isExternal) {
                matchingDesc = desc;
                break;
              }
            }

            if (!matchingDesc) {
              matchSpinner.warn("Could not find exact descriptor match");

              // Try to find any descriptor that contains the BIP path
              for (const desc of descriptors) {
                if (desc.desc.includes(bipPath) && !desc.internal) {
                  matchingDesc = desc;
                  break;
                }
              }

              if (!matchingDesc) {
                matchSpinner.fail("No suitable descriptor found");
                throw new Error(
                  `No suitable descriptor found for wallet ${signerName}`,
                );
              }

              matchSpinner.succeed("Found compatible descriptor");
            } else {
              matchSpinner.succeed("Found exact matching descriptor");
            }

            // Extract xpub and fingerprint from the descriptor
            const extractSpinner = ora(
              "Extracting extended public key...",
            ).start();
            const descStr = matchingDesc.desc;
            const xpubMatch = descStr.match(
              /\[([a-f0-9]+)\/.*?\](.*?)\/[0-9]+\/\*\)/,
            );

            if (!xpubMatch) {
              extractSpinner.fail("Could not extract xpub");
              throw new Error(
                `Could not extract xpub from descriptor: ${descStr}`,
              );
            }

            const fingerprint = xpubMatch[1];
            const xpub = xpubMatch[2];
            extractSpinner.succeed("Extended public key extracted");

            console.log(
              boxText(
                `Signer: ${colors.highlight(signerName)}\n` +
                  `Fingerprint: ${colors.code(fingerprint)}\n` +
                  `XPub: ${colors.code(truncate(xpub, 15))}\n` +
                  `Path: ${colors.code(displayBipPath)}`,
                {
                  title: `Signer ${i + 1} Key Info`,
                  titleColor: colors.success,
                },
              ),
            );

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
              formatError(`Error setting up signer ${i + 1}:`),
              error,
            );
            return null;
          }
        }
      } else {
        // Use existing wallets
        console.log(
          formatWarning(
            "\nUsing existing wallets requires manual steps to extract xpubs.",
          ),
        );
        console.log(
          colors.info(
            `For ${addressType} wallets, use BIP path ${colors.code(displayBipPath)}`,
          ),
        );

        const listSpinner = ora("Loading available wallets...").start();
        const wallets = await this.bitcoinService.listWallets();
        listSpinner.succeed("Wallets loaded");

        for (let i = 0; i < totalSigners!; i++) {
          console.log(colors.header(`\nSigner ${i + 1} of ${totalSigners}`));

          // Let user choose existing wallet
          const signerWallet = await select({
            message: `Select wallet for signer ${i + 1}:`,
            choices: wallets.map((w) => ({
              name: colors.highlight(w),
              value: w,
            })),
          });

          signerWallets.push(signerWallet);

          try {
            // Get descriptors from the wallet
            const descSpinner = ora(
              `Loading descriptors from ${signerWallet}...`,
            ).start();
            const descriptors = await this.getWalletDescriptors(signerWallet);
            descSpinner.succeed("Descriptors loaded");

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
                  d.desc.substring(0, 90) + (d.desc.length > 90 ? "..." : "");
                return {
                  name: colors.highlight(`${idx + 1}. ${shortDesc}`),
                  value: idx,
                };
              });

            console.log(
              colors.success(`\nAvailable descriptors for ${signerWallet}:`),
            );
            const selectedIdx = await select({
              message: "Select the appropriate descriptor:",
              choices: descriptorChoices,
            });

            const selectedDesc = descriptors.filter((d) => !d.internal)[
              selectedIdx
            ];

            // Extract xpub and fingerprint from the descriptor
            const extractSpinner = ora(
              "Extracting public key information...",
            ).start();
            const descStr = selectedDesc.desc;
            const xpubMatch = descStr.match(
              /\[([a-f0-9]+)\/.*?\](.*?)\/[0-9]+\/\*\)/,
            );

            if (!xpubMatch) {
              extractSpinner.fail("Could not extract xpub");
              throw new Error(
                `Could not extract xpub from descriptor: ${descStr}`,
              );
            }

            const fingerprint = xpubMatch[1];
            const xpub = xpubMatch[2];
            extractSpinner.succeed("Key information extracted");

            console.log(
              boxText(
                `Fingerprint: ${colors.code(fingerprint)}\n` +
                  `XPub: ${colors.code(truncate(xpub, 15))}`,
                { title: "Extracted Information", titleColor: colors.success },
              ),
            );

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
              formatError(`Error processing wallet ${signerWallet}:`),
              error,
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
      const saveSpinner = ora("Saving Caravan wallet configuration...").start();
      const savedFileName =
        await this.caravanService.saveCaravanWalletConfig(caravanConfig);
      saveSpinner.succeed(`Caravan wallet "${name}" saved successfully!`);

      // Generate multisig descriptors and import them to watch wallet
      console.log(
        colors.info(
          `\nImporting multisig descriptors to watch wallet "${watcherWalletName}"...`,
        ),
      );

      try {
        const importSpinner = ora("Importing multisig descriptors...").start();
        await this.importMultisigToWatchWallet(
          caravanConfig,
          watcherWalletName,
        );
        importSpinner.succeed("Multisig descriptors imported successfully!");

        console.log(
          boxText(
            "When using Caravan, you need to import addresses to see your funds.\n" +
              "Follow these steps in Caravan after importing your wallet configuration:\n\n" +
              '1. Go to the "Addresses" tab\n' +
              '2. Click the "Import Addresses" button at the bottom\n' +
              '3. Toggle the "Rescan" switch if this is your first time importing\n' +
              '4. Click "Import Addresses" to complete the process',
            { title: "IMPORTANT", titleColor: colors.warning },
          ),
        );
      } catch (error) {
        console.error(
          formatError(`Error importing multisig descriptors: ${error}`),
        );
        console.log(
          formatWarning(
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
      console.error(formatError("\nError creating Caravan wallet:"), error);
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
      // Try listdescriptors first (Bitcoin Core v0.21+)
      try {
        const result: any = await this.bitcoinService.rpc.callRpc(
          "listdescriptors",
          [],
          walletName,
        );
        if (result && result.descriptors && result.descriptors.length > 0) {
          return result.descriptors;
        }
      } catch (error: any) {
        console.log(
          formatWarning(`listdescriptors not supported: ${error.message}`),
        );
        // Continue with alternative methods
      }

      // Alternative: try to get a descriptor from getaddressinfo
      try {
        console.log(
          colors.info(`Trying alternative method to get descriptors...`),
        );

        // Get an address from the wallet
        const addressSpinner = ora(
          "Generating address for descriptor...",
        ).start();
        const address = await this.bitcoinService.getNewAddress(walletName);
        addressSpinner.succeed(`Generated address: ${address}`);

        // Get address info
        const infoSpinner = ora("Getting address information...").start();
        const addressInfo = await this.bitcoinService.getAddressInfo(
          walletName,
          address,
        );
        infoSpinner.succeed("Address information retrieved");

        if (addressInfo && addressInfo.desc) {
          // Create a descriptor-like object manually
          const isChange = false; // Assuming newly generated address is not change

          // Try to extract derivation path
          let path = "0"; // Default external chain
          if (addressInfo.hdkeypath) {
            const pathMatch = addressInfo.hdkeypath.match(
              /m\/.*\/([0-9]+)\/[0-9]+$/,
            );
            if (pathMatch) {
              path = pathMatch[1];
            }
          }

          const descriptor = {
            desc: addressInfo.desc,
            timestamp: Math.floor(Date.now() / 1000),
            active: true,
            internal: path === "1",
            range: [0, 1000],
            next: 0,
          };

          console.log(formatSuccess("Created descriptor from address info"));
          return [descriptor];
        }
      } catch (error) {
        console.error(formatError(`Error getting address info: ${error}`));
      }

      // Last resort: try to create a dummy descriptor
      console.log(
        formatWarning(`Could not get descriptors, creating dummy descriptor`),
      );

      // Map address types to BIP paths
      const addressTypeMap = {
        [AddressType.P2WSH]: "84'/1'/0'",
        [AddressType.P2SH_P2WSH]: "49'/1'/0'",
        [AddressType.P2SH]: "44'/1'/0'",
      };

      // Create a dummy descriptor that will be replaced with manual input
      return [
        {
          desc: `dummy_descriptor_for_${walletName}`,
          timestamp: Math.floor(Date.now() / 1000),
          active: true,
          internal: false,
          range: [0, 1000],
          next: 0,
        },
      ];
    } catch (error) {
      console.error(
        formatError(`Error getting descriptors for ${walletName}:`),
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
    rescan: boolean = false,
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

      // Format descriptors as Caravan does
      const descriptors = [
        {
          desc: receiveDescriptor,
          internal: false,
        },
        {
          desc: changeDescriptor,
          internal: true,
        },
      ].map((d) => ({
        ...d,
        range: [0, 1005],
        timestamp: rescan ? 0 : "now",
        watchonly: true,
        active: true,
      }));

      console.log(
        boxText(
          "Receive descriptor:\n" +
            colors.code(truncate(receiveDescriptor, 50)) +
            "\n\n" +
            "Change descriptor:\n" +
            colors.code(truncate(changeDescriptor, 50)),
          { title: "Descriptors", titleColor: colors.info },
        ),
      );

      // Import descriptors to watch wallet
      const importResult = await this.bitcoinService.rpc.importDescriptors(
        watchWalletName,
        descriptors,
      );

      // Check if import was successful
      const success = Array.isArray(importResult)
        ? importResult.every((result: any) => result.success)
        : false;

      if (!success) {
        console.log(
          formatWarning("Some descriptors may not have imported successfully."),
        );
      }

      return success;
    } catch (error) {
      console.error(
        formatError(`Error importing multisig descriptors: ${error}`),
      );
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
    displayCommandTitle(`Creating Test Transaction for ${caravanConfig.name}`);

    try {
      // Format the config for Caravan - convert BIP32 paths
      const exportSpinner = ora(
        "Preparing wallet configuration for export...",
      ).start();
      const exportConfig =
        this.caravanService.formatCaravanConfigForExport(caravanConfig);

      // Save the configuration to a file
      const configFileName = `${caravanConfig.name.replace(/\s+/g, "_").toLowerCase()}_config.json`;
      const configPath = path.join(
        this.caravanService.getCaravanDir(),
        configFileName,
      );

      // Remove credentials if present
      if (exportConfig.client?.password) {
        delete exportConfig.client.password;
      }

      // Save the formatted config
      await fs.writeJson(configPath, exportConfig, { spaces: 2 });
      exportSpinner.succeed(
        `Caravan wallet configuration saved to: ${configPath}`,
      );

      // Provide instructions to the user
      console.log(
        boxText(
          "1. Open Caravan in your browser\n" +
            '2. Go to "Wallet" tab and click "Import"\n' +
            "3. Load the configuration file: " +
            colors.highlight(configPath) +
            "\n" +
            '4. Go to "Receive" tab and generate a new address',
          {
            title: "Steps to Create a Test Transaction",
            titleColor: colors.info,
          },
        ),
      );

      // Ask the user to paste the address from Caravan
      const multisigAddress = await input({
        message: "Paste the multisig address from Caravan's Receive tab:",
        validate: (addr) =>
          addr && addr.trim().length > 0
            ? true
            : "Please enter a valid address",
      });

      console.log(
        formatSuccess(`\nReceived multisig address: ${multisigAddress}`),
      );

      // Check which wallets are available for funding
      const walletsSpinner = ora(
        "Loading available wallets for funding...",
      ).start();
      const wallets = await this.bitcoinService.listWallets();

      // Remove the watch wallet and current signer wallet from options
      const fundingWalletChoices = wallets
        .filter((w) => w !== watchWalletName)
        .map((w) => ({ name: colors.highlight(w), value: w }));
      walletsSpinner.succeed("Wallets loaded");

      let selectedFundingWallet: string;

      if (fundingWalletChoices.length === 0) {
        console.log(
          formatWarning(
            `\nNo wallets available for funding. Creating a new one.`,
          ),
        );

        // Create a funding wallet
        const fundingWalletName = `${caravanConfig.name.replace(/\s+/g, "_").toLowerCase()}_funding`;

        const createSpinner = ora(
          `Creating funding wallet: ${fundingWalletName}...`,
        ).start();
        await this.bitcoinService.createWallet(fundingWalletName, {
          disablePrivateKeys: false,
          blank: false,
          descriptorWallet: true,
        });
        createSpinner.succeed(`Created funding wallet: ${fundingWalletName}`);

        // Mine some blocks to fund the wallet
        const fundingAddress =
          await this.bitcoinService.getNewAddress(fundingWalletName);
        const mineSpinner = ora(
          "Mining 6 blocks to fund the wallet...",
        ).start();
        await this.bitcoinService.generateToAddress(6, fundingAddress);
        mineSpinner.succeed(`Mined 6 blocks to address ${fundingAddress}`);

        // Set as the funding wallet
        selectedFundingWallet = fundingWalletName;
      } else {
        // Ask which wallet to use for funding
        selectedFundingWallet = await select({
          message: "Select a wallet to use for funding:",
          choices: fundingWalletChoices,
        });
      }

      // Check if selected wallet has funds
      const balanceSpinner = ora(
        `Checking balance of ${selectedFundingWallet}...`,
      ).start();
      const walletInfo = await this.bitcoinService.getWalletInfo(
        selectedFundingWallet,
      );

      if (walletInfo.balance <= 0) {
        balanceSpinner.warn("Funding wallet has no balance");
        console.log(
          formatWarning(
            `\nFunding wallet has no balance. Mining some coins...`,
          ),
        );

        // Mine blocks to fund the wallet
        const fundingAddress = await this.bitcoinService.getNewAddress(
          selectedFundingWallet,
        );
        const mineSpinner = ora("Mining blocks to funding wallet...").start();
        await this.bitcoinService.generateToAddress(6, fundingAddress);
        mineSpinner.succeed(`Mined 6 blocks to fund ${selectedFundingWallet}`);

        // Wait a moment for wallet to update
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Get updated balance
        const updatedInfo = await this.bitcoinService.getWalletInfo(
          selectedFundingWallet,
        );
        balanceSpinner.succeed(
          `Wallet balance: ${formatBitcoin(updatedInfo.balance)}`,
        );
      } else {
        balanceSpinner.succeed(
          `Wallet balance: ${formatBitcoin(walletInfo.balance)}`,
        );
      }

      // Fund amount
      const fundAmount = await number({
        message: "Amount to send to multisig address (BTC):",
        default: 0.005,
      });

      console.log(
        chalk.cyan(`\nSending ${fundAmount} BTC to multisig address...`),
      );

      // Send to the multisig address
      const txid = await this.bitcoinService.sendToAddress(
        selectedFundingWallet,
        multisigAddress,
        fundAmount!,
      );

      console.log(chalk.green(`\nTransaction sent successfully!`));
      console.log(chalk.green(`Transaction ID: ${txid}`));

      console.log(chalk.cyan(`\nNext steps:`));
      console.log(`1. In Caravan, go to the "Pending Transactions" tab`);
      console.log(`2. Click "Refresh" to see your pending transaction`);
      console.log(
        `3. You can now create and sign spending transactions in the "Spend" tab`,
      );

      // Mine a block to confirm
      const mineConfirmation = await confirm({
        message: "Would you like to mine a block to confirm the transaction?",
        default: true,
      });

      if (mineConfirmation) {
        console.log(
          chalk.cyan(`\nMining a block to confirm the transaction...`),
        );
        const miningAddress = await this.bitcoinService.getNewAddress(
          selectedFundingWallet,
        );
        await this.bitcoinService.generateToAddress(1, miningAddress);
        console.log(chalk.green(`Block mined successfully!`));
      }
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
