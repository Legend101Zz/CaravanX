import { ConfigManager } from "./core/config";
import { BitcoinRpcClient } from "./core/rpc";
import { BitcoinService } from "./core/bitcoin";
import { CaravanService } from "./core/caravan";
import { TransactionService } from "./core/transaction";
import { DockerService } from "./core/docker";
import { SnapshotService } from "./core/snapshot";
import { ScenarioService } from "./core/scenario";
import { EnhancedAppConfig, SetupMode } from "./types/config";
import { WalletCommands } from "./commands/wallet";
import { MultisigCommands } from "./commands/multisig";
import { TransactionCommands } from "./commands/transaction";
import { VisualizationCommands } from "./commands/visualizations";
import { ScriptCommands } from "./commands/scripts";
import { MainMenu } from "./ui/mainMenu";
import { SetupWizard } from "./ui/setupWizard";

import { confirm, input, number, select } from "@inquirer/prompts";
import chalk from "chalk";
import boxen from "boxen";
import figlet from "figlet";
import path from "path";
import fs from "fs-extra";
import ora from "ora";
import gradient from "gradient-string";
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
    this.bitcoinService = new BitcoinService(this.bitcoinRpcClient, true);
    this.caravanService = new CaravanService(
      this.bitcoinRpcClient,
      config.caravanDir,
      config.keysDir,
    );
    this.transactionService = new TransactionService(
      this.bitcoinRpcClient,
      true,
    );

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
      )) as { chain: string };
      return blockchainInfo && blockchainInfo.chain === "regtest";
    } catch (error: any) {
      return false;
    }
  }

  /**
   * Main application startup
   */
  async start(): Promise<void> {
    console.clear();

    // Display welcome banner
    this.displayWelcomeBanner();

    // Load or create configuration
    this.enhancedConfig = await this.loadEnhancedConfig();

    let needsSetup = !this.enhancedConfig;
    let justCompletedSetup = false; // Track if we just did setup

    // If config exists, ask if user wants to reconfigure
    if (this.enhancedConfig) {
      console.log(
        boxen(
          chalk.white.bold("Existing Configuration Found\n\n") +
            chalk.gray("Mode: ") +
            this.getModeBadge(this.enhancedConfig.mode) +
            "\n" +
            chalk.gray("Bitcoin RPC: ") +
            chalk.white(
              `${this.enhancedConfig.bitcoin.host}:${this.enhancedConfig.bitcoin.port}`,
            ),
          {
            padding: 1,
            margin: 1,
            borderStyle: "round",
            borderColor: "cyan",
          },
        ),
      );

      const reconfigure = await confirm({
        message: "Would you like to reconfigure?",
        default: false,
      });

      needsSetup = reconfigure;
    }

    // Run setup if needed
    if (needsSetup) {
      try {
        this.enhancedConfig = await this.runSetupWizard();
        await this.reinitializeWithConfig(this.enhancedConfig);
        justCompletedSetup = true;
      } catch (error: any) {
        console.log(chalk.red("\n❌ Setup failed:", error.message));
        process.exit(1);
      }
    } else {
      // Initialize with existing config
      await this.reinitializeWithConfig(this.enhancedConfig!);
    }

    // Check Bitcoin Core connection ONLY if we didn't just complete setup
    // (setup already tested the connection)
    if (!justCompletedSetup) {
      await this.verifyBitcoinConnection();
    } else {
      // Just cleared the screen and show we're ready
      console.clear();
      console.log(chalk.green("\n✅ Setup complete! Starting Caravan-X...\n"));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Start main menu
    const mainMenu = new MainMenu(this);
    await mainMenu.start();
  }

  /**
   * Display welcome banner
   */
  private displayWelcomeBanner(): void {
    try {
      // Create a gradient using Bitcoin orange to blue
      const logoGradient = gradient(["#F7931A", "#F7931A", "#00ACED"]);

      // Generate the figlet text
      const figletText = figlet.textSync("Caravan - X", {
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
      console.log(colors.muted("━".repeat(70)));
      console.log(colors.muted("━".repeat(70)) + "\n");
      // Add the subtitle with accent color
      console.log(
        colors.accent("========== R E G T E S T   M O D E =========="),
      );
      console.log(
        colors.muted("A terminal-based utility for Caravan in regtest mode\n"),
      );
    } catch (error) {
      console.log(
        chalk.cyan(
          figlet.textSync("Caravan-X", {
            font: "Standard",
            horizontalLayout: "default",
          }),
        ),
      );
      console.log(chalk.gray("Bitcoin Multisig Development Testing Tool\n"));
    }
  }

  /**
   * Run the setup wizard
   */
  private async runSetupWizard(): Promise<EnhancedAppConfig> {
    // Ask for mode
    const mode = await this.selectMode();

    if (mode === SetupMode.DOCKER) {
      return await this.setupDockerMode(mode);
    } else {
      return await this.setupManualMode();
    }
  }

  /**
   * Select operation mode
   */
  private async selectMode(): Promise<SetupMode> {
    const mode = await select({
      message: "Select operation mode:",
      choices: [
        {
          name: chalk.cyan("🐳 Docker Mode") + chalk.gray(" (Recommended)"),
          value: SetupMode.DOCKER,
          description:
            "Automated regtest environment with Docker. Easy setup, no manual configuration needed.",
        },
        {
          name: chalk.yellow("⚙️  Manual Mode"),
          value: SetupMode.MANUAL,
          description:
            "Use your own Bitcoin Core node. You manage the node yourself.",
        },
      ],
    });

    return mode;
  }

  /**
   * Setup Docker mode configuration and optionally start containers
   */
  private async setupDockerMode(mode: SetupMode): Promise<EnhancedAppConfig> {
    console.log(
      boxen(
        chalk.white.bold("🐳 Docker Mode Configuration\n\n") +
          chalk.gray("Caravan-X will:\n") +
          chalk.white("  • Create a Bitcoin Core regtest container\n") +
          chalk.white("  • Configure RPC authentication\n") +
          chalk.white("  • Set up nginx proxy for easy access\n") +
          chalk.white("  • Generate initial blockchain\n") +
          chalk.white("  • Create watch-only wallet\n\n") +
          chalk.cyan("Access via: ") +
          chalk.green.bold("http://localhost:8080"),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "cyan",
        },
      ),
    );

    const proceed = await confirm({
      message: "Proceed with Docker setup?",
      default: true,
    });

    if (!proceed) {
      console.log(chalk.gray("\nSetup cancelled"));
      process.exit(0);
    }

    // Run the full setup wizard to get configuration
    const config = await this.setupWizard.run(mode);

    return config;
  }

  /**
   * Setup Manual mode
   */
  private async setupManualMode(): Promise<EnhancedAppConfig> {
    console.log(
      boxen(
        chalk.yellow.bold("⚠️  Manual Mode\n\n") +
          chalk.white("You are responsible for:\n") +
          chalk.gray("  • Running Bitcoin Core yourself\n") +
          chalk.gray("  • Managing the blockchain\n") +
          chalk.gray("  • RPC configuration\n\n") +
          chalk.cyan("Caravan-X will NOT manage your node"),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "yellow",
        },
      ),
    );

    // Check for existing Bitcoin config
    const config = this.configManager.getConfig();
    let bitcoinConfig = config.bitcoin;

    const hasExisting = await this.testBitcoinConnection(
      bitcoinConfig.host,
      bitcoinConfig.port,
      bitcoinConfig.user,
      bitcoinConfig.pass,
    );

    if (hasExisting) {
      console.log(
        boxen(
          chalk.white.bold("Existing Bitcoin Configuration:\n\n") +
            chalk.gray("Host: ") +
            chalk.white(bitcoinConfig.host) +
            "\n" +
            chalk.gray("Port: ") +
            chalk.white(bitcoinConfig.port) +
            "\n" +
            chalk.gray("User: ") +
            chalk.white(bitcoinConfig.user),
          {
            padding: 1,
            margin: 1,
            borderStyle: "round",
            borderColor: "green",
          },
        ),
      );

      const useExisting = await confirm({
        message: "Use existing configuration?",
        default: true,
      });

      if (!useExisting) {
        bitcoinConfig = await this.getBitcoinConfig();
      }
    } else {
      console.log(chalk.yellow("\n⚠️  No existing connection found\n"));
      bitcoinConfig = await this.getBitcoinConfig();
    }

    // Test the connection
    const spinner = ora("Testing connection to Bitcoin Core...").start();
    const connected = await this.testBitcoinConnection(
      bitcoinConfig.host,
      bitcoinConfig.port,
      bitcoinConfig.user,
      bitcoinConfig.pass,
    );

    if (!connected) {
      spinner.fail(chalk.red("Connection failed"));
      console.log(
        boxen(
          chalk.red.bold("⚠️  Cannot Connect to Bitcoin Core\n\n") +
            chalk.white("Please ensure:\n") +
            chalk.gray("  • Bitcoin Core is running\n") +
            chalk.gray("  • RPC credentials are correct\n") +
            chalk.gray("  • Using regtest network\n\n") +
            chalk.yellow("Start your node with:\n") +
            chalk.cyan("  bitcoind -regtest -daemon\n") +
            chalk.cyan(
              "  bitcoind -regtest -server -rpcuser=user -rpcpassword=pass",
            ),
          {
            padding: 1,
            margin: 1,
            borderStyle: "round",
            borderColor: "red",
          },
        ),
      );
      process.exit(1);
    }

    spinner.succeed(chalk.green("Connected to Bitcoin Core"));

    // Create enhanced config
    const enhancedConfig: EnhancedAppConfig = {
      mode: SetupMode.MANUAL,
      bitcoin: bitcoinConfig,
      appDir: config.appDir,
      caravanDir: config.caravanDir,
      keysDir: config.keysDir,
      snapshots: {
        enabled: false, // Disable snapshots in manual mode
        directory: path.join(config.appDir, "snapshots"),
        autoSnapshot: false,
      },
      scenariosDir: path.join(config.appDir, "scenarios"),
    };

    // Save config
    const configPath = path.join(config.appDir, "config.json");
    await fs.ensureDir(config.appDir);
    await fs.writeJson(configPath, enhancedConfig, { spaces: 2 });

    return enhancedConfig;
  }

  /**
   * Get Bitcoin RPC configuration from user
   */
  private async getBitcoinConfig() {
    console.log(chalk.white("\n🔧 Bitcoin Core Configuration\n"));

    const host = await input({
      message: "Bitcoin RPC host:",
      default: "127.0.0.1",
    });

    const port = await number({
      message: "Bitcoin RPC port:",
      default: 18443,
    });

    const user = await input({
      message: "RPC username:",
      default: "user",
    });

    const pass = await input({
      message: "RPC password:",
      default: "pass",
    });

    const dataDir = await input({
      message: "Bitcoin data directory:",
      default: path.join(process.env.HOME || "~", ".bitcoin"),
    });

    return {
      protocol: "http",
      host,
      port: port!,
      user,
      pass,
      dataDir,
    };
  }

  /**
   * Test Bitcoin Core connection
   */
  private async testBitcoinConnection(
    host: string,
    port: number,
    user: string,
    pass: string,
  ): Promise<boolean> {
    try {
      const testRpc = new BitcoinRpcClient({
        protocol: "http",
        host,
        port,
        user,
        pass,
        dataDir: "",
      });

      const info = await testRpc.callRpc("getblockchaininfo");
      return !!info;
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify Bitcoin connection and display status
   */
  private async verifyBitcoinConnection(): Promise<void> {
    console.clear();
    this.displayHeader();

    const spinner = ora("Connecting to Bitcoin Core...").start();
    const connected = await this.checkBitcoinCore();

    if (!connected) {
      spinner.fail(chalk.red("Could not connect to Bitcoin Core"));

      if (
        this.enhancedConfig?.mode === SetupMode.DOCKER &&
        this.dockerService
      ) {
        console.log(
          boxen(
            chalk.yellow.bold("⚠️  Docker Container Not Running\n\n") +
              chalk.white("Try: ") +
              chalk.cyan("Docker Management → Start Container\n") +
              chalk.gray("Or restart Caravan-X to reconfigure"),
            {
              padding: 1,
              margin: 1,
              borderStyle: "round",
              borderColor: "yellow",
            },
          ),
        );
      } else {
        console.log(
          boxen(
            chalk.red.bold("⚠️  Bitcoin Core Not Running\n\n") +
              chalk.white("Start your node with:\n") +
              chalk.cyan("  bitcoind -regtest -daemon"),
            {
              padding: 1,
              margin: 1,
              borderStyle: "round",
              borderColor: "red",
            },
          ),
        );
      }

      await input({ message: "Press Enter to continue anyway..." });
    } else {
      spinner.succeed(chalk.green("Connected to Bitcoin Core"));
    }
  }

  /**
   * Display header with current configuration
   */
  private displayHeader(): void {
    const config = this.enhancedConfig || this.configManager.getConfig();

    console.log(chalk.cyan("━".repeat(70)));
    console.log(
      chalk.cyan.bold("  CARAVAN-X") +
        chalk.gray("  │  ") +
        this.getModeBadge(this.enhancedConfig?.mode || SetupMode.MANUAL),
    );
    console.log(chalk.cyan("━".repeat(70)));

    if (this.enhancedConfig?.mode === SetupMode.DOCKER) {
      console.log(chalk.white("\n Bitcoin RPC:"));
      console.log(
        chalk.dim("  URL:    ") + chalk.white("http://localhost:8080"),
      );
      console.log(chalk.dim("  User:   ") + chalk.white(config.bitcoin.user));
    } else {
      console.log(chalk.white("\nBitcoin RPC:"));
      console.log(
        chalk.dim("  Host:   ") +
          chalk.white(`${config.bitcoin.host}:${config.bitcoin.port}`),
      );
      console.log(chalk.dim("  User:   ") + chalk.white(config.bitcoin.user));
    }
    console.log(chalk.cyan("━".repeat(70)) + "\n");
  }

  /**
   * Get mode badge for display
   */
  private getModeBadge(mode: SetupMode): string {
    if (mode === SetupMode.DOCKER) {
      return chalk.bgCyan.black.bold(" 🐳 DOCKER ");
    } else {
      return chalk.bgYellow.black.bold(" ⚙️  MANUAL ");
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
      // Config doesn't exist yet
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
    this.configManager.updateBitcoinConfig(config.bitcoin);

    // Reinitialize RPC client
    this.bitcoinRpcClient = new BitcoinRpcClient(config.bitcoin);

    // Reinitialize services
    this.bitcoinService = new BitcoinService(this.bitcoinRpcClient, true);
    this.caravanService = new CaravanService(
      this.bitcoinRpcClient,
      config.caravanDir,
      config.keysDir,
    );
    this.transactionService = new TransactionService(
      this.bitcoinRpcClient,
      true,
    );
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

    // Initialize Docker service if in Docker mode
    if (config.mode === SetupMode.DOCKER && config.docker) {
      this.dockerService = new DockerService(
        config.docker,
        path.join(config.appDir, "docker-data"),
      );
    }

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
  }

  /**
   * Set up Bitcoin Core connection configuration interactively
   */
  async setupBitcoinConfig(): Promise<void> {
    console.log(chalk.cyan("\n=== Bitcoin Core Configuration ===\n"));

    const currentConfig = this.enhancedConfig || this.configManager.getConfig();

    const protocol = await input({
      message: "Enter RPC protocol (http/https):",
      default: currentConfig.bitcoin.protocol,
    });

    const host = await input({
      message: "Enter RPC host:",
      default: currentConfig.bitcoin.host,
    });

    const port = await number({
      message: "Enter RPC port:",
      default: currentConfig.bitcoin.port,
    });

    const user = await input({
      message: "Enter RPC username:",
      default: currentConfig.bitcoin.user,
    });

    const pass = await input({
      message: "Enter RPC password:",
      default: currentConfig.bitcoin.pass,
    });

    const dataDir = await input({
      message: "Enter Bitcoin data directory:",
      default: currentConfig.bitcoin.dataDir,
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

    // If we have enhanced config, update that too
    if (this.enhancedConfig) {
      this.enhancedConfig.bitcoin = {
        protocol,
        host,
        port: port!,
        user,
        pass,
        dataDir,
      };

      // Save enhanced config
      const config = this.configManager.getConfig();
      const configPath = path.join(config.appDir, "config.json");
      await fs.writeJson(configPath, this.enhancedConfig, { spaces: 2 });
    }

    // Reinitialize services with new config
    await this.reinitializeWithConfig(
      this.enhancedConfig || (this.configManager.getConfig() as any),
    );

    console.log(chalk.green("\n✓ Configuration updated successfully!"));
    await input({ message: "Press Enter to continue..." });
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
