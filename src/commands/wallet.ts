import { BitcoinService } from "../core/bitcoin";
import { Network } from "../types/caravan";
import { input, confirm, select } from "@inquirer/prompts";
import chalk from "chalk";
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
} from "../utils/terminal";

/**
 * Wallet commands for managing Bitcoin wallets
 */
export class WalletCommands {
  private readonly bitcoinService: BitcoinService;

  constructor(bitcoinService: BitcoinService) {
    this.bitcoinService = bitcoinService;
  }

  /**
   * List all wallets on the node
   */
  async listWallets(): Promise<string[]> {
    displayCommandTitle("Available Wallets");

    try {
      const spinner = ora("Fetching wallets...").start();
      const wallets = await this.bitcoinService.listWallets();
      spinner.succeed("Wallets fetched successfully");

      if (wallets.length === 0) {
        console.log(formatWarning("No wallets found."));
        return [];
      }

      // Prepare table data
      const tableRows = [];

      for (let i = 0; i < wallets.length; i++) {
        const wallet = wallets[i];
        try {
          const spinner = ora(`Loading wallet info for ${wallet}...`).start();
          const walletInfo = await this.bitcoinService.getWalletInfo(wallet);
          spinner.succeed(`Loaded info for ${wallet}`);

          tableRows.push([
            `${i + 1}`,
            colors.highlight(wallet),
            formatBitcoin(walletInfo.balance),
            walletInfo.private_keys_enabled
              ? colors.success("Full")
              : colors.warning("Watch-only"),
            walletInfo.descriptors
              ? colors.success("Yes")
              : colors.muted("Legacy"),
          ]);
        } catch (error) {
          tableRows.push([
            `${i + 1}`,
            colors.highlight(wallet),
            colors.muted("Unknown"),
            colors.muted("Unknown"),
            colors.muted("Unknown"),
          ]);
        }
      }

      // Display table
      const table = createTable(
        ["#", "Wallet Name", "Balance", "Type", "Descriptors"],
        tableRows,
      );

      console.log(table);
      console.log(
        `\nTotal wallets: ${colors.highlight(wallets.length.toString())}`,
      );

      return wallets;
    } catch (error) {
      console.error(formatError("Error listing wallets:"), error);
      return [];
    }
  }

  /**
   * Create a new wallet
   */
  async createWallet(): Promise<string | null> {
    displayCommandTitle("Create New Wallet");

    try {
      const walletName = await input({
        message: "Enter a name for the new wallet:",
        validate: (input) =>
          input.trim() !== "" ? true : "Please enter a valid wallet name",
      });

      const walletType = await select({
        message: "What type of wallet would you like to create?",
        choices: [
          {
            name: colors.highlight("Standard wallet (with private keys)"),
            value: "standard",
          },
          {
            name: colors.highlight("Watch-only wallet (no private keys)"),
            value: "watch-only",
          },
          {
            name: colors.highlight("Blank wallet (no keys or addresses)"),
            value: "blank",
          },
        ],
      });

      const disablePrivateKeys =
        walletType === "watch-only" || walletType === "blank";
      const blank = walletType === "blank";

      console.log(
        colors.info(`\nCreating ${walletType} wallet "${walletName}"...`),
      );

      const spinner = ora("Creating wallet...").start();
      const result = await this.bitcoinService.createWallet(walletName, {
        disablePrivateKeys,
        blank,
      });
      spinner.succeed("Wallet created");

      if (result) {
        console.log(
          boxText(
            formatSuccess(`Wallet "${walletName}" created successfully!`),
            { title: "Wallet Created", titleColor: colors.success },
          ),
        );

        // Generate a new address if the wallet has private keys
        if (walletType === "standard") {
          const addressSpinner = ora("Generating address...").start();
          const address = await this.bitcoinService.getNewAddress(walletName);
          addressSpinner.succeed("Address generated");

          console.log(
            boxText(
              `Wallet: ${colors.highlight(walletName)}\nAddress: ${colors.highlight(address)}`,
              { title: "Generated Address", titleColor: colors.info },
            ),
          );
        }

        return walletName;
      }

      return null;
    } catch (error) {
      console.error(formatError("Error creating wallet:"), error);
      return null;
    }
  }

