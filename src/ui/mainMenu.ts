import { input, confirm, select, number } from "@inquirer/prompts";
import chalk from "chalk";
import { CaravanRegtestManager } from "../index";
import figlet from "figlet";
import * as fs from "fs-extra";
import gradient from "gradient-string";
import ora from "ora";

// Define a consistent color scheme
const colors = {
  primary: chalk.hex("#F7931A"), // Bitcoin orange
  secondary: chalk.hex("#1C2C5B"), // Dark blue
  accent: chalk.hex("#00ACED"), // Light blue
  success: chalk.hex("#28a745"), // Green
  warning: chalk.hex("#ffc107"), // Yellow
  error: chalk.hex("#dc3545"), // Red
  info: chalk.hex("#17a2b8"), // Teal
  muted: chalk.hex("#6c757d"), // Gray
  header: chalk.bold.hex("#F7931A"), // Bold orange for headers
  commandName: chalk.bold.hex("#0095d5"), // Bold dark blue for command names
};

/**
 * Main menu interface
 */
export class MainMenu {
  private app: CaravanRegtestManager;

  // Menu categories
  private readonly mainMenuCategories = [
    { name: colors.header("🏦 Bitcoin Wallets"), value: "bitcoin-wallets" },
    { name: colors.header("🔐 Caravan Multisig"), value: "caravan-multisig" },
    { name: colors.header("💸 Transactions"), value: "transactions" },
    { name: colors.header("📜 Blockchain Scripts"), value: "scripts" },
    { name: colors.header("₿ Visualization"), value: "visualization" },
    { name: colors.header("⚙️ System"), value: "system" },
    { name: colors.header("❓ Help"), value: "help" },
    { name: colors.header("🚪 Exit"), value: "exit" },
  ];

  // Submenu items
  private readonly subMenus = {
    "bitcoin-wallets": [
      { name: colors.commandName("List all wallets"), value: "list-wallets" },
      { name: colors.commandName("Create new wallet"), value: "create-wallet" },
      // {
      //   name: colors.commandName("Create wallet with private key"),
      //   value: "create-key-wallet",
      // },
      {
        name: colors.commandName("View wallet details"),
        value: "wallet-details",
      },
      {
        name: colors.commandName("Send funds between wallets"),
        value: "send-funds",
      },
      {
        name: colors.commandName("Fund wallet with regtest coins"),
        value: "fund-wallet",
      },
      { name: colors.muted("Back to main menu"), value: "back" },
    ],
    "caravan-multisig": [
      {
        name: colors.commandName("List Caravan wallets"),
        value: "list-caravan",
      },
      {
        name: colors.commandName("Create new Caravan multisig wallet"),
        value: "create-caravan",
      },
      {
        name: colors.commandName("Spend from Caravan multisig wallet"),
        value: "spend-caravan",
      },
      {
        name: colors.commandName("Sign Caravan PSBT for import"),
        value: "sign-caravan-psbt",
      },
      {
        name: colors.commandName("Fund Caravan multisig wallet"),
        value: "fund-caravan",
      },
      {
        name: colors.commandName("View Caravan wallet details"),
        value: "caravan-details",
      },
      {
        name: colors.commandName("Create watch-only wallet for Caravan"),
        value: "create-watch",
      },
      // {
      //   name: colors.commandName("Configure private keys for Caravan wallet"),
      //   value: "configure-keys",
      // },

      {
        name: "🧪 Create Test Wallets (Privacy Levels)",
        value: "create-test-wallets",
        description:
          "Create test multisig wallets with different privacy levels",
      },
      { name: colors.muted("Back to main menu"), value: "back" },
    ],
    transactions: [
      { name: colors.commandName("Create new PSBT"), value: "create-psbt" },
      {
        name: colors.commandName("Sign PSBT with wallet"),
        value: "sign-psbt-wallet",
      },
      {
        name: colors.commandName("Sign PSBT with private key"),
        value: "sign-psbt-key",
      },
      {
        name: colors.commandName("Analyze and decode PSBT"),
        value: "analyze-psbt",
      },
      {
        name: colors.commandName("Finalize and broadcast PSBT"),
        value: "finalize-psbt",
      },
      { name: colors.muted("Back to main menu"), value: "back" },
    ],
    scripts: [
      {
        name: colors.commandName("Browse script templates"),
        value: "list-templates",
      },
      {
        name: colors.commandName("Create a new script"),
        value: "create-script",
      },
      { name: colors.commandName("Run a script"), value: "run-script" },
      {
        name: colors.commandName("Manage saved scripts"),
        value: "manage-scripts",
      },
      { name: colors.muted("Back to main menu"), value: "back" },
    ],
    visualization: [
      {
        name: colors.commandName("Start blockchain visualization"),
        value: "start-visualization",
      },
      {
        name: colors.commandName("Stop blockchain visualization"),
        value: "stop-visualization",
      },
      {
        name: colors.commandName("Simulate blockchain activity"),
        value: "simulate-blockchain",
      },
      { name: colors.muted("Back to main menu"), value: "back" },
    ],
    system: [
      {
        name: colors.commandName("Mining and block generation"),
        value: "mining",
      },
      { name: colors.commandName("Export data"), value: "export" },
      { name: colors.commandName("Import data"), value: "import" },
      { name: colors.commandName("Settings"), value: "settings" },
      { name: colors.muted("Back to main menu"), value: "back" },
    ],
  };

