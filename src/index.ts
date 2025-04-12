import { ConfigManager } from "./core/config";
import { BitcoinRpcClient } from "./core/rpc";
import { BitcoinService } from "./core/bitcoin";
import { CaravanService } from "./core/caravan";
import { TransactionService } from "./core/transaction";
import { WalletCommands } from "./commands/wallet";
import { MultisigCommands } from "./commands/multisig";
import { TransactionCommands } from "./commands/transaction";
import { MainMenu } from "./ui/mainMenu";
import chalk from "chalk";

/**
 * Main application class
 */
export class CaravanRegtestManager {
  private configManager: ConfigManager;
  private bitcoinRpcClient: BitcoinRpcClient;
  private bitcoinService: BitcoinService;
  private caravanService: CaravanService;
  private transactionService: TransactionService;

  public walletCommands: WalletCommands;
  public multisigCommands: MultisigCommands;
  public transactionCommands: TransactionCommands;

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
    );
    this.transactionCommands = new TransactionCommands(
      this.transactionService,
      this.caravanService,
      this.bitcoinService,
    );
  }

  /**
   * Check if Bitcoin Core is running and accessible
   */
  async checkBitcoinCore(): Promise<boolean> {
    try {
      const blockchainInfo =
        await this.bitcoinRpcClient.callRpc("getblockchaininfo");
      return blockchainInfo && blockchainInfo.chain === "regtest";
    } catch (error) {
      return false;
    }
  }

  /**
   * Start the application
   */
  async start(): Promise<void> {
    console.log(chalk.bold.cyan("\n=== Caravan Regtest Manager ==="));

    // Check if Bitcoin Core is running
    const bitcoinCoreRunning = await this.checkBitcoinCore();
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

      process.exit(1);
    }

    console.log(
      chalk.green("\nSuccessfully connected to Bitcoin Core (regtest mode)."),
    );

    // Start the main menu
    const mainMenu = new MainMenu(this);
    await mainMenu.start();
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