  /**
   * Create a wallet with a known private key (for testing)
   */
  async createPrivateKeyWallet(): Promise<{
    wallet: string;
    wif: string;
    address: string;
  } | null> {
    displayCommandTitle("Create Wallet with Private Key");

    try {
      const walletName = await input({
        message: "Enter a name for the new wallet:",
        validate: (input) =>
          input.trim() !== "" ? true : "Please enter a valid wallet name",
      });

      const useExistingKey = await confirm({
        message: "Do you want to use an existing private key?",
        default: false,
      });

      let wif: string | undefined;
      if (useExistingKey) {
        wif = await input({
          message: "Enter the private key (WIF format):",
          validate: (input) =>
            input.trim() !== "" ? true : "Please enter a valid private key",
        });
      }

      console.log(
        colors.info(
          `\nCreating wallet "${walletName}" with ${wif ? "specified" : "random"} private key...`,
        ),
      );

      const spinner = ora("Creating wallet with private key...").start();
      const result = await this.bitcoinService.createPrivateKeyWallet(
        walletName,
        wif,
      );
      spinner.succeed("Wallet created successfully");

      if (result) {
        console.log(
          boxText(
            `Wallet: ${colors.highlight(result.wallet)}\nAddress: ${colors.highlight(result.address)}\nPrivate key (WIF): ${colors.code(result.wif)}`,
            { title: "Wallet Created", titleColor: colors.success },
          ),
        );

        console.log(
          formatWarning(
            "\nKeep this private key secure! Anyone with this key can spend funds.",
          ),
        );

        return result;
      }

      return null;
    } catch (error) {
      console.error(
        formatError("Error creating wallet with private key:"),
        error,
      );
      return null;
    }
  }

  /**
   * Create a HD wallet for Caravan multisig (with xpub)
   */
  async createCaravanKeyWallet(): Promise<any> {
    displayCommandTitle("Create Caravan Key Wallet");

    try {
      const walletName = await input({
        message: "Enter a base name for the wallet:",
        validate: (input) =>
          input.trim() !== "" ? true : "Please enter a valid wallet name",
      });

      const network = await select({
        message: "Which network?",
        choices: [
          { name: colors.highlight("Regtest"), value: Network.REGTEST },
          { name: colors.highlight("Testnet"), value: Network.TESTNET },
        ],
        default: Network.REGTEST,
      });

      console.log(
        colors.info(`\nCreating Caravan key wallet "${walletName}_key"...`),
      );

      // Different derivation paths for different networks
      let derivationPath =
        network === Network.REGTEST ? "m/84'/1'/0'" : "m/84'/1'/0'";

      const spinner = ora("Creating Caravan key wallet...").start();
      const result = await this.bitcoinService.createCaravanKeyWallet(
        walletName,
        derivationPath,
      );
      spinner.succeed("Caravan key wallet created");

      if (result) {
        // Format output
        const outputText = `
Wallet: ${colors.highlight(result.wallet)}
Extended Public Key (xpub): ${colors.code(truncate(result.xpub, 15))}
Derivation Path: ${colors.code(result.path)}
Root Fingerprint: ${colors.code(result.rootFingerprint)}
${result.wif ? `\nSample Private Key (WIF): ${colors.code(result.wif)}` : ""}`;

        console.log(
          boxText(outputText, {
            title: "Caravan Key Wallet Created",
            titleColor: colors.success,
          }),
        );

        if (result.wif) {
          console.log(
            formatWarning(
              "\nWARNING: Keep these keys secure! Anyone with these keys can spend funds.",
            ),
          );
        }

        return result;
      }

      return null;
    } catch (error) {
      console.error(formatError("Error creating Caravan key wallet:"), error);
      return null;
    }
  }