  constructor(app: CaravanRegtestManager) {
    this.app = app;
  }

  /**
   * Centralized error handling method
   * Displays error to user and provides option to return to main menu
   */
  private async handleError(error: any, context: string): Promise<void> {
    console.clear();
    console.log(this.getErrorBox(error, context));
    await input({ message: "Press Enter to return to main menu..." });
  }

  /**
   * Create a formatted error box
   */
  private getErrorBox(error: any, context: string): string {
    const errorMessage = error.message || String(error);
    const lines = [
      colors.error(`⚠️ Error in ${context}`),
      "",
      colors.error(errorMessage),
      "",
      colors.muted("Check your inputs and Bitcoin Core connection"),
      colors.muted("Press Enter to return to the main menu"),
    ];

    // Calculate box width based on the longest line
    const width = Math.max(...lines.map((line) => line.length)) + 4;

    // Create the box
    let box = "\n" + "╔" + "═".repeat(width) + "╗\n";

    // Add each line to the box
    lines.forEach((line) => {
      const padding = " ".repeat(Math.floor((width - line.length) / 2));
      box +=
        "║" +
        padding +
        line +
        " ".repeat(width - line.length - padding.length) +
        "║\n";
    });

    // Close the box
    box += "╚" + "═".repeat(width) + "╝\n";

    return box;
  }

  /**
   * Display the Caravan logo
   */
  private displayLogo(): void {
    try {
      // Create a gradient using Bitcoin orange to blue
      const logoGradient = gradient(["#F7931A", "#F7931A", "#00ACED"]);

      // Generate the figlet text
      const figletText = figlet.textSync("Caravan", {
        font: "Big",
        horizontalLayout: "default",
        verticalLayout: "default",
        width: 80,
        whitespaceBreak: true,
      });

      // Apply the gradient to the figlet text
      const gradientText = logoGradient(figletText);

      // Output the gradient text
      console.log(gradientText);

      // Add the subtitle with accent color
      console.log(
        colors.accent("========== R E G T E S T   M O D E =========="),
      );
      console.log(
        colors.muted("A terminal-based utility for Caravan in regtest mode\n"),
      );
    } catch (error) {
      // If figlet fails, fall back to the original ASCII art
      console.log(this.originalCaravanLogo);
    }
  }

  // Add this as a backup
  private originalCaravanLogo = `
       ${colors.primary("   ______                                    ")}
       ${colors.primary("  / ____/___ __________ __   _____ ____     ")}
       ${colors.primary(" / /   / __ \`/ ___/ __ \`/ | / / _ \\/ __ \\   ")}
       ${colors.primary("/ /___/ /_/ / /  / /_/ /| |/ / /_/ / / / /   ")}
       ${colors.primary("\\____/\\__,_/_/   \\__,_/ |___/\\__,_/_/ /_/    ")}

       ${colors.accent("========== R E G T E S T   M O D E ==========")}
   `;

