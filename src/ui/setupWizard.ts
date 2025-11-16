/**
 * Setup Wizard for Caravan-X
 * Interactive setup for first-time users and configuration changes
 */

import { select, input, confirm, number, checkbox } from "@inquirer/prompts";
import chalk from "chalk";
import boxen from "boxen";
import figlet from "figlet";
import ora from "ora";
import { promisify } from "util";
import * as fs from "fs-extra";
import * as path from "path";
import {
  SetupMode,
  SharedConfig,
  EnhancedAppConfig,
  DEFAULT_DOCKER_CONFIG,
  BUILT_IN_SCENARIOS,
  DockerConfig,
} from "../types/config";
import { DockerService } from "../core/docker";
import { colors } from "../utils/terminal";
import { execAsync } from "../utils/exec";

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

    // Step 3: Choose initial scenarios (optional) - ONLY ASKED ONCE HERE
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
  /**
   * Setup Docker mode configuration
   */
  private async setupDockerMode(): Promise<EnhancedAppConfig> {
    console.log(
      boxen(
        chalk.white.bold("🐳 Docker Mode - Local Storage Setup\n\n") +
          chalk.cyan(
            "Docker will store blockchain data locally on your machine.\n",
          ) +
          chalk.cyan("This includes:\n") +
          chalk.white("  • Blockchain data (blocks, chainstate)\n") +
          chalk.white("  • Wallet files\n") +
          chalk.white("  • Configuration files\n\n") +
          chalk.yellow("⚠️  Make sure you have sufficient disk space!\n") +
          chalk.gray("Regtest typically uses < 1GB"),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "cyan",
        },
      ),
    );

    // Detect platform and suggest appropriate default
    const isMacOS = process.platform === "darwin";
    const homeDir = process.env.HOME || "~";

    // Recommend home directory path for Docker compatibility
    const recommendedPath = path.join(
      homeDir,
      ".caravan-x",
      "docker-data",
      "bitcoin-data",
    );

    if (isMacOS) {
      console.log(
        boxen(
          chalk.cyan.bold("🍎 macOS Docker Desktop Note\n\n") +
            chalk.white(
              "For best compatibility, use a path under your home directory.\n",
            ) +
            chalk.gray(
              "Docker Desktop has restricted access to external volumes.\n\n",
            ) +
            chalk.cyan("Recommended: ") +
            chalk.white(recommendedPath),
          {
            padding: 1,
            margin: 1,
            borderStyle: "round",
            borderColor: "cyan",
          },
        ),
      );
    }

    const useCustomLocation = await confirm({
      message: "Use custom storage location?",
      default: false,
    });

    let bitcoinDataDir = recommendedPath;

    if (useCustomLocation) {
      let validPath = false;

      while (!validPath) {
        bitcoinDataDir = await input({
          message: "Enter local directory path for Bitcoin data:",
          default: recommendedPath,
          validate: (input) => {
            if (!input || input.trim().length === 0) {
              return "Path cannot be empty";
            }
            return true;
          },
        });

        // Expand tilde and make absolute
        bitcoinDataDir = bitcoinDataDir.replace(/^~/, homeDir);
        bitcoinDataDir = path.resolve(bitcoinDataDir);

        // Validate path for macOS Docker
        if (isMacOS) {
          const isExternalVolume =
            bitcoinDataDir.startsWith("/Volumes/") &&
            !bitcoinDataDir.startsWith("/Volumes/Macintosh HD");
          const isHomeDirectory = bitcoinDataDir.startsWith(homeDir);
          const isCommonPath =
            bitcoinDataDir.startsWith("/Users/") ||
            bitcoinDataDir.startsWith("/tmp/") ||
            bitcoinDataDir.startsWith("/private/");

          if (isExternalVolume || (!isHomeDirectory && !isCommonPath)) {
            console.log(
              boxen(
                chalk.yellow.bold("⚠️  Docker Access Warning\n\n") +
                  chalk.white(
                    "This path may not be accessible to Docker Desktop.\n",
                  ) +
                  chalk.cyan("Path: ") +
                  chalk.yellow(bitcoinDataDir) +
                  "\n\n" +
                  (isExternalVolume
                    ? chalk.white(
                        "External drives require File Sharing setup in Docker Desktop.\n\n",
                      )
                    : chalk.white(
                        "This path is outside typical Docker-accessible directories.\n\n",
                      )) +
                  chalk.gray("You can either:\n") +
                  chalk.white("  1. Choose a path under ") +
                  chalk.cyan(homeDir) +
                  "\n" +
                  chalk.white(
                    "  2. Continue and set up File Sharing later if it fails",
                  ),
                {
                  padding: 1,
                  margin: 1,
                  borderStyle: "round",
                  borderColor: "yellow",
                },
              ),
            );

            const continueAnyway = await confirm({
              message: "Continue with this path anyway?",
              default: false,
            });

            if (!continueAnyway) {
              continue; // Ask for path again
            }
          }
        }

        validPath = true;
      }
    }

    console.log(
      boxen(
        chalk.white.bold("📁 Storage Configuration\n\n") +
          chalk.gray("Data will be stored at:\n") +
          chalk.cyan(bitcoinDataDir) +
          "\n\n" +
          chalk.white(
            "This directory will be mounted into the Docker container",
          ),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "green",
        },
      ),
    );

    const proceed = await confirm({
      message: "Continue with this location?",
      default: true,
    });

    if (!proceed) {
      console.log(chalk.yellow("\n⚠️  Setup cancelled\n"));
      process.exit(0);
    }

    // Create directory structure with proper permissions
    const spinner = ora("Creating storage directories...").start();

    try {
      await fs.ensureDir(bitcoinDataDir);
      await fs.ensureDir(path.join(bitcoinDataDir, "regtest"));
      await fs.ensureDir(path.join(bitcoinDataDir, "regtest", "wallets"));

      // Set permissions (readable/writable for all)
      if (process.platform !== "win32") {
        try {
          await execAsync(`chmod -R 755 "${bitcoinDataDir}"`);
        } catch (err) {
          // Permission errors are okay, might not be needed
        }
      }

      spinner.succeed(chalk.green("Storage directories created"));
    } catch (error: any) {
      spinner.fail(chalk.red("Failed to create directories"));
      console.error(chalk.red("\nError: ") + error.message);

      if (error.code === "EACCES" || error.code === "EPERM") {
        console.log(
          boxen(
            chalk.yellow.bold("⚠️  Permission Denied\n\n") +
              chalk.white("Cannot create directory at:\n") +
              chalk.yellow(bitcoinDataDir) +
              "\n\n" +
              chalk.cyan("Try:\n") +
              chalk.white("  1. Use default location (") +
              chalk.cyan("~/.caravan-x") +
              ")\n" +
              chalk.white(
                "  2. Choose a directory you have write access to\n",
              ) +
              chalk.white("  3. Fix permissions: ") +
              chalk.gray(
                `sudo chown -R $USER "${path.dirname(bitcoinDataDir)}"`,
              ),
            {
              padding: 1,
              margin: 1,
              borderStyle: "round",
              borderColor: "red",
            },
          ),
        );
      }

      throw error;
    }

    console.log(chalk.white("\n📋 Docker Configuration:\n"));

    // Configure Docker settings (rest of your existing code...)
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

    console.log(chalk.white("\n🔐 RPC Authentication:\n"));

    const rpcUser = await input({
      message: "RPC username:",
      default: "caravan_user",
      validate: (input) => input.length > 0 || "Username cannot be empty",
    });

    const rpcPassword = await input({
      message: "RPC password:",
      default: "caravan_pass",
      validate: (input) => input.length > 0 || "Password cannot be empty",
    });

    console.log(chalk.white("\n💼 Wallet Configuration:\n"));

    const walletName = await input({
      message: "Watch-only wallet name:",
      default: "caravan_watcher",
      validate: (input) => {
        if (input.length === 0) return "Wallet name cannot be empty";
        if (!/^[a-zA-Z0-9_]+$/.test(input))
          return "Only alphanumeric and underscore allowed";
        return true;
      },
    });

    const preGenerateBlocks = await confirm({
      message: "Generate 101 initial blocks? (Needed for spending)",
      default: true,
    });

    // Create Docker config
    const dockerConfig: DockerConfig = {
      enabled: true,
      image: DEFAULT_DOCKER_CONFIG.image,
      containerName,
      ports: {
        rpc: rpcPort!,
        p2p: p2pPort!,
        nginx: 8080,
      },
      volumes: {
        bitcoinData: bitcoinDataDir,
        coordinator: path.join(this.appDir, "coordinator"),
      },
      network: DEFAULT_DOCKER_CONFIG.network,
      autoStart: true,
    };

    // Create shared config
    const sharedConfig: SharedConfig = {
      version: "1.0.0",
      name: "Caravan-X Docker Setup",
      mode: SetupMode.DOCKER,
      bitcoin: {
        network: "regtest",
        rpcPort: rpcPort!,
        p2pPort: p2pPort!,
        rpcUser,
        rpcPassword,
      },
      docker: dockerConfig,
      initialState: {
        blockHeight: preGenerateBlocks ? 101 : 0,
        preGenerateBlocks,
        wallets: [],
        transactions: [],
      },
      scenarios: [], // Will be filled in by run() method
      walletName,
      snapshots: {
        enabled: true,
        autoSnapshot: false,
      },
    };

    // Create enhanced config
    const config: EnhancedAppConfig = {
      mode: SetupMode.DOCKER,
      sharedConfig,
      docker: dockerConfig,
      bitcoin: {
        protocol: "http",
        host: "localhost",
        port: 8080, // nginx proxy port
        user: rpcUser,
        pass: rpcPassword,
        dataDir: bitcoinDataDir,
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