  /**
   * Show wallet details
   */
  async showWalletDetails(walletName?: string): Promise<any> {
    displayCommandTitle("Wallet Details");

    if (!walletName) {
      const walletsSpinner = ora("Loading wallets...").start();
      const wallets = await this.listWallets();
      walletsSpinner.succeed("Wallets loaded");

      if (wallets.length === 0) {
        console.log(formatWarning("No wallets found."));
        return null;
      }

      walletName = await select({
        message: "Select a wallet to view:",
        choices: wallets.map((w) => ({
          name: colors.highlight(w),
          value: w,
        })),
      });
    }

    console.log(colors.info(`\nFetching details for wallet: ${walletName}`));

    try {
      const spinner = ora("Loading wallet information...").start();
      const walletInfo = await this.bitcoinService.getWalletInfo(walletName);
      spinner.succeed("Wallet information loaded");

      // Format the wallet information
      const infoText = `
${keyValue("Balance", formatBitcoin(walletInfo.balance))}
${keyValue("Unconfirmed Balance", formatBitcoin(walletInfo.unconfirmed_balance))}
${keyValue("Immature Balance", formatBitcoin(walletInfo.immature_balance))}
${keyValue("Private Keys Enabled", walletInfo.private_keys_enabled ? "Yes" : "No")}
${keyValue("HD Seed", walletInfo.hdseedid ? walletInfo.hdseedid : "N/A")}
${keyValue("TX Count", walletInfo.txcount)}
${keyValue("Key Pool Size", walletInfo.keypoolsize)}`;

      console.log(
        boxText(infoText, {
          title: `Wallet: ${walletName}`,
          titleColor: colors.header,
        }),
      );

      // Generate a new address
      const generateAddress = await confirm({
        message: "Generate a new address?",
        default: true,
      });

      if (generateAddress) {
        const addressSpinner = ora("Generating new address...").start();
        // Wallet name is now guaranteed to be a string here
        const address = await this.bitcoinService.getNewAddress(walletName);
        addressSpinner.succeed("Address generated");

        // Get address info
        try {
          const infoSpinner = ora("Fetching address information...").start();
          const addressInfo = await this.bitcoinService.getAddressInfo(
            walletName,
            address,
          );
          infoSpinner.succeed("Address information loaded");
          console.log(colors.info(`testing:${addressInfo})`));
          // Format address information
          const addressText = `
${keyValue("Address", addressInfo.address || "N/A")}
${keyValue("Type", addressInfo.scriptPubKey ? addressInfo.scriptPubKey || "N/A" : "Unknown")}
${keyValue("HD Path", addressInfo.hdkeypath || "N/A")}
${keyValue("Public Key", addressInfo.pubkey ? truncate(addressInfo.pubkey, 10) : "N/A")}`;

          console.log(
            boxText(addressText, {
              title: "Generated Address",
              titleColor: colors.info,
            }),
          );
        } catch (error) {
          console.error(
            formatWarning("Could not retrieve address info:"),
            error,
          );
        }
      }

      return walletInfo;
    } catch (error) {
      console.error(
        formatError(`Error getting wallet details for ${walletName}:`),
        error,
      );
      return null;
    }
  }

