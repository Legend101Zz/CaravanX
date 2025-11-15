/**
 * Setup Wizard for Caravan-X
 * Interactive setup for first-time users and configuration changes
 */

import { select, input, confirm, number, checkbox } from "@inquirer/prompts";
import chalk from "chalk";
import boxen from "boxen";
import figlet from "figlet";
import ora from "ora";
import * as fs from "fs-extra";
import * as path from "path";
import {
  SetupMode,
  SharedConfig,
  EnhancedAppConfig,
  DEFAULT_DOCKER_CONFIG,
  BUILT_IN_SCENARIOS,
} from "../types/config";
import { DockerService } from "../core/docker";
import { colors } from "../utils/terminal";

export class SetupWizard {
  private appDir: string;
  private configPath: string;

  constructor(appDir: string) {
    this.appDir = appDir;
    this.configPath = path.join(appDir, "config.json");

    // Ensure app directory exists
    fs.ensureDirSync(appDir);
  }

  /**
   * Check if this is first-time setup
   */
  async isFirstTimeSetup(): Promise<boolean> {
    return !(await fs.pathExists(this.configPath));
  }

  /**
   * Run the setup wizard
   */
  async run(): Promise<EnhancedAppConfig> {
    console.clear();
    this.displayWelcome();

    const isFirstTime = await this.isFirstTimeSetup();

    if (isFirstTime) {
      console.log(chalk.cyan("\n👋 Welcome to Caravan-X!"));
      console.log(chalk.dim("Let's get you set up...\n"));
    } else {
      console.log(chalk.cyan("\n⚙️  Reconfiguring Caravan-X\n"));
    }

    // Step 1: Choose setup mode
    const mode = await this.chooseSetupMode();

    // Step 2: Configure based on mode
    let config: EnhancedAppConfig;

    if (mode === SetupMode.DOCKER) {
      config = await this.setupDockerMode();
    } else {
      config = await this.setupManualMode();
    }

    // Step 3: Choose initial scenarios (optional)
    const includeScenarios = await confirm({
      message: "Would you like to include pre-configured test scenarios?",
      default: true,
    });

    if (includeScenarios) {
      const scenarios = await this.chooseScenarios();
      if (config.sharedConfig) {
        config.sharedConfig.scenarios = scenarios;
      }
    }

    // Step 4: Save configuration
    await this.saveConfig(config);

    // Step 5: Initialize based on mode
    if (mode === SetupMode.DOCKER) {
      await this.initializeDockerMode(config);
    }

    this.displaySuccess(config);

    return config;
  }

