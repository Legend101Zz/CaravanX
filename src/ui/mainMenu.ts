import { input, confirm, select, number } from "@inquirer/prompts";
import chalk from "chalk";
import { CaravanRegtestManager } from "../index";
import figlet from "figlet";
import * as fs from "fs-extra";

/**
 * Main menu interface
 */
export class MainMenu {
  private app: CaravanRegtestManager;

  constructor(app: CaravanRegtestManager) {
    this.app = app;
  }

  /**
   * Display the ASCII art banner
   */
  private displayBanner(): void {
    const bannerText = figlet.textSync("Caravan Regtest", {
      font: "Standard",
      horizontalLayout: "default",
      verticalLayout: "default",
    });

    console.log(chalk.cyan(bannerText));
    console.log(
      chalk.yellow("A terminal-based utility for Caravan in regtest mode\n"),
    );
  }

  /**
   * Show the main menu and process user selection
   */
  async showMainMenu(): Promise<void> {
    const choices = [
      { name: chalk.cyan(" === Bitcoin Wallets === "), disabled: true },
      { name: "List all wallets", value: "list-wallets" },
      { name: "Create new wallet", value: "create-wallet" },
      { name: "Create wallet with private key", value: "create-key-wallet" },
      { name: "View wallet details", value: "wallet-details" },
      { name: "Send funds between wallets", value: "send-funds" },
      { name: "Fund wallet with regtest coins", value: "fund-wallet" },

      { name: chalk.cyan(" === Caravan Multisig === "), disabled: true },
      { name: "List Caravan wallets", value: "list-caravan" },
      { name: "Create new Caravan multisig wallet", value: "create-caravan" },
      { name: "View Caravan wallet details", value: "caravan-details" },
      { name: "Create watch-only wallet for Caravan", value: "create-watch" },
      {
        name: "Configure private keys for Caravan wallet",
        value: "configure-keys",
      },
      { name: "Fund Caravan multisig wallet", value: "fund-caravan" },

      { name: chalk.cyan(" === Transactions === "), disabled: true },
      { name: "Create new PSBT", value: "create-psbt" },
      { name: "Sign PSBT with wallet", value: "sign-psbt-wallet" },
      { name: "Sign PSBT with private key", value: "sign-psbt-key" },
      { name: "Analyze and decode PSBT", value: "analyze-psbt" },
      { name: "Finalize and broadcast PSBT", value: "finalize-psbt" },

      { name: chalk.cyan(" === System === "), disabled: true },
      { name: "Mining and block generation", value: "mining" },
      { name: "Export data", value: "export" },
      { name: "Import data", value: "import" },
      { name: "Settings", value: "settings" },
      { name: "Help", value: "help" },
      { name: "Exit", value: "exit" },
    ];

    while (true) {
      console.clear(); // Clear the console before displaying the menu
      this.displayBanner();

      try {
        const action = await select({
          message: "What would you like to do?",
          pageSize: 20,
          //@ts-ignore
          choices,
        });

        if (action === "exit") {
          console.log(
            chalk.green(
              "Thank you for using Caravan Regtest Manager. Goodbye!",
            ),
          );
          process.exit(0);
        }

        await this.processAction(action!);

        // Wait for user to press Enter before showing the menu again
        await input({
          message: "Press Enter to continue...",
        });
      } catch (error) {
        console.error(chalk.red("Error:"), error);
        await input({
          message: "Press Enter to continue...",
        });
      }
    }
  }

  /**
   * Process the selected menu action
   */
  private async processAction(action: string): Promise<void> {
    switch (action) {
      // Bitcoin Wallets
      case "list-wallets":
        await this.app.walletCommands.listWallets();
        break;
      case "create-wallet":
        await this.app.walletCommands.createWallet();
        break;
      case "create-key-wallet":
        await this.app.walletCommands.createPrivateKeyWallet();
        break;
      case "wallet-details":
        await this.app.walletCommands.showWalletDetails();
        break;
      case "send-funds":
        await this.app.walletCommands.sendFunds();
        break;
      case "fund-wallet":
        await this.app.walletCommands.fundWallet();
        break;

      // Caravan Multisig
      case "list-caravan":
        await this.app.multisigCommands.listCaravanWallets();
        break;
      case "create-caravan":
        await this.app.multisigCommands.createCaravanWallet();
        break;
      case "caravan-details":
        await this.app.multisigCommands.showCaravanWalletDetails();
        break;
      case "create-watch":
        await this.app.multisigCommands.createWatchWallet();
        break;
      case "fund-caravan":
        await this.app.multisigCommands.fundCaravanWallet();
        break;

      // Transactions
      case "create-psbt":
        await this.app.transactionCommands.createPSBT();
        break;
      case "sign-psbt-wallet":
        await this.app.transactionCommands.signPSBTWithWallet();
        break;
      case "sign-psbt-key":
        await this.app.transactionCommands.signPSBTWithPrivateKey();
        break;
      case "analyze-psbt":
        await this.app.transactionCommands.analyzePSBT();
        break;
      case "finalize-psbt":
        await this.app.transactionCommands.finalizeAndBroadcastPSBT();
        break;

      // System
      case "mining":
        await this.miningMenu();
        break;
      case "export":
        await this.exportMenu();
        break;
      case "import":
        await this.importMenu();
        break;
      case "settings":
        await this.settingsMenu();
        break;
      case "help":
        await this.showHelp();
        break;
      default:
        console.log(chalk.yellow(`Action '${action}' not implemented yet.`));
    }
  }