  /**
   * Fund a wallet with new coins (using mining)
   */
  async fundWallet(walletName?: string): Promise<any> {
    displayCommandTitle("Fund Wallet");

    if (!walletName) {
      const walletsSpinner = ora("Loading wallets...").start();
      const wallets = await this.listWallets();
      walletsSpinner.succeed("Wallets loaded");

      if (wallets.length === 0) {
        console.log(formatWarning("No wallets found."));
        return null;
      }

      walletName = await select({
        message: "Select a wallet to fund:",
        choices: wallets.map((w) => ({
          name: colors.highlight(w),
          value: w,
        })),
      });
    }

    console.log(colors.info(`\nPreparing to fund wallet: ${walletName}`));

    try {
      // Check wallet balance before
      const infoSpinner = ora("Checking current balance...").start();
      const walletInfoBefore =
        await this.bitcoinService.getWalletInfo(walletName);
      infoSpinner.succeed("Balance checked");

      console.log(
        keyValue("Current balance", formatBitcoin(walletInfoBefore.balance)),
      );
      console.log(
        keyValue(
          "Immature balance",
          formatBitcoin(walletInfoBefore.immature_balance),
        ),
      );

      // Get a new address to mine to
      const addressSpinner = ora("Generating address for mining...").start();
      const address = await this.bitcoinService.getNewAddress(walletName);
      addressSpinner.succeed(`Using address: ${address}`);

      // Allow user to specify amount rather than blocks
      const fundingMethod = await select({
        message: "How would you like to specify mining?",
        choices: [
          {
            name: colors.highlight("By number of blocks"),
            value: "blocks",
          },
          {
            name: colors.highlight("By target amount (approximate)"),
            value: "amount",
          },
        ],
      });

      let numBlocks;

      if (fundingMethod === "blocks") {
        const blocks = await input({
          message: "How many blocks to mine?",
          default: "1",
          validate: (input) => {
            const num = parseInt(input);
            return !isNaN(num) && num > 0
              ? true
              : "Please enter a positive number";
          },
        });
        numBlocks = parseInt(blocks);
      } else {
        const targetAmount = await input({
          message: "How much BTC would you like to mine (approximate)?",
          default: "50",
          validate: (input) => {
            const num = parseFloat(input);
            return !isNaN(num) && num > 0
              ? true
              : "Please enter a positive number";
          },
        });
        // Each block gives ~50 BTC in regtest mode
        numBlocks = Math.ceil(parseFloat(targetAmount) / 50);
        console.log(
          colors.info(
            `\nMining approximately ${numBlocks} blocks to get ~${targetAmount} BTC...`,
          ),
        );
      }

      console.log(divider());
      console.log(
        colors.info(`Mining ${numBlocks} block(s) to address ${address}...`),
      );

      // Mine the blocks
      const miningSpinner = ora(`Mining ${numBlocks} blocks...`).start();
      const blockHashes = await this.bitcoinService.generateToAddress(
        numBlocks,
        address,
      );
      miningSpinner.succeed(`Successfully mined ${blockHashes.length} blocks!`);

      console.log(
        keyValue(
          "Latest block hash",
          truncate(blockHashes[blockHashes.length - 1], 10),
        ),
      );

      // Check wallet balance after
      const afterSpinner = ora("Checking updated balance...").start();
      const walletInfoAfter =
        await this.bitcoinService.getWalletInfo(walletName);
      afterSpinner.succeed("Balance updated");

      // Format results
      const resultText = `
${keyValue("New balance", formatBitcoin(walletInfoAfter.balance))}
${keyValue("New immature balance", formatBitcoin(walletInfoAfter.immature_balance))}
${keyValue("Added (mature)", formatBitcoin(walletInfoAfter.balance - walletInfoBefore.balance))}
${keyValue("Added (immature)", formatBitcoin(walletInfoAfter.immature_balance - walletInfoBefore.immature_balance))}`;

      console.log(
        boxText(resultText, {
          title: "Mining Results",
          titleColor: colors.success,
        }),
      );

      console.log(
        formatWarning(
          "Newly mined coins require 100 confirmations before they can be spent.",
        ),
      );

      return { blockHashes, newBalance: walletInfoAfter.balance };
    } catch (error) {
      console.error(formatError(`Error funding wallet ${walletName}:`), error);
      return null;
    }
  }

