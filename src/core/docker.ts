import { spawn } from "child_process";
import * as fs from "fs-extra";
import * as path from "path";
import ora from "ora";
import boxen from "boxen";
import chalk from "chalk";
import cliProgress from "cli-progress";
import { DockerConfig, SharedConfig } from "../types/config";
import { execAsync } from "../utils/exec";
import { log } from "../utils/logger";
import { CaravanXError } from "../utils/errors";

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
 *
 * This service handles:
 * - Port conflict detection and auto-adjustment
 * - Bitcoin Core container lifecycle
 * - Nginx proxy setup for CORS-enabled RPC access
 * - Watch-only wallet creation
 * - Connection testing and validation
 */
export class DockerService {
  private config: DockerConfig;
  private dataDir: string;
  private rpcUser: string = "user";
  private rpcPassword: string = "pass";

  constructor(config: DockerConfig, dataDir: string) {
    this.config = config;
    this.dataDir = dataDir;
  }

  // ============================================================================
  // DOCKER & SYSTEM CHECKS
  // ============================================================================

  /**
   * Check if Docker is available and running
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
   * Detect system architecture (important for ARM64/M1 Macs)
   */
  async detectArchitecture(): Promise<string> {
    try {
      const { stdout } = await execAsync("uname -m");
      return stdout.trim();
    } catch (error) {
      return "unknown";
    }
  }

  // ============================================================================
  // PORT MANAGEMENT (Auto-detection and conflict resolution)
  // ============================================================================

