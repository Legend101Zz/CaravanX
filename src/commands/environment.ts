/**
 * Environment Commands for Caravan-X
 */

import { select, input, confirm, checkbox } from "@inquirer/prompts";
import chalk from "chalk";
import * as fs from "fs-extra";
import * as path from "path";
import Table from "cli-table3";
import boxen from "boxen";

import { EnvironmentService } from "../core/environment";
import { BitcoinRpcClient } from "../core/rpc";
import { BitcoinService } from "../core/bitcoin";
import { CaravanService } from "../core/caravan";
import { DockerService } from "../core/docker";
import { ProfileManager } from "../core/profiles";
import {
  EnvironmentExportOptions,
  EnvironmentImportOptions,
  EnvironmentManifest,
} from "../types/environment";
import {
  EnhancedAppConfig,
  SetupMode,
  SharedConfig,
  DEFAULT_DOCKER_CONFIG,
} from "../types/config";
import { colors, displayCommandTitle } from "../utils/terminal";

export class EnvironmentCommands {
  private envService: EnvironmentService;
  private rpc: BitcoinRpcClient;
  private profileManager: ProfileManager;
  private baseDir: string;

  constructor(
    envService: EnvironmentService,
    rpc: BitcoinRpcClient,
    profileManager: ProfileManager,
    baseDir: string,
  ) {
    this.envService = envService;
    this.rpc = rpc;
    this.profileManager = profileManager;
    this.baseDir = baseDir;
  }

  /**
   * Main interactive menu
   */
  async showEnvironmentMenu(): Promise<void> {
    displayCommandTitle("Environment Sharing");

    const action = await select({
      message: "What would you like to do?",
      choices: [
        {
          name: chalk.green("📦 Export Environment"),
          value: "export",
          description: "Package your current regtest environment for sharing",
        },
        {
          name: chalk.cyan("📥 Import Environment"),
          value: "import",
          description:
            "Import a .caravan-env archive into a new Docker profile",
        },
        {
          name: chalk.yellow("🔍 Inspect Environment"),
          value: "inspect",
          description: "View the contents of a .caravan-env archive",
        },
        {
          name: chalk.dim("🔙 Back"),
          value: "back",
        },
      ],
    });

    switch (action) {
      case "export":
        await this.exportEnvironment();
        break;
      case "import":
        await this.importEnvironment();
        break;
      case "inspect":
        await this.inspectEnvironment();
        break;
      case "back":
        return;
    }

    if (action !== "back") {
      await this.showEnvironmentMenu();
    }
  }

  // =========================================================================
  // EXPORT (unchanged — just keeping it here for completeness)
  // =========================================================================