  /**
   * Display welcome message
   */
  private displayWelcome(): void {
    console.log(
      chalk.cyan(
        figlet.textSync("Caravan-X", {
          font: "Standard",
          horizontalLayout: "default",
        }),
      ),
    );

    console.log(
      boxen(
        chalk.white.bold("The Ultimate Bitcoin Regtest Development Tool\n\n") +
          chalk.dim("• Full regtest environment\n") +
          chalk.dim("• Docker or Manual setup\n") +
          chalk.dim("• Snapshot & Restore\n") +
          chalk.dim("• Pre-configured scenarios\n") +
          chalk.dim("• Multisig wallet testing"),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "cyan",
        },
      ),
    );
  }

  /**
   * Choose setup mode
   */
  private async chooseSetupMode(): Promise<SetupMode> {
    const mode = await select({
      message: "How would you like to run Bitcoin Core?",
      choices: [
        {
          name: "🐳 Docker Mode (Recommended)",
          value: SetupMode.DOCKER,
          description:
            "Automatically spin up Bitcoin Core in Docker. Easy setup, isolated environment.",
        },
        {
          name: "🔧 Manual Mode",
          value: SetupMode.MANUAL,
          description:
            "Use your existing Bitcoin Core installation. More control, requires manual setup.",
        },
      ],
    });

    return mode as SetupMode;
  }

  /**
   * Setup Docker mode
   */
  private async setupDockerMode(): Promise<EnhancedAppConfig> {
    console.log(chalk.bold.cyan("\n🐳 Docker Mode Setup\n"));

    // Check if Docker is available
    const dockerService = new DockerService(DEFAULT_DOCKER_CONFIG, this.appDir);
    const dockerAvailable = await dockerService.checkDockerAvailable();

    if (!dockerAvailable) {
      console.log(
        boxen(
          chalk.yellow.bold("⚠️  Docker Not Found\n\n") +
            chalk.white(
              "Docker is required for Docker mode but was not detected on your system.\n\n",
            ) +
            chalk.dim("Please install Docker:\n") +
            chalk.dim(
              "• macOS/Windows: https://www.docker.com/products/docker-desktop\n",
            ) +
            chalk.dim("• Linux: https://docs.docker.com/engine/install/"),
          {
            padding: 1,
            margin: 1,
            borderStyle: "round",
            borderColor: "yellow",
          },
        ),
      );

      const continueAnyway = await confirm({
        message: "Continue anyway? (You can install Docker later)",
        default: false,
      });

      if (!continueAnyway) {
        process.exit(0);
      }
    }

    // Configure Docker settings
    const containerName = await input({
      message: "Docker container name:",
      default: DEFAULT_DOCKER_CONFIG.containerName,
    });

    const rpcPort = await number({
      message: "Bitcoin RPC port:",
      default: DEFAULT_DOCKER_CONFIG.ports.rpc,
    });

    const p2pPort = await number({
      message: "Bitcoin P2P port:",
      default: DEFAULT_DOCKER_CONFIG.ports.p2p,
    });

    const rpcUser = await input({
      message: "RPC username:",
      default: "user",
    });

    const rpcPassword = await input({
      message: "RPC password:",
      default: "pass",
    });

    // Create shared config
    const sharedConfig: SharedConfig = {
      version: "1.0.0",
      name: "default",
      description: "Default Caravan-X Docker configuration",
      mode: SetupMode.DOCKER,
      bitcoin: {
        network: "regtest",
        rpcPort: rpcPort!,
        p2pPort: p2pPort!,
        rpcUser,
        rpcPassword,
      },
      docker: {
        ...DEFAULT_DOCKER_CONFIG,
        containerName,
        ports: {
          rpc: rpcPort!,
          p2p: p2pPort!,
        },
      },
      initialState: {
        blockHeight: 101,
        preGenerateBlocks: true,
        wallets: [],
        transactions: [],
      },
      coordinator: {
        enabled: false,
        port: 5000,
        autoStart: false,
      },
      nginx: {
        enabled: false,
        port: 8080,
        proxyRpc: true,
        proxyCoordinator: true,
      },
      snapshots: {
        enabled: true,
        autoSnapshot: false,
      },
    };

    // Create enhanced config
    const config: EnhancedAppConfig = {
      mode: SetupMode.DOCKER,
      sharedConfig,
      bitcoin: {
        protocol: "http",
        host: "127.0.0.1",
        port: rpcPort!,
        user: rpcUser,
        pass: rpcPassword,
        dataDir: path.join(this.appDir, "bitcoin-data"),
      },
      appDir: this.appDir,
      caravanDir: path.join(this.appDir, "wallets"),
      keysDir: path.join(this.appDir, "keys"),
      docker: sharedConfig.docker,
      snapshots: {
        enabled: true,
        directory: path.join(this.appDir, "snapshots"),
        autoSnapshot: false,
      },
      scenariosDir: path.join(this.appDir, "scenarios"),
    };

    return config;
  }

  /**
   * Setup Manual mode
   */
  private async setupManualMode(): Promise<EnhancedAppConfig> {
    console.log(chalk.bold.cyan("\n🔧 Manual Mode Setup\n"));
    console.log(
      chalk.dim(
        "You'll need to start Bitcoin Core in regtest mode separately.\n",
      ),
    );

    const protocol = await select({
      message: "RPC protocol:",
      choices: [
        { name: "HTTP", value: "http" },
        { name: "HTTPS", value: "https" },
      ],
      default: "http",
    });

    const host = await input({
      message: "RPC host:",
      default: "127.0.0.1",
    });

    const port = await number({
      message: "RPC port:",
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

    // Create shared config
    const sharedConfig: SharedConfig = {
      version: "1.0.0",
      name: "default",
      description: "Default Caravan-X Manual configuration",
      mode: SetupMode.MANUAL,
      bitcoin: {
        network: "regtest",
        rpcPort: port!,
        p2pPort: 18444,
        rpcUser: user,
        rpcPassword: pass,
      },
      initialState: {
        blockHeight: 101,
        preGenerateBlocks: false,
        wallets: [],
        transactions: [],
      },
      snapshots: {
        enabled: true,
        autoSnapshot: false,
      },
    };

    // Create enhanced config
    const config: EnhancedAppConfig = {
      mode: SetupMode.MANUAL,
      sharedConfig,
      bitcoin: {
        protocol: protocol as string,
        host,
        port: port!,
        user,
        pass,
        dataDir,
      },
      appDir: this.appDir,
      caravanDir: path.join(this.appDir, "wallets"),
      keysDir: path.join(this.appDir, "keys"),
      snapshots: {
        enabled: true,
        directory: path.join(this.appDir, "snapshots"),
        autoSnapshot: false,
      },
      scenariosDir: path.join(this.appDir, "scenarios"),
    };

    return config;
  }

  /**
   * Choose scenarios to include
   */
  private async chooseScenarios(): Promise<string[]> {
    const scenarios = await checkbox({
      message: "Select test scenarios to include:",
      choices: Object.values(BUILT_IN_SCENARIOS).map((scenario) => ({
        name: scenario.name,
        value: scenario.id,
        description: scenario.description,
        checked: false,
      })),
    });

    return scenarios;
  }

  /**
   * Initialize Docker mode
   */
  private async initializeDockerMode(config: EnhancedAppConfig): Promise<void> {
    if (!config.docker) {
      return;
    }

    const startNow = await confirm({
      message: "Would you like to start Bitcoin Core now?",
      default: true,
    });

    if (startNow) {
      const dockerService = new DockerService(config.docker, config.appDir);
      await dockerService.startContainer(config.sharedConfig);
    }
  }

  /**
   * Save configuration
   */
  private async saveConfig(config: EnhancedAppConfig): Promise<void> {
    // Ensure all directories exist
    await fs.ensureDir(config.appDir);
    await fs.ensureDir(config.caravanDir);
    await fs.ensureDir(config.keysDir);
    await fs.ensureDir(config.snapshots.directory);
    await fs.ensureDir(config.scenariosDir);

    // Save main config
    await fs.writeJson(this.configPath, config, { spaces: 2 });

    // Save shared config if it exists
    if (config.sharedConfig) {
      const sharedConfigPath = path.join(config.appDir, "shared-config.yaml");
      // TODO: Convert to YAML format for better readability
      await fs.writeJson(sharedConfigPath, config.sharedConfig, { spaces: 2 });
    }
  }

  /**
   * Display success message
   */
  private displaySuccess(config: EnhancedAppConfig): void {
    console.log("\n");
    console.log(
      boxen(
        chalk.green.bold("✅ Setup Complete!\n\n") +
          chalk.white(`Mode: ${chalk.cyan(config.mode)}\n`) +
          chalk.white(
            `Bitcoin RPC: ${chalk.cyan(`${config.bitcoin.host}:${config.bitcoin.port}`)}\n`,
          ) +
          chalk.white(`Data Directory: ${chalk.cyan(config.appDir)}\n\n`) +
          chalk.dim("Run 'caravan-x' to get started!"),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "green",
        },
      ),
    );
  }

  /**
   * Display manual mode instructions
   */
  displayManualModeInstructions(): void {
    console.log("\n");
    console.log(
      boxen(
        chalk.yellow.bold("📝 Manual Mode Instructions\n\n") +
          chalk.white("Start Bitcoin Core in regtest mode:\n\n") +
          chalk.cyan("$ bitcoind -regtest -daemon\n\n") +
          chalk.dim("Or with custom data directory:\n\n") +
          chalk.cyan("$ bitcoind -regtest -daemon -datadir=/path/to/dir\n\n") +
          chalk.dim("Make sure your bitcoin.conf has:\n") +
          chalk.dim("  regtest=1\n") +
          chalk.dim("  server=1\n") +
          chalk.dim("  rpcuser=user\n") +
          chalk.dim("  rpcpassword=pass"),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "yellow",
        },
      ),
    );
  }
}