  /**
   * Execute an async task with a loading spinner
   */
  private async withSpinner<T>(
    message: string,
    task: () => Promise<T>,
    context: string = "operation",
  ): Promise<T> {
    const spinner = ora({
      text: message,
      color: "yellow",
    }).start();

    try {
      const result = await task();
      spinner.succeed(colors.success(message + " - Complete"));
      return result;
    } catch (error) {
      spinner.fail(colors.error(message + " - Failed"));
      await this.handleError(error, context);
      throw error;
    }
  }

  /**
   * Handle paginated output display
   */
  private async displayPaginatedOutput(
    text: string,
    pageSize: number = 15,
  ): Promise<void> {
    const lines = text.split("\n");
    const pages = [];

    for (let i = 0; i < lines.length; i += pageSize) {
      pages.push(lines.slice(i, i + pageSize).join("\n"));
    }

    if (pages.length <= 1) {
      console.log(text);
      return;
    }

    let currentPage = 0;

    while (currentPage < pages.length) {
      console.clear();
      console.log(pages[currentPage]);
      console.log(colors.muted(`\nPage ${currentPage + 1}/${pages.length}`));

      if (currentPage < pages.length - 1) {
        const action = await select({
          message: "Navigation:",
          choices: [
            { name: "Next page", value: "next" },
            {
              name: "Previous page",
              value: "prev",
              disabled: currentPage === 0,
            },
            { name: "Exit", value: "exit" },
          ],
        });

        if (action === "exit") break;
        if (action === "next") currentPage++;
        if (action === "prev") currentPage--;
      } else {
        await input({ message: "Press Enter to continue..." });
        break;
      }
    }
  }

  /**
   * Show the main menu and process user selection
   */
  async showMainMenu(): Promise<void> {
    let exit = false;

    while (!exit) {
      console.clear(); // Clear the console before displaying the menu
      this.displayLogo();

      try {
        const category = await select({
          message: "What would you like to do?",
          pageSize: 10,
          choices: this.mainMenuCategories,
        });

        if (category === "exit") {
          console.log(
            colors.success(
              "\nThank you for using Caravan Regtest Manager. Goodbye!",
            ),
          );
          process.exit(0);
        }

        if (category === "help") {
          await this.showHelp();
          await input({ message: "Press Enter to continue..." });
          continue;
        }

        // Show submenu for selected category
        await this.showSubMenu(category);
      } catch (error) {
        await this.handleError(error, "main menu");
      }
    }
  }

  /**
   * Show submenu for a selected category
   */
  private async showSubMenu(category: string): Promise<void> {
    try {
      //@ts-ignore
      const subMenu = this.subMenus[category];

      if (!subMenu) return;

      console.clear();
      this.displayLogo();
      console.log(
        colors.header(`\n=== ${this.getCategoryTitle(category)} ===\n`),
      );

      const action = await select({
        message: "Select an action:",
        pageSize: 10,
        choices: subMenu,
      });

      if (action === "back") return;
      //@ts-ignore
      await this.processAction(action, category);

      // Wait for user to press Enter before showing the menu again
      await input({ message: "Press Enter to continue..." });
    } catch (error) {
      await this.handleError(error, this.getCategoryTitle(category));
    }
  }

  /**
   * Get readable title for a category
   */
  private getCategoryTitle(category: string): string {
    switch (category) {
      case "bitcoin-wallets":
        return "Bitcoin Wallets";
      case "caravan-multisig":
        return "Caravan Multisig";
      case "transactions":
        return "Transactions";
      case "system":
        return "System";
      default:
        return category;
    }
  }

