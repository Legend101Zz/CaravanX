import { ConfigManager } from "./core/config";
import { BitcoinRpcClient } from "./core/rpc";
import { BitcoinService } from "./core/bitcoin";
import { CaravanService } from "./core/caravan";
import { TransactionService } from "./core/transaction";
import { WalletCommands } from "./commands/wallet";
import { MultisigCommands } from "./commands/multisig";
import { TransactionCommands } from "./commands/transaction";
import { VisualizationCommands } from "./commands/visualizations";
import { ScriptCommands } from "./commands/scripts";
import { MainMenu } from "./ui/mainMenu";

import { confirm, input, number } from "@inquirer/prompts";
import chalk from "chalk";

/**
 * Main application class
 */
export class CaravanRegtestManager {
  private bitcoinRpcClient: BitcoinRpcClient;
  private transactionService: TransactionService;

  public configManager: ConfigManager;
  public bitcoinService: BitcoinService;
  public caravanService: CaravanService;
  public walletCommands: WalletCommands;
  public multisigCommands: MultisigCommands;
  public transactionCommands: TransactionCommands;
  public visualizationCommands: VisualizationCommands;
  public scriptCommands: ScriptCommands;

  constructor() {
    // Initialize configuration
    this.configManager = new ConfigManager();
    const config = this.configManager.getConfig();

    // Initialize RPC client
    this.bitcoinRpcClient = new BitcoinRpcClient(config.bitcoin);

    // Initialize services
    this.bitcoinService = new BitcoinService(this.bitcoinRpcClient, true); // true for regtest mode
    this.caravanService = new CaravanService(
      this.bitcoinRpcClient,
      config.caravanDir,
      config.keysDir,
    );
    this.transactionService = new TransactionService(
      this.bitcoinRpcClient,
      true,
    ); // true for regtest mode

    // Initialize command modules
    this.walletCommands = new WalletCommands(this.bitcoinService);
    this.multisigCommands = new MultisigCommands(
      this.caravanService,
      this.bitcoinService,
      this.bitcoinRpcClient,
      this.transactionService,
    );
    this.transactionCommands = new TransactionCommands(
      this.transactionService,
      this.caravanService,
      this.bitcoinService,
    );
    this.visualizationCommands = new VisualizationCommands(
      this.configManager,
      this.bitcoinRpcClient,
      this.bitcoinService,
    );

    this.scriptCommands = new ScriptCommands(
      this.configManager,
      this.bitcoinService,
      this.caravanService,
      this.transactionService,
      this.bitcoinRpcClient,
      this.multisigCommands,
    );
  }

  /**
   * Check if Bitcoin Core is running and accessible
   */
  async checkBitcoinCore(): Promise<boolean> {
    try {
      const blockchainInfo = (await this.bitcoinRpcClient.callRpc(
        "getblockchaininfo",
      )) as {
        chain: string;
      };
      return blockchainInfo && blockchainInfo.chain === "regtest";
    } catch (error: any) {
      // More detailed error information
      if (error.message.includes("ECONNREFUSED")) {
        console.log(
          chalk.red(
            "Error: Bitcoin Core is not running or RPC server is not accessible.",
          ),
        );
      } else if (error.message.includes("401")) {
        console.log(
          chalk.red(
            "Error: Authentication failed. Check your RPC username and password.",
          ),
        );
      } else if (error.message.includes("data directory")) {
        console.log(chalk.red(`Error: ${error.message}`));
      } else {
        console.log(
          chalk.red("Error connecting to Bitcoin Core:"),
          error.message,
        );
      }
      return false;
    }
  }

  /**
   * Start the application
   */
  async start(): Promise<void> {
    console.log(chalk.bold.cyan("\n=== Caravan Regtest Manager ==="));

    // Check if Bitcoin Core is running
    let bitcoinCoreRunning = await this.checkBitcoinCore();
    if (!bitcoinCoreRunning) {
      console.log(chalk.red("\nERROR: Could not connect to Bitcoin Core."));
      console.log(
        chalk.yellow(
          "Please make sure Bitcoin Core is running in regtest mode.",
        ),
      );
      console.log(
        chalk.yellow(
          "You may need to update your RPC settings in the config file.",
        ),
      );

      const config = this.configManager.getConfig();
      console.log(chalk.cyan("\nCurrent RPC settings:"));
      console.log(
        `URL: ${config.bitcoin.protocol}://${config.bitcoin.host}:${config.bitcoin.port}`,
      );
      console.log(`User: ${config.bitcoin.user}`);
      console.log(`Data Directory: ${config.bitcoin.dataDir}`);

      const setupConfig = await confirm({
        message:
          "Would you like to update your Bitcoin Core connection settings?",
        default: true,
      });

      if (setupConfig) {
        await this.setupBitcoinConfig();
        // Try connecting again
        bitcoinCoreRunning = await this.checkBitcoinCore();
      }
    }

    if (!bitcoinCoreRunning) {
      console.log(
        chalk.yellow("\nContinuing without Bitcoin Core connection."),
      );
      console.log(
        chalk.yellow("Some features will not be available until connected."),
      );
    } else {
      console.log(
        chalk.green("\nSuccessfully connected to Bitcoin Core (regtest mode)."),
      );
    }

    // Start the main menu
    const mainMenu = new MainMenu(this);
    await mainMenu.start();
  }

  /**
   * Set up Bitcoin Core connection configuration interactively
   */
  async setupBitcoinConfig(): Promise<void> {
    console.log(chalk.cyan("\n=== Bitcoin Core Configuration ==="));

    const config = this.configManager.getConfig();

    const protocol = await input({
      message: "Enter RPC protocol (http/https):",
      default: config.bitcoin.protocol,
    });

    const host = await input({
      message: "Enter RPC host:",
      default: config.bitcoin.host,
    });

    const port = await number({
      message: "Enter RPC port:",
      default: config.bitcoin.port,
    });

    const user = await input({
      message: "Enter RPC username:",
      default: config.bitcoin.user,
    });

    const pass = await input({
      message: "Enter RPC password:",
      default: config.bitcoin.pass,
    });

    const dataDir = await input({
      message: "Enter Bitcoin data directory:",
      default: config.bitcoin.dataDir,
    });

    // Update the configuration
    this.configManager.updateBitcoinConfig({
      protocol,
      host,
      port: port!,
      user,
      pass,
      dataDir,
    });

    // Reinitialize the RPC client with new settings
    this.bitcoinRpcClient = new BitcoinRpcClient(
      this.configManager.getConfig().bitcoin,
    );
    this.bitcoinService = new BitcoinService(this.bitcoinRpcClient, true);

    console.log(chalk.green("\nConfiguration updated successfully!"));
  }
}

// When run directly
if (require.main === module) {
  const app = new CaravanRegtestManager();
  app.start().catch((error) => {
    console.error(chalk.red("\nError starting application:"), error);
    process.exit(1);
  });
}

// Export for use in other files
export default CaravanRegtestManager;
