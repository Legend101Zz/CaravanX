import { ConfigManager } from "./core/config";
import { BitcoinRpcClient } from "./core/rpc";
import { BitcoinService } from "./core/bitcoin";
import { CaravanService } from "./core/caravan";
import { TransactionService } from "./core/transaction";
import { DockerService } from "./core/docker";
import { SnapshotService } from "./core/snapshot";
import { ScenarioService } from "./core/scenario";
import { EnvironmentService } from "./core/environment";

import {
  EnhancedAppConfig,
  SetupMode,
  StartupChoices,
  ConfigProfile,
  ProfilesIndex,
} from "./types/config";

import { WalletCommands } from "./commands/wallet";
import { MultisigCommands } from "./commands/multisig";
import { TransactionCommands } from "./commands/transaction";
import { VisualizationCommands } from "./commands/visualizations";
import { ScriptCommands } from "./commands/scripts";
import { EnvironmentCommands } from "./commands/environment";

import { MainMenu } from "./ui/mainMenu";
import { SetupWizard } from "./ui/setupWizard";
import { ProfileManager } from "./core/profiles";
import { CaravanXError } from "./utils/errors";
import { log, parseLogLevel } from "./utils/logger";

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
  public environmentCommands!: EnvironmentCommands;

  public setupWizard: SetupWizard;
  public dockerService?: DockerService;
  public snapshotService: SnapshotService;
  public scenarioService: ScenarioService;
  public enhancedConfig?: EnhancedAppConfig;
  private profileManager!: ProfileManager;

  public environmentService!: EnvironmentService;

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
    this.displayWelcomeBanner();

    // STEP 1: Ask for base directory
    const baseDirectory = await this.askForBaseDirectory();

    // Initialize profile manager with the base directory
    this.profileManager = new ProfileManager(baseDirectory);
    await this.profileManager.initialize();

    // Initialize logger from saved config (CLI flags may override later)
    const savedConfigPath = path.join(baseDirectory, "config.json");
    if (await fs.pathExists(savedConfigPath)) {
      try {
        const savedConfig = await fs.readJson(savedConfigPath);
        if (savedConfig.logging) {
          await log.init({
            level: parseLogLevel(savedConfig.logging.level),
            fileLogging: savedConfig.logging.fileLogging ?? true,
            logDir:
              savedConfig.logging.logDir || path.join(baseDirectory, "logs"),
          });
        }
      } catch {
        // config doesn't exist yet, logger stays at defaults
      }
    }

    // STEP 2: Ask for mode (Docker or Manual)
    const mode = await this.askForMode();

    // STEP 3: Check for existing configurations for this mode
    let enhancedConfig: EnhancedAppConfig;
    let justCompletedSetup = false;

    const existingProfiles = await this.profileManager.getProfilesByMode(mode);

    if (existingProfiles.length > 0) {
      // Show existing configurations and ask user what to do
      const choice = await this.askExistingConfigChoice(existingProfiles, mode);

      if (choice.action === "use_existing") {
        // Load the selected profile
        const profile = await this.profileManager.getProfile(choice.profileId!);
        if (profile) {
          enhancedConfig = profile.config;
          await this.profileManager.setActiveProfile(profile.id);
          console.log(
            chalk.green(`\n✅ Loaded configuration: ${profile.name}\n`),
          );
        } else {
          throw new Error("Failed to load selected profile");
        }
      } else if (choice.action === "new") {
        // Create new configuration
        enhancedConfig = await this.runSetupWizardForMode(mode, baseDirectory);
        justCompletedSetup = true;

        // Ask if they want to save as a new profile or replace
        const profileName = await input({
          message: "Name for this configuration:",
          default: `${mode === SetupMode.DOCKER ? "Docker" : "Manual"} Config ${existingProfiles.length + 1}`,
        });

        const newProfile = await this.profileManager.createProfile(
          profileName,
          mode,
          enhancedConfig,
        );
        await this.profileManager.setActiveProfile(newProfile.id);
      } else {
        // Delete and recreate
        for (const profile of existingProfiles) {
          await this.profileManager.deleteProfile(profile.id);
        }

        enhancedConfig = await this.runSetupWizardForMode(mode, baseDirectory);
        justCompletedSetup = true;

        const profileName = await input({
          message: "Name for this configuration:",
          default: `${mode === SetupMode.DOCKER ? "Docker" : "Manual"} Config`,
        });

        const newProfile = await this.profileManager.createProfile(
          profileName,
          mode,
          enhancedConfig,
        );
        await this.profileManager.setActiveProfile(newProfile.id);
      }
    } else {
      // No existing profiles, run setup
      console.log(
        chalk.cyan(
          `\n📋 No existing ${mode} configuration found. Let's set one up!\n`,
        ),
      );

      enhancedConfig = await this.runSetupWizardForMode(mode, baseDirectory);
      justCompletedSetup = true;

      const profileName = await input({
        message: "Name for this configuration:",
        default: `${mode === SetupMode.DOCKER ? "Docker" : "Manual"} Config`,
      });

      const newProfile = await this.profileManager.createProfile(
        profileName,
        mode,
        enhancedConfig,
      );
      await this.profileManager.setActiveProfile(newProfile.id);
    }

    this.enhancedConfig = enhancedConfig;

    // Also save to the legacy config.json location for compatibility
    const legacyConfigPath = path.join(enhancedConfig.appDir, "config.json");
    await fs.writeJson(legacyConfigPath, enhancedConfig, { spaces: 2 });

    // Initialize services with the configuration
    await this.reinitializeWithConfig(enhancedConfig);

    // Verify connection if not just completed setup
    if (!justCompletedSetup) {
      await this.verifyBitcoinConnection();
    } else {
      console.clear();
      console.log(chalk.green("\n✅ Setup complete! Starting Caravan-X...\n"));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Start main menu
    const mainMenu = new MainMenu(this);
    await mainMenu.start();
  }

  /**
   * Ask user for base directory
   */
  private async askForBaseDirectory(): Promise<string> {
    const homeDir = process.env.HOME || "~";
    const defaultDir = path.join(homeDir, ".caravan-x");

    console.log(
      boxen(
        chalk.white.bold("📁 Choose Your Caravan-X Directory\n\n") +
          chalk.gray(
            "This is where all your configurations, wallets, and data will be stored.\n\n",
          ) +
          chalk.cyan("Default: ") +
          chalk.white(defaultDir),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "cyan",
        },
      ),
    );

    const useDefault = await confirm({
      message: `Use default directory (${defaultDir})?`,
      default: true,
    });

    let chosenDir: string;

    if (useDefault) {
      chosenDir = defaultDir;
    } else {
      chosenDir = await input({
        message: "Enter your preferred directory path:",
        default: defaultDir,
        validate: (inputPath) => {
          if (!inputPath.trim()) {
            return "Directory path cannot be empty";
          }
          // Expand ~ to home directory
          const expandedPath = inputPath.startsWith("~")
            ? path.join(homeDir, inputPath.slice(1))
            : inputPath;

          // Check if it's an absolute path or can be resolved
          if (!path.isAbsolute(expandedPath)) {
            return "Please enter an absolute path";
          }
          return true;
        },
      });

      // Expand ~ if present
      if (chosenDir.startsWith("~")) {
        chosenDir = path.join(homeDir, chosenDir.slice(1));
      }
    }

    // Ensure directory exists
    await fs.ensureDir(chosenDir);
    console.log(chalk.green(`\n✅ Using directory: ${chosenDir}\n`));

    return chosenDir;
  }

  /**
   * Ask user for mode selection
   */
  private async askForMode(): Promise<SetupMode> {
    console.log(
      boxen(
        chalk.white.bold("🔧 Select Operation Mode\n\n") +
          chalk.cyan("🐳 Docker Mode") +
          chalk.gray(" (Recommended)\n") +
          chalk.dim("   • Automatic Bitcoin Core setup in Docker\n") +
          chalk.dim("   • No manual configuration needed\n") +
          chalk.dim("   • Isolated environment\n\n") +
          chalk.yellow("⚙️  Manual Mode\n") +
          chalk.dim("   • Use your own Bitcoin Core installation\n") +
          chalk.dim("   • Full control over configuration\n") +
          chalk.dim("   • Requires running bitcoind separately"),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "cyan",
        },
      ),
    );

    const mode = await select({
      message: "Choose your mode:",
      choices: [
        {
          name: chalk.cyan("🐳 Docker Mode") + chalk.gray(" (Recommended)"),
          value: SetupMode.DOCKER,
        },
        {
          name: chalk.yellow("⚙️  Manual Mode"),
          value: SetupMode.MANUAL,
        },
      ],
    });

    return mode;
  }

  /**
   * Ask user what to do with existing configurations
   */
  private async askExistingConfigChoice(
    profiles: ProfilesIndex["profiles"],
    mode: SetupMode,
  ): Promise<{
    action: "use_existing" | "new" | "delete_and_new";
    profileId?: string;
  }> {
    const modeLabel = mode === SetupMode.DOCKER ? "Docker" : "Manual";

    console.log(
      boxen(
        chalk.white.bold(
          `📋 Existing ${modeLabel} Configuration(s) Found\n\n`,
        ) +
          profiles
            .map(
              (p, i) =>
                chalk.cyan(`${i + 1}. ${p.name}\n`) +
                chalk.dim(
                  `   Created: ${new Date(p.createdAt).toLocaleDateString()}\n`,
                ) +
                chalk.dim(
                  `   Last used: ${new Date(p.lastUsedAt).toLocaleDateString()}`,
                ),
            )
            .join("\n\n"),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "cyan",
        },
      ),
    );

    const action = await select({
      message: "What would you like to do?",
      choices: [
        {
          name:
            chalk.green("📂 Use existing configuration") +
            (profiles.length > 1 ? chalk.gray(" (choose which one)") : ""),
          value: "use_existing",
        },
        {
          name:
            chalk.cyan("➕ Create new configuration") +
            chalk.gray(" (keep existing)"),
          value: "new",
        },
        {
          name:
            chalk.red("🗑️  Start fresh") +
            chalk.gray(" (delete existing and create new)"),
          value: "delete_and_new",
        },
      ],
    });

    if (action === "use_existing") {
      if (profiles.length === 1) {
        return { action: "use_existing", profileId: profiles[0].id };
      }

      // Let user select which profile
      const selectedId = await select({
        message: "Select configuration to use:",
        choices: profiles.map((p) => ({
          name: `${p.name} (Last used: ${new Date(p.lastUsedAt).toLocaleDateString()})`,
          value: p.id,
        })),
      });
      //@ts-ignore
      return { action: "use_existing", profileId: selectedId };
    }
    //@ts-ignore
    return { action };
  }

  /**
   * Run setup wizard for a specific mode
   */
  private async runSetupWizardForMode(
    mode: SetupMode,
    baseDirectory: string,
  ): Promise<EnhancedAppConfig> {
    // Update appDir to use the chosen base directory
    const appDir = baseDirectory;

    if (mode === SetupMode.DOCKER) {
      return await this.setupDockerModeWithDir(mode, appDir);
    } else {
      return await this.setupManualModeWithDir(appDir);
    }
  }

  /**
   * Docker mode setup using specified directory
   */
  private async setupDockerModeWithDir(
    mode: SetupMode,
    appDir: string,
  ): Promise<EnhancedAppConfig> {
    const wizard = new SetupWizard(appDir);
    return await wizard.setupDockerMode();
  }

  /**
   * Manual mode setup using specified directory
   */
  private async setupManualModeWithDir(
    appDir: string,
  ): Promise<EnhancedAppConfig> {
    const wizard = new SetupWizard(appDir);
    return await wizard.setupManualMode();
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

    this.environmentService = new EnvironmentService(
      this.bitcoinRpcClient,
      this.caravanService,
      this.bitcoinService,
      config,
      this.dockerService || undefined,
    );

    this.environmentCommands = new EnvironmentCommands(
      this.environmentService,
      this.bitcoinRpcClient,
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
    log.displayError(CaravanXError.from(error));
    process.exit(1);
  });
}

// Export for use in other files
export default CaravanRegtestManager;
