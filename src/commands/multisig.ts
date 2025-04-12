//@ts-nocheck
import { CaravanService } from "../core/caravan";
import { BitcoinService } from "../core/bitcoin";
import {
  CaravanWalletConfig,
  ExtendedPublicKey,
  AddressType,
  Network,
  CaravanKeyData,
} from "../types/caravan";
import { input, confirm, select, number } from "@inquirer/prompts";
import chalk from "chalk";

/**
 * Commands for managing Caravan multisig wallets
 */
export class MultisigCommands {
  private readonly caravanService: CaravanService;
  private readonly bitcoinService: BitcoinService;

  constructor(caravanService: CaravanService, bitcoinService: BitcoinService) {
    this.caravanService = caravanService;
    this.bitcoinService = bitcoinService;
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

      const network = await select({
        message: "Select network:",
        choices: [
          { name: "Regtest", value: Network.REGTEST },
          { name: "Testnet", value: Network.TESTNET },
        ],
        default: Network.REGTEST,
      });

      // Quorum information
      const requiredSigners = await number({
        message: "Enter the number of required signatures (M):",
        validate: (input: number) =>
          input > 0 ? true : "Number must be greater than 0",
        default: 2,
      });

      const totalSigners = await number({
        message: "Enter the total number of signers (N):",
        validate: (input: number) => {
          if (input < requiredSigners!) {
            return "Total signers must be greater than or equal to required signatures";
          }
          return true;
        },
        default: 3,
      });

      // Ask how to add keys
      const method = await select({
        message: "How would you like to add the extended public keys?",
        choices: [
          { name: "Enter manually one by one", value: "manual" },
          {
            name: "Quick setup (create everything automatically)",
            value: "quick",
          },
        ],
      });

      const extendedPublicKeys: ExtendedPublicKey[] = [];

      if (method === "manual") {
        // Collect extended public keys manually
        for (let i = 0; i < totalSigners; i++) {
          console.log(
            chalk.cyan(
              `\nEntering Extended Public Key ${i + 1} of ${totalSigners}`,
            ),
          );

          // Ask if user wants to create a new wallet for this key
          const createWallet = await confirm({
            message: "Create a new wallet for this key?",
            default: true,
          });

          let xpub: string, path: string, keyName: string, fingerprint: string;

          if (createWallet) {
            // Create a new wallet with HD seed
            console.log(chalk.cyan("\nCreating a new wallet for this key..."));

            const keyWalletName = await input({
              message: `Enter a name for key ${i + 1} wallet:`,
              validate: (input: string) =>
                input.trim() !== "" ? true : "Please enter a valid name",
              default: `key_${i + 1}_wallet`,
            });

            // Create the wallet
            const result =
              await this.bitcoinService.createCaravanKeyWallet(keyWalletName);

            keyName = `Extended Public Key ${i + 1} (${result.wallet})`;
            xpub = result.xpub;
            path = result.path;
            fingerprint = result.rootFingerprint;
          } else {
            // Manually enter key details
            keyName = await input({
              message: `Enter a name for key ${i + 1}:`,
              default: `Extended Public Key ${i + 1}`,
            });

            xpub = await input({
              message: `Enter the extended public key (xpub) for key ${i + 1}:`,
              validate: (input: string) =>
                input.trim() !== "" ? true : "Please enter a valid xpub",
            });

            path = await input({
              message: `Enter the BIP32 derivation path for key ${i + 1}:`,
              default: `m/84'/1'/0'`,
            });

            fingerprint = await input({
              message: `Enter the root fingerprint (xfp) for key ${i + 1} (optional):`,
            });
          }

          // Add the key to our collection
          extendedPublicKeys.push({
            name: keyName,
            xpub,
            bip32Path: path,
            xfp: fingerprint,
            method: "text",
          });
        }
      } else {
        // Quick setup - create all wallets and keys automatically
        console.log(
          chalk.cyan(
            "\nPerforming quick setup - creating all keys automatically...",
          ),
        );

        for (let i = 0; i < totalSigners; i++) {
          const walletName = `${name}_key_${i + 1}`;
          console.log(
            chalk.cyan(`\nCreating wallet for key ${i + 1}: ${walletName}`),
          );

          const result =
            await this.bitcoinService.createCaravanKeyWallet(walletName);

          extendedPublicKeys.push({
            name: `Extended Public Key ${i + 1} (${result.wallet})`,
            xpub: result.xpub,
            bip32Path: result.path,
            xfp: result.rootFingerprint,
            method: "text",
          });

          console.log(
            chalk.green(
              `Created key ${i + 1} with xpub: ${result.xpub.substring(0, 10)}...`,
            ),
          );
        }
      }

      // Create the Caravan wallet configuration
      const caravanConfig = await this.caravanService.createCaravanWalletConfig(
        {
          name,
          addressType,
          network,
          requiredSigners,
          totalSigners,
          extendedPublicKeys,
          startingAddressIndex: 0,
        },
      );

      console.log(
        chalk.green(
          `\nCaravan wallet "${caravanConfig.name}" created successfully!`,
        ),
      );

      // Store key data
      const keyData = extendedPublicKeys.map((key) => ({
        xpub: key.xpub,
        wallet: key.name.includes("(")
          ? key.name.split("(")[1].split(")")[0]
          : undefined,
      }));

      // Ask if user wants to create a watch-only wallet
      const createWatch = await confirm({
        message: "Create a watch-only wallet for this multisig wallet?",
        default: true,
      });

      if (createWatch) {
        await this.createWatchWallet(caravanConfig);
      }

      return caravanConfig;
    } catch (error) {
      console.error(chalk.red("\nError creating Caravan wallet:"), error);
      return null;
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

          for (let i = 0; i < addressCount; i++) {
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
          validate: (input: number) => {
            if (isNaN(input) || input <= 0) {
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
          amount,
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
          validate: (input: number) =>
            input > 0 ? true : "Please enter a positive number",
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
