import { select, confirm, input } from "@inquirer/prompts";
import chalk from "chalk";
import boxen from "boxen";
import * as fs from "fs-extra";
import * as path from "path";

import { ProfileManager } from "../core/profiles";
import { SetupWizard } from "../ui/setupWizard";
import { SetupMode, EnhancedAppConfig, ConfigProfile } from "../types/config";

export class SettingsCommands {
  private appDir: string;
  private configPath: string;
  private profileManager: ProfileManager;

  constructor(appDir: string) {
    this.appDir = appDir;
    this.configPath = path.join(appDir, "config.json");
    this.profileManager = new ProfileManager(appDir);
  }

  async showSettingsMenu(): Promise<void> {
    let continueMenu = true;

    while (continueMenu) {
      console.clear();
      console.log(chalk.cyan.bold("\n⚙️  Settings\n"));
      console.log(chalk.gray("━".repeat(50)) + "\n");

      const action = await select({
        message: "What would you like to do?",
        choices: [
          { name: chalk.cyan("📋 View All Configurations"), value: "view_all" },
          { name: chalk.yellow("🔄 Switch Mode"), value: "switch_mode" },
          { name: chalk.green("📝 Edit Current Config"), value: "edit" },
          { name: chalk.magenta("📂 Manage Profiles"), value: "profiles" },
          { name: chalk.gray("🔙 Back"), value: "back" },
        ],
      });

      switch (action) {
        case "view_all":
          await this.viewAllConfigurations();
          break;
        case "switch_mode":
          await this.switchMode();
          break;
        case "edit":
          await this.editCurrentConfig();
          break;
        case "profiles":
          await this.manageProfiles();
          break;
        case "back":
          continueMenu = false;
          break;
      }
    }
  }

  /**
   * View all configurations (Docker + Manual)
   */
  private async viewAllConfigurations(): Promise<void> {
    console.clear();
    console.log(chalk.cyan.bold("\n📋 All Configurations\n"));

    // Get current config
    let currentConfig: EnhancedAppConfig | null = null;
    try {
      currentConfig = await fs.readJson(this.configPath);
    } catch (error) {
      // No config
    }

    // Get all profiles
    const allProfiles = await this.profileManager.listProfiles();
    const dockerProfiles = allProfiles.filter(
      (p) => p.mode === SetupMode.DOCKER,
    );
    const manualProfiles = allProfiles.filter(
      (p) => p.mode === SetupMode.MANUAL,
    );

    // Docker configurations
    console.log(
      boxen(
        chalk.cyan.bold("🐳 DOCKER CONFIGURATIONS\n\n") +
          (dockerProfiles.length > 0
            ? await this.formatProfilesList(dockerProfiles)
            : chalk.gray("No Docker configurations")),
        {
          padding: 1,
          margin: { top: 0, bottom: 1, left: 0, right: 0 },
          borderStyle: "round",
          borderColor: "cyan",
        },
      ),
    );

    // Manual configurations
    console.log(
      boxen(
        chalk.yellow.bold("⚙️  MANUAL CONFIGURATIONS\n\n") +
          (manualProfiles.length > 0
            ? await this.formatProfilesList(manualProfiles)
            : chalk.gray("No Manual configurations")),
        {
          padding: 1,
          margin: { top: 0, bottom: 1, left: 0, right: 0 },
          borderStyle: "round",
          borderColor: "yellow",
        },
      ),
    );

    // Current active config
    if (currentConfig) {
      console.log(
        boxen(
          chalk.green.bold("✅ CURRENTLY ACTIVE\n\n") +
            this.formatConfigDetails(currentConfig),
          {
            padding: 1,
            margin: { top: 0, bottom: 1, left: 0, right: 0 },
            borderStyle: "double",
            borderColor: "green",
          },
        ),
      );
    }

    await this.pressEnter();
  }

