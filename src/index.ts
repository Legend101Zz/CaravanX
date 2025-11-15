import { ConfigManager } from "./core/config";
import { BitcoinRpcClient } from "./core/rpc";
import { BitcoinService } from "./core/bitcoin";
import { CaravanService } from "./core/caravan";
import { TransactionService } from "./core/transaction";
import { DockerService } from "./core/docker";
import { SnapshotService } from "./core/snapshot";
import { ScenarioService } from "./core/scenario";
import { EnhancedAppConfig } from "./types/config";
import { WalletCommands } from "./commands/wallet";
import { MultisigCommands } from "./commands/multisig";
import { TransactionCommands } from "./commands/transaction";
import { VisualizationCommands } from "./commands/visualizations";
import { ScriptCommands } from "./commands/scripts";
import { MainMenu } from "./ui/mainMenu";
import { SetupWizard } from "./ui/setupWizard";

import { confirm, input, number } from "@inquirer/prompts";
import chalk from "chalk";
import path from "path";
import fs from "fs-extra";

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

  public setupWizard: SetupWizard;
  public dockerService?: DockerService;
  public snapshotService: SnapshotService;
  public scenarioService: ScenarioService;
  private enhancedConfig?: EnhancedAppConfig;

  constructor() {
    // Initialize configuration
    this.configManager = new ConfigManager();
    const config = this.configManager.getConfig();

    // Check if enhanced config exists
    this.setupWizard = new SetupWizard(config.appDir);

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

    this.snapshotService = new SnapshotService(
      this.bitcoinRpcClient,
      path.join(config.appDir, "snapshots"),
      config.bitcoin.dataDir,
    );

    this.scenarioService = new ScenarioService(
      this.bitcoinService,
      this.caravanService,
      this.transactionService,
      this.bitcoinRpcClient,
      path.join(config.appDir, "scenarios"),
    );

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
  /**
   * Start the application
   */
  async start(): Promise<void> {
    // Check if this is first-time setup
    const isFirstTime = await this.setupWizard.isFirstTimeSetup();

    if (isFirstTime) {
      console.log(chalk.cyan("\n🎉 Welcome to Caravan-X!\n"));
      const runSetup = await confirm({
        message: "Would you like to run the setup wizard?",
        default: true,
      });

      if (runSetup) {
        this.enhancedConfig = await this.setupWizard.run();
        await this.reinitializeWithConfig(this.enhancedConfig);
      }
    }

    // Load enhanced config if it exists
    if (!this.enhancedConfig) {
      this.enhancedConfig = await this.loadEnhancedConfig();
    }

    // CRITICAL: Determine which mode we're in and configure accordingly
    const isDockerMode = this.enhancedConfig?.mode === "docker";

    if (isDockerMode && this.enhancedConfig?.docker) {
      // === DOCKER MODE ===
      console.log(chalk.cyan("\n🐳 Initializing Docker mode...\n"));

      this.dockerService = new DockerService(
        this.enhancedConfig.docker,
        this.enhancedConfig.appDir,
      );

      // Check if Docker container is running
      const dockerStatus = await this.dockerService.getContainerStatus();

      if (dockerStatus.running) {
        console.log(chalk.green("✓ Docker container is running\n"));

        // Configure RPC client for Docker (via nginx proxy)
        const dockerRpcConfig = {
          protocol: "http",
          host: "localhost",
          port: 8080, // nginx proxy
          user: this.enhancedConfig.sharedConfig?.bitcoin.rpcUser || "user",
          pass: this.enhancedConfig.sharedConfig?.bitcoin.rpcPassword || "pass",
          dataDir: path.join(this.enhancedConfig.appDir, "bitcoin-data"), // Docker data dir
        };

        // Reinitialize EVERYTHING with Docker settings
        this.bitcoinRpcClient = new BitcoinRpcClient(dockerRpcConfig);
        this.bitcoinService = new BitcoinService(this.bitcoinRpcClient, true);
        this.caravanService = new CaravanService(
          this.bitcoinRpcClient,
          this.enhancedConfig.caravanDir,
          this.enhancedConfig.keysDir,
        );
        this.transactionService = new TransactionService(
          this.bitcoinRpcClient,
          true,
        );

        // Update command modules with new services
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

        console.log(
          chalk.dim("Using Docker connection: http://localhost:8080\n"),
        );
      } else {
        console.log(chalk.yellow("⚠️  Docker container not running\n"));

        const startDocker = await confirm({
          message: "Start complete Docker setup (Container + Nginx + Wallet)?",
          default: true,
        });

        if (startDocker) {
          try {
            await this.dockerService.completeSetup(
              this.enhancedConfig?.sharedConfig,
            );

            // After successful setup, configure RPC client
            const dockerRpcConfig = {
              protocol: "http",
              host: "localhost",
              port: 8080,
              user: this.enhancedConfig.sharedConfig?.bitcoin.rpcUser || "user",
              pass:
                this.enhancedConfig.sharedConfig?.bitcoin.rpcPassword || "pass",
              dataDir: path.join(this.enhancedConfig.appDir, "bitcoin-data"),
            };

            // Reinitialize all services
            this.bitcoinRpcClient = new BitcoinRpcClient(dockerRpcConfig);
            this.bitcoinService = new BitcoinService(
              this.bitcoinRpcClient,
              true,
            );
            this.caravanService = new CaravanService(
              this.bitcoinRpcClient,
              this.enhancedConfig.caravanDir,
              this.enhancedConfig.keysDir,
            );
            this.transactionService = new TransactionService(
              this.bitcoinRpcClient,
              true,
            );

            // Update command modules
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
          } catch (error: any) {
            console.log(chalk.red("Failed to start Docker:", error.message));
          }
        }
      }
    } else {
      // === MANUAL MODE ===
      console.log(chalk.yellow("\n🔧 Using Manual mode\n"));
      console.log(chalk.dim("Connecting to existing Bitcoin Core node...\n"));

      // Already initialized with manual config in constructor
      // No changes needed - use existing configuration
    }

    // Display header with current configuration
    this.displayHeader();

    // Check if Bitcoin Core is accessible
    const bitcoinCoreRunning = await this.checkBitcoinCore();

    if (!bitcoinCoreRunning) {
      console.log(chalk.red("\n❌ Could not connect to Bitcoin Core\n"));

      if (isDockerMode && this.dockerService) {
        console.log(chalk.yellow("Try: Docker Management → Complete Setup\n"));
      } else {
        console.log(chalk.yellow("Please start Bitcoin Core manually\n"));
        this.setupWizard.displayManualModeInstructions();
      }
    } else {
      console.log(chalk.green("✓ Connected to Bitcoin Core\n"));
    }

    // Start the main menu
    const mainMenu = new MainMenu(this);
    await mainMenu.start();
  }

  /**
   * Display header with current configuration
   */
  private displayHeader(): void {
    const config = this.enhancedConfig || this.configManager.getConfig();

    console.log(chalk.bold.cyan("\n=== Caravan-X ==="));

    if (this.enhancedConfig?.mode === "docker") {
      console.log(chalk.bold.green("\n🐳 DOCKER MODE"));
      console.log(chalk.cyan("━".repeat(70)));
      console.log(chalk.white("Bitcoin RPC Connection:"));
      console.log(chalk.dim("  Protocol:         ") + chalk.white("http"));
      console.log(chalk.dim("  Host:             ") + chalk.white("localhost"));
      console.log(
        chalk.dim("  Port:             ") +
          chalk.white("8080") +
          chalk.dim(" (nginx proxy)"),
      );
      console.log(
        chalk.dim("  Direct Port:      ") +
          chalk.white(this.enhancedConfig.docker?.ports.rpc || "18448"),
      );
      console.log(
        chalk.dim("  User:             ") +
          chalk.white(
            this.enhancedConfig.sharedConfig?.bitcoin.rpcUser || "user",
          ),
      );
      console.log(
        chalk.dim("  Wallet Name:      ") +
          chalk.white(
            this.enhancedConfig.sharedConfig?.walletName || "caravan_watcher",
          ),
      );

      console.log(chalk.white("\nDocker Configuration:"));
      console.log(
        chalk.dim("  Container:        ") +
          chalk.white(this.enhancedConfig.docker?.containerName),
      );
      console.log(
        chalk.dim("  Network:          ") +
          chalk.white(this.enhancedConfig.docker?.network),
      );
      console.log(
        chalk.dim("  Data Directory:   ") +
          chalk.white(path.join(this.enhancedConfig.appDir, "bitcoin-data")),
      );

      console.log(chalk.white("\nApplication Directories:"));
      console.log(
        chalk.dim("  App Directory:    ") + chalk.white(config.appDir),
      );
      console.log(
        chalk.dim("  Wallets:          ") + chalk.white(config.caravanDir),
      );
      console.log(
        chalk.dim("  Keys:             ") + chalk.white(config.keysDir),
      );
      console.log(chalk.cyan("━".repeat(70)));
    } else {
      console.log(chalk.bold.yellow("\n🔧 MANUAL MODE"));
      console.log(chalk.cyan("━".repeat(70)));
      console.log(chalk.white("Bitcoin RPC Settings:"));
      console.log(
        chalk.dim("  Protocol:         ") +
          chalk.white(config.bitcoin.protocol),
      );
      console.log(
        chalk.dim("  Host:             ") + chalk.white(config.bitcoin.host),
      );
      console.log(
        chalk.dim("  Port:             ") + chalk.white(config.bitcoin.port),
      );
      console.log(
        chalk.dim("  User:             ") + chalk.white(config.bitcoin.user),
      );
      console.log(
        chalk.dim("  Data Directory:   ") + chalk.white(config.bitcoin.dataDir),
      );

      console.log(chalk.white("\nApplication Directories:"));
      console.log(
        chalk.dim("  App Directory:    ") + chalk.white(config.appDir),
      );
      console.log(
        chalk.dim("  Wallets:          ") + chalk.white(config.caravanDir),
      );
      console.log(
        chalk.dim("  Keys:             ") + chalk.white(config.keysDir),
      );
      console.log(chalk.cyan("━".repeat(70)));
    }
  }

  /**
   * Load enhanced configuration
   */
  private async loadEnhancedConfig(): Promise<EnhancedAppConfig | undefined> {
    try {
      const config = this.configManager.getConfig();
      const enhancedConfigPath = path.join(config.appDir, "config.json");

      if (await fs.pathExists(enhancedConfigPath)) {
        return await fs.readJson(enhancedConfigPath);
      }
    } catch (error) {
      console.error("Error loading enhanced config:", error);
    }

    return undefined;
  }

  /**
   * Reinitialize services with new configuration
   */
  private async reinitializeWithConfig(
    config: EnhancedAppConfig,
  ): Promise<void> {
    // Update config manager
    this.configManager.updateBitcoinConfig({
      protocol: config.bitcoin.protocol,
      host: config.bitcoin.host,
      port: config.bitcoin.port,
      user: config.bitcoin.user,
      pass: config.bitcoin.pass,
      dataDir: config.bitcoin.dataDir,
    });

    // Reinitialize RPC client
    this.bitcoinRpcClient = new BitcoinRpcClient(config.bitcoin);

    // Reinitialize services
    this.bitcoinService = new BitcoinService(this.bitcoinRpcClient, true);
    this.snapshotService = new SnapshotService(
      this.bitcoinRpcClient,
      config.snapshots.directory,
      config.bitcoin.dataDir,
    );
    this.scenarioService = new ScenarioService(
      this.bitcoinService,
      this.caravanService,
      this.transactionService,
      this.bitcoinRpcClient,
      config.scenariosDir,
    );
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
