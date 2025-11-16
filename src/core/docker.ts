import { spawn } from "child_process";
import * as fs from "fs-extra";
import * as path from "path";
import ora from "ora";
import chalk from "chalk";
import cliProgress from "cli-progress";
import { DockerConfig, SharedConfig } from "../types/config";
import { execAsync } from "../utils/exec";

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
  private rpcUser: string = "user";
  private rpcPassword: string = "pass";

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
   * Check if a port is in use
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
   * Check if ports are available
   */
  async checkPortsAvailable(): Promise<PortCheckResult> {
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
      await execAsync(`docker network create ${this.config.network}`);
    }
  }

  /**
   * Generate bitcoin.conf file
   */
  /**
   * Generate bitcoin.conf file
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
   * Generate nginx configuration
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
  }
  `.trim();
  }

  /**
   * Start Bitcoin Core container with beautiful progress UI
   */
  async startContainer(sharedConfig?: SharedConfig): Promise<void> {
    console.log(chalk.bold.cyan("\n🚀 Starting Bitcoin Core Container\n"));

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
        throw new Error("Docker is not installed or not running");
      }
      mainProgress.update(10, { status: "Docker OK ✓" });

      // Step 2: Detect Architecture (20%)
      mainProgress.update(15, { status: "Detecting architecture..." });
      const arch = await this.detectArchitecture();
      mainProgress.update(20, { status: `Architecture: ${arch} ✓` });

      if (sharedConfig?.bitcoin.rpcUser && sharedConfig?.bitcoin.rpcPassword) {
        this.rpcUser = sharedConfig.bitcoin.rpcUser;
        this.rpcPassword = sharedConfig.bitcoin.rpcPassword;

        console.log(
          chalk.dim(`\n  [DEBUG] Credentials set from sharedConfig:`),
        );
        console.log(chalk.dim(`    User: ${this.rpcUser}`));
        console.log(
          chalk.dim(`    Pass: ${this.rpcPassword.substring(0, 3)}***\n`),
        );
      } else {
        console.log(
          chalk.yellow(`\n  [WARNING] No sharedConfig credentials found!`),
        );
        console.log(
          chalk.yellow(
            `    Using defaults: ${this.rpcUser}:${this.rpcPassword}\n`,
          ),
        );
      }

      // Step 3: Check Ports (30%)
      mainProgress.update(25, { status: "Checking ports..." });
      try {
        await this.checkAndCleanupPorts();
        mainProgress.update(30, { status: "Ports available ✓" });
      } catch (error: any) {
        multibar.stop();
        console.error(chalk.red("\n❌ Port Conflict Error\n"));
        console.error(chalk.white(error.message));
        console.error(chalk.yellow("\n💡 Solutions:"));
        console.error(chalk.dim("  1. Manually stop the conflicting process"));
        console.error(chalk.dim("  2. Change the ports in your config"));
        console.error(
          chalk.dim("  3. Use Docker Management → Troubleshoot Port Issues\n"),
        );
        throw error;
      }

      // Step 4: Setup Network (40%)
      mainProgress.update(35, { status: "Setting up network..." });
      await this.ensureNetwork();
      mainProgress.update(40, { status: "Network ready ✓" });

      // Step 5: Prepare Data Directory (50%)
      mainProgress.update(45, { status: "Preparing data directory..." });
      const bitcoinDataDir = this.config.volumes.bitcoinData;

      await fs.ensureDir(bitcoinDataDir);
      await fs.ensureDir(path.join(bitcoinDataDir, "regtest"));
      await fs.ensureDir(path.join(bitcoinDataDir, "regtest", "wallets"));

      // Clean up any existing mining_wallet to prevent conflicts**
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

      if (process.platform !== "win32") {
        try {
          // **CHANGED: Use 777 instead of 755 for Docker container access**
          await execAsync(`chmod -R 777 "${bitcoinDataDir}"`);
        } catch (error) {
          console.warn(
            chalk.yellow("Warning: Could not set directory permissions"),
          );
        }
      }
      mainProgress.update(50, { status: "Directories ready ✓" });

      // Step 6: Check Container Status & Clean Up (60%)
      mainProgress.update(55, { status: "Checking container status..." });
      const status = await this.getContainerStatus();

      if (status.containerId) {
        mainProgress.update(57, { status: "Removing old container..." });
        try {
          // Stop if running
          if (status.running) {
            await execAsync(`docker stop ${this.config.containerName}`);
          }
          // Remove container
          await execAsync(`docker rm ${this.config.containerName}`);
        } catch (error) {
          // Ignore errors, container might already be gone
        }
      }
      mainProgress.update(60, { status: "Ready to create ✓" });

      // Step 7: Create Container (70%)
      mainProgress.update(65, { status: "Creating container..." });

      let dockerCommand = `docker run -d --name ${this.config.containerName}`;

      if (arch.includes("arm64") || arch.includes("aarch64")) {
        dockerCommand += ` --platform linux/amd64`;
      }

      dockerCommand += ` --network ${this.config.network}`;
      dockerCommand += ` -p ${this.config.ports.rpc}:${this.config.ports.rpc}`;
      dockerCommand += ` -p ${this.config.ports.p2p}:${this.config.ports.p2p}`;
      dockerCommand += ` -v "${bitcoinDataDir}":/home/bitcoin/.bitcoin`;

      // Bitcoin Core official image
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

      try {
        console.log(chalk.dim("\n  Starting Bitcoin Core with:"));
        console.log(chalk.dim(`  Image: ${this.config.image}`));
        console.log(chalk.dim(`  User: ${this.rpcUser}`));
        console.log(
          chalk.dim(`  Pass: ${this.rpcPassword.substring(0, 3)}***\n`),
        );

        await execAsync(dockerCommand);
        mainProgress.update(70, { status: "Container created ✓" });
      } catch (error: any) {
        multibar.stop();
        throw error;
      }

      // Step 8: Wait for Container to Start (75%)
      mainProgress.update(72, { status: "Waiting for container..." });
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

      // Step 9: Wait for RPC (90%)
      mainProgress.update(78, { status: "Waiting for RPC..." });
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
      console.log(chalk.bold.green("\n✅ Bitcoin Core container started!\n"));
    } catch (error: any) {
      multibar.stop();
      throw error;
    }
  }

  /**
   * Wait for RPC to be ready
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

        // Use the stored credentials
        await this.execBitcoinCli("getblockchaininfo");

        // Success!
        mainProgress.update(90, { status: "RPC connected ✓" });
        return;
      } catch (error: any) {
        const progress = 78 + (i / maxAttempts) * 12;
        mainProgress.update(progress, {
          status: `Waiting for RPC (${i + 1}/${maxAttempts})...`,
        });

        // Log password attempt errors for debugging
        if (
          error.message.includes("incorrect password") ||
          error.message.includes("401")
        ) {
          console.log(chalk.dim(`\n  Debug: Password mismatch detected`));
          console.log(
            chalk.dim(
              `  Using: ${this.rpcUser}:${this.rpcPassword.substring(0, 3)}***`,
            ),
          );
        }

        if (i === maxAttempts - 1) {
          multibar.stop();

          // Show helpful error message
          console.error(chalk.red("\n❌ RPC Connection Failed\n"));
          console.error(chalk.white("Credentials being used:"));
          console.error(chalk.cyan(`  User: ${this.rpcUser}`));
          console.error(chalk.cyan(`  Pass: ${this.rpcPassword}`));
          console.error(chalk.white("\nCheck container logs:"));
          console.error(
            chalk.gray(`  docker logs ${this.config.containerName} | tail -20`),
          );

          throw new Error(
            `RPC did not become ready after ${maxAttempts} attempts. Credential mismatch likely.`,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * Generate initial blocks
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
      console.error(chalk.yellow("\n⚠️  Could not generate initial blocks"));
      console.error(chalk.dim(error.message));
    }
  }

  /**
   * Setup nginx proxy
   */
  /**
   * Setup nginx proxy
   */
  async setupNginxProxy(
    sharedConfig?: SharedConfig,
    force: boolean = false,
  ): Promise<void> {
    const spinner = ora("Setting up nginx proxy...").start();

    try {
      // Check if nginx container exists
      const { stdout: nginxContainers } = await execAsync(
        "docker ps -a --filter name=caravan-x-nginx --format '{{.ID}}'",
      );

      if (nginxContainers.trim() && !force) {
        // Check if running
        const { stdout: runningStatus } = await execAsync(
          "docker ps --filter name=caravan-x-nginx --format '{{.Status}}'",
        );

        if (runningStatus.trim()) {
          spinner.succeed("Nginx proxy already running");
          return;
        } else {
          // Start existing container
          spinner.text = "Starting nginx proxy...";
          await execAsync("docker start caravan-x-nginx");
          spinner.succeed("Nginx proxy started");
          return;
        }
      }

      // Remove old container if exists
      if (nginxContainers.trim()) {
        spinner.text = "Removing old nginx container...";
        await execAsync("docker rm -f caravan-x-nginx 2>/dev/null || true");
      }

      // Create new nginx setup
      const rpcPort = sharedConfig?.bitcoin.rpcPort || 18443;
      const nginxConfigDir = path.join(this.dataDir, "nginx");
      await fs.ensureDir(nginxConfigDir);

      const nginxConfig = this.generateNginxConfig(rpcPort);
      await fs.writeFile(path.join(nginxConfigDir, "nginx.conf"), nginxConfig);

      spinner.text = "Creating nginx container...";

      // Start nginx container with proper network connection
      const nginxCommand = `docker run -d \
         --name caravan-x-nginx \
         --network ${this.config.network} \
         -p 8080:8080 \
         -v "${nginxConfigDir}/nginx.conf":/etc/nginx/nginx.conf:ro \
         nginx:alpine`;

      await execAsync(nginxCommand.replace(/\s+/g, " "));

      // Wait for nginx to start
      await new Promise((resolve) => setTimeout(resolve, 2000));

      spinner.succeed("Nginx proxy started on http://localhost:8080");
    } catch (error: any) {
      spinner.fail("Failed to setup nginx proxy");
      throw error;
    }
  }
  /**
   * Create watch-only wallet
   */
  async createWatchOnlyWallet(walletName: string): Promise<void> {
    const spinner = ora(`Creating watch-only wallet: ${walletName}...`).start();

    try {
      // Check if wallet exists
      const wallets = await this.execBitcoinCli("listwallets");
      if (wallets.includes(walletName)) {
        spinner.info(`Wallet "${walletName}" already exists`);
        return;
      }

      // Create watch-only wallet
      // Parameters: wallet_name, disable_private_keys, blank, passphrase, avoid_reuse, descriptors, load_on_startup
      await this.execBitcoinCli(
        `createwallet "${walletName}" true true "" false true true`,
      );

      spinner.succeed(`Watch-only wallet "${walletName}" created`);
    } catch (error: any) {
      spinner.fail("Failed to create watch-only wallet");
      throw error;
    }
  }

  /**
   * Test RPC connection
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
   * Get Bitcoin info
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
   * Complete setup - Container + Nginx + Wallet
   */
  /**
   * Complete setup - Container + Nginx + Wallet
   */
  /**
   * Complete setup - Container + Nginx + Wallet
   */
  async completeSetup(sharedConfig?: SharedConfig): Promise<void> {
    console.log(chalk.bold.cyan("\n🚀 Complete Docker Setup\n"));

    try {
      // First cleanup any conflicts
      console.log(chalk.cyan("🔍 Checking for port conflicts...\n"));
      await this.checkAndCleanupPorts();

      // Start Bitcoin Core
      await this.startContainer(sharedConfig);

      // IMPORTANT: Restart nginx to ensure proper connection
      console.log();
      const spinner = ora("Ensuring nginx connection...").start();
      try {
        // Stop nginx if running
        await execAsync("docker stop caravan-x-nginx 2>/dev/null || true");
        await execAsync("docker rm caravan-x-nginx 2>/dev/null || true");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        spinner.text = "Setting up nginx proxy...";
      } catch (e) {}
      spinner.stop();

      // Setup nginx proxy (fresh start)
      await this.setupNginxProxy(sharedConfig);

      // Wait for nginx to be ready
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Create watch-only wallet
      const walletName = sharedConfig?.walletName || "caravan_watcher";
      await this.createWatchOnlyWallet(walletName);

      // Test connection
      console.log();
      const connected = await this.testConnection();

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
        console.log(chalk.cyan(`    http://localhost:8080\n`));
      }

      // Display connection info
      await this.displayConnectionInfo(sharedConfig);
    } catch (error: any) {
      console.error(chalk.red("\n❌ Setup failed:"), error.message);
      throw error;
    }
  }

  /**
   * Find what's using a port
   */
  async findPortUser(port: number): Promise<{
    type: "docker" | "system" | "unknown";
    containerId?: string;
    containerName?: string;
    pid?: number;
  }> {
    try {
      // Check if it's a Docker container
      const { stdout: dockerCheck } = await execAsync(
        `docker ps --format "{{.ID}}|{{.Names}}|{{.Ports}}" | grep ":${port}"`,
      );

      if (dockerCheck.trim()) {
        const [containerId, containerName] = dockerCheck.trim().split("|");
        return {
          type: "docker",
          containerId: containerId.trim(),
          containerName: containerName.trim(),
        };
      }

      // Check system process
      const { stdout: processCheck } = await execAsync(
        `lsof -i :${port} -t 2>/dev/null || netstat -anp 2>/dev/null | grep ${port} | awk '{print $7}' | cut -d'/' -f1 || echo ""`,
      );

      if (processCheck.trim()) {
        return {
          type: "system",
          pid: parseInt(processCheck.trim()),
        };
      }

      return { type: "unknown" };
    } catch (error) {
      return { type: "unknown" };
    }
  }

  /**
   * Clean up port conflicts automatically
   */
  async cleanupPortConflicts(): Promise<void> {
    const spinner = ora("Cleaning up port conflicts...").start();

    try {
      const portsToCheck = [this.config.ports.rpc, this.config.ports.p2p];
      const conflicts: Array<{ port: number; info: any }> = [];

      // Find all conflicts
      for (const port of portsToCheck) {
        if (await this.isPortInUse(port)) {
          const info = await this.findPortUser(port);
          conflicts.push({ port, info });
        }
      }

      if (conflicts.length === 0) {
        spinner.succeed("No port conflicts found");
        return;
      }

      // Handle Docker container conflicts
      const dockerConflicts = conflicts.filter((c) => c.info.type === "docker");
      if (dockerConflicts.length > 0) {
        spinner.text = "Stopping conflicting Docker containers...";

        for (const conflict of dockerConflicts) {
          const { containerId, containerName } = conflict.info;

          console.log(
            chalk.yellow(
              `\n  Stopping container: ${containerName} (${containerId})`,
            ),
          );

          try {
            await execAsync(`docker stop ${containerId}`);
            await execAsync(`docker rm ${containerId}`);
            console.log(chalk.green(`  ✓ Removed ${containerName}`));
          } catch (err) {
            console.log(chalk.red(`  ✗ Failed to remove ${containerName}`));
          }
        }
      }

      // Handle system process conflicts
      const systemConflicts = conflicts.filter((c) => c.info.type === "system");
      if (systemConflicts.length > 0) {
        spinner.warn("Some ports are used by system processes");

        for (const conflict of systemConflicts) {
          console.log(
            chalk.yellow(
              `\n  Port ${conflict.port} is used by PID ${conflict.info.pid}`,
            ),
          );
        }

        spinner.fail("Cannot auto-cleanup system processes");
        throw new Error(
          "Please manually stop the processes using ports: " +
            systemConflicts.map((c) => c.port).join(", "),
        );
      }

      // Wait a moment for ports to be released
      await new Promise((resolve) => setTimeout(resolve, 2000));

      spinner.succeed("Port conflicts cleaned up");
    } catch (error: any) {
      spinner.fail("Failed to cleanup port conflicts");
      throw error;
    }
  }

  /**
   * Check and cleanup ports before starting
   */
  async checkAndCleanupPorts(): Promise<void> {
    const portStatus = await this.checkPortsAvailable();

    if (portStatus.conflicts.length > 0) {
      console.log(chalk.yellow("\n⚠️  Port conflicts detected:"));
      portStatus.conflicts.forEach((conflict) => {
        console.log(chalk.dim(`  • ${conflict}`));
      });

      console.log(chalk.cyan("\n🔧 Attempting automatic cleanup...\n"));
      await this.cleanupPortConflicts();

      // Verify cleanup worked
      const recheckStatus = await this.checkPortsAvailable();
      if (recheckStatus.conflicts.length > 0) {
        throw new Error(
          "Port conflicts remain after cleanup:\n" +
            recheckStatus.conflicts.join("\n"),
        );
      }

      console.log(chalk.green("✓ All ports are now available\n"));
    }
  }

  /**
   * Display connection information
   */
  async displayConnectionInfo(sharedConfig?: SharedConfig): Promise<void> {
    try {
      const info = await this.getBitcoinInfo();
      const walletName = sharedConfig?.walletName || "caravan_watcher";

      console.log(chalk.bold.green("\n✅ Setup Complete! Ready for Caravan\n"));
      console.log(chalk.bold.cyan("━".repeat(70)));
      console.log(chalk.bold.white("\n📡 Connection Settings for Caravan:\n"));
      console.log(
        chalk.cyan("  URL:            ") + chalk.white("http://localhost:8080"),
      );
      console.log(chalk.cyan("  Username:       ") + chalk.white(this.rpcUser));
      console.log(
        chalk.cyan("  Password:       ") + chalk.white(this.rpcPassword),
      );
      console.log(chalk.cyan("  Wallet Name:    ") + chalk.white(walletName));

      console.log(chalk.bold.white("\n📊 Current Status:\n"));
      console.log(chalk.cyan("  Chain:          ") + chalk.white(info.chain));
      console.log(chalk.cyan("  Blocks:         ") + chalk.white(info.blocks));
      console.log(
        chalk.cyan("  Wallets:        ") +
          chalk.white(info.wallets.join(", ") || "none"),
      );

      console.log(chalk.bold.cyan("\n━".repeat(70)));
      console.log(
        chalk.bold.yellow(
          "\n📝 Connect from Local Caravan (http://localhost:5173):\n",
        ),
      );
      console.log(chalk.white("  1. Navigate to Wallet Settings"));
      console.log(chalk.white("  2. Choose 'Private' → 'Custom'"));
      console.log(chalk.white("  3. Enter connection details:"));
      console.log(
        chalk.cyan("     URL:         ") + chalk.white("http://localhost:8080"),
      );
      console.log(chalk.cyan("     Username:    ") + chalk.white(this.rpcUser));
      console.log(
        chalk.cyan("     Password:    ") + chalk.white(this.rpcPassword),
      );
      console.log(chalk.cyan("     Wallet Name: ") + chalk.white(walletName));
      console.log(chalk.white("  4. Click 'Test Connection'"));
      console.log(chalk.white("  5. Create/Import multisig wallet"));
      console.log(
        chalk.white("  6. Click 'Import Addresses' to watch wallet\n"),
      );
    } catch (error: any) {
      console.error(chalk.red("Error getting info:"), error.message);
    }
  }

  /**
   * Stop container
   */
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

  /**
   * Restart container
   */
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

  /**
   * Remove container
   */
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

  /**
   * Execute bitcoin-cli command
   */
  async execBitcoinCli(command: string): Promise<string> {
    try {
      // DEBUG: Log what we're actually using
      console.log(
        chalk.dim(
          `\n  [DEBUG] execBitcoinCli using: ${this.rpcUser}:${this.rpcPassword.substring(0, 3)}***`,
        ),
      );

      const cliCommand = `docker exec ${this.config.containerName} bitcoin-cli -regtest -rpcuser="${this.rpcUser}" -rpcpassword="${this.rpcPassword}" ${command}`;

      console.log(
        chalk.dim(`  [DEBUG] Full command: ${cliCommand.substring(0, 100)}...`),
      );

      const { stdout } = await execAsync(cliCommand);
      return stdout.trim();
    } catch (error: any) {
      throw new Error(`Bitcoin CLI failed: ${error.message}`);
    }
  }

  /**
   * Get logs
   */
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

  /**
   * Open shell
   */
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
