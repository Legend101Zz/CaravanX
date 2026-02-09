/**
 * Environment Commands for Caravan-X
 * Provides both interactive menu and CLI interface for
 * exporting, importing, and inspecting .caravan-env archives.
 */

import { select, input, confirm, checkbox } from "@inquirer/prompts";
import chalk from "chalk";
import * as fs from "fs-extra";
import * as path from "path";
import Table from "cli-table3";
import boxen from "boxen";

import { EnvironmentService } from "../core/environment";
import { BitcoinRpcClient } from "../core/rpc";
import {
  EnvironmentExportOptions,
  EnvironmentImportOptions,
  EnvironmentManifest,
} from "../types/environment";
import { colors, displayCommandTitle } from "../utils/terminal";

export class EnvironmentCommands {
  private envService: EnvironmentService;
  private rpc: BitcoinRpcClient;

  constructor(envService: EnvironmentService, rpc: BitcoinRpcClient) {
    this.envService = envService;
    this.rpc = rpc;
  }

  /**
   * Main interactive menu for environment sharing
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
          description: "Import a .caravan-env archive from another developer",
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

  /**
   * Interactive export flow
   */
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

    // Gather export options
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
        "Include binary blockchain data? (Recommended for exact replication, larger file)",
      default: true,
    });

    const includePrivateKeys = await confirm({
      message:
        "Include private keys in wallet exports? (Needed for signing on the other end)",
      default: true,
    });

    const generateReplayScript = await confirm({
      message:
        "Generate a replay script? (Portable alternative to binary data)",
      default: true,
    });

    // Ask about wallet filtering
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

    // Output path
    const defaultOutputPath = path.join(
      process.cwd(),
      `${name.replace(/\s+/g, "-").toLowerCase()}.caravan-env`,
    );

    const outputPath = await input({
      message: "Output file path:",
      default: defaultOutputPath,
    });

    // Confirm and export
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

  /**
   * Interactive import flow
   */
  private async importEnvironment(): Promise<void> {
    console.log(
      boxen(
        chalk.cyan.bold("📥 Import Environment\n\n") +
          chalk.white(
            "Import a .caravan-env archive to replicate another\n" +
              "developer's exact regtest environment.\n\n",
          ) +
          chalk.yellow("⚠ This will replace your current regtest state!"),
        {
          padding: 1,
          margin: { top: 1, bottom: 1, left: 0, right: 0 },
          borderStyle: "round",
          borderColor: "cyan",
        },
      ),
    );

    const archivePath = await input({
      message: "Path to .caravan-env file:",
      validate: (v) => {
        if (!v.trim()) return "Path is required";
        if (!fs.existsSync(v)) return "File does not exist";
        return true;
      },
    });

    // Inspect first
    console.log(chalk.dim("\nInspecting archive..."));
    const manifest = await this.envService.inspectEnvironment(archivePath);
    if (!manifest) {
      console.log(
        chalk.red("Could not read archive. Is it a valid .caravan-env file?"),
      );
      return;
    }

    this.displayManifestDetails(manifest);

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
                name: "Replay (recreate from scratch, block hashes will differ)",
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

    const proceed = await confirm({
      message:
        "This will replace your current regtest environment. Are you sure?",
      default: false,
    });

    if (!proceed) {
      console.log(chalk.yellow("Import cancelled."));
      return;
    }

    const importOptions: EnvironmentImportOptions = {
      archivePath,
      method,
      skipVerification,
      force: true,
    };

    try {
      const result = await this.envService.importEnvironment(importOptions);

      if (result.success) {
        console.log(chalk.green("\n✅ Environment imported successfully!"));
        console.log(
          chalk.yellow(
            "\nPlease restart Caravan-X for changes to take full effect.",
          ),
        );
      } else {
        console.log(chalk.red("\n❌ Import completed with errors:"));
        for (const err of result.errors) {
          console.log(chalk.red(`  • ${err}`));
        }
      }
    } catch (error: any) {
      console.error(chalk.red(`\n❌ Import failed: ${error.message}`));
    }
  }

  /**
   * Interactive inspect flow
   */
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

  /**
   * Display manifest details in a nice format
   */
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

  // ==========================================================================
  // CLI Commands (non-interactive, for scripting)
  // ==========================================================================

  /**
   * CLI: Export environment
   * Usage: caravan-x env export --name "my-env" --output ./my-env.caravan-env
   */
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

  /**
   * CLI: Import environment
   * Usage: caravan-x env import ./my-env.caravan-env
   */
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

  /**
   * CLI: Inspect environment
   * Usage: caravan-x env inspect ./my-env.caravan-env
   */
  async cliInspect(archivePath: string): Promise<void> {
    const manifest = await this.envService.inspectEnvironment(archivePath);
    if (manifest) {
      this.displayManifestDetails(manifest);
    }
  }
}