  /**
   * Check if a specific port is in use
   */
  async isPortInUse(port: number): Promise<boolean> {
    try {
      const { stdout } = await execAsync(
        `lsof -i :${port} 2>/dev/null || netstat -an 2>/dev/null | grep ${port} || true`,
      );
      return stdout.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Find an available port starting from a base port
   * Tries up to 50 ports sequentially
   */
  async findAvailablePort(basePort: number): Promise<number> {
    let port = basePort;
    let attempts = 0;
    const maxAttempts = 50;

    while (attempts < maxAttempts) {
      if (!(await this.isPortInUse(port))) {
        return port;
      }
      port++;
      attempts++;
    }

    throw new Error(
      `Could not find available port near ${basePort} after ${maxAttempts} attempts`,
    );
  }

  /**
   * Find available ports for both RPC and P2P
   * This is the helper that finds alternative ports
   */
  private async findAvailablePorts(): Promise<{ rpc: number; p2p: number }> {
    const rpcPort = await this.findAvailablePort(18443);
    const p2pPort = await this.findAvailablePort(18444);
    return { rpc: rpcPort, p2p: p2pPort };
  }

  /**
   * Check if default ports are available
   */
  private async checkPortsAvailable(): Promise<PortCheckResult> {
    const conflicts: string[] = [];

    if (await this.isPortInUse(this.config.ports.rpc)) {
      conflicts.push(`Port ${this.config.ports.rpc} (RPC) is already in use`);
    }

    if (await this.isPortInUse(this.config.ports.p2p)) {
      conflicts.push(`Port ${this.config.ports.p2p} (P2P) is already in use`);
    }

    return {
      available: conflicts.length === 0,
      conflicts,
    };
  }

  /**
   * Ensure ports are available - auto-adjust if conflicts exist
   * This is the MAIN port management method called during setup
   *
   * If default ports (18443, 18444) are taken, it automatically finds alternatives
   * and updates the config accordingly. No manual intervention needed!
   */
  async ensurePortsAvailable(): Promise<{ rpc: number; p2p: number }> {
    const portStatus = await this.checkPortsAvailable();

    if (portStatus.conflicts.length > 0) {
      log.warn("Default ports are in use:");
      portStatus.conflicts.forEach((conflict) => {
        log.verbose(`  • ${conflict}`);
      });

      log.info("Finding available ports...");

      // Auto-find alternative ports
      const availablePorts = await this.findAvailablePorts();

      log.info(" Found available ports:");
      log.success(
        `Found available ports — RPC: ${availablePorts.rpc}, P2P: ${availablePorts.p2p}`,
      );
      // Update config with new ports
      this.config.ports.rpc = availablePorts.rpc;
      this.config.ports.p2p = availablePorts.p2p;

      return availablePorts;
    }

    // No conflicts, use default ports
    return {
      rpc: this.config.ports.rpc,
      p2p: this.config.ports.p2p,
    };
  }

  // ============================================================================
  // CONTAINER MANAGEMENT
  // ============================================================================

  /**
   * Get current container status
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
   * Ensure Docker network exists
   */
  async ensureNetwork(): Promise<void> {
    try {
      await execAsync(`docker network inspect ${this.config.network}`);
    } catch (error) {
      await execAsync(`docker network create ${this.config.network}`);
    }
  }

  /**
   * Generate bitcoin.conf file with proper credentials
   */
  private generateBitcoinConf(sharedConfig?: SharedConfig): string {
    // Use sharedConfig credentials if available, otherwise use instance defaults
    const rpcUser = sharedConfig?.bitcoin.rpcUser || this.rpcUser || "user";
    const rpcPassword =
      sharedConfig?.bitcoin.rpcPassword || this.rpcPassword || "pass";
    const rpcPort = sharedConfig?.bitcoin.rpcPort || 18443;

    // Store credentials for later use (for bitcoin-cli commands)
    this.rpcUser = rpcUser;
    this.rpcPassword = rpcPassword;

    return `# Bitcoin Core Configuration for Caravan-X Regtest
# Global Settings
server=1
# NOTE: Do NOT use daemon=1 in Docker - it must run in foreground!

# RPC Authentication (global)
rpcuser=${rpcUser}
rpcpassword=${rpcPassword}

# Wallet Settings
fallbackfee=0.00001

# Performance
dbcache=512

# Logging (verbose for development)
debug=1
printtoconsole=1

# Regtest-specific settings
[regtest]
rpcport=${rpcPort}
rpcallowip=0.0.0.0/0
rpcbind=0.0.0.0
listen=1
port=${this.config.ports.p2p}`.trim();
  }

  /**
   * Start Bitcoin Core container with progress UI
   * This handles the Bitcoin Core container only - nginx is separate
   */
  async startContainer(sharedConfig?: SharedConfig): Promise<void> {
    log.info(" Starting Bitcoin Core Container\n");

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
      // Step 1: Check Docker
      mainProgress.update(5, { status: "Checking Docker..." });
      log.step(1, 11, "Checking Docker availability...");
      const dockerAvailable = await this.checkDockerAvailable();
      if (!dockerAvailable) {
        multibar.stop();
        throw new Error("Docker is not installed or not running");
      }
      mainProgress.update(10, { status: "Docker OK ✓" });

      // Step 2: Detect Architecture
      mainProgress.update(15, { status: "Detecting architecture..." });
      log.step(2, 11, "Detecting architecture...");
      const arch = await this.detectArchitecture();
      mainProgress.update(20, { status: `Architecture: ${arch} ✓` });

      // Step 3: Set credentials from sharedConfig
      log.step(3, 11, "Setting credentials...");
      if (sharedConfig?.bitcoin.rpcUser && sharedConfig?.bitcoin.rpcPassword) {
        this.rpcUser = sharedConfig.bitcoin.rpcUser;
        this.rpcPassword = sharedConfig.bitcoin.rpcPassword;
      }

      // Step 4: Ensure ports are available (auto-adjust if needed)
      mainProgress.update(25, { status: "Checking ports..." });
      log.step(4, 11, "Checking ports...");
      const ports = await this.ensurePortsAvailable();
      mainProgress.update(30, { status: "Ports available ✓" });

      // Update sharedConfig with actual ports being used
      if (sharedConfig) {
        sharedConfig.bitcoin.rpcPort = ports.rpc;
        sharedConfig.bitcoin.p2pPort = ports.p2p;
      }

      // Step 5: Setup Network
      mainProgress.update(35, { status: "Setting up network..." });
      log.step(5, 11, "Setting up network...");
      await this.ensureNetwork();
      mainProgress.update(40, { status: "Network ready ✓" });

      // Step 6: Prepare Data Directory
      mainProgress.update(45, { status: "Preparing data directory..." });
      log.step(6, 11, "Preparing data directory...");
      const bitcoinDataDir = this.config.volumes.bitcoinData;

      await fs.ensureDir(bitcoinDataDir);
      await fs.ensureDir(path.join(bitcoinDataDir, "regtest"));
      await fs.ensureDir(path.join(bitcoinDataDir, "regtest", "wallets"));

      // Clean up any existing mining_wallet to prevent conflicts
      const miningWalletPath = path.join(
        bitcoinDataDir,
        "regtest",
        "wallets",
        "mining_wallet",
      );
      if (await fs.pathExists(miningWalletPath)) {
        mainProgress.update(47, { status: "Cleaning old mining wallet..." });
        await fs.remove(miningWalletPath);
      }

      // Set permissions (777 for Docker compatibility)
      if (process.platform !== "win32") {
        try {
          await execAsync(`chmod -R 777 "${bitcoinDataDir}"`);
        } catch (error) {
          log.warn("Could not set directory permissions");
        }
      }
      mainProgress.update(50, { status: "Directories ready ✓" });

      // Step 7: Check Container Status & Clean Up
      mainProgress.update(55, { status: "Checking container status..." });
      log.step(7, 11, "Checking container status...");
      const status = await this.getContainerStatus();

      if (status.containerId) {
        mainProgress.update(57, { status: "Removing old container..." });
        try {
          if (status.running) {
            await execAsync(`docker stop ${this.config.containerName}`);
          }
          await execAsync(`docker rm ${this.config.containerName}`);
        } catch (error) {
          // Ignore errors, container might already be gone
        }
      }
      mainProgress.update(60, { status: "Ready to create ✓" });

      // Step 8: Create Container
      mainProgress.update(65, { status: "Creating container..." });
      log.step(8, 11, "Creating container...");
      let dockerCommand = `docker run -d --name ${this.config.containerName}`;
      log.command(`docker run -d --name ${this.config.containerName} ...`);
      // Add platform flag for ARM64 systems
      if (arch.includes("arm64") || arch.includes("aarch64")) {
        dockerCommand += ` --platform linux/amd64`;
      }

      dockerCommand += ` --network ${this.config.network}`;
      dockerCommand += ` -p ${this.config.ports.rpc}:${this.config.ports.rpc}`;
      dockerCommand += ` -p ${this.config.ports.p2p}:${this.config.ports.p2p}`;
      dockerCommand += ` -v "${bitcoinDataDir}":/home/bitcoin/.bitcoin`;
      dockerCommand += ` ${this.config.image}`;
      dockerCommand += ` -regtest=1`;
      dockerCommand += ` -server=1`;
      dockerCommand += ` -rest=1`;
      dockerCommand += ` -txindex=1`;
      dockerCommand += ` -printtoconsole=1`;
      dockerCommand += ` -rpcallowip=0.0.0.0/0`;
      dockerCommand += ` -rpcbind=0.0.0.0`;
      dockerCommand += ` -rpcport=${this.config.ports.rpc}`;
      dockerCommand += ` -port=${this.config.ports.p2p}`;
      dockerCommand += ` -rpcuser=${this.rpcUser}`;
      dockerCommand += ` -rpcpassword=${this.rpcPassword}`;
      dockerCommand += ` -fallbackfee=0.00001`;

      await execAsync(dockerCommand);
      mainProgress.update(70, { status: "Container created ✓" });

      // Step 9: Wait for Container to Start
      mainProgress.update(72, { status: "Waiting for container..." });
      log.step(9, 11, "Waiting for container startup...");
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const newStatus = await this.getContainerStatus();
      if (!newStatus.running) {
        multibar.stop();
        const logs = await this.getLogs(50);
        console.error("\n" + chalk.red("❌ Container failed to start!"));
        console.error(chalk.dim(logs));
        throw new Error("Container stopped immediately after starting");
      }
      mainProgress.update(75, { status: "Container running ✓" });

      // Step 10: Wait for RPC to be ready
      mainProgress.update(78, { status: "Waiting for RPC..." });
      log.step(10, 11, "Waiting for RPC...");
      await this.waitForRpcReady(multibar, mainProgress);
      mainProgress.update(90, { status: "RPC ready ✓" });

      // Step 11: Generate Initial Blocks (if requested)
      if (sharedConfig?.initialState.preGenerateBlocks) {
        mainProgress.update(92, { status: "Generating blocks..." });
        log.step(11, 11, "Generating initial blocks...");
        await this.generateInitialBlocks(
          sharedConfig.initialState.blockHeight,
          multibar,
          mainProgress,
        );
      }

      mainProgress.update(100, { status: "Complete ✓" });

      multibar.stop();
      log.info("\nBitcoin Core container started!\n");
    } catch (error: any) {
      multibar.stop();
      throw error;
    }
  }

  /**
   * Wait for RPC to be ready with retry logic
   */
  private async waitForRpcReady(
    multibar: cliProgress.MultiBar,
    mainProgress: cliProgress.SingleBar,
    maxAttempts = 60,
  ): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const status = await this.getContainerStatus();
        if (!status.running) {
          throw new Error("Container stopped unexpectedly");
        }

        await this.execBitcoinCli("getblockchaininfo");
        mainProgress.update(90, { status: "RPC connected ✓" });
        return;
      } catch (error: any) {
        const progress = 78 + (i / maxAttempts) * 12;
        mainProgress.update(progress, {
          status: `Waiting for RPC (${i + 1}/${maxAttempts})...`,
        });

        if (i === maxAttempts - 1) {
          multibar.stop();
          log.debug(`RPC connection failed after ${maxAttempts} attempts`);
          log.debug(
            `Credentials used — user: ${this.rpcUser}, pass: ${this.rpcPassword}`,
          );
          throw new Error(
            `RPC did not become ready after ${maxAttempts} attempts`,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * Generate initial blocks for testing
   */
  private async generateInitialBlocks(
    targetHeight: number,
    multibar: cliProgress.MultiBar,
    mainProgress: cliProgress.SingleBar,
  ): Promise<void> {
    try {
      mainProgress.update(93, { status: "Creating mining wallet..." });
      await this.execBitcoinCli('createwallet "mining_wallet"');

      mainProgress.update(95, { status: "Getting mining address..." });
      const address = await this.execBitcoinCli(
        "-rpcwallet=mining_wallet getnewaddress",
      );

      mainProgress.update(97, {
        status: `Generating ${targetHeight} blocks...`,
      });
      await this.execBitcoinCli(
        `-rpcwallet=mining_wallet generatetoaddress ${targetHeight} ${address.trim()}`,
      );
    } catch (error: any) {
      log.warn("Could not generate initial blocks");
      log.debug("Block generation error:", error.message);
    }
  }

  // ============================================================================
  // NGINX PROXY SETUP (CORS-enabled RPC access)
  // ============================================================================

  /**
   * Generate nginx configuration that proxies to Bitcoin Core
   */
  private generateNginxConfig(rpcPort: number): string {
    return `
events {
    worker_connections 1024;
}

http {
    upstream bitcoin_regtest {
        server ${this.config.containerName}:${rpcPort};
    }

    server {
        listen 8080;
        server_name localhost;

        # Disable request size limits for large transactions
        client_max_body_size 100m;

        location / {
            # Proxy to Bitcoin Core
            proxy_pass http://bitcoin_regtest;

            # Essential headers
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # HTTP version
            proxy_http_version 1.1;

            # Don't buffer - important for RPC
            proxy_buffering off;

            # Timeouts
            proxy_connect_timeout 300s;
            proxy_send_timeout 300s;
            proxy_read_timeout 300s;

            # CORS headers for Caravan (allow all methods including POST)
            add_header 'Access-Control-Allow-Origin' '*' always;
            add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
            add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, Accept, Origin, User-Agent, DNT, Cache-Control, X-Mx-ReqToken, Keep-Alive, X-Requested-With, If-Modified-Since' always;
            add_header 'Access-Control-Expose-Headers' 'Content-Length, Content-Range' always;
            add_header 'Access-Control-Allow-Credentials' 'true' always;

            # Handle preflight OPTIONS requests
            if ($request_method = 'OPTIONS') {
                add_header 'Access-Control-Allow-Origin' '*' always;
                add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
                add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, Accept, Origin, User-Agent, DNT, Cache-Control, X-Mx-ReqToken, Keep-Alive, X-Requested-With, If-Modified-Since' always;
                add_header 'Access-Control-Max-Age' 1728000;
                add_header 'Content-Type' 'text/plain; charset=utf-8';
                add_header 'Content-Length' 0;
                return 204;
            }
        }
    }
}`.trim();
  }

  /**
   * Setup nginx proxy with automatic port detection
   * Returns the actual nginx port used (may differ from 8080 if port was taken)
   */
  async setupNginxProxy(
    sharedConfig?: SharedConfig,
    force: boolean = false,
  ): Promise<number> {
    const spinner = ora("Setting up nginx proxy...").start();

    try {
      // Check if nginx container exists
      const { stdout: nginxContainers } = await execAsync(
        "docker ps -a --filter name=caravan-x-nginx --format '{{.ID}}'",
      );

      // If container exists and we're not forcing recreation
      if (nginxContainers.trim() && !force) {
        const { stdout: runningStatus } = await execAsync(
          "docker ps --filter name=caravan-x-nginx --format '{{.Status}}'",
        );

        if (runningStatus.trim()) {
          spinner.succeed("Nginx proxy already running");
          // Extract port from existing container
          const { stdout: portInfo } = await execAsync(
            "docker port caravan-x-nginx 8080 2>/dev/null || echo '8080'",
          );
          const nginxPort = parseInt(portInfo.split(":")[1]) || 8080;
          return nginxPort;
        } else {
          // Start existing container
          spinner.text = "Starting existing nginx container...";
          await execAsync("docker start caravan-x-nginx");
          spinner.succeed("Nginx proxy started");
          return 8080;
        }
      }

      // Remove old container if forcing recreation
      if (nginxContainers.trim()) {
        spinner.text = "Removing old nginx container...";
        await execAsync("docker rm -f caravan-x-nginx 2>/dev/null || true");
      }

      // Get the Bitcoin Core RPC port (might have been auto-adjusted)
      const rpcPort = sharedConfig?.bitcoin.rpcPort || this.config.ports.rpc;

      // Find an available nginx port (starting from 8080)
      spinner.text = "Finding available nginx port...";
      const nginxPort = await this.findAvailablePort(8080);

      if (nginxPort !== 8080) {
        log.info(`Port 8080 in use, using ${nginxPort} instead\n`);
      }

      // Create nginx config
      const nginxConfigDir = path.join(this.dataDir, "nginx");
      await fs.ensureDir(nginxConfigDir);

      const nginxConfig = this.generateNginxConfig(rpcPort);
      await fs.writeFile(path.join(nginxConfigDir, "nginx.conf"), nginxConfig);

      spinner.text = "Creating nginx container...";

      // Start nginx container with dynamic port mapping
      // Maps host port (nginxPort) to container port 8080
      const nginxCommand = `docker run -d \
         --name caravan-x-nginx \
         --network ${this.config.network} \
         -p ${nginxPort}:8080 \
         -v "${nginxConfigDir}/nginx.conf":/etc/nginx/nginx.conf:ro \
         nginx:alpine`;

      await execAsync(nginxCommand.replace(/\s+/g, " "));

      // Wait for nginx to start
      await new Promise((resolve) => setTimeout(resolve, 2000));

      spinner.succeed(
        chalk.green(`Nginx proxy ready → http://localhost:${nginxPort}`),
      );

      return nginxPort;
    } catch (error: any) {
      spinner.fail("Failed to setup nginx proxy");
      throw error;
    }
  }

  // ============================================================================
  // WALLET MANAGEMENT
  // ============================================================================

  /**
   * Create watch-only wallet for Caravan
   */
  async createWatchOnlyWallet(walletName: string): Promise<void> {
    const spinner = ora(`Creating watch-only wallet: ${walletName}...`).start();

    try {
      // Check if wallet already exists
      const wallets = await this.execBitcoinCli("listwallets");
      if (wallets.includes(walletName)) {
        spinner.info(`Wallet "${walletName}" already exists`);
        return;
      }

      // Create watch-only wallet (descriptor-based, no private keys)
      await this.execBitcoinCli(
        `createwallet "${walletName}" true true "" false true true`,
      );

      spinner.succeed(`Watch-only wallet "${walletName}" created`);
    } catch (error: any) {
      spinner.fail("Failed to create watch-only wallet");
      throw error;
    }
  }

  // ============================================================================
  // COMPLETE SETUP (Bitcoin + Nginx + Wallet)
  // ============================================================================

  /**
   * Complete Docker setup - orchestrates all components
   *
   * This is the MAIN entry point for Docker mode setup. It:
   * 1. Checks and auto-adjusts ports if needed
   * 2. Starts Bitcoin Core container
   * 3. Sets up nginx proxy for CORS-enabled RPC access
   * 4. Creates watch-only wallet
   * 5. Tests the connection
   * 6. Displays connection info
   *
   *  @returns The actual nginx port used
   */
  async completeSetup(sharedConfig?: SharedConfig): Promise<number> {
    log.info("\n Complete Docker Setup\n");

    try {
      // Step 1: Ensure ports are available (auto-adjust if needed)
      log.info("Checking port availability...\n");
      const ports = await this.ensurePortsAvailable();

      // Update shared config with actual ports
      if (sharedConfig) {
        sharedConfig.bitcoin.rpcPort = ports.rpc;
        sharedConfig.bitcoin.p2pPort = ports.p2p;
      }

      // Step 2: Start Bitcoin Core container
      await this.startContainer(sharedConfig);

      // Step 3: Setup nginx proxy
      log.info("\n Setting up nginx proxy...\n");

      // Clean up any existing nginx first
      try {
        await execAsync("docker stop caravan-x-nginx 2>/dev/null || true");
        await execAsync("docker rm caravan-x-nginx 2>/dev/null || true");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (e) {
        // Ignore cleanup errors
      }

      // Create fresh nginx proxy (returns actual port used)
      const nginxPort = await this.setupNginxProxy(sharedConfig, true);

      // Wait for nginx to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Step 4: Create watch-only wallet
      const walletName = sharedConfig?.walletName || "caravan_watcher";
      log.info(`\n Creating watch-only wallet...\n`);
      await this.createWatchOnlyWallet(walletName);

      // Step 5: Test connection through nginx
      log.info("\n Testing connection...\n");
      const connected = await this.testConnection("localhost", nginxPort);

      if (!connected) {
        console.log(
          chalk.yellow(
            "\n⚠️  Connection test failed, but containers are running",
          ),
        );
        console.log(chalk.dim("You can test manually with:"));
        console.log(
          chalk.cyan(`  curl -u ${this.rpcUser}:${this.rpcPassword} \\`),
        );
        console.log(
          chalk.cyan(
            `    -d '{"jsonrpc":"1.0","method":"getblockchaininfo","params":[]}' \\`,
          ),
        );
        console.log(chalk.cyan(`    http://localhost:${nginxPort}\n`));
      }

      // Step 6: Display connection info
      await this.displayConnectionInfo(sharedConfig, nginxPort, ports.rpc);
      // RETURN the actual nginx port so it can be saved to config
      return nginxPort;
    } catch (error: any) {
      throw CaravanXError.from(error);
      throw error;
    }
  }

  // ============================================================================
  // CONNECTION TESTING & INFO
  // ============================================================================

  /**
   * Test RPC connection through nginx proxy
   */
  async testConnection(
    host: string = "localhost",
    port: number = 8080,
  ): Promise<boolean> {
    const spinner = ora("Testing connection...").start();

    try {
      const axios = require("axios");
      const response = await axios.post(
        `http://${host}:${port}`,
        {
          jsonrpc: "1.0",
          id: "test",
          method: "getblockchaininfo",
          params: [],
        },
        {
          auth: {
            username: this.rpcUser,
            password: this.rpcPassword,
          },
          timeout: 5000,
        },
      );

      if (response.data && response.data.result) {
        spinner.succeed(chalk.green("Connection successful!"));
        console.log(
          chalk.cyan("  Chain:"),
          chalk.white(response.data.result.chain),
        );
        console.log(
          chalk.cyan("  Blocks:"),
          chalk.white(response.data.result.blocks),
        );
        return true;
      } else {
        spinner.fail("Unexpected response from Bitcoin Core");
        return false;
      }
    } catch (error: any) {
      spinner.fail("Connection failed");
      console.error(chalk.red("  Error:"), error.message);
      return false;
    }
  }

  /**
   * Get Bitcoin blockchain info
   */
  async getBitcoinInfo(): Promise<{
    blocks: number;
    chain: string;
    wallets: string[];
  }> {
    const info = JSON.parse(await this.execBitcoinCli("getblockchaininfo"));
    const walletsStr = await this.execBitcoinCli("listwallets");
    const wallets = JSON.parse(walletsStr);

    return {
      blocks: info.blocks,
      chain: info.chain,
      wallets: wallets,
    };
  }

  /**
   * Display comprehensive connection information and instructions
   */
  async displayConnectionInfo(
    sharedConfig?: SharedConfig,
    nginxPort: number = 8080,
    bitcoinRpcPort: number = 18443,
  ): Promise<void> {
    try {
      const info = await this.getBitcoinInfo();
      const walletName = sharedConfig?.walletName || "caravan_watcher";

      console.log("\n");
      console.log(
        boxen(
          chalk.bold.green("✅ Docker Setup Complete!\n\n") +
            chalk.white.bold("🐳 Bitcoin Core is running in Docker\n") +
            chalk.white.bold("🌐 Nginx proxy is active for CORS support\n") +
            chalk.white.bold("📁 Watch-only wallet created\n\n") +
            chalk.cyan("Ready to connect with Caravan!"),
          {
            padding: 1,
            margin: 1,
            borderStyle: "double",
            borderColor: "green",
          },
        ),
      );

      console.log(chalk.bold.cyan("\n━".repeat(70)));
      console.log(chalk.bold.white("\n📡 Connection Settings:\n"));
      console.log(
        chalk.cyan("  URL:            ") +
          chalk.white.bold(`http://localhost:${nginxPort}`),
      );
      console.log(
        chalk.cyan("  Username:       ") + chalk.white.bold(this.rpcUser),
      );
      console.log(
        chalk.cyan("  Password:       ") + chalk.white.bold(this.rpcPassword),
      );
      console.log(
        chalk.cyan("  Wallet Name:    ") + chalk.white.bold(walletName),
      );

      console.log(chalk.bold.white("\n📊 Blockchain Status:\n"));
      console.log(chalk.cyan("  Network:        ") + chalk.white(info.chain));
      console.log(chalk.cyan("  Blocks:         ") + chalk.white(info.blocks));
      console.log(
        chalk.cyan("  Wallets:        ") +
          chalk.white(info.wallets.join(", ") || "none"),
      );

      console.log(chalk.bold.white("\n🔧 Technical Details:\n"));
      console.log(
        chalk.dim("  Bitcoin RPC:    ") +
          chalk.dim(`localhost:${bitcoinRpcPort}`),
      );
      console.log(
        chalk.dim("  Nginx Proxy:    ") + chalk.dim(`localhost:${nginxPort}`),
      );

      console.log(chalk.bold.cyan("━".repeat(70)));
      console.log(chalk.bold.yellow("\n🚀 How to Connect with Caravan:\n"));

      console.log(chalk.white.bold("\n  Step 1: Start Caravan Coordinator"));
      console.log(chalk.dim("    cd caravan"));
      console.log(chalk.dim("    npm start"));
      console.log(chalk.dim("    (Usually runs on http://localhost:5173)\n"));

      console.log(chalk.white.bold("  Step 2: Open Caravan in Browser"));
      console.log(
        chalk.dim("    Navigate to: ") + chalk.cyan("http://localhost:5173\n"),
      );

      console.log(chalk.white.bold("  Step 3: Configure Bitcoin Client"));
      console.log(
        chalk.dim("    1. Go to ") + chalk.white("Settings → Bitcoin Client"),
      );
      console.log(chalk.dim("    2. Select ") + chalk.white("Private"));
      console.log(chalk.dim("    3. Select ") + chalk.white("Custom"));
      console.log(chalk.dim("    4. Enter these settings:\n"));

      console.log(
        boxen(
          chalk.cyan("URL:           ") +
            chalk.white.bold(`http://localhost:${nginxPort}\n`) +
            chalk.cyan("Username:      ") +
            chalk.white.bold(`${this.rpcUser}\n`) +
            chalk.cyan("Password:      ") +
            chalk.white.bold(`${this.rpcPassword}\n`) +
            chalk.cyan("Wallet Name:   ") +
            chalk.white.bold(`${walletName}`) +
            chalk.dim(" (optional)"),
          {
            padding: 1,
            margin: { top: 0, bottom: 1, left: 4, right: 0 },
            borderStyle: "round",
            borderColor: "cyan",
          },
        ),
      );

      console.log(chalk.white.bold("  Step 4: Test Connection"));
      console.log(chalk.dim("    Click ") + chalk.white("'Test Connection'"));
      console.log(
        chalk.dim("    You should see: ") +
          chalk.green("✓ Connected to regtest"),
      );

      console.log(chalk.bold.cyan("━".repeat(70)));

      console.log(chalk.bold.white("\n💡 Quick Tips:\n"));
      console.log(chalk.dim("  • Nginx proxy handles CORS automatically"));
      console.log(
        chalk.dim("  • All ports are auto-detected to avoid conflicts"),
      );
      console.log(
        chalk.dim("  • Run ") +
          chalk.white("'caravan-x'") +
          chalk.dim(" anytime to manage your setup"),
      );
      console.log(
        chalk.dim("  • Use ") +
          chalk.white("'Docker Management'") +
          chalk.dim(" menu for container operations"),
      );

      console.log(chalk.bold.cyan("━".repeat(70) + "\n"));

      console.log(
        chalk.green("🎉 You're all set! Start building with Caravan.\n"),
      );
    } catch (error) {
      console.log(chalk.yellow("\n⚠️  Could not fetch connection info"));
      console.log(chalk.dim("Containers are running, but status check failed"));
    }
  }

  // ============================================================================
  // CONTAINER LIFECYCLE OPERATIONS
  // ============================================================================

  async stopContainer(): Promise<void> {
    const spinner = ora("Stopping Bitcoin Core...").start();
    try {
      const status = await this.getContainerStatus();
      if (!status.running) {
        spinner.info("Container not running");
        return;
      }
      await execAsync(`docker stop ${this.config.containerName}`);
      spinner.succeed("Container stopped");
    } catch (error: any) {
      spinner.fail("Failed to stop container");
      throw error;
    }
  }

  async restartContainer(): Promise<void> {
    const spinner = ora("Restarting Bitcoin Core...").start();
    try {
      await execAsync(`docker restart ${this.config.containerName}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      spinner.succeed("Container restarted");
    } catch (error: any) {
      spinner.fail("Failed to restart");
      throw error;
    }
  }

  async removeContainer(): Promise<void> {
    const spinner = ora("Removing container...").start();
    try {
      const status = await this.getContainerStatus();
      if (!status.containerId) {
        spinner.info("Container does not exist");
        return;
      }
      if (status.running) {
        await execAsync(`docker stop ${this.config.containerName}`);
      }
      await execAsync(`docker rm ${this.config.containerName}`);
      spinner.succeed("Container removed");
    } catch (error: any) {
      spinner.fail("Failed to remove container");
      throw error;
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Execute bitcoin-cli command inside container
   */
  async execBitcoinCli(command: string): Promise<string> {
    try {
      const cliCommand = `docker exec ${this.config.containerName} bitcoin-cli -regtest -rpcuser="${this.rpcUser}" -rpcpassword="${this.rpcPassword}" ${command}`;
      const { stdout } = await execAsync(cliCommand);
      return stdout.trim();
    } catch (error: any) {
      throw new Error(`Bitcoin CLI failed: ${error.message}`);
    }
  }

  async getLogs(tail = 100): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `docker logs --tail ${tail} ${this.config.containerName}`,
      );
      return stdout;
    } catch (error: any) {
      throw new Error(`Failed to get logs: ${error.message}`);
    }
  }

  async openShell(): Promise<void> {
    console.log(chalk.cyan("\n🐚 Opening shell..."));
    console.log(chalk.yellow("Type 'exit' to return\n"));

    const shell = spawn(
      "docker",
      ["exec", "-it", this.config.containerName, "/bin/bash"],
      { stdio: "inherit" },
    );

    return new Promise((resolve, reject) => {
      shell.on("close", (code) => {
        code === 0
          ? resolve()
          : reject(new Error(`Shell exited with code ${code}`));
      });
    });
  }
}
