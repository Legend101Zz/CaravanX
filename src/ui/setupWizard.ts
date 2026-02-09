import { select, input, confirm, number } from "@inquirer/prompts";
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
  DockerConfig,
} from "../types/config";
import { DockerService } from "../core/docker";
import { colors } from "../utils/terminal";

export class SetupWizard {
  private appDir: string;

  constructor(appDir: string) {
    this.appDir = appDir;
    fs.ensureDirSync(appDir);
  }

  /**
   * Setup Docker mode - called from index.ts
   *
   * DEV: This wizard ONLY collects user preferences (ports, container name,
   * RPC creds, etc.). It does NOT start Docker or create data directories.
   * The caller is responsible for:
   *   1. Calling ProfileManager.createProfile() to scope all paths
   *   2. Starting Docker with the scoped config
   * This prevents data from landing in the shared base directory.
   */
  async setupDockerMode(): Promise<EnhancedAppConfig> {
    console.log(
      boxen(
        chalk.white.bold("🐳 Docker Mode Configuration\n\n") +
          chalk.gray("Caravan-X will configure:\n") +
          chalk.white("  • Bitcoin Core regtest container\n") +
          chalk.white("  • RPC authentication\n") +
          chalk.white("  • Nginx proxy for easy access\n") +
          chalk.white("  • Watch-only wallet"),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "cyan",
        },
      ),
    );

    // DEV: We no longer ask about bitcoin data directory here.
    // The data dir is automatically placed inside the profile directory
    // by ProfileManager.scopeConfigToProfile(). Show a note instead.
    console.log(
      boxen(
        chalk.cyan.bold("📁 Data Storage\n\n") +
          chalk.white(
            "All blockchain data, wallets, keys, and snapshots will be\n" +
              "stored inside this profile's isolated directory.\n\n",
          ) +
          chalk.gray(
            "  ~/.caravan-x/profiles/<profile_id>/\n" +
              "    ├── docker-data/bitcoin-data/\n" +
              "    ├── wallets/\n" +
              "    ├── keys/\n" +
              "    ├── snapshots/\n" +
              "    └── scenarios/",
          ),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "gray",
        },
      ),
    );

    // --- Collect Docker container preferences ---

    console.log(chalk.white("\n🐳 Docker Container Settings:\n"));

    const containerName = await input({
      message: "Container name:",
      default: DEFAULT_DOCKER_CONFIG.containerName,
    });

    let rpcPort = await number({
      message: "Bitcoin Core RPC port:",
      default: 18443,
    });

    let p2pPort = await number({
      message: "Bitcoin Core P2P port:",
      default: 18444,
    });

    console.log(chalk.white("\n🔐 RPC Authentication:\n"));

    const rpcUser = await input({
      message: "RPC username:",
      default: "caravan",
    });

    const rpcPassword = await input({
      message: "RPC password:",
      default: "caravan_pass",
    });

    console.log(chalk.white("\n⚙️  Initial Setup Options:\n"));

    const walletName = await input({
      message: "Watch-only wallet name (for Caravan):",
      default: "caravan_watcher",
    });

    const preGenerateBlocks = await confirm({
      message: "Pre-generate 101 blocks? (Needed for spending)",
      default: true,
    });

    // DEV: Use a placeholder for bitcoinDataDir — scopeConfigToProfile()
    // will overwrite this with the actual profile-scoped path.
    // We use this.appDir as a temporary value that gets replaced.
    const placeholderBitcoinDataDir = path.join(
      this.appDir,
      "docker-data",
      "bitcoin-data",
    );

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
        bitcoinData: placeholderBitcoinDataDir,
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
      walletName,
      snapshots: {
        enabled: true,
        autoSnapshot: false,
      },
    };

    // DEV: Build config with placeholder paths. These ALL get rewritten
    // by ProfileManager.scopeConfigToProfile() before anything uses them.
    const config: EnhancedAppConfig = {
      mode: SetupMode.DOCKER,
      sharedConfig,
      docker: dockerConfig,
      bitcoin: {
        protocol: "http",
        host: "localhost",
        port: 8080, // Updated to actual nginx port after Docker starts
        user: rpcUser,
        pass: rpcPassword,
        dataDir: placeholderBitcoinDataDir,
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

    // DEV: We do NOT start Docker here. The caller will:
    //   1. Call createProfile() to scope paths into the profile dir
    //   2. Start Docker with the scoped config
    // This prevents docker-data from landing in the shared base directory.

    return config;
  }

  /**
   * Setup Manual mode - called from index.ts
   */
  async setupManualMode(): Promise<EnhancedAppConfig> {
    console.log(
      boxen(
        chalk.white.bold("⚙️  Manual Mode Configuration\n\n") +
          chalk.gray("You'll need to:\n") +
          chalk.white("  • Have Bitcoin Core installed\n") +
          chalk.white("  • Run bitcoind in regtest mode\n") +
          chalk.white("  • Configure RPC authentication"),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "yellow",
        },
      ),
    );

    console.log(chalk.white("\n📡 Bitcoin Core RPC Settings:\n"));

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
      message: "Bitcoin Core data directory:",
      default: path.join(process.env.HOME || "~", ".bitcoin"),
    });

    // Create shared config
    const sharedConfig: SharedConfig = {
      version: "1.0.0",
      name: "Caravan-X Manual Setup",
      description: "Manual Bitcoin Core configuration",
      mode: SetupMode.MANUAL,
      bitcoin: {
        network: "regtest",
        rpcPort: port!,
        p2pPort: 18444,
        rpcUser: user,
        rpcPassword: pass,
      },
      initialState: {
        blockHeight: 0,
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

    // Ensure directories exist
    await fs.ensureDir(config.caravanDir);
    await fs.ensureDir(config.keysDir);
    await fs.ensureDir(config.snapshots.directory);
    await fs.ensureDir(config.scenariosDir);

    return config;
  }
}
