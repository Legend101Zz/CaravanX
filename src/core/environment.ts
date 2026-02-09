/**
 * Environment Sharing Service for Caravan-X
 *
 * Handles exporting and importing complete regtest environments
 * as .caravan-env archives. This is the core of the "it works on
 * my machine" solution — package everything and share it.
 *
 * Export flow:
 * 1. Stop Bitcoin Core (or flush to disk)
 * 2. Capture blockchain data (blocks + chainstate)
 * 3. Export wallet descriptors (with private keys for signers)
 * 4. Package Caravan wallet configs + key data
 * 5. Generate integrity checksums
 * 6. Create .caravan-env tar.gz archive
 *
 * Import flow:
 * 1. Verify archive integrity
 * 2. Stop existing Bitcoin Core
 * 3. Replace regtest data with archived data (binary mode)
 *    OR replay the construction steps (replay mode)
 * 4. Start Bitcoin Core
 * 5. Verify blockchain state matches expected
 * 6. Copy Caravan configs and key data
 */

import * as fs from "fs-extra";
import * as path from "path";
import * as crypto from "crypto";
import { promisify } from "util";
import { exec } from "child_process";
import chalk from "chalk";
import ora, { Ora } from "ora";
import cliProgress from "cli-progress";
import { BitcoinRpcClient } from "./rpc";
import { CaravanService } from "./caravan";
import { BitcoinService } from "./bitcoin";
import { DockerService } from "./docker";
import { SnapshotService } from "./snapshot";
import {
  EnvironmentManifest,
  WalletDescriptorExport,
  FullWalletExport,
  ReplayScript,
  ReplayStep,
  EnvironmentExportOptions,
  EnvironmentImportOptions,
  EnvironmentImportResult,
} from "../types/environment";
import { EnhancedAppConfig, SetupMode, SharedConfig } from "../types/config";

const execAsync = promisify(exec);

/** Current schema version for .caravan-env archives */
const ENV_SCHEMA_VERSION = "1.0.0";

/** Caravan-X version — update with releases */
const CARAVAN_X_VERSION = "1.3.0";

export class EnvironmentService {
  private readonly rpc: BitcoinRpcClient;
  private readonly caravanService: CaravanService;
  private readonly bitcoinService: BitcoinService;
  private readonly dockerService: DockerService | null;
  private readonly config: EnhancedAppConfig;

  constructor(
    rpc: BitcoinRpcClient,
    caravanService: CaravanService,
    bitcoinService: BitcoinService,
    config: EnhancedAppConfig,
    dockerService?: DockerService,
  ) {
    this.rpc = rpc;
    this.caravanService = caravanService;
    this.bitcoinService = bitcoinService;
    this.config = config;
    this.dockerService = dockerService || null;
  }

  // ==========================================================================
  // EXPORT
  // ==========================================================================

