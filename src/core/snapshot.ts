/**
 * Snapshot Service for Caravan-X
 * Handles saving and restoring blockchain states in regtest mode
 */

import * as fs from "fs-extra";
import * as path from "path";
import * as crypto from "crypto";
import { promisify } from "util";
import { exec } from "child_process";
import chalk from "chalk";
import ora from "ora";
import { BlockchainSnapshot } from "../types/config";
import { BitcoinRpcClient } from "./rpc";

const execAsync = promisify(exec);

export interface SnapshotOptions {
  name: string;
  description?: string;
  tags?: string[];
  includeWallets?: string[];
  scenario?: string;
}

export interface SnapshotDiff {
  snapshot1: BlockchainSnapshot;
  snapshot2: BlockchainSnapshot;
  blocksDiff: number;
  walletsDiff: {
    added: string[];
    removed: string[];
    common: string[];
  };
  heightDiff: number;
}

export class SnapshotService {
  private readonly rpc: BitcoinRpcClient;
  private readonly snapshotsDir: string;
  private readonly bitcoinDataDir: string;

  constructor(
    rpc: BitcoinRpcClient,
    snapshotsDir: string,
    bitcoinDataDir: string,
  ) {
    this.rpc = rpc;
    this.snapshotsDir = snapshotsDir;
    this.bitcoinDataDir = bitcoinDataDir;

    // Ensure snapshots directory exists
    fs.ensureDirSync(this.snapshotsDir);
  }

  /**
   * Create a snapshot of the current blockchain state
   */
  async createSnapshot(options: SnapshotOptions): Promise<BlockchainSnapshot> {
    const spinner = ora(`Creating snapshot: ${options.name}`).start();

    try {
      // Get current blockchain info
      const blockchainInfo = await this.rpc.callRpc<any>("getblockchaininfo");
      const blockHash = await this.rpc.callRpc<string>("getblockhash", [
        blockchainInfo.blocks,
      ]);

      // Get list of loaded wallets
      const wallets = options.includeWallets || (await this.rpc.listWallets());

      // Generate snapshot ID
      const id = this.generateSnapshotId(options.name);

      // Create snapshot metadata
      const snapshot: BlockchainSnapshot = {
        id,
        name: options.name,
        description: options.description,
        createdAt: new Date().toISOString(),
        blockHeight: blockchainInfo.blocks,
        blockHash,
        wallets,
        filePath: path.join(this.snapshotsDir, `${id}.tar.gz`),
        metadata: {
          tags: options.tags,
          scenario: options.scenario,
        },
      };

      // Create temporary directory for snapshot
      const tempDir = path.join(this.snapshotsDir, `temp_${id}`);
      await fs.ensureDir(tempDir);

      try {
        // Copy regtest blockchain data
        spinner.text = "Copying blockchain data...";
        const regtestDir = path.join(this.bitcoinDataDir, "regtest");
        const snapshotRegtestDir = path.join(tempDir, "regtest");
        await fs.ensureDir(snapshotRegtestDir);

        // Copy only necessary files (blocks, chainstate, wallets)
        await this.copyDirectory(
          path.join(regtestDir, "blocks"),
          path.join(snapshotRegtestDir, "blocks"),
        );
        await this.copyDirectory(
          path.join(regtestDir, "chainstate"),
          path.join(snapshotRegtestDir, "chainstate"),
        );

        // Copy wallet files if they exist
        if (wallets.length > 0) {
          const walletsDir = path.join(regtestDir, "wallets");
          const snapshotWalletsDir = path.join(snapshotRegtestDir, "wallets");

          for (const wallet of wallets) {
            const walletPath = path.join(walletsDir, wallet);
            if (await fs.pathExists(walletPath)) {
              await this.copyDirectory(
                walletPath,
                path.join(snapshotWalletsDir, wallet),
              );
            }
          }
        }

        // Save snapshot metadata
        spinner.text = "Saving snapshot metadata...";
        await fs.writeJson(path.join(tempDir, "snapshot.json"), snapshot, {
          spaces: 2,
        });

        // Create compressed archive
        spinner.text = "Compressing snapshot...";
        await this.createTarGz(tempDir, snapshot.filePath);

        // Save snapshot reference
        await this.saveSnapshotReference(snapshot);

        spinner.succeed(`Snapshot created: ${snapshot.name} (${id})`);
        return snapshot;
      } finally {
        // Clean up temporary directory
        await fs.remove(tempDir);
      }
    } catch (error: any) {
      spinner.fail("Failed to create snapshot");
      throw error;
    }
  }