  /**
   * Mining options menu
   */
  private async miningMenu(): Promise<void> {
    const action = await select({
      message: "Mining Options:",
      choices: [
        { name: "Generate blocks to a wallet", value: "mine-to-wallet" },
        { name: "Generate blocks to an address", value: "mine-to-address" },
        { name: "Back to main menu", value: "back" },
      ],
    });

    if (action === "back") {
      return;
    }

    if (action === "mine-to-wallet") {
      // List wallets to select from
      const wallets = await this.app.walletCommands.listWallets();

      if (wallets.length === 0) {
        console.log(chalk.yellow("\nNo wallets found. Create a wallet first."));
        return;
      }

      const wallet = await select({
        message: "Select a wallet to mine to:",
        choices: wallets.map((w) => ({ name: w, value: w })),
      });

      const blocks = await number({
        message: "How many blocks do you want to mine?",
        default: 1,
        validate: (input) =>
          input! > 0 ? true : "Please enter a positive number",
      });

      await this.app.walletCommands.fundWallet(wallet);
    } else if (action === "mine-to-address") {
      const address = await input({
        message: "Enter destination address:",
        validate: (input) =>
          input.trim() !== "" ? true : "Please enter a valid address",
      });

      const blocks = await number({
        message: "How many blocks do you want to mine?",
        default: 1,
        validate: (input) =>
          input! > 0 ? true : "Please enter a positive number",
      });

      console.log(
        chalk.cyan(`\nMining ${blocks} block(s) to address ${address}...`),
      );

      try {
        // Access bitcoin service directly since it's not exposed through a command
        const minedBlocks = await this.app.bitcoinService.generateToAddress(
          blocks!,
          address,
        );

        console.log(
          chalk.green(`\nSuccessfully mined ${minedBlocks.length} block(s)!`),
        );
        console.log(
          chalk.green(
            `Latest block hash: ${minedBlocks[minedBlocks.length - 1]}`,
          ),
        );
      } catch (error) {
        console.error(chalk.red("\nError mining blocks:"), error);
      }
    }
  }

  /**
   * Export menu
   */
  private async exportMenu(): Promise<void> {
    const action = await select({
      message: "Export Options:",
      choices: [
        {
          name: "Export Caravan wallet configuration",
          value: "export-caravan",
        },
        { name: "Export key data", value: "export-keys" },
        { name: "Back to main menu", value: "back" },
      ],
    });

    if (action === "back") {
      return;
    }

    if (action === "export-caravan") {
      const wallets = await this.app.multisigCommands.listCaravanWallets();

      if (wallets.length === 0) {
        console.log(chalk.yellow("\nNo Caravan wallets found."));
        return;
      }

      const walletIndex = await select({
        message: "Select a Caravan wallet to export:",
        choices: wallets.map((w, i) => ({ name: w.name, value: i })),
      });

      const selectedWallet = wallets[walletIndex];
      const filename = await input({
        message: "Enter export file name:",
        default: `${selectedWallet.name.replace(/\s+/g, "_")}_export.json`,
      });

      try {
        await fs.writeJson(filename, selectedWallet, { spaces: 2 });
        console.log(chalk.green(`\nCaravan wallet exported to ${filename}`));
      } catch (error) {
        console.error(chalk.red("\nError exporting wallet:"), error);
      }
    }
  }

  /**
   * Import menu
   */
  private async importMenu(): Promise<void> {
    const action = await select({
      message: "Import Options:",
      choices: [
        {
          name: "Import Caravan wallet configuration",
          value: "import-caravan",
        },
        { name: "Import key data", value: "import-keys" },
        { name: "Back to main menu", value: "back" },
      ],
    });

    if (action === "back") {
      return;
    }

    if (action === "import-caravan") {
      const filename = await input({
        message: "Enter path to Caravan wallet JSON file:",
        validate: (input) =>
          fs.existsSync(input) ? true : "File does not exist",
      });

      try {
        const config = await fs.readJson(filename);

        if (!config.name || !config.quorum || !config.extendedPublicKeys) {
          console.log(chalk.red("\nInvalid Caravan wallet configuration."));
          return;
        }

        console.log(
          chalk.cyan(`\nImporting Caravan wallet "${config.name}"...`),
        );

        const savedFileName =
          await this.app.caravanService.saveCaravanWalletConfig(config);

        console.log(
          chalk.green(
            `\nCaravan wallet imported successfully as ${savedFileName}!`,
          ),
        );

        // Ask if user wants to create a watch-only wallet
        const createWatch = await confirm({
          message: "Create a watch-only wallet for this multisig wallet?",
          default: true,
        });

        if (createWatch) {
          await this.app.multisigCommands.createWatchWallet(config);
        }
      } catch (error) {
        console.error(chalk.red("\nError importing Caravan wallet:"), error);
      }
    } else if (action === "import-keys") {
      const filename = await input({
        message: "Enter path to key data JSON file:",
        validate: (input) =>
          fs.existsSync(input) ? true : "File does not exist",
      });

      try {
        const keyData = await fs.readJson(filename);

        if (!keyData.caravanName || !keyData.keyData) {
          console.log(chalk.red("\nInvalid key data file."));
          return;
        }

        console.log(
          chalk.cyan(
            `\nImporting key data for wallet "${keyData.caravanName}"...`,
          ),
        );

        // Check if the wallet exists
        const wallets = await this.app.multisigCommands.listCaravanWallets();
        const caravanWallet = wallets.find(
          (w) => w.name === keyData.caravanName,
        );

        if (!caravanWallet) {
          console.log(
            chalk.yellow(`\nWallet "${keyData.caravanName}" not found.`),
          );
          console.log(chalk.yellow("Import the wallet configuration first."));
          return;
        }
      } catch (error) {
        console.error(chalk.red("\nError importing key data:"), error);
      }
    }
  }