  /**
   * Send funds between wallets
   */
  async sendFunds(): Promise<any> {
    displayCommandTitle("Send Funds");

    const walletsSpinner = ora("Loading wallets...").start();
    const wallets = await this.listWallets();
    walletsSpinner.succeed("Wallets loaded");

    if (wallets.length < 1) {
      console.log(
        formatWarning(
          "Not enough wallets found. You need at least one wallet.",
        ),
      );
      return null;
    }

    try {
      // Select source wallet
      const sourceWallet = await select({
        message: "Select source wallet:",
        choices: wallets.map((w) => ({
          name: colors.highlight(w),
          value: w,
        })),
      });

      const infoSpinner = ora(
        `Loading information for ${sourceWallet}...`,
      ).start();
      const sourceInfo = await this.bitcoinService.getWalletInfo(sourceWallet);
      infoSpinner.succeed("Wallet information loaded");

      console.log(
        keyValue("Source wallet balance", formatBitcoin(sourceInfo.balance)),
      );

      if (sourceInfo.balance <= 0) {
        console.log(
          formatWarning("Source wallet has no funds. Please fund it first."),
        );
        return null;
      }

      // Ask for destination - either address or internal wallet
      const destType = await select({
        message: "Send to:",
        choices: [
          { name: colors.highlight("Another wallet"), value: "wallet" },
          { name: colors.highlight("External address"), value: "address" },
        ],
      });

      let destinationAddress: string;

      if (destType === "wallet") {
        // Filter out the source wallet
        const destWallets = wallets.filter((w) => w !== sourceWallet);

        if (destWallets.length === 0) {
          console.log(
            formatWarning(
              "No other wallets found. Create another wallet first.",
            ),
          );
          return null;
        }

        const destWallet = await select({
          message: "Select destination wallet:",
          choices: destWallets.map((w) => ({
            name: colors.highlight(w),
            value: w,
          })),
        });

        // Get a new address from the destination wallet
        const addressSpinner = ora(
          `Generating address from wallet ${destWallet}...`,
        ).start();
        destinationAddress =
          await this.bitcoinService.getNewAddress(destWallet);
        addressSpinner.succeed("Address generated");

        console.log(keyValue("Generated address", destinationAddress));
      } else {
        destinationAddress = await input({
          message: "Enter destination address:",
          validate: (input) =>
            input.trim() !== "" ? true : "Please enter a valid address",
        });
      }

      // Ask for amount
      const amount = await input({
        message: "Enter amount to send (BTC):",
        validate: (input) => {
          const num = parseFloat(input);
          if (isNaN(num) || num <= 0) {
            return "Please enter a valid positive amount";
          }
          if (num > sourceInfo.balance) {
            return `Amount exceeds balance (${formatBitcoin(sourceInfo.balance)})`;
          }
          return true;
        },
      });

      const amountNum = parseFloat(amount);

      console.log(
        colors.info(
          `\nSending ${formatBitcoin(amountNum)} from ${sourceWallet} to ${destinationAddress}...`,
        ),
      );

      // Send the transaction
      const txSpinner = ora("Sending transaction...").start();
      const txid = await this.bitcoinService.sendToAddress(
        sourceWallet,
        destinationAddress,
        amountNum,
      );
      txSpinner.succeed("Transaction sent successfully");

      console.log(
        boxText(`${keyValue("Transaction ID", truncate(txid, 15))}`, {
          title: "Transaction Sent",
          titleColor: colors.success,
        }),
      );

      // Ask if user wants to mine a block to confirm the transaction
      const mine = await confirm({
        message: "Mine a block to confirm the transaction?",
        default: true,
      });

      if (mine) {
        // Use the source wallet for mining
        const mineAddressSpinner = ora(
          "Generating address for mining...",
        ).start();
        const address = await this.bitcoinService.getNewAddress(sourceWallet);
        mineAddressSpinner.succeed("Address generated for mining");

        const mineSpinner = ora("Mining block...").start();
        const blockHashes = await this.bitcoinService.generateToAddress(
          1,
          address,
        );
        mineSpinner.succeed("Block mined successfully");

        console.log(keyValue("Block hash", blockHashes[0]));
      }

      return { txid };
    } catch (error) {
      console.error(chalk.red("\nError sending funds:"), error);
      return null;
    }
  }
}