  /**
   * Restore a snapshot
   */
  async restoreSnapshot(
    snapshotId: string,
    options: { stopBitcoin?: boolean; restartBitcoin?: boolean } = {},
  ): Promise<void> {
    const spinner = ora("Restoring snapshot...").start();

    try {
      // Get snapshot metadata
      const snapshot = await this.getSnapshot(snapshotId);
      if (!snapshot) {
        throw new Error(`Snapshot not found: ${snapshotId}`);
      }

      // Verify snapshot file exists
      if (!(await fs.pathExists(snapshot.filePath))) {
        throw new Error(`Snapshot file not found: ${snapshot.filePath}`);
      }

      // Stop Bitcoin Core if requested
      if (options.stopBitcoin) {
        spinner.text = "Stopping Bitcoin Core...";
        try {
          await this.rpc.callRpc("stop");
          // Wait for Bitcoin to stop
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error) {
          // Bitcoin might already be stopped
        }
      }

      // Create temporary directory for extraction
      const tempDir = path.join(this.snapshotsDir, `restore_${Date.now()}`);
      await fs.ensureDir(tempDir);

      try {
        // Extract snapshot
        spinner.text = "Extracting snapshot...";
        await this.extractTarGz(snapshot.filePath, tempDir);

        // Backup current data
        spinner.text = "Backing up current data...";
        const backupDir = path.join(this.snapshotsDir, `backup_${Date.now()}`);
        const regtestDir = path.join(this.bitcoinDataDir, "regtest");

        if (await fs.pathExists(regtestDir)) {
          await this.copyDirectory(regtestDir, backupDir);
        }

        // Restore data
        spinner.text = "Restoring blockchain data...";
        const snapshotRegtestDir = path.join(tempDir, "regtest");

        // Remove current data
        if (await fs.pathExists(regtestDir)) {
          await fs.remove(regtestDir);
        }

        // Copy snapshot data
        await this.copyDirectory(snapshotRegtestDir, regtestDir);

        // Restart Bitcoin Core if requested
        if (options.restartBitcoin) {
          spinner.text = "Restarting Bitcoin Core...";
          // This would require integration with the Docker service or system service
          // For now, just inform the user
          spinner.info(
            "Please restart Bitcoin Core manually to apply the snapshot",
          );
        }

        spinner.succeed(`Snapshot restored: ${snapshot.name}`);
        console.log(chalk.cyan(`\nBlock height: ${snapshot.blockHeight}`));
        console.log(chalk.cyan(`Block hash: ${snapshot.blockHash}`));
        console.log(chalk.cyan(`Wallets: ${snapshot.wallets.join(", ")}`));
      } finally {
        // Clean up temporary directory
        await fs.remove(tempDir);
      }
    } catch (error: any) {
      spinner.fail("Failed to restore snapshot");
      throw error;
    }
  }

  /**
   * List all snapshots
   */
  async listSnapshots(): Promise<BlockchainSnapshot[]> {
    try {
      const snapshotsFile = path.join(this.snapshotsDir, "snapshots.json");

      if (!(await fs.pathExists(snapshotsFile))) {
        return [];
      }

      const snapshots = await fs.readJson(snapshotsFile);
      return snapshots || [];
    } catch (error) {
      console.error("Error listing snapshots:", error);
      return [];
    }
  }

  /**
   * Get a specific snapshot by ID or name
   */
  async getSnapshot(idOrName: string): Promise<BlockchainSnapshot | null> {
    const snapshots = await this.listSnapshots();
    return (
      snapshots.find((s) => s.id === idOrName || s.name === idOrName) || null
    );
  }

