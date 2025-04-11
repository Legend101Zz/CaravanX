import * as fs from "fs-extra";
import * as path from "path";
import { AppConfig, DEFAULT_CONFIG } from "../types/config";

/**
 * Manages application Configuration
 */
export class ConfigManager {
  private readonly configPath: string;
  private config: AppConfig;

  constructor(configPath?: string) {
    this.configPath =
      configPath ||
      path.join(process.env.HOME || "", ".caravan-regtest", "config.json");
    this.config = DEFAULT_CONFIG;
    this.initConfig();
  }

  /**
   * Initialize configuration by loading from disk or creating default
   */
  private initConfig(): void {
    try {
      fs.ensureDirSync(path.dirname(this.configPath));

      if (fs.existsSync(this.configPath)) {
        const savedConfig = fs.readJsonSync(this.configPath);
        this.config = { ...DEFAULT_CONFIG, ...savedConfig };
      } else {
        // If no config exists, save the default
        this.saveConfig();
      }

      // Make sure directories exist
      fs.ensureDirSync(this.config.appDir);
      fs.ensureDirSync(this.config.caravanDir);
      fs.ensureDirSync(this.config.keysDir);
    } catch (error) {
      console.error("Error initializing configuration:", error);
      // Fall back to defaults
      this.config = DEFAULT_CONFIG;
    }
  }

  /**
   * Save configuration to disk
   */
  saveConfig(): void {
    try {
      fs.writeJsonSync(this.configPath, this.config, { spaces: 2 });
    } catch (error) {
      console.error("Error saving configuration:", error);
    }
  }

  /**
   * Get the current configuration
   */
  getConfig(): AppConfig {
    return this.config;
  }

  /**
   * Update Bitcoin RPC configuration
   */
  updateBitcoinConfig(bitcoinConfig: Partial<AppConfig["bitcoin"]>): void {
    this.config.bitcoin = { ...this.config.bitcoin, ...bitcoinConfig };
    this.saveConfig();
  }

  /**
   * Update application directories
   */
  updateDirectories(
    dirs: Partial<Pick<AppConfig, "appDir" | "caravanDir" | "keysDir">>,
  ): void {
    this.config = { ...this.config, ...dirs };

    // Make sure the directories exist
    if (dirs.appDir) fs.ensureDirSync(dirs.appDir);
    if (dirs.caravanDir) fs.ensureDirSync(dirs.caravanDir);
    if (dirs.keysDir) fs.ensureDirSync(dirs.keysDir);

    this.saveConfig();
  }
}