  /**
   * Settings menu
   */
  private async settingsMenu(): Promise<void> {
    console.log(chalk.cyan("\n=== Settings ==="));

    const action = await select({
      message: "Settings options:",
      choices: [
        {
          name: "Update Bitcoin Core connection settings",
          value: "update-bitcoin",
        },
        { name: "Change application directories", value: "update-dirs" },
        { name: "View current configuration", value: "view-config" },
        { name: "Back to main menu", value: "back" },
      ],
    });
    // Simply display the current configuration for now
    const config = this.app.configManager.getConfig();

    if (action === "back") return;

    if (action === "update-bitcoin") {
      await this.app.setupBitcoinConfig();
    } else if (action === "update-dirs") {
      await this.updateAppDirectories();
    } else if (action === "view-config") {
      this.displayCurrentConfig();
    }
  }

  private async updateAppDirectories(): Promise<void> {
    const config = this.app.configManager.getConfig();

    console.log(chalk.cyan("\n=== Update Application Directories ==="));

    const appDir = await input({
      message: "Enter application directory:",
      default: config.appDir,
    });

    const caravanDir = await input({
      message: "Enter Caravan wallets directory:",
      default: config.caravanDir,
    });

    const keysDir = await input({
      message: "Enter keys directory:",
      default: config.keysDir,
    });

    await this.app.configManager.updateDirectories({
      appDir,
      caravanDir,
      keysDir,
    });
    console.log(chalk.green("\nDirectories updated successfully!"));
  }

  private displayCurrentConfig(): void {
    const config = this.app.configManager.getConfig();

    console.log(chalk.cyan("\nBitcoin RPC Settings:"));
    console.log(`Protocol: ${config.bitcoin.protocol}`);
    console.log(`Host: ${config.bitcoin.host}`);
    console.log(`Port: ${config.bitcoin.port}`);
    console.log(`User: ${config.bitcoin.user}`);
    console.log(`Data Directory: ${config.bitcoin.dataDir}`);

    console.log(chalk.cyan("\nApplication Directories:"));
    console.log(`App Directory: ${config.appDir}`);
    console.log(`Caravan Directory: ${config.caravanDir}`);
    console.log(`Keys Directory: ${config.keysDir}`);
  }

  /**
   * Show help information
   */
  private async showHelp(): Promise<void> {
    console.log(chalk.cyan("\n=== Caravan Regtest Manager Help ==="));

    console.log(chalk.yellow("\nBitcoin Wallets:"));
    console.log("- Manage regular Bitcoin wallets in regtest mode");
    console.log("- Create wallets, check balances, send funds");
    console.log("- Fund wallets by mining new blocks");

    console.log(chalk.yellow("\nCaravan Multisig:"));
    console.log("- Create and manage Caravan multisig wallet configurations");
    console.log("- Set up watch-only wallets for multisig addresses");
    console.log("- Configure private keys for signing");

    console.log(chalk.yellow("\nTransactions:"));
    console.log("- Create, sign, and broadcast transactions");
    console.log("- Work with PSBTs (Partially Signed Bitcoin Transactions)");
    console.log("- Sign with wallets or individual private keys");

    console.log(chalk.yellow("\nImportant Notes:"));
    console.log(
      "1. This tool is designed for regtest mode only (not for mainnet)",
    );
    console.log("2. Bitcoin Core must be running in regtest mode");
    console.log("3. Private keys should be kept secure");
    console.log("4. Use Caravan for real multisig wallet management");

    console.log(chalk.yellow("\nUseful Resources:"));
    console.log("- Caravan: https://github.com/caravan-bitcoin/caravan");
    console.log("- Bitcoin Core: https://bitcoin.org/en/bitcoin-core/");
    console.log("- Bitcoin Development: https://bitcoin.org/en/development");
  }

  /**
   * Start the main menu interface
   */
  async start(): Promise<void> {
    await this.showMainMenu();
  }
}
