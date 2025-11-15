import { select, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import * as fs from "fs-extra";
import * as path from "path";

export class SettingsCommands {
  private configPath: string;

  constructor(appDir: string) {
    this.configPath = path.join(appDir, "config.json");
  }

  async showSettingsMenu(): Promise<void> {
    console.log(chalk.cyan("\n⚙️  Settings\n"));

    const action = await select({
      message: "What would you like to configure?",
      choices: [
        { name: "🔄 Switch Mode (Docker ↔ Manual)", value: "switch_mode" },
        { name: "📝 View Current Config", value: "view_config" },
        { name: "🔙 Back", value: "back" },
      ],
    });

    switch (action) {
      case "switch_mode":
        await this.switchMode();
        break;
      case "view_config":
        await this.viewConfig();
        break;
      case "back":
        return;
    }
  }

  private async switchMode(): Promise<void> {
    console.log(
      chalk.yellow("\n⚠️  Switching modes requires restarting Caravan-X\n"),
    );

    const currentConfig = await fs.readJson(this.configPath);
    const currentMode = currentConfig.mode;

    console.log(chalk.white("Current mode:"), chalk.cyan(currentMode));

    const switchTo = currentMode === "docker" ? "manual" : "docker";

    const confirmSwitch = await confirm({
      message: `Switch to ${switchTo} mode?`,
      default: false,
    });

    if (!confirmSwitch) {
      return;
    }

    // Update config
    currentConfig.mode = switchTo;
    await fs.writeJson(this.configPath, currentConfig, { spaces: 2 });

    console.log(chalk.green(`\n✓ Switched to ${switchTo} mode`));
    console.log(
      chalk.yellow("\nPlease restart Caravan-X for changes to take effect\n"),
    );

    process.exit(0);
  }

  private async viewConfig(): Promise<void> {
    const config = await fs.readJson(this.configPath);

    console.log(chalk.cyan("\n📋 Current Configuration:\n"));
    console.log(JSON.stringify(config, null, 2));
    console.log();
  }
}