  /**
   * Process the selected menu action
   */
  private async processAction(action: string, category: string): Promise<void> {
    try {
      switch (action) {
        // Bitcoin Wallets
        case "list-wallets":
          await this.withSpinner("Listing wallets", async () => {
            const result = await this.app.walletCommands.listWallets();
            return result;
          });
          break;
        case "create-wallet":
          await this.app.walletCommands.createWallet();
          break;
        // case "create-key-wallet":
        //   await this.app.walletCommands.createPrivateKeyWallet();
        //   break;
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
          await this.withSpinner("Listing Caravan wallets", async () => {
            const result = await this.app.multisigCommands.listCaravanWallets();
            return result;
          });
          break;
        case "create-caravan":
          await this.app.multisigCommands.createCaravanWallet();
          break;
        case "spend-caravan":
          await this.app.multisigCommands.spendFromCaravanWallet();
          break;
        case "sign-caravan-psbt":
          await this.app.multisigCommands.signCaravanPSBT();
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
        case "create-test-wallets":
          await this.app.multisigCommands.createTestMultisigWallets();
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

        // Blockchain Scripts
        case "list-templates":
          await this.app.scriptCommands.listScriptTemplates();
          break;
        case "create-script":
          await this.app.scriptCommands.createNewScript();
          break;
        case "run-script":
          await this.app.scriptCommands.runCustomScript();
          break;
        case "manage-scripts":
          await this.app.scriptCommands.manageScripts();
          break;

        // Visualization
        case "start-visualization":
          await this.app.visualizationCommands.startVisualization();
          break;
        case "stop-visualization":
          await this.app.visualizationCommands.stopVisualization();
          break;
        case "simulate-blockchain":
          await this.app.visualizationCommands.simulateBlockchain();
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
        default:
          console.log(
            colors.warning(`Action '${action}' not implemented yet.`),
          );
      }
    } catch (error) {
      // Make sure all spinners are stopped here too
      ora().stop();
      process.stdout.write("\r\x1b[K");
      await this.handleError(
        error,
        `${this.getCategoryTitle(category)} > ${action}`,
      );
    }
  }

  /**
   * Mining options menu
   */
  private async miningMenu(): Promise<void> {
    console.clear();
    this.displayLogo();
    console.log(colors.header("\n=== Mining Options ===\n"));

    const action = await select({
      message: "Select mining action:",
      choices: [
        {
          name: colors.commandName("Generate blocks to a wallet"),
          value: "mine-to-wallet",
        },
        {
          name: colors.commandName("Generate blocks to an address"),
          value: "mine-to-address",
        },
        { name: colors.muted("Back to main menu"), value: "back" },
      ],
    });

    if (action === "back") {
      return;
    }

    if (action === "mine-to-wallet") {
      // List wallets to select from
      const walletsResult = await this.withSpinner(
        "Loading wallets",
        async () => {
          return await this.app.walletCommands.listWallets();
        },
      );

      // Check if we got a valid array of wallets
      const wallets = Array.isArray(walletsResult) ? walletsResult : [];

      if (wallets.length === 0) {
        console.log(
          colors.warning("\nNo wallets found. Create a wallet first."),
        );
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

      await this.withSpinner(
        `Mining ${blocks} blocks to ${wallet}`,
        async () => {
          return await this.app.walletCommands.fundWallet(wallet);
        },
      );
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
        colors.info(`\nMining ${blocks} block(s) to address ${address}...`),
      );

      try {
        const minedBlocks = await this.withSpinner(
          `Mining ${blocks} blocks`,
          async () => {
            return await this.app.bitcoinService.generateToAddress(
              blocks!,
              address,
            );
          },
        );

        console.log(
          colors.success(
            `\nSuccessfully mined ${minedBlocks.length} block(s)!`,
          ),
        );
        console.log(
          colors.success(
            `Latest block hash: ${minedBlocks[minedBlocks.length - 1]}`,
          ),
        );
      } catch (error) {
        await this.handleError(error, "mining menu");
      }
    }
  }

