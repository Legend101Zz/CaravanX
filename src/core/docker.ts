import { execSync, spawn } from "child_process";
import { promisify } from "util";
import * as fs from "fs-extra";
import * as path from "path";
import ora from "ora";
import chalk from "chalk";
import cliProgress from "cli-progress";
import { DockerConfig, SharedConfig } from "../types/config";

const exec = promisify(require("child_process").exec);

const execAsync = async (
  command: string,
): Promise<{ stdout: string; stderr: string }> => {
  return exec(command);
};

interface ContainerStatus {
  running: boolean;
  containerId?: string;
  ports?: {
    rpc: number;
    p2p: number;
  };
  network?: string;
}

interface PortCheckResult {
  available: boolean;
  conflicts: string[];
}

/**
 * Docker service for managing Bitcoin Core containers
 */
export class DockerService {
  private config: DockerConfig;
  private dataDir: string;

  constructor(config: DockerConfig, dataDir: string) {
    this.config = config;
    this.dataDir = dataDir;
  }

  /**
   * Check if Docker is available
   */
  async checkDockerAvailable(): Promise<boolean> {
    try {
      await execAsync("docker --version");
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Detect system architecture
   */
  async detectArchitecture(): Promise<string> {
    try {
      const { stdout } = await execAsync("uname -m");
      return stdout.trim();
    } catch (error) {
      return "unknown";
    }
  }

  /**
   * Check if ports are available
   */
  async checkPortsAvailable(): Promise<PortCheckResult> {
    const conflicts: string[] = [];

    try {
      // Check RPC port
      const rpcCheck = await execAsync(
        `lsof -i :${this.config.ports.rpc} || netstat -an | grep ${this.config.ports.rpc} || true`,
      );
      if (rpcCheck.stdout.trim()) {
        conflicts.push(`Port ${this.config.ports.rpc} (RPC) is already in use`);
      }

      // Check P2P port
      const p2pCheck = await execAsync(
        `lsof -i :${this.config.ports.p2p} || netstat -an | grep ${this.config.ports.p2p} || true`,
      );
      if (p2pCheck.stdout.trim()) {
        conflicts.push(`Port ${this.config.ports.p2p} (P2P) is already in use`);
      }
    } catch (error) {
      // If commands fail, assume ports are available
    }

    return {
      available: conflicts.length === 0,
      conflicts,
    };
  }

  /**
   * Get container status
   */
  async getContainerStatus(): Promise<ContainerStatus> {
    try {
      const { stdout } = await execAsync(
        `docker ps -a --filter "name=${this.config.containerName}" --format "{{.ID}}|{{.Status}}|{{.Ports}}"`,
      );

      if (!stdout.trim()) {
        return { running: false };
      }

      const [containerId, status, ports] = stdout.trim().split("|");
      const running = status.toLowerCase().includes("up");

      return {
        running,
        containerId,
        ports: {
          rpc: this.config.ports.rpc,
          p2p: this.config.ports.p2p,
        },
        network: this.config.network,
      };
    } catch (error) {
      return { running: false };
    }
  }

  /**
   * Create Docker network if it doesn't exist
   */
  async ensureNetwork(): Promise<void> {
    try {
      await execAsync(`docker network inspect ${this.config.network}`);
    } catch (error) {
      // Network doesn't exist, create it
      await execAsync(`docker network create ${this.config.network}`);
    }
  }

  /**
   * Setup nginx proxy for Docker container
   */
  async setupNginxProxy(): Promise<void> {
    const spinner = ora("Setting up nginx proxy...").start();

    try {
      // Check if nginx is already running
      const { stdout: nginxContainers } = await execAsync(
        "docker ps -a --filter name=caravan-x-nginx --format '{{.ID}}'",
      );

      if (nginxContainers.trim()) {
        spinner.info("Nginx proxy already exists");
        return;
      }

      // Create nginx config
      const nginxConfig = this.generateNginxConfig();
      const nginxConfigDir = path.join(this.dataDir, "nginx");
      await fs.ensureDir(nginxConfigDir);
      await fs.writeFile(path.join(nginxConfigDir, "nginx.conf"), nginxConfig);

      // Start nginx container
      const nginxCommand = `docker run -d \
        --name caravan-x-nginx \
        --network ${this.config.network} \
        -p 8080:8080 \
        -v "${nginxConfigDir}/nginx.conf":/etc/nginx/nginx.conf:ro \
        nginx:alpine`;

      await execAsync(nginxCommand.replace(/\s+/g, " "));

      spinner.succeed("Nginx proxy started on http://localhost:8080");
    } catch (error: any) {
      spinner.fail("Failed to setup nginx proxy");
      console.error(
        chalk.yellow(
          "Warning: Nginx setup failed, but you can still use direct connection",
        ),
      );
      console.error(chalk.dim(error.message));
    }
  }

  /**
   * Generate nginx configuration
   */
  private generateNginxConfig(): string {
    return `
  events {
      worker_connections 1024;
  }

  http {
      upstream bitcoin_regtest {
          server ${this.config.containerName}:${this.config.ports.rpc};
      }

      server {
          listen 8080;
          server_name regtest.localhost localhost;

          location / {
              proxy_pass http://bitcoin_regtest;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

              # CORS headers for Caravan
              add_header 'Access-Control-Allow-Origin' '*' always;
              add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
              add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
              add_header 'Access-Control-Expose-Headers' 'Content-Length,Content-Range' always;

              if ($request_method = 'OPTIONS') {
                  return 204;
              }
          }
      }
  }
  `.trim();
  }

  /**
   * Create watch-only wallet for Caravan
   */
  async createWatchOnlyWallet(
    walletName: string = "caravan_watcher",
  ): Promise<void> {
    const spinner = ora(`Creating watch-only wallet: ${walletName}...`).start();

    try {
      // Check if wallet already exists
      const wallets = await this.execBitcoinCli("listwallets");
      if (wallets.includes(walletName)) {
        spinner.info(`Wallet "${walletName}" already exists`);
        return;
      }

      // Create watch-only wallet
      await this.execBitcoinCli(
        `createwallet "${walletName}" true true "" false false false`,
      );

      spinner.succeed(`Watch-only wallet "${walletName}" created`);
    } catch (error: any) {
      spinner.fail("Failed to create watch-only wallet");
      throw error;
    }
  }

  /**
   * Get Bitcoin Core info for display
   */
  async getBitcoinInfo(): Promise<{
    blocks: number;
    chain: string;
    wallets: string[];
  }> {
    try {
      const info = JSON.parse(await this.execBitcoinCli("getblockchaininfo"));
      const walletsStr = await this.execBitcoinCli("listwallets");
      const wallets = JSON.parse(walletsStr);

      return {
        blocks: info.blocks,
        chain: info.chain,
        wallets: wallets,
      };
    } catch (error) {
      throw new Error("Failed to get Bitcoin info");
    }
  }

  /**
   * Complete setup - Start container, nginx, and create wallet
   */
  async completeSetup(sharedConfig?: SharedConfig): Promise<void> {
    console.log(chalk.bold.cyan("\n🚀 Complete Docker Setup\n"));

    // Start Bitcoin Core container
    await this.startContainer(sharedConfig);

    // Setup nginx proxy
    await this.setupNginxProxy();

    // Create watch-only wallet
    await this.createWatchOnlyWallet("caravan_watcher");

    // Display connection info
    await this.displayConnectionInfo();
  }

  /**
   * Display connection information for Caravan
   */
  async displayConnectionInfo(): Promise<void> {
    try {
      const info = await this.getBitcoinInfo();

      console.log(chalk.bold.green("\n✅ Setup Complete! Ready for Caravan\n"));

      console.log(
        chalk.bold.cyan("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"),
      );
      console.log(chalk.bold.white("\n📡 Connection Settings for Caravan:\n"));
      console.log(chalk.cyan("  Protocol:       ") + chalk.white("http"));
      console.log(chalk.cyan("  Host:           ") + chalk.white("localhost"));
      console.log(chalk.cyan("  Port:           ") + chalk.white("8080"));
      console.log(chalk.cyan("  Network:        ") + chalk.white("regtest"));
      console.log(
        chalk.cyan("  Wallet Name:    ") + chalk.white("caravan_watcher"),
      );

      console.log(chalk.bold.white("\n🔐 RPC Authentication:\n"));
      console.log(
        chalk.cyan("  Username:       ") +
          chalk.white(this.config.ports.rpc === 18443 ? "user" : "user"),
      );
      console.log(chalk.cyan("  Password:       ") + chalk.white("pass"));

      console.log(chalk.bold.white("\n📊 Current Status:\n"));
      console.log(chalk.cyan("  Chain:          ") + chalk.white(info.chain));
      console.log(chalk.cyan("  Blocks:         ") + chalk.white(info.blocks));
      console.log(
        chalk.cyan("  Wallets:        ") +
          chalk.white(info.wallets.join(", ") || "none"),
      );

      console.log(chalk.bold.white("\n🌐 Access URLs:\n"));
      console.log(
        chalk.cyan("  Via Proxy:      ") + chalk.white("http://localhost:8080"),
      );
      console.log(
        chalk.cyan("  Direct RPC:     ") +
          chalk.white(`http://localhost:${this.config.ports.rpc}`),
      );

      console.log(
        chalk.bold.cyan(
          "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n",
        ),
      );

      console.log(chalk.bold.yellow("📝 Next Steps:\n"));
      console.log(
        chalk.white("  1. Open Caravan: ") +
          chalk.cyan("https://caravanmultisig.com"),
      );
      console.log(chalk.white("  2. Settings → Bitcoin Network → Custom"));
      console.log(chalk.white("  3. Enter the connection settings above"));
      console.log(chalk.white("  4. Create/Import your multisig wallet"));
      console.log(
        chalk.white("  5. Click 'Import Addresses' to watch your wallet\n"),
      );
    } catch (error: any) {
      console.error(chalk.red("Error getting connection info:"), error.message);
    }
  }

  /**
   * Generate bitcoin.conf file
   */
  private generateBitcoinConf(sharedConfig?: SharedConfig): string {
    const config = sharedConfig?.bitcoin || {
      rpcUser: "user",
      rpcPassword: "pass",
      rpcPort: 18443,
    };

    return `
# Bitcoin Core Configuration for Caravan-X Regtest

# Global Settings
server=1
# NOTE: Do NOT use daemon=1 in Docker - it must run in foreground!

# RPC Authentication (global)
rpcuser=${config.rpcUser}
rpcpassword=${config.rpcPassword}

# Wallet Settings
fallbackfee=0.00001

# Performance
dbcache=512

# Logging (verbose for development)
debug=1
printtoconsole=1

# Regtest-specific settings
[regtest]
rpcport=${config.rpcPort}
rpcallowip=0.0.0.0/0
rpcbind=0.0.0.0
listen=1
port=${this.config.ports.p2p}
    `.trim();
  }

  /**
   * Start Bitcoin Core container with beautiful progress UI
   */
  async startContainer(sharedConfig?: SharedConfig): Promise<void> {
    console.log(chalk.bold.cyan("\n🚀 Starting Bitcoin Core Container\n"));

    // Create multi-bar progress
    const multibar = new cliProgress.MultiBar(
      {
        clearOnComplete: false,
        hideCursor: true,
        format: " {bar} | {status} | {percentage}%",
        barCompleteChar: "\u2588",
        barIncompleteChar: "\u2591",
      },
      cliProgress.Presets.shades_classic,
    );

    const mainProgress = multibar.create(100, 0, { status: "Initializing..." });

    try {
      // Step 1: Check Docker (10%)
      mainProgress.update(5, { status: "Checking Docker..." });
      const dockerAvailable = await this.checkDockerAvailable();
      if (!dockerAvailable) {
        multibar.stop();
        throw new Error(
          "Docker is not installed or not running. Please install Docker first.",
        );
      }
      mainProgress.update(10, { status: "Docker OK ✓" });

      // Step 2: Detect Architecture (20%)
      mainProgress.update(15, { status: "Detecting architecture..." });
      const arch = await this.detectArchitecture();
      mainProgress.update(20, { status: `Architecture: ${arch} ✓` });

      // Step 3: Check Ports (30%)
      mainProgress.update(25, { status: "Checking ports..." });
      const portStatus = await this.checkPortsAvailable();
      if (portStatus.conflicts.length > 0) {
        multibar.stop();
        const conflictError = new Error(
          `Port conflict detected:\n${portStatus.conflicts.join("\n")}`,
        );
        conflictError.name = "PortConflictError";
        throw conflictError;
      }
      mainProgress.update(30, { status: "Ports available ✓" });

      // Step 4: Setup Network (40%)
      mainProgress.update(35, { status: "Setting up network..." });
      await this.ensureNetwork();
      mainProgress.update(40, { status: "Network ready ✓" });

      // Step 5: Prepare Data Directory (50%)
      mainProgress.update(45, { status: "Preparing data directory..." });
      const bitcoinDataDir = path.join(this.dataDir, "bitcoin-data");
      await fs.ensureDir(bitcoinDataDir);

      const bitcoinConf = this.generateBitcoinConf(sharedConfig);
      await fs.writeFile(
        path.join(bitcoinDataDir, "bitcoin.conf"),
        bitcoinConf,
      );
      mainProgress.update(50, { status: "Config generated ✓" });

      // Step 6: Check Container Status (60%)
      mainProgress.update(55, { status: "Checking container status..." });
      const status = await this.getContainerStatus();

      if (status.containerId) {
        if (status.running) {
          mainProgress.update(100, { status: "Already running ✓" });
          multibar.stop();
          console.log(
            chalk.green("\n✅ Bitcoin Core container is already running!"),
          );
          return;
        } else {
          // Remove old container
          mainProgress.update(58, { status: "Removing old container..." });
          await execAsync(`docker rm ${this.config.containerName}`);
        }
      }
      mainProgress.update(60, { status: "Container check complete ✓" });

      // Step 7: Create Container (70%)
      mainProgress.update(65, { status: "Creating container..." });

      let dockerCommand = `docker run -d --name ${this.config.containerName}`;

      // Add platform flag for ARM64 systems (Apple Silicon)
      if (arch.includes("arm64") || arch.includes("aarch64")) {
        dockerCommand += ` --platform linux/amd64`;
      }

      // Add network and ports
      dockerCommand += ` --network ${this.config.network}`;
      dockerCommand += ` -p ${this.config.ports.rpc}:${this.config.ports.rpc}`;
      dockerCommand += ` -p ${this.config.ports.p2p}:${this.config.ports.p2p}`;

      // Add volume with proper quoting for paths with spaces
      dockerCommand += ` -v "${bitcoinDataDir}":/bitcoin/.bitcoin`;

      // Add image
      dockerCommand += ` ${this.config.image}`;

      // CRITICAL: Add -regtest flag to run in regtest mode!
      dockerCommand += ` -regtest -conf=/bitcoin/.bitcoin/bitcoin.conf`;

      await execAsync(dockerCommand);
      mainProgress.update(70, { status: "Container created ✓" });

      // Step 8: Wait for Container to Start (75%)
      mainProgress.update(72, { status: "Waiting for container to start..." });
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Check if container is still running
      const newStatus = await this.getContainerStatus();
      if (!newStatus.running) {
        multibar.stop();

        const logs = await this.getLogs(50);
        console.error("\n" + chalk.red("❌ Container failed to start!"));
        console.error(chalk.yellow("\n📜 Container logs:"));
        console.error(chalk.dim(logs));

        throw new Error(
          "Bitcoin Core container stopped immediately after starting. Check the logs above for details.",
        );
      }
      mainProgress.update(75, { status: "Container running ✓" });

      // Step 9: Wait for RPC (90%)
      mainProgress.update(78, { status: "Waiting for RPC to be ready..." });
      await this.waitForRpcReady(multibar, mainProgress);
      mainProgress.update(90, { status: "RPC ready ✓" });

      // Step 10: Generate Initial Blocks (100%)
      if (sharedConfig?.initialState.preGenerateBlocks) {
        mainProgress.update(92, { status: "Generating blocks..." });
        await this.generateInitialBlocks(
          sharedConfig.initialState.blockHeight,
          multibar,
          mainProgress,
        );
      }
      mainProgress.update(100, { status: "Complete ✓" });

      multibar.stop();

      console.log(
        chalk.bold.green("\n✅ Bitcoin Core container started successfully!\n"),
      );
      console.log(
        chalk.cyan("  📡 RPC Port:"),
        chalk.white(this.config.ports.rpc),
      );
      console.log(
        chalk.cyan("  🌐 P2P Port:"),
        chalk.white(this.config.ports.p2p),
      );
      console.log(
        chalk.cyan("  🔗 Network:"),
        chalk.white(this.config.network),
      );
      console.log(chalk.cyan("  📂 Data Dir:"), chalk.white(bitcoinDataDir));

      if (sharedConfig?.initialState.preGenerateBlocks) {
        console.log(
          chalk.cyan("  📦 Blocks:"),
          chalk.white(sharedConfig.initialState.blockHeight),
        );
      }
      console.log();
    } catch (error: any) {
      multibar.stop();
      throw error;
    }
  }

  /**
   * Wait for RPC to be ready with progress updates
   */
  private async waitForRpcReady(
    multibar: cliProgress.MultiBar,
    mainProgress: cliProgress.SingleBar,
    maxAttempts = 60,
  ): Promise<void> {
    // Initial wait for container to fully start
    await new Promise((resolve) => setTimeout(resolve, 2000));

    for (let i = 0; i < maxAttempts; i++) {
      try {
        // Check if container is still running
        const status = await this.getContainerStatus();
        if (!status.running) {
          throw new Error(
            "Container stopped unexpectedly. Check logs with:\n" +
              `docker logs ${this.config.containerName}`,
          );
        }

        // Try to call RPC
        await this.execBitcoinCli("getblockchaininfo");
        return; // Success!
      } catch (error: any) {
        // Update progress
        const progress = 78 + (i / maxAttempts) * 12;
        mainProgress.update(progress, {
          status: `Waiting for RPC (${i + 1}/${maxAttempts})...`,
        });

        if (i === maxAttempts - 1) {
          // Last attempt failed
          throw new Error(
            `Bitcoin Core RPC did not become ready after ${maxAttempts} attempts.\n` +
              `This might indicate a configuration issue.\n` +
              `Check logs with: docker logs ${this.config.containerName}`,
          );
        }

        // Wait 1 second before trying again
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * Generate initial blocks with progress
   */
  private async generateInitialBlocks(
    targetHeight: number,
    multibar: cliProgress.MultiBar,
    mainProgress: cliProgress.SingleBar,
  ): Promise<void> {
    try {
      // Create a temporary wallet for mining
      mainProgress.update(93, { status: "Creating mining wallet..." });
      await this.execBitcoinCli('createwallet "mining_wallet"');

      // Get a mining address
      mainProgress.update(95, { status: "Getting mining address..." });
      const address = await this.execBitcoinCli(
        "-rpcwallet=mining_wallet getnewaddress",
      );

      // Generate blocks
      mainProgress.update(97, {
        status: `Generating ${targetHeight} blocks...`,
      });
      await this.execBitcoinCli(
        `-rpcwallet=mining_wallet generatetoaddress ${targetHeight} ${address.trim()}`,
      );
    } catch (error: any) {
      console.error(
        chalk.yellow("\n⚠️  Warning: Could not generate initial blocks"),
      );
      console.error(chalk.dim(error.message));
      // Don't throw - this is not critical
    }
  }

  /**
   * Stop Bitcoin Core container
   */
  async stopContainer(): Promise<void> {
    const spinner = ora("Stopping Bitcoin Core container...").start();

    try {
      const status = await this.getContainerStatus();

      if (!status.running) {
        spinner.info("Bitcoin Core container is not running");
        return;
      }

      await execAsync(`docker stop ${this.config.containerName}`);
      spinner.succeed("Bitcoin Core container stopped");
    } catch (error: any) {
      spinner.fail("Failed to stop Bitcoin Core container");
      throw error;
    }
  }

  /**
   * Restart container
   */
  async restartContainer(): Promise<void> {
    const spinner = ora("Restarting Bitcoin Core container...").start();

    try {
      await execAsync(`docker restart ${this.config.containerName}`);

      // Wait for RPC to be ready
      spinner.text = "Waiting for Bitcoin Core to be ready...";

      // Simple wait without multibar for restart
      await this.waitForRpcReadySimple();

      spinner.succeed("Bitcoin Core container restarted");
    } catch (error: any) {
      spinner.fail("Failed to restart Bitcoin Core container");
      throw error;
    }
  }

  /**
   * Simple RPC wait (for restart operations)
   */
  private async waitForRpcReadySimple(maxAttempts = 60): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    for (let i = 0; i < maxAttempts; i++) {
      try {
        await this.execBitcoinCli("getblockchaininfo");
        return;
      } catch (error) {
        if (i === maxAttempts - 1) {
          throw new Error("Bitcoin Core RPC did not become ready in time");
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * Remove Bitcoin Core container
   */
  async removeContainer(): Promise<void> {
    const spinner = ora("Removing Bitcoin Core container...").start();

    try {
      const status = await this.getContainerStatus();

      if (!status.containerId) {
        spinner.info("Bitcoin Core container does not exist");
        return;
      }

      // Stop if running
      if (status.running) {
        await execAsync(`docker stop ${this.config.containerName}`);
      }

      await execAsync(`docker rm ${this.config.containerName}`);
      spinner.succeed("Bitcoin Core container removed");
    } catch (error: any) {
      spinner.fail("Failed to remove Bitcoin Core container");
      throw error;
    }
  }

  /**
   * Execute bitcoin-cli command in container
   */
  async execBitcoinCli(command: string): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `docker exec ${this.config.containerName} bitcoin-cli -regtest ${command}`,
      );
      return stdout.trim();
    } catch (error: any) {
      throw new Error(`Bitcoin CLI command failed: ${error.message}`);
    }
  }

  /**
   * Get container logs
   */
  async getLogs(tail = 100): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `docker logs --tail ${tail} ${this.config.containerName}`,
      );
      return stdout;
    } catch (error: any) {
      throw new Error(`Failed to get container logs: ${error.message}`);
    }
  }

  /**
   * Open a shell in the container
   */
  async openShell(): Promise<void> {
    console.log(chalk.cyan("\n🐚 Opening shell in Bitcoin Core container..."));
    console.log(chalk.yellow("Type 'exit' to return to Caravan-X\n"));

    const shell = spawn(
      "docker",
      ["exec", "-it", this.config.containerName, "/bin/bash"],
      { stdio: "inherit" },
    );

    return new Promise((resolve, reject) => {
      shell.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Shell exited with code ${code}`));
        }
      });
    });
  }
}