  /**
   * Export the current environment as a .caravan-env archive.
   * This is the main entry point for environment sharing.
   */
  async exportEnvironment(options: EnvironmentExportOptions): Promise<string> {
    const spinner = ora("Preparing environment export...").start();

    // Create a temporary staging directory
    const stagingDir = path.join(
      this.config.appDir,
      `env_export_${Date.now()}`,
    );
    await fs.ensureDir(stagingDir);

    try {
      // ── Step 1: Gather blockchain state info ──
      spinner.text = "Querying blockchain state...";
      const blockchainInfo = await this.rpc.callRpc<any>("getblockchaininfo");
      const bestBlockHash = await this.rpc.callRpc<string>("getblockhash", [
        blockchainInfo.blocks,
      ]);

      let bitcoinCoreVersion: string | undefined;
      try {
        const networkInfo = await this.rpc.callRpc<any>("getnetworkinfo");
        bitcoinCoreVersion = `${networkInfo.version}`;
      } catch {
        // Not critical
      }

      // ── Step 2: Get list of all wallets ──
      spinner.text = "Discovering wallets...";
      const loadedWallets = await this.rpc.callRpc<string[]>("listwallets");
      const walletsToExport = options.walletFilter?.length
        ? loadedWallets.filter((w) => options.walletFilter!.includes(w))
        : loadedWallets;

      // ── Step 3: Export wallet descriptors ──
      spinner.text = "Exporting wallet descriptors...";
      const walletExports = await this.exportAllWalletDescriptors(
        walletsToExport,
        options.includePrivateKeys,
      );

      // Save descriptor exports
      const descriptorsDir = path.join(stagingDir, "descriptors");
      await fs.ensureDir(descriptorsDir);
      for (const walletExport of walletExports) {
        const filename = `${walletExport.descriptorExport.walletName}.json`;
        await fs.writeJson(path.join(descriptorsDir, filename), walletExport, {
          spaces: 2,
        });
      }

      // ── Step 4: Copy Caravan wallet configs ──
      spinner.text = "Packaging Caravan wallet configs...";
      const caravanDir = path.join(stagingDir, "caravan-wallets");
      await fs.ensureDir(caravanDir);

      const caravanWalletNames: string[] = [];
      const caravanConfigs = await this.caravanService.listCaravanWallets();
      for (const config of caravanConfigs) {
        const srcFile = path.join(
          this.caravanService.getCaravanDir(),
          (config as any).filename || `${config.name}_config.json`,
        );
        if (await fs.pathExists(srcFile)) {
          const destFile = path.join(caravanDir, path.basename(srcFile));
          await fs.copy(srcFile, destFile);
          caravanWalletNames.push(config.name);
        }
      }

      // ── Step 5: Copy key data ──
      spinner.text = "Packaging key data...";
      const keysDir = path.join(stagingDir, "keys");
      await fs.ensureDir(keysDir);

      const keyFileNames: string[] = [];
      if (await fs.pathExists(this.config.keysDir)) {
        const keyFiles = await fs.readdir(this.config.keysDir);
        for (const keyFile of keyFiles) {
          if (keyFile.endsWith(".json")) {
            await fs.copy(
              path.join(this.config.keysDir, keyFile),
              path.join(keysDir, keyFile),
            );
            keyFileNames.push(keyFile);
          }
        }
      }

      // ── Step 6: Copy scenario scripts ──
      spinner.text = "Packaging scenarios...";
      const scenariosDir = path.join(stagingDir, "scenarios");
      await fs.ensureDir(scenariosDir);

      const scenarioNames: string[] = [];
      if (
        this.config.scenariosDir &&
        (await fs.pathExists(this.config.scenariosDir))
      ) {
        const scenarioFiles = await fs.readdir(this.config.scenariosDir);
        for (const file of scenarioFiles) {
          if (file.endsWith(".js") || file.endsWith(".json")) {
            await fs.copy(
              path.join(this.config.scenariosDir, file),
              path.join(scenariosDir, file),
            );
            scenarioNames.push(file);
          }
        }
      }

      // ── Step 7: Capture binary blockchain data ──
      let blockchainDataChecksum: string | undefined;

      if (options.includeBlockchainData) {
        spinner.text = "Capturing blockchain data (this may take a moment)...";

        const blockchainDir = path.join(stagingDir, "blockchain");
        await fs.ensureDir(blockchainDir);

        // Determine the regtest data directory
        const regtestDir = await this.getRegtestDataDir();

        if (regtestDir && (await fs.pathExists(regtestDir))) {
          // Copy blocks directory
          const blocksDir = path.join(regtestDir, "blocks");
          if (await fs.pathExists(blocksDir)) {
            spinner.text = "Copying blockchain blocks...";
            await fs.copy(blocksDir, path.join(blockchainDir, "blocks"));
          }

          // Copy chainstate directory
          const chainstateDir = path.join(regtestDir, "chainstate");
          if (await fs.pathExists(chainstateDir)) {
            spinner.text = "Copying chainstate...";
            await fs.copy(
              chainstateDir,
              path.join(blockchainDir, "chainstate"),
            );
          }

          // Copy Bitcoin Core wallet directories (the actual wallet.dat / db files)
          const coreWalletsDir = path.join(regtestDir, "wallets");
          if (await fs.pathExists(coreWalletsDir)) {
            spinner.text = "Copying Bitcoin Core wallet files...";
            const bcWalletsDir = path.join(blockchainDir, "wallets");
            await fs.ensureDir(bcWalletsDir);

            for (const wallet of walletsToExport) {
              const walletDir = path.join(coreWalletsDir, wallet);
              if (await fs.pathExists(walletDir)) {
                await fs.copy(walletDir, path.join(bcWalletsDir, wallet));
              }
            }
          }

          const settingsFile = path.join(regtestDir, "settings.json");
          if (await fs.pathExists(settingsFile)) {
            await fs.copy(
              settingsFile,
              path.join(blockchainDir, "settings.json"),
            );
          }

          // Compute checksum of the blockchain data
          spinner.text = "Computing blockchain data checksum...";
          const blockchainTarPath = path.join(
            stagingDir,
            "blockchain-data.tar.gz",
          );
          await this.createTarGz(blockchainDir, blockchainTarPath);
          blockchainDataChecksum =
            await this.computeFileChecksum(blockchainTarPath);

          // Remove the uncompressed directory, keep only the tarball
          await fs.remove(blockchainDir);
        } else {
          spinner.warn(
            "Could not locate regtest data directory — skipping binary blockchain data",
          );
        }
      }

      // ── Step 8: Generate replay script (optional) ──
      let hasReplayScript = false;
      if (options.generateReplayScript) {
        spinner.text = "Generating declarative replay script...";
        const replayScript = await this.generateReplayScript(
          walletsToExport,
          walletExports,
          blockchainInfo.blocks,
        );
        await fs.writeJson(path.join(stagingDir, "replay.json"), replayScript, {
          spaces: 2,
        });
        hasReplayScript = true;
      }

      // ── Step 9: Save shared config ──
      spinner.text = "Saving configuration...";
      const configDir = path.join(stagingDir, "config");
      await fs.ensureDir(configDir);

      // Save a sanitized version of the enhanced config
      const sanitizedConfig = this.sanitizeConfigForExport(this.config);
      await fs.writeJson(
        path.join(configDir, "enhanced-config.json"),
        sanitizedConfig,
        { spaces: 2 },
      );

      if (this.config.sharedConfig) {
        await fs.writeJson(
          path.join(configDir, "shared-config.json"),
          this.config.sharedConfig,
          { spaces: 2 },
        );
      }

      // ── Step 10: Compute file checksums ──
      spinner.text = "Computing file checksums...";
      const fileChecksums = await this.computeDirectoryChecksums(stagingDir);

      // ── Step 11: Create manifest ──
      spinner.text = "Creating manifest...";
      const manifest: EnvironmentManifest = {
        version: ENV_SCHEMA_VERSION,
        name: options.name,
        description: options.description,
        createdBy: options.createdBy,
        createdAt: new Date().toISOString(),
        caravanXVersion: CARAVAN_X_VERSION,
        bitcoinCoreVersion,
        network: "regtest",
        blockchainState: {
          blockHeight: blockchainInfo.blocks,
          blockHash: bestBlockHash,
          chainWork: blockchainInfo.chainwork,
        },
        contents: {
          hasBlockchainData: options.includeBlockchainData,
          bitcoinWallets: walletsToExport,
          caravanWallets: caravanWalletNames,
          keyFiles: keyFileNames,
          scenarios: scenarioNames,
          hasReplayScript,
        },
        checksums: {
          blockchainData: blockchainDataChecksum,
          files: fileChecksums,
        },
        mode: this.config.mode === SetupMode.DOCKER ? "docker" : "manual",
        rpcConfig: {
          rpcUser: this.config.bitcoin.user,
          rpcPassword: this.config.bitcoin.pass,
          rpcPort: this.config.bitcoin.port,
          p2pPort: this.config.sharedConfig?.bitcoin.p2pPort || 18444,
        },
        docker: this.config.docker
          ? {
              image: this.config.docker.image,
              containerName: this.config.docker.containerName,
              nginxPort: this.config.docker.ports.nginx,
            }
          : undefined,
      };

      await fs.writeJson(path.join(stagingDir, "manifest.json"), manifest, {
        spaces: 2,
      });

      // ── Step 12: Create the final .caravan-env archive ──
      spinner.text = "Creating .caravan-env archive...";

      const outputPath = options.outputPath.endsWith(".caravan-env")
        ? options.outputPath
        : `${options.outputPath}.caravan-env`;

      await this.createTarGz(stagingDir, outputPath);

      // Get file size for display
      const stats = await fs.stat(outputPath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      spinner.succeed(
        chalk.green(`Environment exported: ${outputPath} (${sizeMB} MB)`),
      );

      console.log(chalk.cyan("\n📦 Environment Package Summary:"));
      console.log(chalk.dim("─".repeat(50)));
      console.log(`  Name:             ${manifest.name}`);
      console.log(
        `  Block Height:     ${manifest.blockchainState.blockHeight}`,
      );
      console.log(
        `  Bitcoin Wallets:  ${manifest.contents.bitcoinWallets.length}`,
      );
      console.log(
        `  Caravan Wallets:  ${manifest.contents.caravanWallets.length}`,
      );
      console.log(`  Key Files:        ${manifest.contents.keyFiles.length}`);
      console.log(
        `  Blockchain Data:  ${manifest.contents.hasBlockchainData ? "✅ Included" : "❌ Not included"}`,
      );
      console.log(
        `  Replay Script:    ${manifest.contents.hasReplayScript ? "✅ Included" : "❌ Not included"}`,
      );
      console.log(chalk.dim("─".repeat(50)));

      return outputPath;
    } finally {
      // Clean up staging directory
      await fs.remove(stagingDir);
    }
  }

  // ==========================================================================
  // IMPORT
  // ==========================================================================

  /**
   * Import an environment from a .caravan-env archive.
   * This replaces the current regtest environment with the archived one.
   */
  async importEnvironment(
    options: EnvironmentImportOptions,
  ): Promise<EnvironmentImportResult> {
    const result: EnvironmentImportResult = {
      success: false,
      method: "binary",
      blockHeight: 0,
      walletsImported: [],
      caravanWalletsImported: [],
      warnings: [],
      errors: [],
    };

    const spinner = ora("Reading environment archive...").start();

    // Create a temporary extraction directory
    const extractDir = path.join(
      this.config.appDir,
      `env_import_${Date.now()}`,
    );
    await fs.ensureDir(extractDir);

    try {
      // ── Step 1: Extract archive ──
      if (!(await fs.pathExists(options.archivePath))) {
        throw new Error(`Archive not found: ${options.archivePath}`);
      }

      spinner.text = "Extracting archive...";
      await this.extractTarGz(options.archivePath, extractDir);

      // ── Step 2: Read and validate manifest ──
      spinner.text = "Validating manifest...";
      const manifestPath = path.join(extractDir, "manifest.json");
      if (!(await fs.pathExists(manifestPath))) {
        throw new Error(
          "Invalid .caravan-env archive: manifest.json not found",
        );
      }

      const manifest: EnvironmentManifest = await fs.readJson(manifestPath);

      // Version check
      const [majorSchema] = manifest.version.split(".");
      if (parseInt(majorSchema) > 1) {
        result.warnings.push(
          `Archive schema version ${manifest.version} is newer than supported. Some features may not import correctly.`,
        );
      }

      // ── Step 3: Verify integrity ──
      if (!options.skipVerification) {
        spinner.text = "Verifying archive integrity...";
        const integrityOk = await this.verifyArchiveIntegrity(
          extractDir,
          manifest,
        );
        if (!integrityOk) {
          result.warnings.push(
            "Some checksums did not match — archive may have been modified",
          );
        }
      }

      // Display manifest info
      spinner.info(chalk.cyan("Environment details:"));
      console.log(`  Name:          ${manifest.name}`);
      console.log(`  Block Height:  ${manifest.blockchainState.blockHeight}`);
      console.log(
        `  Created:       ${new Date(manifest.createdAt).toLocaleString()}`,
      );
      console.log(
        `  Bitcoin Core:  ${manifest.bitcoinCoreVersion || "unknown"}`,
      );
      console.log(
        `  Wallets:       ${manifest.contents.bitcoinWallets.join(", ")}`,
      );
      if (manifest.description) {
        console.log(`  Description:   ${manifest.description}`);
      }
      console.log("");

      // ── Step 4: Determine import method ──
      let importMethod = options.method;
      if (importMethod === "auto") {
        // Prefer binary if blockchain data is available
        importMethod = manifest.contents.hasBlockchainData
          ? "binary"
          : "replay";
      }

      if (importMethod === "binary" && !manifest.contents.hasBlockchainData) {
        spinner.warn(
          "Binary import requested but no blockchain data in archive. Falling back to replay.",
        );
        importMethod = "replay";
      }

      if (importMethod === "replay" && !manifest.contents.hasReplayScript) {
        throw new Error(
          "Replay import requested but no replay script found in archive. " +
            "Re-export with generateReplayScript enabled.",
        );
      }

      result.method = importMethod;

      // ── Step 5: Stop Bitcoin Core ──
      spinner.text = "Stopping Bitcoin Core...";
      await this.stopBitcoinCore();

      // ── Step 6: Import based on method ──
      if (importMethod === "binary") {
        await this.importBinary(extractDir, manifest, spinner, result, options);
      } else {
        await this.importReplay(extractDir, manifest, spinner, result, options);
      }

      // ── Step 6b: Start Docker container with imported data ──
      // DEV: Binary import only copies files into the volume directory.
      // The container doesn't exist yet for freshly created profiles.
      // We need to start it so it mounts the imported data and becomes
      // reachable on restart.
      if (this.config.mode === SetupMode.DOCKER && this.dockerService) {
        spinner.text = "Starting Docker container with imported data...";
        spinner.info("Starting Docker container with imported data...");

        try {
          // Build a SharedConfig from the manifest so Docker uses
          // the correct credentials and ports.
          // preGenerateBlocks = false because we already have the data.
          const sharedConfig: SharedConfig = {
            version: "1.0.0",
            name: manifest.name,
            description: manifest.description || "",
            mode: SetupMode.DOCKER,
            bitcoin: {
              network: manifest.network as "regtest" | "signet" | "testnet",
              rpcPort: manifest.rpcConfig.rpcPort,
              p2pPort: manifest.rpcConfig.p2pPort,
              rpcUser: manifest.rpcConfig.rpcUser,
              rpcPassword: manifest.rpcConfig.rpcPassword,
            },
            docker: this.config.docker!,
            initialState: {
              blockHeight: 0,
              preGenerateBlocks: false, // Already have imported blocks
              wallets: [],
              transactions: [],
            },
            walletName: "caravan_watcher",
            snapshots: {
              enabled: true,
              autoSnapshot: false,
            },
          };

          // Start Bitcoin Core container — it will mount the volume
          // where importBinary just wrote blocks/chainstate/wallets
          // DEV: skipDataPrep=true prevents startContainer from deleting
          // imported wallet files (like mining_wallet) that contain the
          // coinbase rewards funding the entire environment.
          // reindex=true forces Bitcoin Core to rebuild the block
          // index from raw blk*.dat files. This is necessary because
          // LevelDB files (blocks/index, chainstate) copied from
          // a running instance may have inconsistent internal state.
          // During reindex, Bitcoin Core also re-processes all blocks
          // through loaded wallets, so balances are automatically correct.
          await this.dockerService.startContainer(sharedConfig, {
            skipDataPrep: true,
            reindex: true,
          });

          // Set up nginx proxy for CORS-enabled RPC access
          spinner.text = "Setting up nginx proxy...";
          const nginxPort = await this.dockerService.setupNginxProxy(
            sharedConfig,
            true,
          );

          // Update the config with the actual nginx port so the
          // profile config is correct on next restart
          this.config.bitcoin.port = nginxPort;

          // Load any wallets that were imported but not auto-loaded
          spinner.text = "Loading imported wallets...";
          for (const walletName of manifest.contents.bitcoinWallets) {
            try {
              await this.rpc.callRpc("loadwallet", [walletName]);
            } catch {
              // Wallet may already be loaded or auto-loaded — ignore
            }
          }

          spinner.succeed(
            chalk.green(
              `Docker container running → nginx on port ${nginxPort}`,
            ),
          );
        } catch (dockerError: any) {
          // Don't fail the entire import — data is already in place.
          // User can start the container manually.
          result.warnings.push(
            `Could not auto-start Docker container: ${dockerError.message}. ` +
              `Use Docker Management → Start Container to start manually.`,
          );
          spinner.warn(
            "Imported data is in place but container could not be started automatically.",
          );
        }
      }

      // ── Step 7: Import Caravan wallet configs ──
      spinner.text = "Importing Caravan wallet configurations...";
      const caravanSrcDir = path.join(extractDir, "caravan-wallets");
      if (await fs.pathExists(caravanSrcDir)) {
        const caravanFiles = await fs.readdir(caravanSrcDir);
        for (const file of caravanFiles) {
          if (file.endsWith(".json")) {
            const srcPath = path.join(caravanSrcDir, file);
            const destPath = path.join(
              this.caravanService.getCaravanDir(),
              file,
            );
            await fs.copy(srcPath, destPath, { overwrite: true });
            result.caravanWalletsImported.push(
              file.replace("_config.json", ""),
            );
          }
        }
      }

      // ── Step 8: Import key data ──
      spinner.text = "Importing key data...";
      const keysSrcDir = path.join(extractDir, "keys");
      if (await fs.pathExists(keysSrcDir)) {
        const keyFiles = await fs.readdir(keysSrcDir);
        for (const file of keyFiles) {
          if (file.endsWith(".json")) {
            await fs.copy(
              path.join(keysSrcDir, file),
              path.join(this.config.keysDir, file),
              { overwrite: true },
            );
          }
        }
      }

      // ── Step 9: Import scenarios ──
      spinner.text = "Importing scenarios...";
      const scenariosSrcDir = path.join(extractDir, "scenarios");
      if ((await fs.pathExists(scenariosSrcDir)) && this.config.scenariosDir) {
        await fs.ensureDir(this.config.scenariosDir);
        const scenarioFiles = await fs.readdir(scenariosSrcDir);
        for (const file of scenarioFiles) {
          await fs.copy(
            path.join(scenariosSrcDir, file),
            path.join(this.config.scenariosDir, file),
            { overwrite: true },
          );
        }
      }

      // ── Step 10: Update local config with RPC credentials from archive ──
      spinner.text = "Updating configuration...";
      const rpcUser =
        options.rpcOverrides?.rpcUser || manifest.rpcConfig.rpcUser;
      const rpcPassword =
        options.rpcOverrides?.rpcPassword || manifest.rpcConfig.rpcPassword;
      const rpcPort =
        options.rpcOverrides?.rpcPort || manifest.rpcConfig.rpcPort;

      // Save imported config overlay
      const importedConfigPath = path.join(
        this.config.appDir,
        "imported-env-config.json",
      );
      await fs.writeJson(
        importedConfigPath,
        {
          importedFrom: path.basename(options.archivePath),
          importedAt: new Date().toISOString(),
          manifest,
          rpcOverrides: { rpcUser, rpcPassword, rpcPort },
        },
        { spaces: 2 },
      );

      result.blockHeight = manifest.blockchainState.blockHeight;
      result.success = true;

      spinner.succeed(chalk.green("Environment imported successfully!"));

      console.log(chalk.cyan("\n✅ Import Summary:"));
      console.log(chalk.dim("─".repeat(50)));
      console.log(`  Method:             ${result.method}`);
      console.log(`  Block Height:       ${result.blockHeight}`);
      console.log(`  Wallets Imported:   ${result.walletsImported.length}`);
      console.log(
        `  Caravan Wallets:    ${result.caravanWalletsImported.length}`,
      );
      if (result.warnings.length > 0) {
        console.log(
          chalk.yellow(`  Warnings:           ${result.warnings.length}`),
        );
        for (const w of result.warnings) {
          console.log(chalk.yellow(`    ⚠ ${w}`));
        }
      }
      console.log(chalk.dim("─".repeat(50)));
      console.log(
        chalk.yellow(
          "\n⚠ Please restart Caravan-X for changes to take effect.",
        ),
      );

      return result;
    } catch (error: any) {
      spinner.fail(`Import failed: ${error.message}`);
      result.errors.push(error.message);
      return result;
    } finally {
      // Clean up extraction directory
      await fs.remove(extractDir);
    }
  }

  // ==========================================================================
  // INSPECT — View archive contents without importing
  // ==========================================================================

  /**
   * Inspect a .caravan-env archive without importing it.
   * Returns the manifest and summary information.
   */
  async inspectEnvironment(
    archivePath: string,
  ): Promise<EnvironmentManifest | null> {
    const extractDir = path.join(
      this.config.appDir,
      `env_inspect_${Date.now()}`,
    );

    try {
      await fs.ensureDir(extractDir);
      await this.extractTarGz(archivePath, extractDir);

      const manifestPath = path.join(extractDir, "manifest.json");
      if (!(await fs.pathExists(manifestPath))) {
        console.log(
          chalk.red("Invalid .caravan-env archive: manifest.json not found"),
        );
        return null;
      }

      return await fs.readJson(manifestPath);
    } catch (error: any) {
      console.log(chalk.red(`Error inspecting archive: ${error.message}`));
      return null;
    } finally {
      await fs.remove(extractDir);
    }
  }

  // ==========================================================================
  // PRIVATE — Export helpers
  // ==========================================================================

  /**
   * Export descriptors for all specified wallets.
   * Uses `listdescriptors true` for signer wallets (includes private keys)
   * and `listdescriptors` for watch-only wallets.
   */
  private async exportAllWalletDescriptors(
    walletNames: string[],
    includePrivateKeys: boolean,
  ): Promise<FullWalletExport[]> {
    const exports: FullWalletExport[] = [];

    for (const walletName of walletNames) {
      try {
        const walletInfo = await this.rpc.callRpc<any>(
          "getwalletinfo",
          [],
          walletName,
        );

        // Determine wallet type
        const isWatchOnly = !walletInfo.private_keys_enabled;
        const isDescriptor = walletInfo.descriptors === true;

        let walletType: "signer" | "watch-only" | "regular" = "regular";
        if (walletName.includes("_watcher") || isWatchOnly) {
          walletType = "watch-only";
        } else if (walletName.includes("_signer")) {
          walletType = "signer";
        }

        // Get descriptors
        let descriptors: any[] = [];
        if (isDescriptor) {
          try {
            // Try with private keys if requested and available
            const shouldGetPrivate = includePrivateKeys && !isWatchOnly;
            const descriptorResult = await this.rpc.callRpc<any>(
              "listdescriptors",
              shouldGetPrivate ? [true] : [],
              walletName,
            );
            descriptors = descriptorResult.descriptors || [];
          } catch (err: any) {
            // Fall back to public descriptors
            try {
              const descriptorResult = await this.rpc.callRpc<any>(
                "listdescriptors",
                [],
                walletName,
              );
              descriptors = descriptorResult.descriptors || [];
            } catch {
              // Wallet may not support listdescriptors
            }
          }
        }

        const descriptorExport: WalletDescriptorExport = {
          walletName,
          walletType,
          isDescriptorWallet: isDescriptor,
          hasPrivateKeys: includePrivateKeys && !isWatchOnly,
          descriptors,
        };

        // Find associated Caravan config
        let caravanConfig: any = undefined;
        let keyData: any = undefined;

        // Check if this wallet has a Caravan config
        const caravanConfigs = await this.caravanService.listCaravanWallets();
        for (const cc of caravanConfigs) {
          // Match by client walletName or by signer wallet naming convention
          if (
            cc.client?.walletName === walletName ||
            walletName.startsWith(cc.name.replace(/\s+/g, "_").toLowerCase())
          ) {
            caravanConfig = cc;

            // Try to find key data
            const keyFilePath = path.join(
              this.config.keysDir,
              `${cc.name.replace(/\s+/g, "_").toLowerCase()}_keys.json`,
            );
            if (await fs.pathExists(keyFilePath)) {
              keyData = await fs.readJson(keyFilePath);
            }
            break;
          }
        }

        exports.push({
          descriptorExport,
          caravanConfig,
          keyData,
        });
      } catch (error: any) {
        // Skip wallets we can't export (might be locked etc.)
        console.log(
          chalk.yellow(
            `  ⚠ Could not export wallet "${walletName}": ${error.message}`,
          ),
        );
      }
    }

    return exports;
  }

  /**
   * Generate a declarative replay script that can recreate the environment.
   */
  private async generateReplayScript(
    walletNames: string[],
    walletExports: FullWalletExport[],
    targetBlockHeight: number,
  ): Promise<ReplayScript> {
    const steps: ReplayStep[] = [];

    // Step 1: Generate initial blocks to fund the miner wallet
    steps.push({
      type: "generate_blocks",
      description: "Generate initial blocks for coinbase maturity",
      params: { count: 101, toWallet: "default" },
    });

    // Step 2: Create all wallets
    for (const walletExport of walletExports) {
      const { descriptorExport } = walletExport;

      if (descriptorExport.walletType === "watch-only") {
        steps.push({
          type: "create_wallet",
          description: `Create watch-only wallet: ${descriptorExport.walletName}`,
          params: {
            name: descriptorExport.walletName,
            disablePrivateKeys: true,
            blank: true,
            descriptorWallet: true,
          },
        });
      } else {
        steps.push({
          type: "create_wallet",
          description: `Create wallet: ${descriptorExport.walletName}`,
          params: {
            name: descriptorExport.walletName,
            disablePrivateKeys: false,
            blank: false,
            descriptorWallet: descriptorExport.isDescriptorWallet,
          },
        });
      }

      // Import descriptors if available
      if (descriptorExport.descriptors.length > 0) {
        steps.push({
          type: "import_descriptors",
          description: `Import descriptors for: ${descriptorExport.walletName}`,
          params: {
            walletName: descriptorExport.walletName,
            descriptors: descriptorExport.descriptors,
          },
        });
      }
    }

    // Step 3: Import Caravan wallet configs
    for (const walletExport of walletExports) {
      if (walletExport.caravanConfig) {
        steps.push({
          type: "import_caravan_config",
          description: `Import Caravan config: ${walletExport.caravanConfig.name}`,
          params: {
            config: walletExport.caravanConfig,
          },
        });
      }
    }

    // Step 4: Mine remaining blocks to reach target height
    // We already mined 101 blocks
    const remainingBlocks = targetBlockHeight - 101;
    if (remainingBlocks > 0) {
      steps.push({
        type: "generate_blocks",
        description: `Mine remaining blocks to reach height ${targetBlockHeight}`,
        params: { count: remainingBlocks, toWallet: "default" },
      });
    }

    return {
      version: ENV_SCHEMA_VERSION,
      name: "Environment Replay Script",
      description:
        "Declarative script to reconstruct the environment from scratch. " +
        "Note: Block hashes will differ from the original since regtest mining is non-deterministic. " +
        "Wallet states and balances will match if transactions are replayed correctly.",
      steps,
    };
  }

  /**
   * Remove sensitive or machine-specific paths from config before export.
   */
  private sanitizeConfigForExport(
    config: EnhancedAppConfig,
  ): Partial<EnhancedAppConfig> {
    return {
      mode: config.mode,
      bitcoin: {
        protocol: config.bitcoin.protocol,
        host: "127.0.0.1", // Always localhost
        port: config.bitcoin.port,
        user: config.bitcoin.user,
        pass: config.bitcoin.pass,
        dataDir: "", // Will be set on import
      },
      sharedConfig: config.sharedConfig,
      docker: config.docker
        ? {
            ...config.docker,
            volumes: {
              bitcoinData: "", // Will be set on import
              coordinator: "",
            },
          }
        : undefined,
      snapshots: {
        enabled: config.snapshots.enabled,
        directory: "",
        autoSnapshot: config.snapshots.autoSnapshot,
      },
      // Omit appDir, caravanDir, keysDir — these are machine-specific
    } as any;
  }

  // ==========================================================================
  // PRIVATE — Import helpers
  // ==========================================================================

  /**
   * Import using binary method — copy blockchain data directly.
   * This gives exact replication of the blockchain state.
   */
  private async importBinary(
    extractDir: string,
    manifest: EnvironmentManifest,
    spinner: Ora,
    result: EnvironmentImportResult,
    options: EnvironmentImportOptions,
  ): Promise<void> {
    // DEV: Pass createIfMissing=true because on a fresh imported profile
    // the regtest directory doesn't exist yet (Docker hasn't started).
    // We just need the target path to copy binary data into.
    const regtestDir = await this.getRegtestDataDir(true);

    if (!regtestDir) {
      throw new Error(
        "Cannot determine regtest data directory. Please check your configuration.",
      );
    }

    // Extract blockchain data tarball
    const blockchainTarPath = path.join(extractDir, "blockchain-data.tar.gz");
    if (!(await fs.pathExists(blockchainTarPath))) {
      throw new Error(
        "blockchain-data.tar.gz not found in archive. Archive may be corrupt.",
      );
    }

    const blockchainDir = path.join(extractDir, "blockchain");
    await fs.ensureDir(blockchainDir);
    await this.extractTarGz(blockchainTarPath, blockchainDir);

    // Backup current regtest directory
    spinner.text = "Backing up current regtest data...";
    const backupDir = path.join(
      this.config.appDir,
      `regtest_backup_${Date.now()}`,
    );
    // DEV: Only backup if regtest dir has actual data.
    // For fresh profiles (created during import), the dir exists
    // but is empty — no point backing up nothing.
    const regtestContents = await fs.readdir(regtestDir).catch(() => []);
    const hasExistingData = regtestContents.length > 0;

    if (hasExistingData) {
      await fs.copy(regtestDir, backupDir);
      result.warnings.push(`Previous regtest data backed up to: ${backupDir}`);
    }

    // After copying files to regtestDir, if in Docker mode and using docker cp:
    if (
      this.config.mode === SetupMode.DOCKER &&
      this.config.docker &&
      regtestDir.includes("docker-regtest-") // Was obtained via docker cp
    ) {
      const containerName = this.config.docker.containerName;
      spinner.text = "Copying data back into Docker container...";
      try {
        // Remove existing regtest data in container
        await execAsync(
          `docker exec "${containerName}" rm -rf /home/bitcoin/.bitcoin/regtest 2>/dev/null || true`,
        );
        // Copy new data in
        await execAsync(
          `docker cp "${regtestDir}" "${containerName}:/home/bitcoin/.bitcoin/regtest"`,
        );
      } catch (err: any) {
        result.warnings.push(
          `Could not copy data into container via docker cp: ${err.message}. ` +
            `If using a bind mount, the files are already in place.`,
        );
      }
    }

    try {
      // Replace blocks
      spinner.text = "Importing blockchain blocks...";
      const srcBlocks = path.join(blockchainDir, "blocks");
      const destBlocks = path.join(regtestDir, "blocks");
      if (await fs.pathExists(srcBlocks)) {
        if (await fs.pathExists(destBlocks)) {
          await fs.remove(destBlocks);
        }
        await fs.copy(srcBlocks, destBlocks);
      }

      // Replace chainstate
      spinner.text = "Importing chainstate...";
      const srcChainstate = path.join(blockchainDir, "chainstate");
      const destChainstate = path.join(regtestDir, "chainstate");
      if (await fs.pathExists(srcChainstate)) {
        if (await fs.pathExists(destChainstate)) {
          await fs.remove(destChainstate);
        }
        await fs.copy(srcChainstate, destChainstate);
      }

      // Replace wallet files
      spinner.text = "Importing wallet files...";
      const srcWallets = path.join(blockchainDir, "wallets");
      const destWallets = path.join(regtestDir, "wallets");
      if (await fs.pathExists(srcWallets)) {
        if (await fs.pathExists(destWallets)) {
          await fs.remove(destWallets);
        }
        await fs.copy(srcWallets, destWallets);
        result.walletsImported = manifest.contents.bitcoinWallets;
      }

      // Copy settings.json — tells Bitcoin Core which wallets to
      // auto-load on startup. Without this, wallet files exist on
      // disk but Bitcoin Core won't load them.
      spinner.text = "Importing wallet settings...";
      const srcSettings = path.join(blockchainDir, "settings.json");
      const destSettings = path.join(regtestDir, "settings.json");
      if (await fs.pathExists(srcSettings)) {
        await fs.copy(srcSettings, destSettings, { overwrite: true });
      } else {
        // Fallback: generate settings.json from the manifest's wallet list
        // so Bitcoin Core knows to load them
        const walletSettings = {
          $schema: "/wallet-settings.json",
          wallet: manifest.contents.bitcoinWallets.map((name) => ({
            name,
          })),
        };
        await fs.writeJson(destSettings, walletSettings, { spaces: 2 });
      }
    } catch (error: any) {
      // Restore backup on failure
      spinner.text = "Import failed — restoring backup...";
      if (await fs.pathExists(backupDir)) {
        await fs.remove(regtestDir);
        await fs.copy(backupDir, regtestDir);
      }
      throw error;
    }
  }

  /**
   * Import using replay method — recreate the environment from descriptors.
   * Block hashes will differ but wallet states will match.
   */
  private async importReplay(
    extractDir: string,
    manifest: EnvironmentManifest,
    spinner: Ora,
    result: EnvironmentImportResult,
    options: EnvironmentImportOptions,
  ): Promise<void> {
    const replayPath = path.join(extractDir, "replay.json");
    if (!(await fs.pathExists(replayPath))) {
      throw new Error("replay.json not found in archive");
    }

    const replayScript: ReplayScript = await fs.readJson(replayPath);

    // We need Bitcoin Core running for replay
    spinner.text = "Starting Bitcoin Core for replay...";

    if (this.config.mode === SetupMode.DOCKER && this.dockerService) {
      // Build a SharedConfig from the manifest so Docker sets up
      // with the correct RPC credentials, ports, etc.
      const sharedConfig: SharedConfig = {
        version: manifest.version,
        name: manifest.name,
        mode: SetupMode.DOCKER,
        bitcoin: {
          network: manifest.network,
          rpcPort: manifest.rpcConfig.rpcPort,
          p2pPort: manifest.rpcConfig.p2pPort,
          rpcUser: manifest.rpcConfig.rpcUser,
          rpcPassword: manifest.rpcConfig.rpcPassword,
        },
        initialState: {
          blockHeight: 0,
          preGenerateBlocks: false,
          wallets: [],
          transactions: [],
        },
      };

      // This creates the container, writes bitcoin.conf, starts everything
      await this.dockerService.completeSetup(sharedConfig);
    } else {
      // Manual mode — just start bitcoind
      await this.startBitcoinCore();
    }

    // Wait for RPC to be ready
    spinner.text = "Waiting for Bitcoin Core RPC...";
    const rpcReady = await this.waitForRpc(30);
    if (!rpcReady) {
      throw new Error(
        "Bitcoin Core RPC did not become available after 30 seconds. " +
          "Check that Docker is running and ports are available.",
      );
    }

    // Execute replay steps
    for (let i = 0; i < replayScript.steps.length; i++) {
      const step = replayScript.steps[i];
      spinner.text = `[${i + 1}/${replayScript.steps.length}] ${step.description}`;

      try {
        await this.executeReplayStep(step);
        result.walletsImported.push(
          ...(step.type === "create_wallet" ? [step.params.name] : []),
        );
      } catch (error: any) {
        result.warnings.push(
          `Step ${i + 1} failed: ${step.description} — ${error.message}`,
        );
      }
    }

    // Also import any descriptor exports that weren't in the replay script
    const descriptorsDir = path.join(extractDir, "descriptors");
    if (await fs.pathExists(descriptorsDir)) {
      const descriptorFiles = await fs.readdir(descriptorsDir);
      for (const file of descriptorFiles) {
        if (!file.endsWith(".json")) continue;

        try {
          const walletExport: FullWalletExport = await fs.readJson(
            path.join(descriptorsDir, file),
          );
          const { descriptorExport } = walletExport;

          // Check if wallet already exists
          const loadedWallets = await this.rpc.callRpc<string[]>("listwallets");
          if (!loadedWallets.includes(descriptorExport.walletName)) {
            // Create and import
            await this.rpc.callRpc("createwallet", [
              descriptorExport.walletName,
              descriptorExport.walletType === "watch-only", // disable_private_keys
              descriptorExport.walletType === "watch-only", // blank
              "", // passphrase
              false, // avoid_reuse
              descriptorExport.isDescriptorWallet, // descriptors
              true, // load_on_startup
            ]);

            if (descriptorExport.descriptors.length > 0) {
              await this.rpc.callRpc(
                "importdescriptors",
                [
                  descriptorExport.descriptors.map((d) => ({
                    desc: d.desc,
                    timestamp: "now",
                    active: d.active,
                    internal: d.internal,
                    range: d.range,
                  })),
                ],
                descriptorExport.walletName,
              );
            }

            if (!result.walletsImported.includes(descriptorExport.walletName)) {
              result.walletsImported.push(descriptorExport.walletName);
            }
          }
        } catch (error: any) {
          result.warnings.push(
            `Could not import descriptor file ${file}: ${error.message}`,
          );
        }
      }
    }
  }

  /**
   * Execute a single replay step
   */
  private async executeReplayStep(step: ReplayStep): Promise<void> {
    switch (step.type) {
      case "create_wallet":
        try {
          await this.rpc.callRpc("createwallet", [
            step.params.name,
            step.params.disablePrivateKeys || false,
            step.params.blank || false,
            "", // passphrase
            false, // avoid_reuse
            step.params.descriptorWallet !== false, // descriptors
            true, // load_on_startup
          ]);
        } catch (error: any) {
          if (!error.message.includes("already exists")) {
            throw error;
          }
        }
        break;

      case "import_descriptors":
        if (step.params.descriptors && step.params.descriptors.length > 0) {
          const importPayload = step.params.descriptors.map((d: any) => ({
            desc: d.desc,
            timestamp: "now",
            active: d.active !== undefined ? d.active : true,
            internal: d.internal,
            range: d.range,
          }));
          await this.rpc.callRpc(
            "importdescriptors",
            [importPayload],
            step.params.walletName,
          );
        }
        break;

      case "generate_blocks":
        {
          // Get or create an address to mine to
          let address: string;
          try {
            const wallets = await this.rpc.callRpc<string[]>("listwallets");
            if (wallets.length > 0) {
              address = await this.rpc.callRpc<string>(
                "getnewaddress",
                [],
                wallets[0],
              );
            } else {
              // Create a temporary wallet for mining
              await this.rpc.callRpc("createwallet", [
                "mining_temp",
                false,
                false,
              ]);
              address = await this.rpc.callRpc<string>(
                "getnewaddress",
                [],
                "mining_temp",
              );
            }
          } catch {
            // Fallback: use the generate RPC directly
            address = "bcrt1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3l7f0n";
          }
          await this.rpc.callRpc("generatetoaddress", [
            step.params.count,
            address,
          ]);
        }
        break;

      case "import_caravan_config":
        if (step.params.config) {
          await this.caravanService.saveCaravanWalletConfig(step.params.config);
        }
        break;

      case "fund_address":
      case "mine_to_address":
        await this.rpc.callRpc("generatetoaddress", [
          step.params.count || 1,
          step.params.address,
        ]);
        break;

      case "send_transaction":
        await this.rpc.callRpc(
          "sendtoaddress",
          [step.params.address, step.params.amount],
          step.params.fromWallet,
        );
        break;

      case "wait":
        await new Promise((resolve) =>
          setTimeout(resolve, step.params.ms || 1000),
        );
        break;

      default:
        // Unknown step type — skip
        break;
    }
  }

  // ==========================================================================
  // PRIVATE — Bitcoin Core lifecycle helpers
  // ==========================================================================

  /**
   * Get the regtest data directory path.
   * Handles both Docker mode (data inside container) and manual mode.
   *  Handles both Docker mode and manual mode.
   *
   * @param createIfMissing — If true, create the directory if it doesn't
   *   exist. Used during import where we need a target path before
   *   Bitcoin Core has ever started.
   */
  private async getRegtestDataDir(
    createIfMissing = false,
  ): Promise<string | null> {
    if (this.config.mode === SetupMode.DOCKER && this.config.docker) {
      // In Docker mode, we ALWAYS use docker cp to get/put data
      // The volume path in config.docker.volumes.bitcoinData is the host-side mount
      const volumePath = this.config.docker.volumes.bitcoinData;
      const regtestViaVolume = path.join(volumePath, "regtest");

      if (await fs.pathExists(regtestViaVolume)) {
        return regtestViaVolume;
      }

      // DEV: For fresh profiles (e.g. import), the regtest dir doesn't
      // exist yet because Docker hasn't started. Create it so the
      // binary import has somewhere to write data.
      if (createIfMissing && volumePath) {
        await fs.ensureDir(regtestViaVolume);
        return regtestViaVolume;
      }

      // Fallback: check the docker-data directory caravan-x creates
      const dockerDataDir = path.join(this.config.appDir, "docker-data");
      const candidates = [
        path.join(dockerDataDir, "bitcoin", "regtest"),
        path.join(dockerDataDir, "regtest"),
        path.join(dockerDataDir, "bitcoin-data", "regtest"),
      ];

      for (const c of candidates) {
        if (await fs.pathExists(c)) return c;
      }

      // DEV: If still nothing found and we're allowed to create,
      // use the canonical Docker volume path
      if (createIfMissing) {
        await fs.ensureDir(regtestViaVolume);
        return regtestViaVolume;
      }

      // Last resort: docker cp from container to temp dir
      return this.copyRegtestFromContainer();
    } else {
      // Manual mode
      const regtestDir = path.join(this.config.bitcoin.dataDir, "regtest");
      if (await fs.pathExists(regtestDir)) return regtestDir;

      const home = process.env.HOME || "";
      const candidates = [
        path.join(home, ".bitcoin", "regtest"),
        path.join(home, "Library", "Application Support", "Bitcoin", "regtest"),
      ];

      for (const c of candidates) {
        if (await fs.pathExists(c)) return c;
      }

      return null;
    }
  }

  /**
   * Copy regtest data from Docker container to a temp directory.
   * Used when we can't find the volume mount on the host.
   */
  private async copyRegtestFromContainer(): Promise<string | null> {
    const containerName =
      this.config.docker?.containerName || "caravan-x-bitcoin";
    const tempDir = path.join(
      this.config.appDir,
      `docker-regtest-${Date.now()}`,
    );

    try {
      await fs.ensureDir(tempDir);
      // Try common bitcoind data paths inside containers
      await execAsync(
        `docker cp "${containerName}:/home/bitcoin/.bitcoin/regtest" "${tempDir}/regtest" 2>/dev/null || ` +
          `docker cp "${containerName}:/root/.bitcoin/regtest" "${tempDir}/regtest" 2>/dev/null`,
      );

      const copiedDir = path.join(tempDir, "regtest");
      if (await fs.pathExists(copiedDir)) return copiedDir;
    } catch {
      // Container might be stopped or path wrong
    }

    await fs.remove(tempDir);
    return null;
  }

  /**
   * Stop Bitcoin Core gracefully
   */
  private async stopBitcoinCore(): Promise<void> {
    try {
      if (this.config.mode === SetupMode.DOCKER && this.dockerService) {
        try {
          await execAsync(
            `docker stop ${this.config.docker?.containerName || "caravan-x-bitcoin"}`,
          );
        } catch {
          // Container might already be stopped
        }
      } else {
        try {
          await this.rpc.callRpc("stop");
        } catch {
          // Node might already be stopped
        }
      }

      // Wait for shutdown
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch {
      // Best effort
    }
  }

  /**
   * Start Bitcoin Core
   */
  private async startBitcoinCore(): Promise<void> {
    if (this.config.mode === SetupMode.DOCKER && this.config.docker) {
      try {
        await execAsync(`docker start ${this.config.docker.containerName}`);
      } catch {
        // Container might need to be created
      }
    } else {
      try {
        await execAsync(
          `bitcoind -regtest -daemon -datadir="${this.config.bitcoin.dataDir}"`,
        );
      } catch {
        // bitcoind might already be running
      }
    }

    // Wait for startup
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  /**
   * Wait for RPC to become available
   */
  private async waitForRpc(maxAttempts: number = 30): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await this.rpc.callRpc("getblockchaininfo");
        return true;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    return false;
  }

  // ==========================================================================
  // PRIVATE — Archive and checksum utilities
  // ==========================================================================

  /**
   * Verify archive integrity using checksums from manifest
   */
  private async verifyArchiveIntegrity(
    extractDir: string,
    manifest: EnvironmentManifest,
  ): Promise<boolean> {
    let allOk = true;

    // Verify blockchain data tarball checksum
    if (manifest.checksums.blockchainData) {
      const tarPath = path.join(extractDir, "blockchain-data.tar.gz");
      if (await fs.pathExists(tarPath)) {
        const actualChecksum = await this.computeFileChecksum(tarPath);
        if (actualChecksum !== manifest.checksums.blockchainData) {
          console.log(chalk.yellow("  ⚠ Blockchain data checksum mismatch"));
          allOk = false;
        }
      }
    }

    // Verify individual file checksums
    for (const [relativePath, expectedChecksum] of Object.entries(
      manifest.checksums.files,
    )) {
      const filePath = path.join(extractDir, relativePath);
      if (await fs.pathExists(filePath)) {
        const actualChecksum = await this.computeFileChecksum(filePath);
        if (actualChecksum !== expectedChecksum) {
          console.log(chalk.yellow(`  ⚠ Checksum mismatch: ${relativePath}`));
          allOk = false;
        }
      }
    }

    return allOk;
  }

  /**
   * Compute SHA256 checksum for a file
   */
  private async computeFileChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(filePath);
      stream.on("data", (data) => hash.update(data));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", reject);
    });
  }

  /**
   * Compute checksums for all JSON files in a directory tree
   */
  private async computeDirectoryChecksums(
    dir: string,
  ): Promise<Record<string, string>> {
    const checksums: Record<string, string> = {};

    const walkDir = async (currentDir: string): Promise<void> => {
      const entries = await fs.readdir(currentDir, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else if (entry.name.endsWith(".json") || entry.name.endsWith(".js")) {
          const relativePath = path.relative(dir, fullPath);
          checksums[relativePath] = await this.computeFileChecksum(fullPath);
        }
      }
    };

    await walkDir(dir);
    return checksums;
  }

  /**
   * Create tar.gz archive
   */
  private async createTarGz(
    sourceDir: string,
    outputFile: string,
  ): Promise<void> {
    await fs.ensureDir(path.dirname(outputFile));
    await execAsync(`tar -czf "${outputFile}" -C "${sourceDir}" .`);
  }

  /**
   * Extract tar.gz archive
   */
  private async extractTarGz(
    archiveFile: string,
    outputDir: string,
  ): Promise<void> {
    await fs.ensureDir(outputDir);
    await execAsync(`tar -xzf "${archiveFile}" -C "${outputDir}"`);
  }
}