  /**
   * Format profiles list
   */
  private async formatProfilesList(
    profiles: {
      id: string;
      name: string;
      mode: SetupMode;
      createdAt: string;
      lastUsedAt: string;
      configPath: string;
    }[],
  ): Promise<string> {
    const lines: string[] = [];

    for (const profile of profiles) {
      try {
        const config: EnhancedAppConfig = await fs.readJson(profile.configPath);

        lines.push(chalk.white.bold(`📄 ${profile.name}`));
        lines.push(
          chalk.dim("   Last used: ") +
            chalk.white(new Date(profile.lastUsedAt).toLocaleString()),
        );
        lines.push(
          chalk.dim("   RPC: ") +
            chalk.white(`${config.bitcoin.host}:${config.bitcoin.port}`),
        );

        if (config.docker) {
          lines.push(
            chalk.dim("   Container: ") +
              chalk.cyan(config.docker.containerName),
          );
        }

        lines.push("");
      } catch (error) {
        lines.push(chalk.red(`Error loading: ${profile.name}\n`));
      }
    }

    return lines.join("\n");
  }

  /**
   * Format config details
   */
  private formatConfigDetails(config: EnhancedAppConfig): string {
    const lines: string[] = [];

    const modeBadge =
      config.mode === SetupMode.DOCKER
        ? chalk.bgCyan.black(" 🐳 DOCKER ")
        : chalk.bgYellow.black(" ⚙️  MANUAL ");

    lines.push(chalk.white("Mode: ") + modeBadge + "\n");

    lines.push(chalk.white.bold("📡 Bitcoin RPC:"));
    lines.push(
      chalk.dim("   Protocol: ") + chalk.white(config.bitcoin.protocol),
    );
    lines.push(chalk.dim("   Host: ") + chalk.white(config.bitcoin.host));
    lines.push(
      chalk.dim("   Port: ") + chalk.cyan(config.bitcoin.port.toString()),
    );
    lines.push(chalk.dim("   User: ") + chalk.white(config.bitcoin.user));
    lines.push(
      chalk.dim("   Data Dir: ") + chalk.white(config.bitcoin.dataDir),
    );
    lines.push("");

    lines.push(chalk.white.bold("📁 Directories:"));
    lines.push(chalk.dim("   App: ") + chalk.white(config.appDir));
    lines.push(chalk.dim("   Wallets: ") + chalk.white(config.caravanDir));
    lines.push(chalk.dim("   Keys: ") + chalk.white(config.keysDir));

    if (config.mode === SetupMode.DOCKER && config.docker) {
      lines.push("");
      lines.push(chalk.white.bold("🐳 Docker:"));
      lines.push(
        chalk.dim("   Container: ") + chalk.cyan(config.docker.containerName),
      );
      lines.push(chalk.dim("   Image: ") + chalk.white(config.docker.image));
      lines.push(
        chalk.dim("   Network: ") + chalk.white(config.docker.network),
      );
      lines.push(
        chalk.dim("   RPC Port: ") +
          chalk.white(config.docker.ports.rpc.toString()),
      );
      lines.push(
        chalk.dim("   P2P Port: ") +
          chalk.white(config.docker.ports.p2p.toString()),
      );
      lines.push(
        chalk.dim("   Bitcoin Data: ") +
          chalk.white(config.docker.volumes.bitcoinData),
      );
    }

    return lines.join("\n");
  }