  /**
   * Delete a snapshot
   */
  async deleteSnapshot(snapshotId: string): Promise<void> {
    const spinner = ora("Deleting snapshot...").start();

    try {
      const snapshot = await this.getSnapshot(snapshotId);
      if (!snapshot) {
        throw new Error(`Snapshot not found: ${snapshotId}`);
      }

      // Delete snapshot file
      if (await fs.pathExists(snapshot.filePath)) {
        await fs.remove(snapshot.filePath);
      }

      // Remove from snapshots list
      const snapshots = await this.listSnapshots();
      const updatedSnapshots = snapshots.filter((s) => s.id !== snapshot.id);
      await this.saveSnapshotsList(updatedSnapshots);

      spinner.succeed(`Snapshot deleted: ${snapshot.name}`);
    } catch (error: any) {
      spinner.fail("Failed to delete snapshot");
      throw error;
    }
  }

  /**
   * Compare two snapshots
   */
  async diffSnapshots(
    snapshot1Id: string,
    snapshot2Id: string,
  ): Promise<SnapshotDiff> {
    const snapshot1 = await this.getSnapshot(snapshot1Id);
    const snapshot2 = await this.getSnapshot(snapshot2Id);

    if (!snapshot1 || !snapshot2) {
      throw new Error("One or both snapshots not found");
    }

    const wallets1Set = new Set(snapshot1.wallets);
    const wallets2Set = new Set(snapshot2.wallets);

    const added = snapshot2.wallets.filter((w) => !wallets1Set.has(w));
    const removed = snapshot1.wallets.filter((w) => !wallets2Set.has(w));
    const common = snapshot1.wallets.filter((w) => wallets2Set.has(w));

    return {
      snapshot1,
      snapshot2,
      blocksDiff: snapshot2.blockHeight - snapshot1.blockHeight,
      walletsDiff: {
        added,
        removed,
        common,
      },
      heightDiff: snapshot2.blockHeight - snapshot1.blockHeight,
    };
  }

  /**
   * Generate a unique snapshot ID
   */
  private generateSnapshotId(name: string): string {
    const timestamp = Date.now();
    const hash = crypto
      .createHash("sha256")
      .update(`${name}_${timestamp}`)
      .digest("hex")
      .substring(0, 8);
    return `snapshot_${hash}_${timestamp}`;
  }

  /**
   * Save snapshot reference
   */
  private async saveSnapshotReference(
    snapshot: BlockchainSnapshot,
  ): Promise<void> {
    const snapshots = await this.listSnapshots();
    snapshots.push(snapshot);
    await this.saveSnapshotsList(snapshots);
  }

  /**
   * Save snapshots list
   */
  private async saveSnapshotsList(
    snapshots: BlockchainSnapshot[],
  ): Promise<void> {
    const snapshotsFile = path.join(this.snapshotsDir, "snapshots.json");
    await fs.writeJson(snapshotsFile, snapshots, { spaces: 2 });
  }

  /**
   * Copy directory recursively
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.copy(src, dest, {
      overwrite: true,
      errorOnExist: false,
    });
  }

  /**
   * Create tar.gz archive
   */
  private async createTarGz(
    sourceDir: string,
    outputFile: string,
  ): Promise<void> {
    await execAsync(`tar -czf "${outputFile}" -C "${sourceDir}" .`);
  }

  /**
   * Extract tar.gz archive
   */
  private async extractTarGz(
    archiveFile: string,
    outputDir: string,
  ): Promise<void> {
    await execAsync(`tar -xzf "${archiveFile}" -C "${outputDir}"`);
  }

  /**
   * Auto-snapshot based on interval
   */
  async createAutoSnapshot(): Promise<BlockchainSnapshot> {
    const blockchainInfo = await this.rpc.callRpc<any>("getblockchaininfo");

    return this.createSnapshot({
      name: `auto_${Date.now()}`,
      description: `Auto-snapshot at block ${blockchainInfo.blocks}`,
      tags: ["auto"],
    });
  }
}
