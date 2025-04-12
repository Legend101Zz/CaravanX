import { BitcoinService } from "../core/bitcoin";
import { Network } from "../types/caravan";
import { input, confirm, select } from "@inquirer/prompts";
import chalk from "chalk";

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
    console.log(chalk.cyan("\n=== Available Wallets ==="));

    try {
      const wallets = await this.bitcoinService.listWallets();

      if (wallets.length === 0) {
        console.log(chalk.yellow("No wallets found."));
        return [];
      }

      for (let i = 0; i < wallets.length; i++) {
        const wallet = wallets[i];

        try {
          const walletInfo = await this.bitcoinService.getWalletInfo(wallet);
          console.log(chalk.green(`\n${i + 1}. ${wallet}`));
          console.log(`   Balance: ${walletInfo.balance} BTC`);
          console.log(
            `   Type: ${walletInfo.private_keys_enabled ? "Full" : "Watch-only"}`,
          );
          console.log(
            `   Descriptors: ${walletInfo.descriptors ? "Yes" : "Legacy"}`,
          );
        } catch (error) {
          console.log(chalk.green(`\n${i + 1}. ${wallet}`));
          console.log(chalk.yellow("   (Unable to get wallet info)"));
        }
      }

      return wallets;
    } catch (error) {
      console.error(chalk.red("Error listing wallets:"), error);
      return [];
    }
  }

  /**
   * Create a new wallet
   */
  async createWallet(): Promise<string | null> {
    console.log(chalk.cyan("\n=== Create New Wallet ==="));

    try {
      const walletName = await input({
        message: "Enter a name for the new wallet:",
        validate: (input) =>
          input.trim() !== "" ? true : "Please enter a valid wallet name",
      });

      const walletType = await select({
        message: "What type of wallet would you like to create?",
        choices: [
          { name: "Standard wallet (with private keys)", value: "standard" },
          { name: "Watch-only wallet (no private keys)", value: "watch-only" },
          { name: "Blank wallet (no keys or addresses)", value: "blank" },
        ],
      });

      const disablePrivateKeys =
        walletType === "watch-only" || walletType === "blank";
      const blank = walletType === "blank";

      console.log(
        chalk.cyan(`\nCreating ${walletType} wallet "${walletName}"...`),
      );

      const result = await this.bitcoinService.createWallet(walletName, {
        disablePrivateKeys,
        blank,
      });

      if (result) {
        console.log(
          chalk.green(`\nWallet "${walletName}" created successfully!`),
        );

        // Generate a new address if the wallet has private keys
        if (walletType === "standard") {
          const address = await this.bitcoinService.getNewAddress(walletName);
          console.log(chalk.green(`\nGenerated address: ${address}`));
        }

        return walletName;
      }

      return null;
    } catch (error) {
      console.error(chalk.red("\nError creating wallet:"), error);
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
    console.log(chalk.cyan("\n=== Create Wallet with Private Key ==="));

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
          type: "password",
        });
      }

      console.log(
        chalk.cyan(
          `\nCreating wallet "${walletName}" with ${wif ? "specified" : "random"} private key...`,
        ),
      );

      const result = await this.bitcoinService.createPrivateKeyWallet(
        walletName,
        wif,
      );

      if (result) {
        console.log(
          chalk.green(`\nWallet "${walletName}" created successfully!`),
        );
        console.log(chalk.green(`Address: ${result.address}`));
        console.log(chalk.green(`Private key (WIF): ${result.wif}`));
        console.log(
          chalk.yellow(
            "\nWARNING: Keep this private key secure! Anyone with this key can spend funds.",
          ),
        );

        return result;
      }

      return null;
    } catch (error) {
      console.error(
        chalk.red("\nError creating wallet with private key:"),
        error,
      );
      return null;
    }
  }

  /**
   * Create a HD wallet for Caravan multisig (with xpub)
   */
  async createCaravanKeyWallet(): Promise<any> {
    console.log(chalk.cyan("\n=== Create Caravan Key Wallet ==="));

    try {
      const walletName = await input({
        message: "Enter a base name for the wallet:",
        validate: (input) =>
          input.trim() !== "" ? true : "Please enter a valid wallet name",
      });

      const network = await select({
        message: "Which network?",
        choices: [
          { name: "Regtest", value: Network.REGTEST },
          { name: "Testnet", value: Network.TESTNET },
        ],
        default: Network.REGTEST,
      });

      console.log(
        chalk.cyan(`\nCreating Caravan key wallet "${walletName}_key"...`),
      );

      // Different derivation paths for different networks
      let derivationPath =
        network === Network.REGTEST ? "m/84'/1'/0'" : "m/84'/1'/0'";

      const result = await this.bitcoinService.createCaravanKeyWallet(
        walletName,
        derivationPath,
      );

      if (result) {
        console.log(
          chalk.green(`\nWallet "${result.wallet}" created successfully!`),
        );
        console.log(chalk.green(`Extended Public Key (xpub): ${result.xpub}`));
        console.log(chalk.green(`Derivation Path: ${result.path}`));
        console.log(chalk.green(`Root Fingerprint: ${result.rootFingerprint}`));

        if (result.wif) {
          console.log(chalk.green(`Sample Private Key (WIF): ${result.wif}`));
          console.log(
            chalk.yellow(
              "\nWARNING: Keep these keys secure! Anyone with these keys can spend funds.",
            ),
          );
        }

        return result;
      }

      return null;
    } catch (error) {
      console.error(chalk.red("\nError creating Caravan key wallet:"), error);
      return null;
    }
  }

  /**
   * Show wallet details
   */
  async showWalletDetails(walletName?: string): Promise<any> {
    if (!walletName) {
      const wallets = await this.listWallets();

      if (wallets.length === 0) {
        console.log(chalk.yellow("\nNo wallets found."));
        return null;
      }

      walletName = await select({
        message: "Select a wallet to view:",
        choices: wallets.map((w) => ({ name: w, value: w })),
      });
    }

    console.log(chalk.cyan(`\n=== Wallet Details: ${walletName} ===`));

    try {
      const walletInfo = await this.bitcoinService.getWalletInfo(walletName);

      console.log(chalk.green("\nWallet Information:"));
      console.log(`Balance: ${walletInfo.balance} BTC`);
      console.log(`Unconfirmed Balance: ${walletInfo.unconfirmed_balance} BTC`);
      console.log(`Immature Balance: ${walletInfo.immature_balance} BTC`);
      console.log(
        `Private Keys Enabled: ${walletInfo.private_keys_enabled ? "Yes" : "No"}`,
      );
      console.log(
        `HD Seed: ${walletInfo.hdseedid ? walletInfo.hdseedid : "N/A"}`,
      );
      console.log(`TX Count: ${walletInfo.txcount}`);
      console.log(`Key Pool Size: ${walletInfo.keypoolsize}`);

      // Generate a new address
      console.log(chalk.green("\nGenerate a new address?"));
      const generateAddress = await confirm({
        message: "Generate a new address?",
        default: true,
      });

      if (generateAddress) {
        // Wallet name is now guaranteed to be a string here
        const address = await this.bitcoinService.getNewAddress(walletName);
        console.log(chalk.green(`\nGenerated address: ${address}`));

        // Get address info
        try {
          const addressInfo = await this.bitcoinService.getAddressInfo(
            walletName,
            address,
          );
          console.log(chalk.green("\nAddress Information:"));
          console.log(`Address: ${addressInfo.address}`);
          console.log(
            `Type: ${addressInfo.scriptPubKey ? addressInfo.scriptPubKey.type : "Unknown"}`,
          );
          console.log(`HD Path: ${addressInfo.hdkeypath || "N/A"}`);
          console.log(`Public Key: ${addressInfo.pubkey || "N/A"}`);
        } catch (error) {
          console.error(
            chalk.yellow("\nCould not retrieve address info:"),
            error,
          );
        }
      }

      return walletInfo;
    } catch (error) {
      console.error(
        chalk.red(`\nError getting wallet details for ${walletName}:`),
        error,
      );
      return null;
    }
  }

  /**
   * Fund a wallet with new coins (using mining)
   */
  async fundWallet(walletName?: string): Promise<any> {
    if (!walletName) {
      const wallets = await this.listWallets();

      if (wallets.length === 0) {
        console.log(chalk.yellow("\nNo wallets found."));
        return null;
      }

      walletName = await select({
        message: "Select a wallet to fund:",
        choices: wallets.map((w) => ({ name: w, value: w })),
      });
    }

    console.log(chalk.cyan(`\n=== Funding Wallet: ${walletName} ===`));

    try {
      // Check wallet balance before
      const walletInfoBefore =
        await this.bitcoinService.getWalletInfo(walletName);
      console.log(
        chalk.green(`Current balance: ${walletInfoBefore.balance} BTC`),
      );

      // Get a new address to mine to
      const address = await this.bitcoinService.getNewAddress(walletName);
      console.log(chalk.green(`Using address: ${address}`));

      // Ask how many blocks to mine
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

      const numBlocks = parseInt(blocks);

      console.log(
        chalk.cyan(`\nMining ${numBlocks} block(s) to address ${address}...`),
      );

      // Mine the blocks
      const blockHashes = await this.bitcoinService.generateToAddress(
        numBlocks,
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

      // Check wallet balance after
      const walletInfoAfter =
        await this.bitcoinService.getWalletInfo(walletName);
      console.log(chalk.green(`\nNew balance: ${walletInfoAfter.balance} BTC`));
      console.log(
        chalk.green(
          `Added: ${walletInfoAfter.balance - walletInfoBefore.balance} BTC`,
        ),
      );

      return { blockHashes, newBalance: walletInfoAfter.balance };
    } catch (error) {
      console.error(chalk.red(`\nError funding wallet ${walletName}:`), error);
      return null;
    }
  }

  /**
   * Send funds between wallets
   */
  async sendFunds(): Promise<any> {
    const wallets = await this.listWallets();

    if (wallets.length < 1) {
      console.log(
        chalk.yellow(
          "\nNot enough wallets found. You need at least one wallet.",
        ),
      );
      return null;
    }

    console.log(chalk.cyan("\n=== Send Funds ==="));

    try {
      // Select source wallet
      const sourceWallet = await select({
        message: "Select source wallet:",
        choices: wallets.map((w) => ({ name: w, value: w })),
      });

      const sourceInfo = await this.bitcoinService.getWalletInfo(sourceWallet);

      console.log(
        chalk.green(`\nSource wallet balance: ${sourceInfo.balance} BTC`),
      );

      if (sourceInfo.balance <= 0) {
        console.log(
          chalk.yellow("Source wallet has no funds. Please fund it first."),
        );
        return null;
      }

      // Ask for destination - either address or internal wallet
      const destType = await select({
        message: "Send to:",
        choices: [
          { name: "Another wallet", value: "wallet" },
          { name: "External address", value: "address" },
        ],
      });

      let destinationAddress: string;

      if (destType === "wallet") {
        // Filter out the source wallet
        const destWallets = wallets.filter((w) => w !== sourceWallet);

        if (destWallets.length === 0) {
          console.log(
            chalk.yellow(
              "No other wallets found. Create another wallet first.",
            ),
          );
          return null;
        }

        const destWallet = await select({
          message: "Select destination wallet:",
          choices: destWallets.map((w) => ({ name: w, value: w })),
        });

        // Get a new address from the destination wallet
        destinationAddress =
          await this.bitcoinService.getNewAddress(destWallet);
        console.log(
          chalk.green(
            `\nGenerated address from wallet ${destWallet}: ${destinationAddress}`,
          ),
        );
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
            return `Amount exceeds balance (${sourceInfo.balance} BTC)`;
          }
          return true;
        },
      });

      const amountNum = parseFloat(amount);

      console.log(
        chalk.cyan(
          `\nSending ${amountNum} BTC from ${sourceWallet} to ${destinationAddress}...`,
        ),
      );

      // Send the transaction
      const txid = await this.bitcoinService.sendToAddress(
        sourceWallet,
        destinationAddress,
        amountNum,
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
        const address = await this.bitcoinService.getNewAddress(sourceWallet);
        const blockHashes = await this.bitcoinService.generateToAddress(
          1,
          address,
        );

        console.log(chalk.green(`\nMined 1 block to confirm the transaction!`));
        console.log(chalk.green(`Block hash: ${blockHashes[0]}`));
      }

      return { txid };
    } catch (error) {
      console.error(chalk.red("\nError sending funds:"), error);
      return null;
    }
  }
}