  /**
   * Switch between modes
   */
  private async switchMode(): Promise<void> {
    console.clear();
    console.log(chalk.cyan.bold("\n🔄 Switch Mode\n"));

    let currentConfig: EnhancedAppConfig;
    try {
      currentConfig = await fs.readJson(this.configPath);
    } catch (error) {
      console.log(chalk.red("No current configuration found"));
      await this.pressEnter();
      return;
    }

    const currentMode = currentConfig.mode;
    const targetMode =
      currentMode === SetupMode.DOCKER ? SetupMode.MANUAL : SetupMode.DOCKER;

    const currentBadge =
      currentMode === SetupMode.DOCKER
        ? chalk.bgCyan.black(" 🐳 Docker ")
        : chalk.bgYellow.black(" ⚙️  Manual ");
    const targetBadge =
      targetMode === SetupMode.DOCKER
        ? chalk.bgCyan.black(" 🐳 Docker ")
        : chalk.bgYellow.black(" ⚙️  Manual ");

    console.log(chalk.white("Current: ") + currentBadge);
    console.log(chalk.white("Switch to: ") + targetBadge + "\n");

    // Check for existing configs in target mode
    const targetProfiles =
      await this.profileManager.getProfilesByMode(targetMode);

    if (targetProfiles.length > 0) {
      console.log(
        chalk.green(
          `Found ${targetProfiles.length} existing ${targetMode} config(s)\n`,
        ),
      );

      const choice = await select({
        message: "Select action:",
        choices: [
          ...targetProfiles.map((p) => ({
            name: `📂 Use: ${p.name}`,
            value: p.id,
          })),
          { name: chalk.cyan("➕ Create new configuration"), value: "new" },
          { name: chalk.gray("🔙 Cancel"), value: "cancel" },
        ],
      });

      if (choice === "cancel") return;

      if (choice === "new") {
        await this.createAndSwitchToNew(targetMode);
      } else {
        // Load selected profile
        const profile = await this.profileManager.getProfile(choice);
        if (profile) {
          await fs.writeJson(this.configPath, profile.config, { spaces: 2 });
          await this.profileManager.setActiveProfile(profile.id);
          console.log(chalk.green(`\n✅ Switched to: ${profile.name}`));
          console.log(
            chalk.yellow("\nRestart Caravan-X for changes to take effect."),
          );
          await this.pressEnter();
        }
      }
    } else {
      console.log(chalk.yellow(`No ${targetMode} configurations found.\n`));

      const create = await confirm({
        message: `Create a new ${targetMode} configuration?`,
        default: true,
      });

      if (create) {
        await this.createAndSwitchToNew(targetMode);
      }
    }
  }

  /**
   * Create new config and switch to it
   */
  private async createAndSwitchToNew(mode: SetupMode): Promise<void> {
    const wizard = new SetupWizard(this.appDir);

    let config: EnhancedAppConfig;
    if (mode === SetupMode.DOCKER) {
      config = await wizard.setupDockerMode(true); // Skip docker start
    } else {
      config = await wizard.setupManualMode();
    }

    const profileName = await input({
      message: "Name this configuration:",
      default: `${mode === SetupMode.DOCKER ? "Docker" : "Manual"} Config`,
    });

    const profile = await this.profileManager.createProfile(
      profileName,
      mode,
      config,
    );
    await fs.writeJson(this.configPath, config, { spaces: 2 });
    await this.profileManager.setActiveProfile(profile.id);

    console.log(chalk.green(`\n✅ Created and switched to: ${profileName}`));
    console.log(
      chalk.yellow("\nRestart Caravan-X for changes to take effect."),
    );
    await this.pressEnter();
  }