  private async exportEnvironment(): Promise<void> {
    console.log(
      boxen(
        chalk.cyan.bold("📦 Export Environment\n\n") +
          chalk.white(
            "This will package your current regtest environment into\n" +
              "a .caravan-env archive that other developers can import\n" +
              "to get an identical blockchain state, wallets, and configs.",
          ),
        {
          padding: 1,
          margin: { top: 1, bottom: 1, left: 0, right: 0 },
          borderStyle: "round",
          borderColor: "cyan",
        },
      ),
    );

    const name = await input({
      message: "Environment name:",
      default: `caravan-env-${Date.now()}`,
      validate: (v) => (v.trim() ? true : "Name is required"),
    });

    const description = await input({
      message: "Description (optional):",
    });

    const createdBy = await input({
      message: "Your name/handle (optional):",
    });

    const includeBlockchainData = await confirm({
      message:
        "Include binary blockchain data? (Recommended for exact replication)",
      default: true,
    });

    const includePrivateKeys = await confirm({
      message: "Include private keys in wallet exports?",
      default: true,
    });

    const generateReplayScript = await confirm({
      message: "Generate a replay script?",
      default: true,
    });

    let walletFilter: string[] | undefined;
    try {
      const loadedWallets = await this.rpc.listWallets();
      if (loadedWallets.length > 0) {
        const filterWallets = await confirm({
          message: `Found ${loadedWallets.length} wallets. Export all?`,
          default: true,
        });
        if (!filterWallets) {
          walletFilter = await checkbox({
            message: "Select wallets to include:",
            choices: loadedWallets.map((w) => ({
              name: w,
              value: w,
              checked: true,
            })),
          });
        }
      }
    } catch {
      // Can't list wallets — skip filtering
    }

    const defaultOutputPath = path.join(
      process.cwd(),
      `${name.replace(/\s+/g, "-").toLowerCase()}.caravan-env`,
    );

    const outputPath = await input({
      message: "Output file path:",
      default: defaultOutputPath,
    });

    console.log(chalk.dim("\n─".repeat(50)));
    console.log(chalk.cyan("Export configuration:"));
    console.log(`  Name:              ${name}`);
    console.log(`  Blockchain data:   ${includeBlockchainData ? "Yes" : "No"}`);
    console.log(`  Private keys:      ${includePrivateKeys ? "Yes" : "No"}`);
    console.log(`  Replay script:     ${generateReplayScript ? "Yes" : "No"}`);
    console.log(
      `  Wallets:           ${walletFilter ? walletFilter.join(", ") : "All"}`,
    );
    console.log(`  Output:            ${outputPath}`);
    console.log(chalk.dim("─".repeat(50)));

    const proceed = await confirm({
      message: "Proceed with export?",
      default: true,
    });

    if (!proceed) {
      console.log(chalk.yellow("Export cancelled."));
      return;
    }

    const exportOptions: EnvironmentExportOptions = {
      name,
      description: description || undefined,
      createdBy: createdBy || undefined,
      includeBlockchainData,
      includePrivateKeys,
      generateReplayScript,
      walletFilter,
      outputPath,
    };

    try {
      const result = await this.envService.exportEnvironment(exportOptions);
      console.log(
        chalk.green(`\n✅ Environment exported successfully to: ${result}`),
      );
      console.log(
        chalk.cyan(
          "\nShare this file with your team. They can import it with:\n" +
            `  caravan-x env import "${result}"`,
        ),
      );
    } catch (error: any) {
      console.error(chalk.red(`\n❌ Export failed: ${error.message}`));
    }
  }

  // =========================================================================
  // IMPORT — Creates a new Docker profile and imports into it
  // =========================================================================

