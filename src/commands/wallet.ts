//@ts-nocheck
import { BitcoinService } from "../core/bitcoin";
import { Network } from "../types/caravan";
import { input, confirm, select } from "@inquirer/prompts";
import chalk from "chalk";
import ora, { Ora } from "ora";
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

// Back option constant
const BACK_OPTION = "__BACK__";

/**
 * Wallet commands for managing Bitcoin wallets
 */
export class WalletCommands {
  private readonly bitcoinService: BitcoinService;

  constructor(bitcoinService: BitcoinService) {
    this.bitcoinService = bitcoinService;
  }

  /**
   * Add a back option to selection choices
   */
  private addBackOption(choices: any[], backLabel = "Back to menu"): any[] {
    return [...choices, { name: colors.muted(backLabel), value: BACK_OPTION }];
  }

  /**
   * Check if a value is the back option
   */
  private isBackOption(value: string): boolean {
    return value === BACK_OPTION;
  }

  /**
   * Custom text input with back option (using 'q' to go back)
   */
  private async inputWithBack(options: {
    message: string;
    default?: string;
    validate?: (input: string) => boolean | string;
  }): Promise<string> {
    const message = options.message + " (or 'q' to go back)";

    const result = await input({
      message,
      default: options.default,
      validate: (input) => {
        if (input.toLowerCase() === "q") return true;
        if (options.validate) return options.validate(input);
        return true;
      },
    });

    if (result.toLowerCase() === "q") {
      return BACK_OPTION;
    }

    return result;
  }

  /**
   * Handle spinner errors and return false to indicate operation should be canceled
   */
  private handleSpinnerError(
    spinner: Ora,
    errorMessage: string,
    error: any,
  ): false {
    spinner.stop();
    // Clear the spinner line completely
    process.stdout.write("\r\x1b[K");
    console.error(formatError(errorMessage));
    if (error && error.message) {
      console.error(formatError(`Details: ${error.message}`));
    }

    console.log(colors.info("Press Enter to return to menu..."));
    return false;
  }

  /**
   * List all wallets on the node
   */
  async listWallets(): Promise<string[] | false> {
    displayCommandTitle("Available Wallets");

    try {
      const spinner = ora("Fetching wallets...").start();
      let wallets;

      try {
        wallets = await this.bitcoinService.listWallets();
        spinner.succeed("Wallets fetched successfully");
      } catch (error) {
        return this.handleSpinnerError(
          spinner,
          "Error fetching wallets",
          error,
        );
      }

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
      return false;
    }
  }

  /**
   * Create a new wallet
   */
  async createWallet(): Promise<string | false | null> {
    displayCommandTitle("Create New Wallet");

    try {
      // Get wallet name with back option
      const walletName = await this.inputWithBack({
        message: "Enter a name for the new wallet:",
        validate: (input) =>
          input.trim() !== "" ? true : "Please enter a valid wallet name",
      });

      // Check if user wants to go back
      if (this.isBackOption(walletName)) {
        return false;
      }

      // Add back option to wallet type selection
      const walletTypeChoices = [
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
      ];

      const walletType = await select({
        message: "What type of wallet would you like to create?",
        choices: this.addBackOption(walletTypeChoices),
      });

      // Check if user wants to go back
      if (this.isBackOption(walletType)) {
        return false;
      }

      const disablePrivateKeys =
        walletType === "watch-only" || walletType === "blank";
      const blank = walletType === "blank";

      console.log(
        colors.info(`\nCreating ${walletType} wallet "${walletName}"...`),
      );

      const spinner = ora("Creating wallet...").start();
      let result;

      try {
        result = await this.bitcoinService.createWallet(walletName, {
          disablePrivateKeys,
          blank,
        });
        spinner.succeed("Wallet created");
      } catch (error) {
        return this.handleSpinnerError(spinner, "Error creating wallet", error);
      }

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
          try {
            const address = await this.bitcoinService.getNewAddress(walletName);
            addressSpinner.succeed("Address generated");

            console.log(
              boxText(
                `Wallet: ${colors.highlight(walletName)}\nAddress: ${colors.highlight(address)}`,
                { title: "Generated Address", titleColor: colors.info },
              ),
            );
          } catch (error) {
            addressSpinner.fail("Could not generate address");
            console.log(
              formatWarning(
                "This wallet might not support address generation.",
              ),
            );
          }
        }

        return walletName;
      }

