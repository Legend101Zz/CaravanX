/**
 * Docker Management Service for Caravan-X
 * Handles spinning up and managing Bitcoin Core containers in regtest mode
 */

import { exec, spawn } from "child_process";
import { promisify } from "util";
import * as fs from "fs-extra";
import * as path from "path";
import chalk from "chalk";
import ora from "ora";
import { DockerConfig, SharedConfig } from "../types/config";

const execAsync = promisify(exec);

export interface DockerStatus {
  running: boolean;
  containerId?: string;
  ports?: {
    rpc: number;
    p2p: number;
  };
  network?: string;
}

export class DockerService {
  private config: DockerConfig;
  private dataDir: string;

  constructor(config: DockerConfig, dataDir: string) {
    this.config = config;
    this.dataDir = dataDir;
  }

  /**
   * Check if Docker is installed and running
   */
  async checkDockerAvailable(): Promise<boolean> {
    try {
      await execAsync("docker --version");
      await execAsync("docker ps");
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
  async checkPortsAvailable(): Promise<{
    rpc: boolean;
    p2p: boolean;
    conflicts: string[];
  }> {
    const conflicts: string[] = [];

    try {
      // Check RPC port
      try {
        const { stdout: rpcCheck } = await execAsync(
          `lsof -i :${this.config.ports.rpc} 2>/dev/null || netstat -an 2>/dev/null | grep ${this.config.ports.rpc} || echo 'free'`,
        );
        if (!rpcCheck.includes("free")) {
          conflicts.push(`Port ${this.config.ports.rpc} (RPC) is in use`);
        }
      } catch (e) {
        // Port check failed, assume available
      }

      // Check P2P port
      try {
        const { stdout: p2pCheck } = await execAsync(
          `lsof -i :${this.config.ports.p2p} 2>/dev/null || netstat -an 2>/dev/null | grep ${this.config.ports.p2p} || echo 'free'`,
        );
        if (!p2pCheck.includes("free")) {
          conflicts.push(`Port ${this.config.ports.p2p} (P2P) is in use`);
        }
      } catch (e) {
        // Port check failed, assume available
      }
    } catch (error) {
      // If we can't check, assume ports are available
    }

    return {
      rpc: !conflicts.some((c) => c.includes("RPC")),
      p2p: !conflicts.some((c) => c.includes("P2P")),
      conflicts,
    };
  }

  /**
   * Check if the Bitcoin container is running
   */
  async getContainerStatus(): Promise<DockerStatus> {
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
daemon=1

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
   * Start Bitcoin Core container
   */
  async startContainer(sharedConfig?: SharedConfig): Promise<void> {
    const spinner = ora("Starting Bitcoin Core container...").start();

    try {
      // Check if Docker is available
      const dockerAvailable = await this.checkDockerAvailable();
      if (!dockerAvailable) {
        throw new Error(
          "Docker is not installed or not running. Please install Docker first.",
        );
      }

      // Check system architecture
      const arch = await this.detectArchitecture();
      spinner.text = `Detected architecture: ${arch}`;

      // Check if ports are available
      spinner.text = "Checking port availability...";
      const portStatus = await this.checkPortsAvailable();

      if (portStatus.conflicts.length > 0) {
        spinner.stop();
        const conflictError = new Error(
          `Port conflict detected:\n${portStatus.conflicts.join("\n")}`,
        );
        conflictError.name = "PortConflictError";
        throw conflictError;
      }

      // Ensure network exists
      spinner.text = "Setting up Docker network...";
      await this.ensureNetwork();

      // Create data directory if it doesn't exist
      const bitcoinDataDir = path.join(this.dataDir, "bitcoin-data");
      await fs.ensureDir(bitcoinDataDir);

      // Generate bitcoin.conf
      const bitcoinConf = this.generateBitcoinConf(sharedConfig);
      await fs.writeFile(
        path.join(bitcoinDataDir, "bitcoin.conf"),
        bitcoinConf,
      );

      // Check if container already exists
      const status = await this.getContainerStatus();

      if (status.containerId) {
        // Container exists, check if it's running
        if (status.running) {
          spinner.succeed("Bitcoin Core container is already running");
          return;
        } else {
          // Start existing container
          spinner.text = "Starting existing Bitcoin Core container...";
          await execAsync(`docker start ${this.config.containerName}`);
        }
      } else {
        // Create and start new container
        spinner.text = "Creating new Bitcoin Core container...";

        // Build docker command with proper quoting and platform support
        let dockerCommand = `docker run -d --name ${this.config.containerName}`;

        // Add platform flag for ARM64 systems (Apple Silicon)
        if (arch.includes("arm64") || arch.includes("aarch64")) {
          spinner.text = "Creating container (ARM64 - using emulation)...";
          dockerCommand += ` --platform linux/amd64`;
        }

        // Add network and ports
        dockerCommand += ` --network ${this.config.network}`;
        dockerCommand += ` -p ${this.config.ports.rpc}:${this.config.ports.rpc}`;
        dockerCommand += ` -p ${this.config.ports.p2p}:${this.config.ports.p2p}`;

        // Add volume with proper quoting for paths with spaces
        dockerCommand += ` -v "${bitcoinDataDir}":/bitcoin/.bitcoin`;

        // Add image and config
        dockerCommand += ` ${this.config.image}`;
        dockerCommand += ` -conf=/bitcoin/.bitcoin/bitcoin.conf`;

        await execAsync(dockerCommand);
      }

      // Wait for container to be ready
      spinner.text = "Waiting for Bitcoin Core to be ready...";
      await this.waitForRpcReady();

      // Generate initial blocks if specified in shared config
      if (sharedConfig?.initialState.preGenerateBlocks) {
        spinner.text = "Generating initial blocks...";
        await this.generateInitialBlocks(sharedConfig.initialState.blockHeight);
      }

      spinner.succeed("Bitcoin Core container started successfully");
    } catch (error: any) {
      spinner.fail("Failed to start Bitcoin Core container");
      throw error;
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
   * Wait for RPC to be ready
   */
  private async waitForRpcReady(maxAttempts = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await this.execBitcoinCli("getblockchaininfo");
        return; // RPC is ready
      } catch (error) {
        // Wait 1 second before trying again
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    throw new Error("Bitcoin Core RPC did not become ready in time");
  }

  /**
   * Generate initial blocks
   */
  private async generateInitialBlocks(targetHeight: number): Promise<void> {
    try {
      // Create a temporary wallet for mining
      await this.execBitcoinCli('createwallet "mining_wallet"');

      // Get a mining address
      const address = await this.execBitcoinCli(
        "-rpcwallet=mining_wallet getnewaddress",
      );

      // Generate blocks to the target height
      await this.execBitcoinCli(
        `-rpcwallet=mining_wallet generatetoaddress ${targetHeight} ${address.trim()}`,
      );
    } catch (error: any) {
      console.error("Error generating initial blocks:", error.message);
      // Don't throw - this is not critical
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
   * Restart container
   */
  async restartContainer(): Promise<void> {
    const spinner = ora("Restarting Bitcoin Core container...").start();

    try {
      await execAsync(`docker restart ${this.config.containerName}`);

      // Wait for RPC to be ready
      spinner.text = "Waiting for Bitcoin Core to be ready...";
      await this.waitForRpcReady();

      spinner.succeed("Bitcoin Core container restarted");
    } catch (error: any) {
      spinner.fail("Failed to restart Bitcoin Core container");
      throw error;
    }
  }

  /**
   * Open a shell in the container
   */
  async openShell(): Promise<void> {
    console.log(chalk.cyan("\nOpening shell in Bitcoin Core container..."));
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