  private async importEnvironment(): Promise<void> {
    console.log(
      boxen(
        chalk.cyan.bold("📥 Import Environment\n\n") +
          chalk.white(
            "Import a .caravan-env archive into a new isolated Docker\n" +
              "profile. The imported environment gets its own container,\n" +
              "wallets, keys, and blockchain data — completely separate\n" +
              "from your existing profiles.\n\n",
          ) +
          chalk.gray(
            "A new Docker profile will be created automatically.\n" +
              "You can switch between profiles at any time.",
          ),
        {
          padding: 1,
          margin: { top: 1, bottom: 1, left: 0, right: 0 },
          borderStyle: "round",
          borderColor: "cyan",
        },
      ),
    );

    // --- Step 1: Get archive path ---
    const archivePath = await input({
      message: "Path to .caravan-env file:",
      validate: (v) => {
        if (!v.trim()) return "Path is required";
        if (!fs.existsSync(v)) return "File does not exist";
        if (!v.endsWith(".caravan-env"))
          return "File must be a .caravan-env archive";
        return true;
      },
    });

    // --- Step 2: Inspect the archive ---
    console.log(chalk.dim("\nInspecting archive..."));
    const manifest = await this.envService.inspectEnvironment(archivePath);
    if (!manifest) {
      console.log(
        chalk.red("Could not read archive. Is it a valid .caravan-env file?"),
      );
      return;
    }

    this.displayManifestDetails(manifest);

    // --- Step 3: Choose import method ---
    const method = await select({
      message: "Import method:",
      choices: [
        {
          name: "Auto (binary if available, replay otherwise)",
          value: "auto" as const,
        },
        ...(manifest.contents.hasBlockchainData
          ? [
              {
                name: "Binary (exact replication, recommended)",
                value: "binary" as const,
              },
            ]
          : []),
        ...(manifest.contents.hasReplayScript
          ? [
              {
                name: "Replay (recreate from scratch)",
                value: "replay" as const,
              },
            ]
          : []),
      ],
    });

    const skipVerification = await confirm({
      message: "Skip integrity verification?",
      default: false,
    });

    // --- Step 4: Let user name the imported profile ---
    const defaultProfileName = `📥 Imported: ${manifest.name}`;
    const profileName = await input({
      message: "Name for the imported profile:",
      default: defaultProfileName,
    });

    // --- Step 5: Confirm ---
    console.log(
      boxen(
        chalk.white.bold("Import Summary\n\n") +
          chalk.cyan(`Profile Name:   `) +
          chalk.white(`${profileName}\n`) +
          chalk.cyan(`Source:         `) +
          chalk.white(`${manifest.name}\n`) +
          chalk.cyan(`Block Height:   `) +
          chalk.white(`${manifest.blockchainState.blockHeight}\n`) +
          chalk.cyan(`Wallets:        `) +
          chalk.white(`${manifest.contents.bitcoinWallets.length}\n`) +
          chalk.cyan(`Method:         `) +
          chalk.white(`${method}\n`) +
          chalk.cyan(`Mode:           `) +
          chalk.white(`Docker (isolated container)`),
        {
          padding: 1,
          margin: { top: 1, bottom: 1, left: 0, right: 0 },
          borderStyle: "round",
          borderColor: "green",
        },
      ),
    );

    const proceed = await confirm({
      message: "Create profile and import?",
      default: true,
    });

    if (!proceed) {
      console.log(chalk.yellow("Import cancelled."));
      return;
    }

    try {
      // --- Step 6: Build a Docker config from the manifest ---
      const importedConfig = this.buildConfigFromManifest(manifest);

      // --- Step 7: Create a new profile (scopes all paths) ---
      console.log(chalk.dim("\nCreating isolated Docker profile..."));
      const profile = await this.profileManager.createProfile(
        profileName,
        SetupMode.DOCKER,
        importedConfig,
      );

      // profile.config now has all paths scoped to profiles/<id>/
      const scopedConfig = profile.config;

      // --- Step 8: Build services scoped to the new profile ---
      const rpc = new BitcoinRpcClient(scopedConfig.bitcoin);
      const bitcoinService = new BitcoinService(rpc, true);
      const caravanService = new CaravanService(
        rpc,
        scopedConfig.caravanDir,
        scopedConfig.keysDir,
      );

      let dockerService: DockerService | undefined;
      if (scopedConfig.docker) {
        dockerService = new DockerService(
          scopedConfig.docker,
          path.join(scopedConfig.appDir, "docker-data"),
        );
      }

      // Create an EnvironmentService that targets the new profile's directories
      const scopedEnvService = new EnvironmentService(
        rpc,
        caravanService,
        bitcoinService,
        scopedConfig,
        dockerService,
      );

      // --- Step 9: Run the actual import into the new profile ---
      const importOptions: EnvironmentImportOptions = {
        archivePath,
        method,
        skipVerification,
        force: true,
        rpcOverrides: {
          rpcUser: manifest.rpcConfig.rpcUser,
          rpcPassword: manifest.rpcConfig.rpcPassword,
          rpcPort: manifest.rpcConfig.rpcPort,
        },
      };

      const result = await scopedEnvService.importEnvironment(importOptions);

      if (result.success) {
        // --- Step 10: Set as active profile ---
        await this.profileManager.setActiveProfile(profile.id);

        // Save the updated config (nginx port may have changed)
        const profileConfigPath = path.join(scopedConfig.appDir, "config.json");
        await fs.writeJson(profileConfigPath, scopedConfig, { spaces: 2 });

        // Update the legacy config.json at the base directory
        const legacyConfigPath = path.join(this.baseDir, "config.json");
        await fs.writeJson(legacyConfigPath, scopedConfig, { spaces: 2 });

        console.log(
          boxen(
            chalk.green.bold("✅ Environment Imported Successfully!\n\n") +
              chalk.white(`Profile:        ${profileName}\n`) +
              chalk.white(`Block Height:   ${result.blockHeight}\n`) +
              chalk.white(
                `Wallets:        ${result.walletsImported.join(", ") || "none"}\n`,
              ) +
              chalk.white(
                `Caravan:        ${result.caravanWalletsImported.join(", ") || "none"}\n`,
              ) +
              "\n" +
              chalk.yellow(
                "Restart Caravan-X to use the imported environment.\n" +
                  "The new profile is now active.",
              ),
            {
              padding: 1,
              margin: { top: 1, bottom: 1, left: 0, right: 0 },
              borderStyle: "double",
              borderColor: "green",
            },
          ),
        );

        if (result.warnings.length > 0) {
          console.log(chalk.yellow("\n⚠️  Warnings:"));
          for (const warn of result.warnings) {
            console.log(chalk.yellow(`  • ${warn}`));
          }
        }
      } else {
        // Import failed — clean up the profile we just created
        console.log(chalk.red("\n❌ Import failed. Cleaning up..."));
        await this.profileManager.deleteProfile(profile.id);

        for (const err of result.errors) {
          console.log(chalk.red(`  • ${err}`));
        }
      }
    } catch (error: any) {
      console.error(chalk.red(`\n❌ Import failed: ${error.message}`));
    }
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  /**
   * Build an EnhancedAppConfig from a manifest's metadata.
   * This creates the config that ProfileManager.createProfile() will
   * then scope into the profile's isolated directory.
   *
   * We use Docker mode so the imported env gets its own container.
   */
  private buildConfigFromManifest(
    manifest: EnvironmentManifest,
  ): EnhancedAppConfig {
    const rpcUser = manifest.rpcConfig.rpcUser;
    const rpcPassword = manifest.rpcConfig.rpcPassword;
    const rpcPort = manifest.rpcConfig.rpcPort;
    const p2pPort = manifest.rpcConfig.p2pPort;

    // Container name derived from the env name to avoid collisions
    const safeName = manifest.name
      .replace(/[^a-zA-Z0-9]/g, "-")
      .toLowerCase()
      .slice(0, 30);
    const containerName = `caravan-x-imported-${safeName}`;

    const dockerConfig = {
      enabled: true,
      image: manifest.docker?.image || DEFAULT_DOCKER_CONFIG.image,
      containerName,
      ports: {
        rpc: rpcPort,
        p2p: p2pPort,
        nginx: 8080,
      },
      volumes: {
        bitcoinData: "", // Will be scoped by ProfileManager
        coordinator: "",
      },
      network: DEFAULT_DOCKER_CONFIG.network,
      autoStart: true,
    };

    const sharedConfig: SharedConfig = {
      version: "1.0.0",
      name: `Imported: ${manifest.name}`,
      description: manifest.description || `Imported from ${manifest.name}`,
      mode: SetupMode.DOCKER,
      bitcoin: {
        network: manifest.network as "regtest" | "signet" | "testnet",
        rpcPort,
        p2pPort,
        rpcUser,
        rpcPassword,
      },
      docker: dockerConfig,
      initialState: {
        // DEV: Don't pre-generate blocks — we're importing existing data
        blockHeight: 0,
        preGenerateBlocks: false,
        wallets: [],
        transactions: [],
      },
      walletName: "caravan_watcher",
      snapshots: {
        enabled: true,
        autoSnapshot: false,
      },
    };

    // DEV: Placeholder paths — ProfileManager.scopeConfigToProfile()
    // will rewrite all of these into profiles/<id>/
    return {
      mode: SetupMode.DOCKER,
      sharedConfig,
      docker: dockerConfig,
      bitcoin: {
        protocol: "http",
        host: "localhost",
        port: 8080, // Updated after nginx starts
        user: rpcUser,
        pass: rpcPassword,
        dataDir: "", // Scoped by ProfileManager
      },
      appDir: this.baseDir,
      caravanDir: "",
      keysDir: "",
      snapshots: {
        enabled: true,
        directory: "",
        autoSnapshot: false,
      },
      scenariosDir: "",
    };
  }

  // =========================================================================
  // INSPECT (unchanged)
  // =========================================================================

  private async inspectEnvironment(): Promise<void> {
    const archivePath = await input({
      message: "Path to .caravan-env file:",
      validate: (v) => {
        if (!v.trim()) return "Path is required";
        if (!fs.existsSync(v)) return "File does not exist";
        return true;
      },
    });

    const manifest = await this.envService.inspectEnvironment(archivePath);
    if (!manifest) {
      console.log(chalk.red("Could not read archive."));
      return;
    }

    this.displayManifestDetails(manifest);
    await input({ message: "Press Enter to continue..." });
  }

  private displayManifestDetails(manifest: EnvironmentManifest): void {
    console.log(
      boxen(
        chalk.cyan.bold(`📋 ${manifest.name}\n`) +
          (manifest.description ? chalk.dim(`${manifest.description}\n`) : "") +
          "\n" +
          chalk.white(`Version:          ${manifest.version}\n`) +
          chalk.white(`Network:          ${manifest.network}\n`) +
          chalk.white(
            `Block Height:     ${manifest.blockchainState.blockHeight}\n`,
          ) +
          chalk.white(
            `Block Hash:       ${manifest.blockchainState.blockHash.substring(0, 16)}...\n`,
          ) +
          chalk.white(
            `Created:          ${new Date(manifest.createdAt).toLocaleString()}\n`,
          ) +
          (manifest.createdBy
            ? chalk.white(`Created By:       ${manifest.createdBy}\n`)
            : "") +
          chalk.white(`Caravan-X:        ${manifest.caravanXVersion}\n`) +
          chalk.white(
            `Bitcoin Core:     ${manifest.bitcoinCoreVersion || "unknown"}\n`,
          ) +
          chalk.white(`Mode:             ${manifest.mode}\n`) +
          "\n" +
          chalk.cyan.bold("Contents:\n") +
          chalk.white(
            `  Blockchain Data:  ${manifest.contents.hasBlockchainData ? "✅" : "❌"}\n`,
          ) +
          chalk.white(
            `  Replay Script:    ${manifest.contents.hasReplayScript ? "✅" : "❌"}\n`,
          ) +
          chalk.white(
            `  Bitcoin Wallets:  ${manifest.contents.bitcoinWallets.join(", ") || "none"}\n`,
          ) +
          chalk.white(
            `  Caravan Wallets:  ${manifest.contents.caravanWallets.join(", ") || "none"}\n`,
          ) +
          chalk.white(
            `  Key Files:        ${manifest.contents.keyFiles.length}\n`,
          ) +
          chalk.white(
            `  Scenarios:        ${manifest.contents.scenarios.length}\n`,
          ) +
          "\n" +
          chalk.cyan.bold("RPC Config:\n") +
          chalk.white(`  User:             ${manifest.rpcConfig.rpcUser}\n`) +
          chalk.white(`  Port:             ${manifest.rpcConfig.rpcPort}\n`) +
          chalk.white(`  P2P Port:         ${manifest.rpcConfig.p2pPort}`),
        {
          padding: 1,
          margin: { top: 1, bottom: 1, left: 0, right: 0 },
          borderStyle: "round",
          borderColor: "cyan",
        },
      ),
    );
  }

  // =========================================================================
  // CLI Commands
  // =========================================================================

  async cliExport(args: {
    name: string;
    output: string;
    description?: string;
    noBlockchain?: boolean;
    noPrivateKeys?: boolean;
    noReplay?: boolean;
  }): Promise<void> {
    const options: EnvironmentExportOptions = {
      name: args.name,
      description: args.description,
      includeBlockchainData: !args.noBlockchain,
      includePrivateKeys: !args.noPrivateKeys,
      generateReplayScript: !args.noReplay,
      outputPath: args.output,
    };
    await this.envService.exportEnvironment(options);
  }

  async cliImport(args: {
    archivePath: string;
    method?: "binary" | "replay" | "auto";
    skipVerification?: boolean;
    force?: boolean;
  }): Promise<void> {
    const options: EnvironmentImportOptions = {
      archivePath: args.archivePath,
      method: args.method || "auto",
      skipVerification: args.skipVerification || false,
      force: args.force || false,
    };
    await this.envService.importEnvironment(options);
  }

  async cliInspect(archivePath: string): Promise<void> {
    const manifest = await this.envService.inspectEnvironment(archivePath);
    if (manifest) {
      this.displayManifestDetails(manifest);
    }
  }
}
