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
   * @param skipDockerStart - if true, don't start containers (just return config)
   */
  async setupDockerMode(
    skipDockerStart: boolean = false,
  ): Promise<EnhancedAppConfig> {
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

    // Bitcoin data directory - default to under appDir
    const defaultBitcoinDataDir = path.join(
      this.appDir,
      "docker-data",
      "bitcoin-data",
    );

    // Check platform for recommendations
    const isMacOS = process.platform === "darwin";
    if (isMacOS) {
      console.log(
        boxen(
          chalk.cyan.bold("🍎 macOS Note\n\n") +
            chalk.white(
              "For Docker compatibility, data will be stored under:\n",
            ) +
            chalk.cyan(defaultBitcoinDataDir),
          {
            padding: 1,
            margin: 1,
            borderStyle: "round",
            borderColor: "cyan",
          },
        ),
      );
    }

    const useCustomBitcoinDir = await confirm({
      message: `Use default Bitcoin data location? (${defaultBitcoinDataDir})`,
      default: true,
    });

    let bitcoinDataDir: string;
    if (useCustomBitcoinDir) {
      bitcoinDataDir = defaultBitcoinDataDir;
    } else {
      bitcoinDataDir = await input({
        message: "Enter Bitcoin data directory path:",
        default: defaultBitcoinDataDir,
        validate: (inputPath) => {
          if (!inputPath.trim()) return "Path cannot be empty";
          return true;
        },
      });
    }

    // Ensure directory exists and is writable
    try {
      await fs.ensureDir(bitcoinDataDir);
      const testFile = path.join(bitcoinDataDir, ".write-test");
      await fs.writeFile(testFile, "test");
      await fs.remove(testFile);
    } catch (error) {
      console.log(
        boxen(
          chalk.red.bold("❌ Permission Error\n\n") +
            chalk.white(`Cannot write to: ${bitcoinDataDir}\n\n`) +
            chalk.yellow(
              "Please choose a different directory or fix permissions.",
            ),
          {
            padding: 1,
            margin: 1,
            borderStyle: "round",
            borderColor: "red",
          },
        ),
      );
      throw error;
    }

    console.log(chalk.white("\n📋 Docker Configuration:\n"));

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
      walletName,
      snapshots: {
        enabled: true,
        autoSnapshot: false,
      },
    };

    // Create enhanced config (nginx port will be updated after Docker starts)
    const config: EnhancedAppConfig = {
      mode: SetupMode.DOCKER,
      sharedConfig,
      docker: dockerConfig,
      bitcoin: {
        protocol: "http",
        host: "localhost",
        port: 8080, // Will be updated to actual nginx port
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

    // Optionally start Docker
    if (!skipDockerStart) {
      const startNow = await confirm({
        message: "Start Docker containers now?",
        default: true,
      });

      if (startNow) {
        const dockerService = new DockerService(
          config.docker!,
          path.join(config.appDir, "docker-data"),
        );

        const nginxPort = await dockerService.completeSetup(
          config.sharedConfig,
        );
        config.bitcoin.port = nginxPort;
      }
    }

    // Ensure directories exist
    await fs.ensureDir(config.caravanDir);
    await fs.ensureDir(config.keysDir);
    await fs.ensureDir(config.snapshots.directory);
    await fs.ensureDir(config.scenariosDir);

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