      return null;
    } catch (error) {
      console.error(formatError("Error creating wallet:"), error);
      return false;
    }
  }

  /**
   * Show wallet details
   */
  async showWalletDetails(walletName?: string): Promise<any | false> {
    displayCommandTitle("Wallet Details");

    try {
      if (!walletName) {
        const walletsSpinner = ora("Loading wallets...").start();
        let wallets;

        try {
          wallets = await this.listWallets();
          walletsSpinner.succeed("Wallets loaded");

          // Check if listing wallets was cancelled or failed
          if (wallets === false) {
            return false;
          }
        } catch (error) {
          return this.handleSpinnerError(
            walletsSpinner,
            "Error loading wallets",
            error,
          );
        }

        if (wallets.length === 0) {
          console.log(formatWarning("No wallets found."));
          return false;
        }

        // Add back option to wallet selection
        const walletChoices = wallets.map((w) => ({
          name: colors.highlight(w),
          value: w,
        }));

        walletName = await select({
          message: "Select a wallet to view:",
          choices: this.addBackOption(walletChoices),
        });

        // Check if user wants to go back
        if (this.isBackOption(walletName)) {
          return false;
        }
      }

      console.log(colors.info(`\nFetching details for wallet: ${walletName}`));

      // Get wallet info with proper error handling
      const spinner = ora("Loading wallet information...").start();
      let walletInfo;

      try {
        walletInfo = await this.bitcoinService.getWalletInfo(walletName);
        spinner.succeed("Wallet information loaded");
      } catch (error) {
        return this.handleSpinnerError(
          spinner,
          "Error loading wallet information",
          error,
        );
      }

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

      // Show options with back option
      const generateOptions = [
        { name: colors.highlight("Yes, generate address"), value: "yes" },
        { name: colors.highlight("No, skip"), value: "no" },
      ];

      const generateOption = await select({
        message: "Generate a new address?",
        choices: this.addBackOption(generateOptions),
      });

      // Check if user wants to go back
      if (this.isBackOption(generateOption)) {
        return false;
      }

      if (generateOption === "yes") {
        const addressSpinner = ora("Generating new address...").start();
        let address;

        try {
          // Wallet name is now guaranteed to be a string here
          address = await this.bitcoinService.getNewAddress(walletName);
          addressSpinner.succeed("Address generated");
        } catch (error) {
          return this.handleSpinnerError(
            addressSpinner,
            `Error generating address for wallet ${walletName}`,
            error,
          );
        }

        // Get address info with proper error handling
        try {
          const infoSpinner = ora("Fetching address information...").start();
          const addressInfo = await this.bitcoinService.getAddressInfo(
            walletName,
            address,
          );
          infoSpinner.succeed("Address information loaded");

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
            formatWarning("Could not retrieve detailed address info"),
          );
          console.log(colors.info(`Address generated: ${address}`));
        }
      }

      return walletInfo;
    } catch (error) {
      console.error(
        formatError(`Error getting wallet details: ${error.message}`),
      );
      return false;
    }
  }

  /**
   * Fund a wallet with new coins (using mining)
   */
  async fundWallet(walletName?: string): Promise<any | false> {
    displayCommandTitle("Fund Wallet");

    try {
      if (!walletName) {
        const walletsSpinner = ora("Loading wallets...").start();
        let wallets;

        try {
          wallets = await this.listWallets();
          walletsSpinner.succeed("Wallets loaded");

          // Check if listing wallets was cancelled
          if (wallets === false) {
            return false;
          }
        } catch (error) {
          return this.handleSpinnerError(
            walletsSpinner,
            "Error loading wallets",
            error,
          );
        }

        if (wallets.length === 0) {
          console.log(formatWarning("No wallets found."));
          return false;
        }

        // Add back option to wallet selection
        walletName = await select({
          message: "Select a wallet to fund:",
          choices: this.addBackOption(
            wallets.map((w) => ({
              name: colors.highlight(w),
              value: w,
            })),
          ),
        });

        // Check if user wants to go back
        if (this.isBackOption(walletName)) {
          return false;
        }
      }

      console.log(colors.info(`\nPreparing to fund wallet: ${walletName}`));

      // Check wallet balance with proper error handling
      const infoSpinner = ora("Checking current balance...").start();
      let walletInfoBefore;

      try {
        walletInfoBefore = await this.bitcoinService.getWalletInfo(walletName);
        infoSpinner.succeed("Balance checked");
      } catch (error) {
        return this.handleSpinnerError(
          infoSpinner,
          "Error checking wallet balance",
          error,
        );
      }

      console.log(
        keyValue("Current balance", formatBitcoin(walletInfoBefore.balance)),
      );
      console.log(
        keyValue(
          "Immature balance",
          formatBitcoin(walletInfoBefore.immature_balance),
        ),
      );

      // Get a new address with proper error handling
      const addressSpinner = ora("Generating address for mining...").start();
      let address;

      try {
        address = await this.bitcoinService.getNewAddress(walletName);
        addressSpinner.succeed(`Using address: ${address}`);
      } catch (error) {
        return this.handleSpinnerError(
          addressSpinner,
          "Error generating address",
          error,
        );
      }

      // Allow user to specify amount with back option
      const fundingMethodChoices = [
        {
          name: colors.highlight("By number of blocks"),
          value: "blocks",
        },
        {
          name: colors.highlight("By target amount (approximate)"),
          value: "amount",
        },
      ];

      const fundingMethod = await select({
        message: "How would you like to specify mining?",
        choices: this.addBackOption(fundingMethodChoices),
      });

      // Check if user wants to go back
      if (this.isBackOption(fundingMethod)) {
        return false;
      }

      let numBlocks;

      if (fundingMethod === "blocks") {
        const blocks = await this.inputWithBack({
          message: "How many blocks to mine?",
          default: "1",
          validate: (input) => {
            const num = parseInt(input);
            return !isNaN(num) && num > 0
              ? true
              : "Please enter a positive number";
          },
        });

        // Check if user wants to go back
        if (this.isBackOption(blocks)) {
          return false;
        }

        numBlocks = parseInt(blocks);
      } else {
        const targetAmount = await this.inputWithBack({
          message: "How much BTC would you like to mine (approximate)?",
          default: "50",
          validate: (input) => {
            const num = parseFloat(input);
            return !isNaN(num) && num > 0
              ? true
              : "Please enter a positive number";
          },
        });

        // Check if user wants to go back
        if (this.isBackOption(targetAmount)) {
          return false;
        }

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

      // Mine the blocks with proper error handling
      const miningSpinner = ora(`Mining ${numBlocks} blocks...`).start();
      let blockHashes;

      try {
        blockHashes = await this.bitcoinService.generateToAddress(
          numBlocks,
          address,
        );
        miningSpinner.succeed(
          `Successfully mined ${blockHashes.length} blocks!`,
        );
      } catch (error) {
        return this.handleSpinnerError(
          miningSpinner,
          "Error mining blocks",
          error,
        );
      }

      console.log(
        keyValue(
          "Latest block hash",
          truncate(blockHashes[blockHashes.length - 1], 10),
        ),
      );

      // Check updated wallet balance
      const afterSpinner = ora("Checking updated balance...").start();
      let walletInfoAfter;

      try {
        walletInfoAfter = await this.bitcoinService.getWalletInfo(walletName);
        afterSpinner.succeed("Balance updated");
      } catch (error) {
        return this.handleSpinnerError(
          afterSpinner,
          "Error checking updated balance",
          error,
        );
      }

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
      console.error(formatError(`Error funding wallet: ${error.message}`));
      return false;
    }
  }

  /**
   * Send funds between wallets
   */
  async sendFunds(): Promise<any | false> {
    displayCommandTitle("Send Funds");

    try {
      const walletsSpinner = ora("Loading wallets...").start();
      let wallets;

      try {
        wallets = await this.listWallets();
        walletsSpinner.succeed("Wallets loaded");

        // Check if listing wallets was cancelled
        if (wallets === false) {
          return false;
        }
      } catch (error) {
        return this.handleSpinnerError(
          walletsSpinner,
          "Error loading wallets",
          error,
        );
      }

      if (wallets.length < 1) {
        console.log(
          formatWarning(
            "Not enough wallets found. You need at least one wallet.",
          ),
        );
        return false;
      }

      // Select source wallet with back option
      const sourceWallet = await select({
        message: "Select source wallet:",
        choices: this.addBackOption(
          wallets.map((w) => ({
            name: colors.highlight(w),
            value: w,
          })),
        ),
      });

      // Check if user wants to go back
      if (this.isBackOption(sourceWallet)) {
        return false;
      }

      // Get wallet info with proper error handling
      const infoSpinner = ora(
        `Loading information for ${sourceWallet}...`,
      ).start();
      let sourceInfo;

      try {
        sourceInfo = await this.bitcoinService.getWalletInfo(sourceWallet);
        infoSpinner.succeed("Wallet information loaded");
      } catch (error) {
        return this.handleSpinnerError(
          infoSpinner,
          "Error loading wallet information",
          error,
        );
      }

      console.log(
        keyValue("Source wallet balance", formatBitcoin(sourceInfo.balance)),
      );

      if (sourceInfo.balance <= 0) {
        console.log(
          formatWarning("Source wallet has no funds. Please fund it first."),
        );
        return false;
      }

      // Ask for destination with back option
      const destTypeChoices = [
        { name: colors.highlight("Another wallet"), value: "wallet" },
        { name: colors.highlight("External address"), value: "address" },
      ];

      const destType = await select({
        message: "Send to:",
        choices: this.addBackOption(destTypeChoices),
      });

      // Check if user wants to go back
      if (this.isBackOption(destType)) {
        return false;
      }

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
          return false;
        }

        // Select destination wallet with back option
        const destWallet = await select({
          message: "Select destination wallet:",
          choices: this.addBackOption(
            destWallets.map((w) => ({
              name: colors.highlight(w),
              value: w,
            })),
          ),
        });

        // Check if user wants to go back
        if (this.isBackOption(destWallet)) {
          return false;
        }

        // Get a new address from the destination wallet
        const addressSpinner = ora(
          `Generating address from wallet ${destWallet}...`,
        ).start();

        try {
          destinationAddress =
            await this.bitcoinService.getNewAddress(destWallet);
          addressSpinner.succeed("Address generated");
        } catch (error) {
          return this.handleSpinnerError(
            addressSpinner,
            "Error generating address",
            error,
          );
        }

        console.log(keyValue("Generated address", destinationAddress));
      } else {
        // Get external address with back option
        const address = await this.inputWithBack({
          message: "Enter destination address:",
          validate: (input) =>
            input.trim() !== "" ? true : "Please enter a valid address",
        });

        // Check if user wants to go back
        if (this.isBackOption(address)) {
          return false;
        }

        destinationAddress = address;
      }

      // Ask for amount with back option
      const amount = await this.inputWithBack({
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

      // Check if user wants to go back
      if (this.isBackOption(amount)) {
        return false;
      }

      const amountNum = parseFloat(amount);

      console.log(
        colors.info(
          `\nSending ${formatBitcoin(amountNum)} from ${sourceWallet} to ${destinationAddress}...`,
        ),
      );

      // Send transaction with proper error handling
      const txSpinner = ora("Sending transaction...").start();
      let txid;

      try {
        txid = await this.bitcoinService.sendToAddress(
          sourceWallet,
          destinationAddress,
          amountNum,
        );
        txSpinner.succeed("Transaction sent successfully");
      } catch (error) {
        return this.handleSpinnerError(
          txSpinner,
          "Error sending transaction",
          error,
        );
      }

      console.log(
        boxText(`${keyValue("Transaction ID", truncate(txid, 15))}`, {
          title: "Transaction Sent",
          titleColor: colors.success,
        }),
      );

      // Ask about mining with back option
      const mineOptions = [
        { name: colors.highlight("Yes, mine a block"), value: "yes" },
        { name: colors.highlight("No, skip mining"), value: "no" },
      ];

      const mineBlock = await select({
        message: "Mine a block to confirm the transaction?",
        choices: this.addBackOption(mineOptions),
      });

      // Check if user wants to go back
      if (this.isBackOption(mineBlock)) {
        return false;
      }

      if (mineBlock === "yes") {
        // Use the source wallet for mining
        const mineAddressSpinner = ora(
          "Generating address for mining...",
        ).start();
        let address;

        try {
          address = await this.bitcoinService.getNewAddress(sourceWallet);
          mineAddressSpinner.succeed("Address generated for mining");
        } catch (error) {
          return this.handleSpinnerError(
            mineAddressSpinner,
            "Error generating mining address",
            error,
          );
        }

        // Mine block with proper error handling
        const mineSpinner = ora("Mining block...").start();
        let blockHashes;

        try {
          blockHashes = await this.bitcoinService.generateToAddress(1, address);
          mineSpinner.succeed("Block mined successfully");
        } catch (error) {
          return this.handleSpinnerError(
            mineSpinner,
            "Error mining block",
            error,
          );
        }

        console.log(keyValue("Block hash", blockHashes[0]));
      }

      return { txid };
    } catch (error) {
      console.error(formatError(`Error sending funds: ${error.message}`));
      return false;
    }
  }
}
