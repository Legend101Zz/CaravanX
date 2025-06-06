import { CaravanService } from "../core/caravan";
import { BitcoinService } from "../core/bitcoin";
import { BitcoinRpcClient } from "../core/rpc";
import { TransactionService } from "../core/transaction";
import {
  CaravanWalletConfig,
  ExtendedPublicKey,
  AddressType,
  Network,
} from "../types/caravan";
import clipboard from "clipboardy";
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
  private readonly transactionService: TransactionService;
  constructor(
    caravanService: CaravanService,
    bitcoinService: BitcoinService,
    bitcoinRpcClient: BitcoinRpcClient,
    transactionService: TransactionService,
  ) {
    this.caravanService = caravanService;
    this.bitcoinService = bitcoinService;
    this.bitcoinRpcClient = bitcoinRpcClient;
    this.transactionService = transactionService;
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
      const exportSpinner = ora(
        "Saving Caravan wallet configuration...",
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
   * Spend funds from a Caravan multisig wallet
   */
  async spendFromCaravanWallet(): Promise<any | null> {
    displayCommandTitle("Spend from Caravan Multisig Wallet");

    try {
      // Step 1: Select a Caravan wallet
      const wallets = await this.caravanService.listCaravanWallets();

      if (wallets.length === 0) {
        console.log(
          formatWarning("No Caravan wallets found. Create one first."),
        );
        return null;
      }

      const walletIndex = await select({
        message: "Select Caravan wallet to spend from:",
        choices: wallets.map((w, i) => ({
          name:
            colors.highlight(w.name) +
            colors.info(
              ` (${w.quorum.requiredSigners} of ${w.quorum.totalSigners}, ${w.addressType})`,
            ),
          value: i,
        })),
      });

      const selectedWallet = wallets[walletIndex];

      // Determine if this is a wallet created by our terminal tool
      const isTerminalCreatedWallet = await this.isTerminalCreatedWallet(
        selectedWallet.name,
      );

      console.log(
        boxText(
          `Wallet: ${colors.highlight(selectedWallet.name)}\n` +
            `Quorum: ${colors.highlight(`${selectedWallet.quorum.requiredSigners} of ${selectedWallet.quorum.totalSigners}`)}\n` +
            `Address Type: ${colors.highlight(selectedWallet.addressType)}\n` +
            `Creator: ${isTerminalCreatedWallet ? colors.success("Created by this tool") : colors.warning("External wallet")}`,
          { title: "Selected Wallet", titleColor: colors.info },
        ),
      );

      // Find watcher wallet name
      let watcherWalletName = `${selectedWallet.name.replace(/\\s+/g, "_").toLowerCase()}_watcher`;

      // Check if watcher wallet exists
      const bitcoinWallets = await this.bitcoinService.listWallets();
      let watchWalletExists = bitcoinWallets.includes(watcherWalletName);

      if (!watchWalletExists) {
        console.log(
          formatWarning(`Watch wallet "${watcherWalletName}" not found.`),
        );

        if (isTerminalCreatedWallet) {
          // Try to create the watch wallet automatically
          const createWatch = await confirm({
            message: "Create watch wallet automatically?",
            default: true,
          });

          if (createWatch) {
            await this.createWatchWallet(selectedWallet);
            watchWalletExists = true;
          } else {
            watcherWalletName = await input({
              message: "Enter the name of the watch wallet:",
              validate: (input) =>
                input.trim() !== "" ? true : "Please enter a valid wallet name",
            });

            // Check if the entered wallet exists
            watchWalletExists = bitcoinWallets.includes(watcherWalletName);

            if (!watchWalletExists) {
              console.log(
                formatError(`Watch wallet "${watcherWalletName}" not found.`),
              );
              return null;
            }
          }
        } else {
          watcherWalletName = await input({
            message: "Enter the name of the watch wallet:",
            validate: (input) =>
              input.trim() !== "" ? true : "Please enter a valid wallet name",
          });

          // Check if the entered wallet exists
          watchWalletExists = bitcoinWallets.includes(watcherWalletName);

          if (!watchWalletExists) {
            console.log(
              formatError(`Watch wallet "${watcherWalletName}" not found.`),
            );
            return null;
          }
        }
      }

      // Step 2: Guide the user to create a PSBT with Caravan
      console.log(
        boxText(
          "1. Open Caravan in your browser\n" +
            '2. Go to "Wallet" tab and select your wallet\n' +
            '3. Navigate to the "Spend" tab\n' +
            "4. Create a transaction by filling in the recipient address and amount\n" +
            '5. Click "Create Transaction" to generate the PSBT\n' +
            "6. Copy the PSBT string",
          { title: "Create Transaction in Caravan", titleColor: colors.info },
        ),
      );

      // Get the PSBT from the user
      const psbtBase64 = await input({
        message: "Paste the PSBT from Caravan:",
        validate: (input) =>
          input.trim() !== "" ? true : "Please enter a valid PSBT",
      });

      // Step 3: Process the PSBT with the watcher wallet
      console.log(
        colors.info(
          `\nProcessing PSBT with watch wallet "${watcherWalletName}"...`,
        ),
      );

      const processSpinner = ora("Processing PSBT...").start();
      let processedPSBT;
      try {
        processedPSBT = await this.transactionService.processPSBT(
          watcherWalletName,
          psbtBase64.trim(),
        );
        processSpinner.succeed("PSBT processed successfully with watch wallet");
      } catch (error) {
        processSpinner.fail("Error processing PSBT with watch wallet");
        console.error(formatError(`Error: ${error}`));

        // Try to decode the PSBT to provide more information
        try {
          const decodedPsbt = await this.transactionService.decodePSBT(
            psbtBase64.trim(),
          );
          console.log(
            formatWarning("The PSBT may be missing UTXO information."),
          );
        } catch (decodeError) {
          console.log(
            formatError("Could not decode the PSBT. It may be invalid."),
          );
        }

        return null;
      }

      // Show processed PSBT details
      try {
        const decodeSpinner = ora("Decoding processed PSBT...").start();
        const decodedPsbt =
          await this.transactionService.decodePSBT(processedPSBT);
        decodeSpinner.succeed("PSBT decoded");

        console.log(
          boxText(this.formatPSBTSummary(decodedPsbt), {
            title: "Transaction Details",
            titleColor: colors.info,
          }),
        );
      } catch (error) {
        console.log(
          formatWarning("Could not decode the processed PSBT for display."),
        );
      }

      // Step 4: Collect signatures based on quorum requirements
      const { requiredSigners, totalSigners } = selectedWallet.quorum;
      const signedPSBTs: string[] = [];

      // First signed PSBT is the processed one
      let currentPSBT = processedPSBT;
      signedPSBTs.push(currentPSBT);

      console.log(
        boxText(
          `This wallet requires ${colors.highlight(requiredSigners.toString())} of ${colors.highlight(totalSigners.toString())} signatures.`,
          { title: "Signature Requirements", titleColor: colors.info },
        ),
      );

      // Track signers we've already used
      const usedSigners = new Set<string>();

      // Keep collecting signatures until we have enough
      for (let i = 0; i < requiredSigners; i++) {
        console.log(
          colors.header(`\nSignature ${i + 1} of ${requiredSigners}`),
        );

        // Ask how to provide the signature
        const signMethod = await select({
          message: "How would you like to sign?",
          choices: [
            { name: colors.highlight("Sign with wallet"), value: "wallet" },
            ...(i > 0
              ? [
                  {
                    name: colors.highlight(
                      "Skip (already have enough signatures)",
                    ),
                    value: "skip",
                  },
                ]
              : []),
          ],
        });

        if (signMethod === "skip") {
          console.log(formatWarning("Skipping remaining signatures."));
          break;
        }

        if (signMethod === "wallet") {
          // Find potential signer wallets
          let signerWallets: string[] = [];

          if (isTerminalCreatedWallet) {
            // For terminal-created wallets, we can guess the signer wallet names
            for (let j = 1; j <= totalSigners; j++) {
              const signerName = `${selectedWallet.name.replace(/\\s+/g, "_").toLowerCase()}_signer_${j}`;
              if (
                bitcoinWallets.includes(signerName) &&
                !usedSigners.has(signerName)
              ) {
                signerWallets.push(signerName);
              }
            }
          }

          // If we didn't find any or this is an external wallet, let the user select
          if (signerWallets.length === 0) {
            // Filter out already used signers and the watch wallet
            signerWallets = bitcoinWallets.filter(
              (w) => w !== watcherWalletName && !usedSigners.has(w),
            );
          }

          if (signerWallets.length === 0) {
            console.log(formatWarning("No available signer wallets found."));
            continue;
          }

          // Let user select a signer wallet
          const signerWallet = await select({
            message: `Select wallet for signature ${i + 1}:`,
            choices: signerWallets.map((w) => ({
              name: colors.highlight(w),
              value: w,
            })),
          });

          // Sign with the selected wallet
          const signSpinner = ora(
            `Signing with wallet "${signerWallet}"...`,
          ).start();
          try {
            const newSignedPSBT = await this.transactionService.processPSBT(
              signerWallet,
              currentPSBT,
            );
            signSpinner.succeed(`Signed with wallet "${signerWallet}"`);

            // Update the current PSBT and add to signed list
            currentPSBT = newSignedPSBT;
            signedPSBTs.push(newSignedPSBT);

            // Mark this signer as used
            usedSigners.add(signerWallet);
          } catch (error) {
            signSpinner.fail(`Failed to sign with wallet "${signerWallet}"`);
            console.error(formatError(`Error: ${error}`));

            // Let the user try again with a different method
            i--; // Decrement to retry this signature
            continue;
          }
        } else if (signMethod === "privkey") {
          // Sign with private key
          console.log(
            colors.info(
              "\nYou'll need the private key for one of the signers.",
            ),
          );

          const privateKey = await input({
            message: "Enter private key (WIF format):",
            validate: (input) =>
              input.trim() !== "" ? true : "Please enter a valid private key",
          });

          const signSpinner = ora("Signing with private key...").start();
          try {
            const newSignedPSBT =
              await this.transactionService.signPSBTWithPrivateKey(
                currentPSBT,
                privateKey.trim(),
              );
            signSpinner.succeed("Signed with private key");

            // Update the current PSBT and add to signed list
            currentPSBT = newSignedPSBT;
            signedPSBTs.push(newSignedPSBT);
          } catch (error) {
            signSpinner.fail("Failed to sign with private key");
            console.error(formatError(`Error: ${error}`));

            // Let the user try again with a different method
            i--; // Decrement to retry this signature
            continue;
          }
        } else if (signMethod === "import") {
          // Import signature from Caravan
          console.log(
            boxText(
              "1. In Caravan, sign the transaction with your hardware wallet or key\n" +
                '2. Once signed, copy the "Signed Transaction Hex" or PSBT',
              {
                title: "Import Signature from Caravan",
                titleColor: colors.info,
              },
            ),
          );

          const importedSignature = await input({
            message: "Paste the signed transaction or PSBT from Caravan:",
            validate: (input) =>
              input.trim() !== "" ? true : "Please enter a valid signature",
          });

          // Try to determine if this is a PSBT or a transaction hex
          let importedPSBT = importedSignature.trim();

          // If it starts with "70736274" (hex for "psbt"), it might be hex encoded rather than base64
          if (importedPSBT.startsWith("70736274")) {
            console.log(
              formatWarning(
                "Detected hex-encoded PSBT, converting to base64...",
              ),
            );
            // We'd need to convert hex to base64, but for simplicity we'll assume it's a valid PSBT format
          }

          try {
            // Try to decode the imported data to see if it's valid
            const decodeSpinner = ora(
              "Validating imported signature...",
            ).start();
            await this.transactionService.decodePSBT(importedPSBT);
            decodeSpinner.succeed("Signature validated");

            // Update the current PSBT and add to signed list
            currentPSBT = importedPSBT;
            signedPSBTs.push(importedPSBT);
          } catch (error) {
            console.error(formatError(`Error: ${error}`));

            // Let the user try again with a different method
            i--; // Decrement to retry this signature
            continue;
          }
        }

        // If we've collected enough signatures, give the option to proceed
        if (signedPSBTs.length > 1 && i < requiredSigners - 1) {
          const proceed = await confirm({
            message: `You have ${signedPSBTs.length - 1} signature(s). Try to finalize now?`,
            default: false,
          });

          if (proceed) {
            console.log(
              formatWarning(
                "Proceeding to finalization with current signatures.",
              ),
            );
            break;
          }
        }
      }

      // Step 5: Finalize the PSBT
      console.log(colors.info("\nFinalizing transaction..."));

      const finalizeSpinner = ora("Finalizing PSBT...").start();
      let finalizedPSBT;
      try {
        finalizedPSBT = await this.transactionService.finalizePSBT(currentPSBT);
        finalizeSpinner.succeed("PSBT finalized successfully");
      } catch (error) {
        finalizeSpinner.fail("Failed to finalize PSBT");
        console.error(formatError(`Error: ${error}`));

        console.log(
          boxText(
            "The transaction could not be finalized. This usually means:\n" +
              "1. Not enough signatures were collected\n" +
              "2. The signatures are not valid for this transaction\n" +
              "3. There was an issue with the PSBT structure",
            { title: "Finalization Failed", titleColor: colors.error },
          ),
        );

        // Ask if the user wants to save the partially signed PSBT
        const savePSBT = await confirm({
          message: "Would you like to save the partially signed PSBT?",
          default: true,
        });

        if (savePSBT) {
          const filename = await input({
            message: "Enter filename to save PSBT:",
            default: `${selectedWallet.name.replace(/\\s+/g, "_").toLowerCase()}_partially_signed.psbt`,
          });

          const saveSpinner = ora(`Saving PSBT to ${filename}...`).start();
          await fs.writeFile(filename, currentPSBT);
          saveSpinner.succeed(`PSBT saved to ${filename}`);
        }

        return null;
      }

      // Check if finalization was complete
      if (!finalizedPSBT.complete) {
        console.log(
          boxText(
            "The PSBT could not be fully finalized. More signatures may be required.",
            { title: "Incomplete Finalization", titleColor: colors.warning },
          ),
        );

        // Ask if the user wants to save the partially signed PSBT
        const savePSBT = await confirm({
          message: "Would you like to save the partially signed PSBT?",
          default: true,
        });

        if (savePSBT) {
          const filename = await input({
            message: "Enter filename to save PSBT:",
            default: `${selectedWallet.name.replace(/\\s+/g, "_").toLowerCase()}_partially_signed.psbt`,
          });

          const saveSpinner = ora(`Saving PSBT to ${filename}...`).start();
          await fs.writeFile(filename, currentPSBT);
          saveSpinner.succeed(`PSBT saved to ${filename}`);
        }

        return null;
      }

      // Step 6: Broadcast the transaction
      const broadcastTx = await confirm({
        message: "Would you like to broadcast the transaction now?",
        default: true,
      });

      if (broadcastTx) {
        const broadcastSpinner = ora("Broadcasting transaction...").start();
        try {
          const txid = await this.transactionService.broadcastTransaction(
            finalizedPSBT.hex,
          );
          broadcastSpinner.succeed("Transaction broadcast successfully");

          console.log(
            boxText(
              `Transaction ID: ${colors.highlight(txid)}\n` +
                `\nThe transaction has been broadcast to the Bitcoin network.`,
              { title: "Transaction Broadcast", titleColor: colors.success },
            ),
          );

          // Offer to mine a block in regtest mode
          const mineBlock = await confirm({
            message: "Mine a block to confirm the transaction?",
            default: true,
          });

          if (mineBlock) {
            // Find a wallet to mine to (preferably a signer wallet)
            let miningWallet;
            if (usedSigners.size > 0) {
              miningWallet = Array.from(usedSigners)[0];
            } else {
              // Fallback: use any wallet that's not the watch wallet
              const otherWallets = bitcoinWallets.filter(
                (w) => w !== watcherWalletName,
              );
              if (otherWallets.length > 0) {
                miningWallet = otherWallets[0];
              } else {
                miningWallet = await select({
                  message: "Select wallet to mine to:",
                  choices: bitcoinWallets.map((w) => ({ name: w, value: w })),
                });
              }
            }

            const mineSpinner = ora(
              `Mining block to wallet ${miningWallet}...`,
            ).start();
            try {
              const miningAddress =
                await this.bitcoinService.getNewAddress(miningWallet);
              const blockHashes = await this.bitcoinService.generateToAddress(
                1,
                miningAddress,
              );
              mineSpinner.succeed(
                `Block mined successfully: ${truncate(blockHashes[0], 10)}`,
              );
            } catch (error) {
              mineSpinner.fail("Failed to mine block");
              console.error(formatError(`Error: ${error}`));
            }
          }

          return { txid };
        } catch (error) {
          broadcastSpinner.fail("Failed to broadcast transaction");
          console.error(formatError(`Error: ${error}`));

          console.log(
            boxText(
              "The transaction could not be broadcast. This could be due to:\n" +
                "1. Network connectivity issues\n" +
                "2. The transaction is invalid (e.g., spending already spent outputs)\n" +
                "3. The transaction violates policy rules (e.g., too low fee)",
              { title: "Broadcast Failed", titleColor: colors.error },
            ),
          );

          // Ask if the user wants to save the transaction hex
          const saveHex = await confirm({
            message: "Would you like to save the transaction hex?",
            default: true,
          });

          if (saveHex) {
            const filename = await input({
              message: "Enter filename to save transaction hex:",
              default: `${selectedWallet.name.replace(/\\s+/g, "_").toLowerCase()}_tx.hex`,
            });

            const saveSpinner = ora(
              `Saving transaction hex to ${filename}...`,
            ).start();
            await fs.writeFile(filename, finalizedPSBT.hex);
            saveSpinner.succeed(`Transaction hex saved to ${filename}`);
          }

          return null;
        }
      } else {
        // The user chose not to broad
        // cast
        console.log(
          formatWarning(
            "Transaction not broadcast. You can broadcast it later.",
          ),
        );

        // Ask if the user wants to save the transaction hex
        const saveHex = await confirm({
          message: "Would you like to save the transaction hex?",
          default: true,
        });

        if (saveHex) {
          const filename = await input({
            message: "Enter filename to save transaction hex:",
            default: `${selectedWallet.name.replace(/\\s+/g, "_").toLowerCase()}_tx.hex`,
          });

          const saveSpinner = ora(
            `Saving transaction hex to ${filename}...`,
          ).start();
          await fs.writeFile(filename, finalizedPSBT.hex);
          saveSpinner.succeed(`Transaction hex saved to ${filename}`);
        }

        return { hex: finalizedPSBT.hex };
      }
    } catch (error) {
      console.error(formatError("Error spending from Caravan wallet:"), error);
      return null;
    }
  }

  /**
   * Helper method to check if a wallet was created by this terminal tool
   */
  private async isTerminalCreatedWallet(walletName: string): Promise<boolean> {
    // Check for watch wallet with expected naming pattern
    const watcherWalletName = `${walletName.replace(/\\s+/g, "_").toLowerCase()}_watcher`;
    const bitcoinWallets = await this.bitcoinService.listWallets();

    if (bitcoinWallets.includes(watcherWalletName)) {
      return true;
    }

    // Check for signer wallets with expected naming pattern
    const signerPrefix = `${walletName.replace(/\\s+/g, "_").toLowerCase()}_signer_`;

    const matchingSigner = bitcoinWallets.find((w) =>
      w.startsWith(signerPrefix),
    );
    if (matchingSigner) {
      return true;
    }
    return false;
  }

  /**
   * Format a decoded PSBT for display
   */
  private formatPSBTSummary(decodedPsbt: any): string {
    let summary = "";

    // Display inputs
    summary += colors.header("Inputs:") + "\n";
    decodedPsbt.inputs.forEach((input: any, index: any) => {
      summary += `Input #${index + 1}:\n`;
      if (input.has_utxo) {
        summary += `  TXID: ${truncate(decodedPsbt.tx.vin[index].txid, 10)}\n`;
        summary += `  VOUT: ${decodedPsbt.tx.vin[index].vout}\n`;
        summary += `  Amount: ${formatBitcoin(input.utxo.amount)}\n`;
        summary += `  Address: ${input.utxo.scriptPubKey.address || "Unknown"}\n`;
      } else {
        summary += `  TXID: ${truncate(decodedPsbt.tx.vin[index].txid, 10)}\n`;
        summary += `  VOUT: ${decodedPsbt.tx.vin[index].vout}\n`;
      }
      summary += "\n";
    });

    // Display outputs
    summary += colors.header("Outputs:") + "\n";
    decodedPsbt.tx.vout.forEach((output: any, index: any) => {
      summary += `Output #${index + 1}:\n`;
      summary += `  Amount: ${formatBitcoin(output.value)}\n`;
      summary += `  Address: ${output.scriptPubKey.address || "Unknown"}\n\n`;
    });

    // Display fee
    if (decodedPsbt.fee) {
      summary += colors.header("Fee:") + "\n";
      summary += `  ${formatBitcoin(decodedPsbt.fee)}\n`;

      // Calculate fee rate
      if (decodedPsbt.tx.vsize) {
        const feeRate = decodedPsbt.fee / (decodedPsbt.tx.vsize / 1000);
        summary += `  Rate: ${feeRate.toFixed(2)} BTC/kB\n`;
      }
    }

    return summary;
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
      // Save the configuration to a file
      const configFileName = `${caravanConfig.name.replace(/\s+/g, "_").toLowerCase()}_config.json`;
      const configPath = path.join(
        this.caravanService.getCaravanDir(),
        configFileName,
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
    displayCommandTitle("Fund Caravan Multisig Wallet");

    try {
      const wallets = await this.caravanService.listCaravanWallets();

      if (wallets.length === 0) {
        console.log(
          formatWarning("No Caravan wallets found. Create one first."),
        );
        return null;
      }

      const walletIndex = await select({
        message: "Select a Caravan wallet to fund:",
        choices: wallets.map((w, i) => ({
          name:
            colors.highlight(w.name) +
            colors.info(
              ` (${w.quorum.requiredSigners} of ${w.quorum.totalSigners}, ${w.addressType})`,
            ),
          value: i,
        })),
      });

      const selectedWallet = wallets[walletIndex];

      // Provide instructions to the user
      console.log(
        boxText(
          "1. Open Caravan in your browser\n" +
            '2. Go to your caravan wallet\'s "Receive" tab\n' +
            "3. Select an Address\n" +
            "4. Copy that address and paste it below",
          {
            title: "Steps to Get Multisig Address",
            titleColor: colors.info,
          },
        ),
      );

      // Get the multisig address from user
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

      // Find non-watch wallets with funds
      console.log(colors.info("\nScanning for wallets with funds..."));

      const fundingWalletsSpinner = ora(
        "Loading wallets with funds...",
      ).start();
      const bitcoindWallets = await this.bitcoinService.listWallets();

      // Filter out watch wallets (those ending with _watch)
      const nonWatchWallets = bitcoindWallets.filter(
        (w) => !w.endsWith("_watch"),
      );

      // Check balance of each wallet
      const walletsWithFunds = [];

      for (const wallet of nonWatchWallets) {
        try {
          const walletInfo = await this.bitcoinService.getWalletInfo(wallet);
          if (walletInfo.balance > 0) {
            walletsWithFunds.push({
              name: wallet,
              balance: walletInfo.balance,
            });
          }
        } catch (error) {
          // Skip wallets that we can't get info for
        }
      }

      fundingWalletsSpinner.succeed(
        `Found ${walletsWithFunds.length} wallet(s) with funds`,
      );

      if (walletsWithFunds.length === 0) {
        console.log(
          formatWarning(
            "\nNo wallets with funds found. Please fund a wallet first.",
          ),
        );

        // Offer to create and fund a wallet
        const createWallet = await confirm({
          message: "Would you like to create and fund a wallet now?",
          default: true,
        });

        if (createWallet) {
          // Create funding wallet
          const fundingWalletName = `funding_wallet_${Date.now()}`;
          console.log(
            colors.info(`\nCreating funding wallet: ${fundingWalletName}`),
          );

          const createSpinner = ora(
            `Creating wallet ${fundingWalletName}...`,
          ).start();
          await this.bitcoinService.createWallet(fundingWalletName, {
            disablePrivateKeys: false,
            blank: false,
            descriptorWallet: true,
          });
          createSpinner.succeed(`Created funding wallet: ${fundingWalletName}`);

          // Fund it by mining
          const fundingAddress =
            await this.bitcoinService.getNewAddress(fundingWalletName);
          const mineSpinner = ora(
            "Mining 6 blocks to fund the wallet...",
          ).start();
          const blockHashes = await this.bitcoinService.generateToAddress(
            6,
            fundingAddress,
          );
          mineSpinner.succeed(`Mined 6 blocks to address ${fundingAddress}`);

          // Add to walletsWithFunds
          const walletInfo =
            await this.bitcoinService.getWalletInfo(fundingWalletName);
          walletsWithFunds.push({
            name: fundingWalletName,
            balance: walletInfo.balance,
          });
        } else {
          return null;
        }
      }

      // Have user select a wallet to use for funding
      const fundingWalletChoices = walletsWithFunds.map((w) => ({
        name:
          colors.highlight(w.name) +
          colors.info(` (Balance: ${formatBitcoin(w.balance)})`),
        value: w.name,
      }));

      const sourceWallet = await select({
        message: "Select a wallet to use for funding:",
        choices: fundingWalletChoices,
      });

      const sourceInfo = await this.bitcoinService.getWalletInfo(sourceWallet);

      // Ask for amount
      const amount = await number({
        message: "Enter amount to send (BTC):",
        validate: (input: number | undefined) => {
          if (input === undefined || isNaN(input) || input <= 0) {
            return "Please enter a valid positive amount";
          }
          if (input > sourceInfo.balance) {
            return `Amount exceeds balance (${formatBitcoin(sourceInfo.balance)})`;
          }
          return true;
        },
        default: Math.min(0.01, sourceInfo.balance),
      });

      // Ask about transaction fee
      const includeFee = await confirm({
        message: "Would you like to specify a custom fee?",
        default: false,
      });

      let fee = 0.0001; // Default fee

      if (includeFee) {
        fee = (await number({
          message: "Enter fee amount (BTC):",
          validate: (input: number | undefined) => {
            if (input === undefined || isNaN(input) || input < 0) {
              return "Please enter a valid non-negative amount";
            }
            if (input + amount! > sourceInfo.balance) {
              return `Amount + fee (${formatBitcoin(input + amount!)}) exceeds balance (${formatBitcoin(sourceInfo.balance)})`;
            }
            return true;
          },
          default: 0.0001,
        })) as number;
      }

      // Generate transaction description
      const txDescription = boxText(
        `From: ${colors.highlight(sourceWallet)}\n` +
          `To: ${colors.highlight(multisigAddress)}\n` +
          `Amount: ${colors.highlight(formatBitcoin(amount!))}\n` +
          `Fee: ${colors.highlight(formatBitcoin(fee))}\n` +
          `Total: ${colors.highlight(formatBitcoin(amount! + fee))}`,
        { title: "Transaction Details", titleColor: colors.info },
      );

      console.log(txDescription);

      // Confirm the transaction
      const confirmSend = await confirm({
        message: "Do you want to send this transaction?",
        default: true,
      });

      if (!confirmSend) {
        console.log(formatWarning("Transaction cancelled."));
        return null;
      }

      // Send the transaction
      console.log(
        colors.info(
          `\nSending ${formatBitcoin(amount!)} to multisig address...`,
        ),
      );

      const txSpinner = ora("Sending transaction...").start();
      let txid;

      try {
        txid = await this.bitcoinService.sendToAddress(
          sourceWallet,
          multisigAddress,
          amount!,
        );
        txSpinner.succeed("Transaction sent successfully");
      } catch (error) {
        txSpinner.fail("Failed to send transaction");
        console.error(formatError(`Error: ${error}`));
        return null;
      }

      console.log(
        boxText(
          `Transaction ID: ${colors.highlight(txid)}\n\n` +
            `The funds have been sent to the multisig address. You should now\n` +
            `be able to see this transaction in Caravan's "Pending Transactions" tab.\n\n` +
            `In regtest mode, the transaction needs to be confirmed by mining a block.`,
          { title: "Transaction Sent", titleColor: colors.success },
        ),
      );

      // Ask if the user wants to mine a block to confirm
      const mineBlock = await confirm({
        message: "Would you like to mine a block to confirm the transaction?",
        default: true,
      });

      if (mineBlock) {
        const mineSpinner = ora("Mining a block...").start();
        try {
          const miningAddress =
            await this.bitcoinService.getNewAddress(sourceWallet);
          const blockHashes = await this.bitcoinService.generateToAddress(
            1,
            miningAddress,
          );
          mineSpinner.succeed("Block mined successfully");

          console.log(
            boxText(
              `Block hash: ${colors.highlight(blockHashes[0])}\n\n` +
                `The transaction has been confirmed. You can now spend these funds\n` +
                `from your Caravan multisig wallet by creating a transaction in the\n` +
                `"Spend" tab.`,
              { title: "Transaction Confirmed", titleColor: colors.success },
            ),
          );
        } catch (error) {
          mineSpinner.fail("Failed to mine block");
          console.error(formatError(`Error: ${error}`));
        }
      } else {
        console.log(
          formatWarning(
            "\nTransaction will remain pending until a block is mined.",
          ),
        );
      }

      return { txid };
    } catch (error) {
      console.error(formatError("Error funding Caravan wallet:"), error);
      return null;
    }
  }

  /**
   * Sign a Caravan PSBT and generate JSON signature format for reimporting into Caravan
   */
  async signCaravanPSBT(): Promise<any | false> {
    displayCommandTitle("Sign Caravan PSBT for Import");

    try {
      // Step 1: Get the unsigned PSBT from the user
      console.log(
        boxText(
          "This feature lets you sign a Caravan PSBT and generate a compatible JSON format\n" +
            "that can be directly imported back into Caravan's UI for transaction completion.",
          { title: "Caravan Signature Generator", titleColor: colors.info },
        ),
      );

      // Get the PSBT with back option
      const sourceOptions = [
        { name: colors.highlight("Load from file"), value: "file" },
        { name: colors.highlight("Paste Base64 string"), value: "paste" },
        { name: colors.highlight("Read from clipboard"), value: "clipboard" },
      ];

      const source = await select({
        message: "How would you like to provide the PSBT?",
        choices: sourceOptions,
      });

      let psbtBase64: string;

      switch (source) {
        case "file": {
          const filename = await input({
            message: "Enter path to PSBT file:",
            validate: (input) =>
              fs.existsSync(input) ? true : "File does not exist",
          });

          const readSpinner = ora(`Reading PSBT from ${filename}...`).start();
          try {
            psbtBase64 = (await fs.readFile(filename, "utf8")).trim();
            readSpinner.succeed("PSBT loaded from file");
          } catch (error: any) {
            readSpinner.fail(`Error reading from ${filename}`);
            console.error(formatError(`Error: ${error.message}`));
            return false;
          }
          break;
        }
        case "paste": {
          psbtBase64 = await input({
            message: "Paste the base64-encoded PSBT from Caravan:",
            validate: (input) =>
              input.trim() !== "" ? true : "Please enter a valid PSBT",
          });
          break;
        }
        case "clipboard":
          try {
            const clipboardSpinner = ora("Reading from clipboard...").start();
            psbtBase64 = await clipboard.read();
            clipboardSpinner.succeed("PSBT read from clipboard");
          } catch (error) {
            console.error(formatError("Error reading from clipboard:"), error);
            return false;
          }
          break;
      }

      // Step 2: Validate the PSBT is from a Caravan wallet and detect if terminal-created
      const detectSpinner = ora("Analyzing PSBT...").start();
      let caravanWallets;
      let caravanConfig;
      let isTerminalCreatedWallet = false;

      try {
        caravanWallets = await this.caravanService.listCaravanWallets();
        caravanConfig =
          await this.transactionService.detectCaravanWalletForPSBT(
            psbtBase64!,
            caravanWallets,
          );

        if (caravanConfig) {
          // Check if this is a wallet created by our terminal tool
          isTerminalCreatedWallet = await this.isTerminalCreatedWallet(
            caravanConfig.name,
          );
        }
      } catch (error) {
        detectSpinner.warn("Error analyzing PSBT");
        console.log(
          formatWarning("Could not check if this is a Caravan PSBT."),
        );
      }

      if (caravanConfig) {
        detectSpinner.succeed("Caravan wallet detected");
        console.log(
          boxText(
            `PSBT belongs to Caravan wallet: ${colors.highlight(caravanConfig.name)}\n` +
              `Quorum: ${colors.highlight(`${caravanConfig.quorum.requiredSigners} of ${caravanConfig.quorum.totalSigners}`)}\n` +
              `Address Type: ${colors.highlight(caravanConfig.addressType)}` +
              (isTerminalCreatedWallet
                ? `\nCreator: ${colors.success("Created by this tool")}`
                : ""),
            { title: "Caravan Wallet Information", titleColor: colors.success },
          ),
        );
      } else {
        detectSpinner.warn("No Caravan wallet detected");
        console.log(
          formatWarning(
            "This PSBT does not appear to be from a known Caravan wallet. Will proceed anyway.",
          ),
        );
      }

      // Step 3: Show PSBT details
      let decodedPsbt;
      try {
        const decodeSpinner = ora("Decoding PSBT...").start();
        decodedPsbt = await this.transactionService.decodePSBT(psbtBase64!);
        decodeSpinner.succeed("PSBT decoded successfully");

        // Display summary info
        console.log(
          boxText(
            `Inputs: ${colors.highlight(decodedPsbt.inputs.length.toString())}\n` +
              `Outputs: ${colors.highlight(decodedPsbt.tx.vout.length.toString())}` +
              (decodedPsbt.fee
                ? `\nFee: ${colors.highlight(formatBitcoin(decodedPsbt.fee))}`
                : ""),
            { title: "Transaction Details", titleColor: colors.info },
          ),
        );

        // Optional detailed view
        const showDetails = await confirm({
          message: "Would you like to see detailed transaction information?",
          default: false,
        });

        if (showDetails) {
          console.log(
            boxText(this.formatPSBTSummary(decodedPsbt), {
              title: "Transaction Details",
              titleColor: colors.info,
            }),
          );
        }
      } catch (error) {
        console.log(formatWarning("Could not decode PSBT for inspection."));
      }

      // Get information about required signatures
      const requiredSigners = caravanConfig?.quorum.requiredSigners || 1;
      const totalSigners = caravanConfig?.quorum.totalSigners || 1;
      const walletName = caravanConfig?.name || "unknown-wallet";

      console.log(
        boxText(
          `This wallet requires ${colors.highlight(requiredSigners.toString())} of ${colors.highlight(totalSigners.toString())} signatures.`,
          { title: "Signature Requirements", titleColor: colors.info },
        ),
      );

      // Track information for signature collection
      const usedSigners = new Set<string>();
      let currentPSBT = psbtBase64!;
      const signedPSBTs: string[] = [];
      signedPSBTs.push(currentPSBT); // Add initial PSBT

      // Function to process signing with a wallet
      const signWithWallet = async (walletName: string): Promise<boolean> => {
        const signSpinner = ora(
          `Signing with wallet "${walletName}"...`,
        ).start();
        try {
          // Sign the PSBT with the wallet
          const newSignedPSBT = await this.transactionService.processPSBT(
            walletName,
            currentPSBT,
          );

          // Update current PSBT and add to signed list
          currentPSBT = newSignedPSBT;
          signedPSBTs.push(newSignedPSBT);

          // Mark this signer as used
          usedSigners.add(walletName);

          signSpinner.succeed(`Signed with wallet "${walletName}"`);
          return true;
        } catch (error: any) {
          signSpinner.fail(`Failed to sign with wallet "${walletName}"`);
          console.error(formatError(`Error: ${error.message}`));
          return false;
        }
      };

      // Function to process signing with a private key
      const signWithPrivateKey = async (
        privateKey: string,
      ): Promise<boolean> => {
        const signSpinner = ora("Signing with private key...").start();
        try {
          const newSignedPSBT =
            await this.transactionService.signPSBTWithPrivateKey(
              currentPSBT,
              privateKey.trim(),
            );

          // Update current PSBT and add to signed list
          currentPSBT = newSignedPSBT;
          signedPSBTs.push(newSignedPSBT);

          signSpinner.succeed("PSBT signed successfully with private key");
          return true;
        } catch (error: any) {
          signSpinner.fail("Error signing PSBT");
          console.error(formatError(`Error: ${error.message}`));
          return false;
        }
      };

      // Step 4: Collect signatures based on wallet detection and quorum requirements
      for (let i = 0; i < requiredSigners; i++) {
        console.log(
          colors.header(`\nSignature ${i + 1} of ${requiredSigners}`),
        );

        // Check if we can automatically find signer wallets for terminal-created wallets
        let autoSignerWallets: string[] = [];

        if (isTerminalCreatedWallet && caravanConfig) {
          // For terminal-created wallets, we can guess the signer wallet names
          // Get list of available Bitcoin wallets
          const bitcoinWallets = await this.bitcoinService.listWallets();

          // Look for signer wallets based on naming pattern
          for (let j = 1; j <= totalSigners; j++) {
            const signerName = `${walletName.replace(/\s+/g, "_").toLowerCase()}_signer_${j}`;
            if (
              bitcoinWallets.includes(signerName) &&
              !usedSigners.has(signerName)
            ) {
              autoSignerWallets.push(signerName);
            }
          }
        }

        if (autoSignerWallets.length > 0) {
          // We found automatically detected signer wallets
          console.log(
            boxText(
              `Found ${colors.highlight(autoSignerWallets.length.toString())} available signing wallets for this Caravan wallet.`,
              { title: "Available Signers", titleColor: colors.success },
            ),
          );

          // Let user select from auto-detected signer wallets
          const signerWallet = await select({
            message: `Select wallet for signature ${i + 1}:`,
            choices: autoSignerWallets.map((w) => ({
              name: colors.highlight(w),
              value: w,
            })),
          });

          // Sign with selected wallet
          const success = await signWithWallet(signerWallet);

          if (!success) {
            // If signing failed, retry this signature
            i--;
            continue;
          }
        } else {
          // No auto-detected signer wallets or not a terminal-created wallet
          // Ask how to provide the signature
          const signMethod = await select({
            message: "How would you like to sign?",
            choices: [
              { name: colors.highlight("Sign with wallet"), value: "wallet" },
              {
                name: colors.highlight("Sign with private key"),
                value: "privkey",
              },
              ...(i > 0
                ? [
                    {
                      name: colors.highlight("Skip (enough signatures)"),
                      value: "skip",
                    },
                  ]
                : []),
            ],
          });

          if (signMethod === "skip") {
            console.log(formatWarning("Skipping remaining signatures."));
            break;
          }

          if (signMethod === "wallet") {
            // Get all available Bitcoin wallets, excluding already used ones
            const bitcoinWallets = await this.bitcoinService.listWallets();
            const availableWallets = bitcoinWallets.filter(
              (w) => !usedSigners.has(w),
            );

            if (availableWallets.length === 0) {
              console.log(formatWarning("No available signer wallets found."));
              i--; // Retry this signature
              continue;
            }

            // Let user select a signer wallet
            const signerWallet = await select({
              message: `Select wallet for signature ${i + 1}:`,
              choices: availableWallets.map((w) => ({
                name: colors.highlight(w),
                value: w,
              })),
            });

            // Sign with the selected wallet
            const success = await signWithWallet(signerWallet);

            if (!success) {
              // If signing failed, retry this signature
              i--;
              continue;
            }
          } else if (signMethod === "privkey") {
            // Sign with private key
            console.log(
              colors.info(
                "\nYou'll need the private key for one of the signers.",
              ),
            );

            const privateKey = await input({
              message: "Enter private key (WIF format):",
              validate: (input) =>
                input.trim() !== "" ? true : "Please enter a valid private key",
            });

            const success = await signWithPrivateKey(privateKey);

            if (!success) {
              // If signing failed, retry this signature
              i--;
              continue;
            }
          }
        }

        // If we've collected enough signatures, give the option to proceed
        if (signedPSBTs.length > 1 && i < requiredSigners - 1) {
          const proceed = await confirm({
            message: `You have ${signedPSBTs.length - 1} signature(s). Generate JSON now?`,
            default: false,
          });

          if (proceed) {
            console.log(formatWarning("Proceeding with current signatures."));
            break;
          }
        }
      }

      if (signedPSBTs.length <= 1) {
        console.log(formatError("No signatures were collected."));
        return false;
      }

      // Step 5: Extract signatures directly from the decoded PSBT
      // We only need an array of signature strings for Caravan

      const extractSpinner = ora("Extracting signatures from PSBT...").start();
      let signatures = [];

      try {
        // Decode the PSBT to get access to input details
        const decodedPsbt =
          await this.transactionService.decodePSBT(currentPSBT);

        // Extract signatures from final_scriptwitness arrays
        // The signature is typically the second element (index 1) in the scriptwitness array
        if (
          decodedPsbt &&
          decodedPsbt.inputs &&
          Array.isArray(decodedPsbt.inputs)
        ) {
          signatures = decodedPsbt.inputs
            .filter(
              (input: any) =>
                input.final_scriptwitness &&
                Array.isArray(input.final_scriptwitness) &&
                input.final_scriptwitness.length > 1,
            )
            .map((input: any) => input.final_scriptwitness[1]);
        }

        if (signatures.length > 0) {
          extractSpinner.succeed(
            `Extracted ${signatures.length} signature(s) from PSBT`,
          );
        } else {
          extractSpinner.warn("No signatures found in PSBT");
          console.log(
            formatWarning(
              "Could not find signatures in the PSBT. Make sure the PSBT is properly signed.",
            ),
          );
        }
      } catch (error) {
        extractSpinner.fail("Failed to extract signatures");
        console.error(formatError(`Error: ${error}`));
        signatures = [];
      }

      // Format as a simple JSON array of signatures
      const signaturesJson = JSON.stringify(signatures, null, 2);

      // Preview the JSON result
      console.log(
        boxText(
          "Generated Caravan signature array.\n" +
            "This can be imported back into Caravan's UI to add these signatures to the transaction.",
          { title: "Signatures Ready", titleColor: colors.success },
        ),
      );

      // Let the user decide what to do with the JSON
      const action = await select({
        message: "What would you like to do with the signatures?",
        choices: [
          { name: colors.highlight("Save to file"), value: "file" },
          { name: colors.highlight("Copy to clipboard"), value: "clipboard" },
          { name: colors.highlight("Display"), value: "display" },
        ],
      });

      switch (action) {
        case "file": {
          const filename = await input({
            message: "Enter file name:",
            default: `caravan-signatures.json`,
          });

          const saveSpinner = ora(
            `Saving signatures to ${filename}...`,
          ).start();
          try {
            await fs.writeFile(filename, signaturesJson);
            saveSpinner.succeed("Signatures saved successfully");

            console.log(
              boxText(
                `The signatures have been saved to ${colors.highlight(filename)}\n\n` +
                  "To use these signatures in Caravan:\n" +
                  "1. In Caravan, go to your transaction in the 'Spend' tab\n" +
                  "2. Under 'Signature', click 'Import'\n" +
                  "3. Select 'Load from file' and choose the saved JSON file\n" +
                  "4. Click 'Add Signature' to apply it to the transaction",
                { title: "Next Steps", titleColor: colors.info },
              ),
            );
          } catch (error: any) {
            saveSpinner.fail(`Error saving to ${filename}`);
            console.error(formatError(`Error: ${error.message}`));
          }
          break;
        }
        case "clipboard":
          const clipboardSpinner = ora("Copying to clipboard...").start();
          try {
            await clipboard.write(signaturesJson);
            clipboardSpinner.succeed("Signatures copied to clipboard");

            console.log(
              boxText(
                "The signatures have been copied to your clipboard.\n\n" +
                  "To use these signatures in Caravan:\n" +
                  "1. In Caravan, go to your transaction in the 'Spend' tab\n" +
                  "2. Under 'Signature', click 'Import'\n" +
                  "3. Select 'Paste JSON' and paste the clipboard content\n" +
                  "4. Click 'Add Signature' to apply it to the transaction",
                { title: "Next Steps", titleColor: colors.info },
              ),
            );
          } catch (error: any) {
            clipboardSpinner.fail("Error copying to clipboard");
            console.error(formatError(`Error: ${error.message}`));
          }
          break;
        case "display":
          console.log(
            boxText(colors.code(signaturesJson), {
              title: "Caravan Signatures (JSON Array)",
              titleColor: colors.info,
            }),
          );

          console.log(
            boxText(
              "To use these signatures in Caravan:\n" +
                "1. In Caravan, go to your transaction in the 'Spend' tab\n" +
                "2. Under 'Signature', click 'Import'\n" +
                "3. Select 'Paste JSON' and paste the displayed JSON\n" +
                "4. Click 'Add Signature' to apply it to the transaction",
              { title: "Next Steps", titleColor: colors.info },
            ),
          );
          break;
      }

      // Return the signatures array and PSBT for reference
      return {
        signatures,
        psbt: currentPSBT,
      };
    } catch (error) {
      console.error(formatError("Error signing Caravan PSBT:"), error);
      return false;
    }
  }
}