  /**
   * Edit current configuration
   */
  private async editCurrentConfig(): Promise<void> {
    console.clear();
    console.log(chalk.cyan.bold("\n📝 Edit Current Configuration\n"));

    let config: EnhancedAppConfig;
    try {
      config = await fs.readJson(this.configPath);
    } catch (error) {
      console.log(chalk.red("No configuration found"));
      await this.pressEnter();
      return;
    }

    const choice = await select({
      message: "What to edit?",
      choices: [
        { name: "📡 RPC Settings", value: "rpc" },
        { name: "📁 Directories", value: "dirs" },
        ...(config.mode === SetupMode.DOCKER
          ? [{ name: "🐳 Docker Settings", value: "docker" }]
          : []),
        { name: chalk.gray("🔙 Back"), value: "back" },
      ],
    });

    if (choice === "back") return;

    if (choice === "rpc") {
      config.bitcoin.host = await input({
        message: "Host:",
        default: config.bitcoin.host,
      });
      config.bitcoin.port = parseInt(
        await input({
          message: "Port:",
          default: config.bitcoin.port.toString(),
        }),
      );
      config.bitcoin.user = await input({
        message: "User:",
        default: config.bitcoin.user,
      });
      config.bitcoin.pass = await input({
        message: "Password:",
        default: config.bitcoin.pass,
      });
    }

    if (choice === "dirs") {
      config.caravanDir = await input({
        message: "Wallets directory:",
        default: config.caravanDir,
      });
      config.keysDir = await input({
        message: "Keys directory:",
        default: config.keysDir,
      });
      await fs.ensureDir(config.caravanDir);
      await fs.ensureDir(config.keysDir);
    }

    if (choice === "docker" && config.docker) {
      config.docker.containerName = await input({
        message: "Container name:",
        default: config.docker.containerName,
      });
      config.docker.ports.rpc = parseInt(
        await input({
          message: "RPC port:",
          default: config.docker.ports.rpc.toString(),
        }),
      );
      config.docker.ports.p2p = parseInt(
        await input({
          message: "P2P port:",
          default: config.docker.ports.p2p.toString(),
        }),
      );
    }

    await fs.writeJson(this.configPath, config, { spaces: 2 });
    console.log(chalk.green("\n✅ Configuration updated!"));

    if (choice === "docker") {
      console.log(
        chalk.yellow("Restart Docker containers for changes to take effect."),
      );
    }

    await this.pressEnter();
  }

  /**
   * Manage saved profiles
   */
  private async manageProfiles(): Promise<void> {
    console.clear();
    console.log(chalk.cyan.bold("\n📂 Manage Profiles\n"));

    const profiles = await this.profileManager.listProfiles();

    if (profiles.length === 0) {
      console.log(chalk.gray("No saved profiles."));
      await this.pressEnter();
      return;
    }

    const choice = await select({
      message: "Select profile:",
      choices: [
        ...profiles.map((p) => ({
          name: `${p.mode === SetupMode.DOCKER ? "🐳" : "⚙️ "} ${p.name}`,
          value: p.id,
        })),
        { name: chalk.gray("🔙 Back"), value: "back" },
      ],
    });

    if (choice === "back") return;

    // Manage selected profile
    const profile = await this.profileManager.getProfile(choice);
    if (!profile) return;

    console.log(
      boxen(
        chalk.white.bold(`📄 ${profile.name}\n\n`) +
          this.formatConfigDetails(profile.config),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: profile.mode === SetupMode.DOCKER ? "cyan" : "yellow",
        },
      ),
    );

    const action = await select({
      message: "Action:",
      choices: [
        { name: chalk.green("✅ Set as Active"), value: "activate" },
        { name: chalk.yellow("✏️  Rename"), value: "rename" },
        { name: chalk.red("🗑️  Delete"), value: "delete" },
        { name: chalk.gray("🔙 Back"), value: "back" },
      ],
    });

    if (action === "activate") {
      await fs.writeJson(this.configPath, profile.config, { spaces: 2 });
      await this.profileManager.setActiveProfile(profile.id);
      console.log(chalk.green(`\n✅ ${profile.name} is now active!`));
      console.log(
        chalk.yellow("Restart Caravan-X for changes to take effect."),
      );
    }

    if (action === "rename") {
      const newName = await input({
        message: "New name:",
        default: profile.name,
      });
      await this.profileManager.renameProfile(profile.id, newName);
      console.log(chalk.green(`\n✅ Renamed to: ${newName}`));
    }

    if (action === "delete") {
      const confirmDel = await confirm({
        message: `Delete "${profile.name}"?`,
        default: false,
      });
      if (confirmDel) {
        await this.profileManager.deleteProfile(profile.id);
        console.log(chalk.green("\n✅ Deleted"));
      }
    }

    await this.pressEnter();
  }

  private async pressEnter(): Promise<void> {
    await input({ message: chalk.gray("Press Enter to continue...") });
  }
}