  /**
   * Export menu
   */
  private async exportMenu(): Promise<void> {
    try {
      console.clear();
      this.displayLogo();
      console.log(colors.header("\n=== Export Options ===\n"));

      const action = await select({
        message: "Select export option:",
        choices: [
          {
            name: colors.commandName("Export Caravan wallet configuration"),
            value: "export-caravan",
          },
          { name: colors.commandName("Export key data"), value: "export-keys" },
          { name: colors.muted("Back to main menu"), value: "back" },
        ],
      });

      if (action === "back") {
        return;
      }

      if (action === "export-caravan") {
        const wallets = await this.withSpinner(
          "Loading Caravan wallets",
          async () => {
            return await this.app.multisigCommands.listCaravanWallets();
          },
        );

        if (wallets.length === 0) {
          console.log(colors.warning("\nNo Caravan wallets found."));
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

        await this.withSpinner(`Exporting wallet to ${filename}`, async () => {
          await fs.writeJson(filename, selectedWallet, { spaces: 2 });
          return true;
        });
        console.log(colors.success(`\nCaravan wallet exported to ${filename}`));
      }
    } catch (error) {
      await this.handleError(error, "export menu");
    }
  }

  /**
   * Import menu
   */
  private async importMenu(): Promise<void> {
    try {
      console.clear();
      this.displayLogo();
      console.log(colors.header("\n=== Import Options ===\n"));

      const action = await select({
        message: "Select import option:",
        choices: [
          {
            name: colors.commandName("Import Caravan wallet configuration"),
            value: "import-caravan",
          },
          { name: colors.commandName("Import key data"), value: "import-keys" },
          { name: colors.muted("Back to main menu"), value: "back" },
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

        const config = await this.withSpinner(
          "Reading wallet configuration",
          async () => {
            return await fs.readJson(filename);
          },
        );

        if (!config.name || !config.quorum || !config.extendedPublicKeys) {
          console.log(colors.error("\nInvalid Caravan wallet configuration."));
          return;
        }

        console.log(
          colors.info(`\nImporting Caravan wallet "${config.name}"...`),
        );

        const savedFileName = await this.withSpinner(
          "Saving wallet configuration",
          async () => {
            return await this.app.caravanService.saveCaravanWalletConfig(
              config,
            );
          },
        );

        console.log(
          colors.success(
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
      } else if (action === "import-keys") {
        const filename = await input({
          message: "Enter path to key data JSON file:",
          validate: (input) =>
            fs.existsSync(input) ? true : "File does not exist",
        });

        const keyData = await this.withSpinner("Reading key data", async () => {
          return await fs.readJson(filename);
        });

        if (!keyData.caravanName || !keyData.keyData) {
          console.log(colors.error("\nInvalid key data file."));
          return;
        }

        console.log(
          colors.info(
            `\nImporting key data for wallet "${keyData.caravanName}"...`,
          ),
        );

        // Check if the wallet exists
        const wallets = await this.withSpinner("Checking wallets", async () => {
          return await this.app.multisigCommands.listCaravanWallets();
        });

        const caravanWallet = wallets.find(
          (w) => w.name === keyData.caravanName,
        );

        if (!caravanWallet) {
          console.log(
            colors.warning(`\nWallet "${keyData.caravanName}" not found.`),
          );
          console.log(colors.warning("Import the wallet configuration first."));
          return;
        }
      }
    } catch (error) {
      await this.handleError(error, "import menu");
    }
  }

  /**
   * Settings menu
   */
  private async settingsMenu(): Promise<void> {
    try {
      console.clear();
      this.displayLogo();
      console.log(colors.header("\n=== Settings ===\n"));

      const action = await select({
        message: "Settings options:",
        choices: [
          {
            name: colors.commandName("Update Bitcoin Core connection settings"),
            value: "update-bitcoin",
          },
          {
            name: colors.commandName("Change application directories"),
            value: "update-dirs",
          },
          {
            name: colors.commandName("View current configuration"),
            value: "view-config",
          },
          { name: colors.muted("Back to main menu"), value: "back" },
        ],
      });

      if (action === "back") return;

      if (action === "update-bitcoin") {
        await this.app.setupBitcoinConfig();
      } else if (action === "update-dirs") {
        await this.updateAppDirectories();
      } else if (action === "view-config") {
        this.displayCurrentConfig();
      }
    } catch (error) {
      await this.handleError(error, "settings menu");
    }
  }

  private async updateAppDirectories(): Promise<void> {
    try {
      const config = this.app.configManager.getConfig();

      console.log(colors.header("\n=== Update Application Directories ===\n"));

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

      await this.withSpinner("Updating directories", async () => {
        await this.app.configManager.updateDirectories({
          appDir,
          caravanDir,
          keysDir,
        });
        return true;
      });

      console.log(colors.success("\nDirectories updated successfully!"));
    } catch (error) {
      await this.handleError(error, "directory update");
    }
  }

  private displayCurrentConfig(): void {
    const config = this.app.configManager.getConfig();

    console.clear();
    this.displayLogo();
    console.log(colors.header("\n=== Current Configuration ===\n"));

    console.log(colors.header("\nBitcoin RPC Settings:"));
    console.log(colors.info(`Protocol: ${config.bitcoin.protocol}`));
    console.log(colors.info(`Host: ${config.bitcoin.host}`));
    console.log(colors.info(`Port: ${config.bitcoin.port}`));
    console.log(colors.info(`User: ${config.bitcoin.user}`));
    console.log(colors.info(`Data Directory: ${config.bitcoin.dataDir}`));

    console.log(colors.header("\nApplication Directories:"));
    console.log(colors.info(`App Directory: ${config.appDir}`));
    console.log(colors.info(`Caravan Directory: ${config.caravanDir}`));
    console.log(colors.info(`Keys Directory: ${config.keysDir}`));
  }

  /**
   * Show help information
   */
  private async showHelp(): Promise<void> {
    try {
      console.clear();
      this.displayLogo();
      console.log(colors.header("\n=== Caravan Regtest Manager Help ===\n"));

      console.log(colors.header("\n🏦 Bitcoin Wallets:"));
      console.log(
        colors.info("- Manage regular Bitcoin wallets in regtest mode"),
      );
      console.log(colors.info("- Create wallets, check balances, send funds"));
      console.log(colors.info("- Fund wallets by mining new blocks"));

      console.log(colors.header("\n🔐 Caravan Multisig:"));
      console.log(
        colors.info(
          "- Create and manage Caravan multisig wallet configurations",
        ),
      );
      console.log(
        colors.info("- Set up watch-only wallets for multisig addresses"),
      );
      console.log(colors.info("- Configure private keys for signing"));

      console.log(colors.header("\n💸 Transactions:"));
      console.log(colors.info("- Create, sign, and broadcast transactions"));
      console.log(
        colors.info(
          "- Work with PSBTs (Partially Signed Bitcoin Transactions)",
        ),
      );
      console.log(
        colors.info("- Sign with wallets or individual private keys"),
      );

      console.log(colors.header("\n⚠️ Important Notes:"));
      console.log(
        colors.warning(
          "1. This tool is designed for regtest mode only (not for mainnet)",
        ),
      );
      console.log(
        colors.warning("2. Bitcoin Core must be running in regtest mode"),
      );
      console.log(colors.warning("3. Private keys should be kept secure"));
      console.log(
        colors.warning("4. Use Caravan for real multisig wallet management"),
      );

      console.log(colors.header("\n📚 Useful Resources:"));
      console.log(
        colors.info("- Caravan: https://github.com/caravan-bitcoin/caravan"),
      );
      console.log(
        colors.info("- Bitcoin Core: https://bitcoin.org/en/bitcoin-core/"),
      );
      console.log(
        colors.info(
          "- Bitcoin Development: https://bitcoin.org/en/development",
        ),
      );
    } catch (error) {
      await this.handleError(error, "help menu");
    }
  }

  /**
   * Start the main menu interface
   */
  async start(): Promise<void> {
    try {
      await this.showMainMenu();
    } catch (error) {
      await this.handleError(error, "application startup");
      process.exit(1);
    }
  }
}
