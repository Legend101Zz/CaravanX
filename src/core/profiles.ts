import * as fs from "fs-extra";
import * as path from "path";
import chalk from "chalk";
import boxen from "boxen";
import { confirm } from "@inquirer/prompts";
import {
  ConfigProfile,
  ProfilesIndex,
  EnhancedAppConfig,
  SetupMode,
} from "../types/config";

/**
 * Manages multiple configuration profiles for Caravan-X.
 *
 * ISOLATION PRINCIPLE:
 * Each profile gets its own directory under <baseDir>/profiles/<profileId>/.
 * Wallets, keys, snapshots, docker-data, scenarios, and logs all live inside
 * the profile directory. This means exporting, snapshotting, or switching
 * profiles never touches another profile's data.
 */
export class ProfileManager {
  private baseDir: string;
  private profilesDir: string;
  private indexPath: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.profilesDir = path.join(baseDir, "profiles");
    this.indexPath = path.join(this.profilesDir, "index.json");
  }

  // =========================================================================
  // INITIALIZATION + LEGACY DETECTION
  // =========================================================================

  /**
   * Initialize the profile system.
   * Detects old flat-directory layouts and prompts for a clean wipe.
   *
   * Returns false if the user chose NOT to wipe (i.e., wants to stay
   * on older version), so the caller can exit gracefully.
   */
  async initialize(): Promise<boolean> {
    // --- Check for legacy layout BEFORE creating anything ---
    const hasLegacy = await this.detectLegacyLayout();

    if (hasLegacy) {
      const userAccepted = await this.promptLegacyWipe();
      if (!userAccepted) {
        // User declined — they want to keep old data / use older version
        return false;
      }
      // Wipe everything and start fresh
      await this.wipeLegacyData();
    }

    // Ensure the profiles directory and index exist
    await fs.ensureDir(this.profilesDir);

    if (!(await fs.pathExists(this.indexPath))) {
      const emptyIndex: ProfilesIndex = {
        activeProfileId: null,
        profiles: [],
      };
      await fs.writeJson(this.indexPath, emptyIndex, { spaces: 2 });
    }

    return true;
  }

  /**
   * Detect the old flat-directory layout.
   *
   * Old layout had these directly in the base dir:
   *   ~/.caravan-x/docker-data/
   *   ~/.caravan-x/wallets/
   *   ~/.caravan-x/keys/
   *   ~/.caravan-x/snapshots/
   *   ~/.caravan-x/scenarios/
   *
   * AND old profiles were flat JSON files in profiles/ (not subdirectories).
   *
   * We check for any of these markers.
   */
  private async detectLegacyLayout(): Promise<boolean> {
    // Marker 1: shared data directories sitting directly in baseDir
    const legacyDirs = [
      path.join(this.baseDir, "docker-data"),
      path.join(this.baseDir, "wallets"),
      path.join(this.baseDir, "keys"),
      path.join(this.baseDir, "snapshots"),
      path.join(this.baseDir, "scenarios"),
    ];

    for (const dir of legacyDirs) {
      if (await fs.pathExists(dir)) {
        return true;
      }
    }

    // Marker 2: old-style profile JSON files directly in profiles/
    // (new layout has subdirectories like profiles/profile_xxx/config.json)
    if (await fs.pathExists(this.profilesDir)) {
      const entries = await fs.readdir(this.profilesDir);
      for (const entry of entries) {
        // Old profiles are profile_*.json files sitting directly in profiles/
        if (
          entry.startsWith("profile_") &&
          entry.endsWith(".json") &&
          entry !== "index.json"
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Show the user a clear warning about the breaking change and ask
   * if they want to proceed (wipe) or bail out (use older version).
   */
  private async promptLegacyWipe(): Promise<boolean> {
    console.log(
      boxen(
        chalk.red.bold("⚠️  Breaking Change — New Profile System\n\n") +
          chalk.white(
            "Caravan-X now isolates each configuration profile into its\n" +
              "own directory. This fixes a bug where wallets, keys, and\n" +
              "snapshots from different configurations would leak into\n" +
              "each other during exports and snapshots.\n\n",
          ) +
          chalk.yellow.bold("What this means:\n") +
          chalk.white(
            "  • All existing data in this directory will be DELETED\n" +
              "    (wallets, keys, snapshots, docker-data, configs)\n" +
              "  • You will set up fresh configurations from scratch\n" +
              "  • Each new configuration will have its own isolated storage\n\n",
          ) +
          chalk.cyan.bold("New directory layout:\n") +
          chalk.gray(
            "  ~/.caravan-x/\n" +
              "    └── profiles/\n" +
              "        ├── profile_abc/\n" +
              "        │   ├── config.json\n" +
              "        │   ├── docker-data/\n" +
              "        │   ├── wallets/\n" +
              "        │   ├── keys/\n" +
              "        │   ├── snapshots/\n" +
              "        │   └── scenarios/\n" +
              "        └── profile_def/\n" +
              "            └── ... (fully isolated)\n\n",
          ) +
          chalk.yellow(
            "If you want to keep your existing data, press N and use\n" +
              "an older version of Caravan-X (< v2.0.0).",
          ),
        {
          padding: 1,
          margin: 1,
          borderStyle: "double",
          borderColor: "red",
        },
      ),
    );

    const proceed = await confirm({
      message: "Delete all existing data and start fresh with the new system?",
      default: false, // default to NO so the user has to actively choose
    });

    return proceed;
  }

  /**
   * Nuke the entire base directory contents and start clean.
   * We preserve the base directory itself but remove everything inside it.
   */
  private async wipeLegacyData(): Promise<void> {
    console.log(chalk.yellow("\n🗑️  Cleaning up old data...\n"));

    // List of things to delete from the base directory
    const toDelete = [
      "config.json",
      "docker-data",
      "wallets",
      "keys",
      "snapshots",
      "scenarios",
      "profiles",
      "shared-config.yaml",
      "imported-env-config.json",
      "logs",
    ];

    for (const item of toDelete) {
      const itemPath = path.join(this.baseDir, item);
      if (await fs.pathExists(itemPath)) {
        await fs.remove(itemPath);
        console.log(chalk.gray(`  Removed: ${item}`));
      }
    }

    console.log(chalk.green("\n✅ Old data cleared. Starting fresh!\n"));
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  /**
   * Get the profiles index
   */
  async getIndex(): Promise<ProfilesIndex> {
    await fs.ensureDir(this.profilesDir);
    if (!(await fs.pathExists(this.indexPath))) {
      return { activeProfileId: null, profiles: [] };
    }
    return await fs.readJson(this.indexPath);
  }

  /**
   * List all profiles
   */
  async listProfiles(): Promise<ProfilesIndex["profiles"]> {
    const index = await this.getIndex();
    return index.profiles;
  }

  /**
   * Get profiles filtered by mode (docker / manual)
   */
  async getProfilesByMode(mode: SetupMode): Promise<ProfilesIndex["profiles"]> {
    const index = await this.getIndex();
    return index.profiles.filter((p) => p.mode === mode);
  }

  /**
   * Check if any profiles exist
   */
  async hasProfiles(): Promise<boolean> {
    const index = await this.getIndex();
    return index.profiles.length > 0;
  }

  /**
   * Get a specific profile by ID
   */
  async getProfile(profileId: string): Promise<ConfigProfile | null> {
    const index = await this.getIndex();
    const entry = index.profiles.find((p) => p.id === profileId);
    if (!entry) return null;

    try {
      const config = await fs.readJson(entry.configPath);
      return {
        id: entry.id,
        name: entry.name,
        mode: entry.mode,
        createdAt: entry.createdAt,
        lastUsedAt: entry.lastUsedAt,
        config,
      };
    } catch (error) {
      console.error(`Error loading profile ${profileId}:`, error);
      return null;
    }
  }

  /**
   * Get the currently active profile
   */
  async getActiveProfile(): Promise<ConfigProfile | null> {
    const index = await this.getIndex();
    if (!index.activeProfileId) return null;
    return this.getProfile(index.activeProfileId);
  }

  /**
   * Create a new profile with its own isolated data directory.
   *
   * This is where the isolation magic happens:
   *   <baseDir>/profiles/<profileId>/
   *     ├── config.json         ← profile-scoped config
   *     ├── docker-data/        ← only this profile's blockchain data
   *     ├── wallets/            ← only this profile's Caravan wallet configs
   *     ├── keys/               ← only this profile's key files
   *     ├── snapshots/          ← only this profile's snapshots
   *     ├── scenarios/          ← only this profile's scenarios
   *     └── logs/               ← only this profile's logs
   */
  async createProfile(
    name: string,
    mode: SetupMode,
    config: EnhancedAppConfig,
  ): Promise<ConfigProfile> {
    const index = await this.getIndex();

    // Manual mode is limited to one profile because all manual
    // profiles share the same bitcoind — no filesystem isolation.
    // Docker mode gets container-level isolation so multiple are fine.
    if (mode === SetupMode.MANUAL) {
      const existingManual = index.profiles.filter(
        (p) => p.mode === SetupMode.MANUAL,
      );
      if (existingManual.length > 0) {
        throw new Error(
          "Only one Manual mode profile is allowed. Delete the existing one first, or use Docker mode for multiple profiles.",
        );
      }
    }

    const id = this.generateProfileId();
    const now = new Date().toISOString();

    // --- Create the profile's isolated directory tree ---
    const profileDir = path.join(this.profilesDir, id);
    const configPath = path.join(profileDir, "config.json");

    await fs.ensureDir(profileDir);
    await fs.ensureDir(path.join(profileDir, "wallets"));
    await fs.ensureDir(path.join(profileDir, "keys"));
    await fs.ensureDir(path.join(profileDir, "snapshots"));
    await fs.ensureDir(path.join(profileDir, "scenarios"));
    await fs.ensureDir(path.join(profileDir, "logs"));

    if (mode === SetupMode.DOCKER) {
      await fs.ensureDir(path.join(profileDir, "docker-data", "bitcoin-data"));
      await fs.ensureDir(path.join(profileDir, "docker-data", "nginx"));
    }

    // --- Rewrite all paths in config to point inside this profile dir ---
    const scopedConfig = this.scopeConfigToProfile(config, profileDir);

    // Persist the scoped config
    await fs.writeJson(configPath, scopedConfig, { spaces: 2 });

    // Update the index
    index.profiles.push({
      id,
      name,
      mode,
      createdAt: now,
      lastUsedAt: now,
      configPath,
    });
    await this.saveIndex(index);

    return {
      id,
      name,
      mode,
      createdAt: now,
      lastUsedAt: now,
      config: scopedConfig,
    };
  }

  /**
   * Update an existing profile's config
   */
  async updateProfile(
    profileId: string,
    config: EnhancedAppConfig,
  ): Promise<void> {
    const index = await this.getIndex();
    const entry = index.profiles.find((p) => p.id === profileId);
    if (!entry) throw new Error(`Profile ${profileId} not found`);

    // Re-scope paths in case caller passed raw config
    const profileDir = path.dirname(entry.configPath);
    const scopedConfig = this.scopeConfigToProfile(config, profileDir);

    await fs.writeJson(entry.configPath, scopedConfig, { spaces: 2 });
    entry.lastUsedAt = new Date().toISOString();
    await this.saveIndex(index);
  }

  /**
   * Rename a profile
   */
  async renameProfile(profileId: string, newName: string): Promise<void> {
    const index = await this.getIndex();
    const entry = index.profiles.find((p) => p.id === profileId);
    if (!entry) throw new Error(`Profile ${profileId} not found`);

    entry.name = newName;
    await this.saveIndex(index);
  }

  /**
   * Set the active profile
   */
  async setActiveProfile(profileId: string): Promise<void> {
    const index = await this.getIndex();
    const entry = index.profiles.find((p) => p.id === profileId);
    if (!entry) throw new Error(`Profile ${profileId} not found`);

    index.activeProfileId = profileId;
    entry.lastUsedAt = new Date().toISOString();
    await this.saveIndex(index);
  }

  /**
   * Delete a profile AND its entire isolated data directory.
   * This removes wallets, keys, snapshots, docker-data — everything.
   */
  async deleteProfile(profileId: string): Promise<void> {
    const index = await this.getIndex();
    const idx = index.profiles.findIndex((p) => p.id === profileId);
    if (idx === -1) throw new Error(`Profile ${profileId} not found`);

    const entry = index.profiles[idx];

    // The profile directory is the parent of the config file
    const profileDir = path.dirname(entry.configPath);

    // Nuke the entire profile directory
    if (await fs.pathExists(profileDir)) {
      await fs.remove(profileDir);
    }

    // Remove from index
    index.profiles.splice(idx, 1);
    if (index.activeProfileId === profileId) {
      index.activeProfileId = null;
    }

    await this.saveIndex(index);
  }

  /**
   * Get the isolated root directory for a given profile
   */
  getProfileDir(profileId: string): string {
    return path.join(this.profilesDir, profileId);
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  private async saveIndex(index: ProfilesIndex): Promise<void> {
    await fs.writeJson(this.indexPath, index, { spaces: 2 });
  }

  /**
   * Rewrite every data path in the config to point inside the profile
   * directory. This is the heart of profile isolation.
   *
   * Before: config.caravanDir = "~/.caravan-x/wallets"         (shared!)
   * After:  config.caravanDir = "~/.caravan-x/profiles/xyz/wallets"  (isolated)
   */
  private scopeConfigToProfile(
    config: EnhancedAppConfig,
    profileDir: string,
  ): EnhancedAppConfig {
    const scoped: EnhancedAppConfig = {
      ...config,

      // --- Core directories → profile-scoped ---
      appDir: profileDir,
      caravanDir: path.join(profileDir, "wallets"),
      keysDir: path.join(profileDir, "keys"),
      scenariosDir: path.join(profileDir, "scenarios"),

      // --- Snapshots → profile-scoped ---
      snapshots: {
        ...config.snapshots,
        directory: path.join(profileDir, "snapshots"),
      },
    };

    // --- Docker mode: scope blockchain data + volumes ---
    if (config.mode === SetupMode.DOCKER) {
      const dockerBitcoinData = path.join(
        profileDir,
        "docker-data",
        "bitcoin-data",
      );

      scoped.bitcoin = {
        ...config.bitcoin,
        dataDir: dockerBitcoinData,
      };

      if (scoped.docker) {
        scoped.docker = {
          ...scoped.docker,
          volumes: {
            ...scoped.docker.volumes,
            bitcoinData: dockerBitcoinData,
            coordinator: path.join(profileDir, "coordinator"),
          },
        };
      }
    }

    // --- Logging → profile-scoped ---
    scoped.logging = {
      ...(config.logging || {
        level: "normal" as const,
        fileLogging: true,
      }),
      logDir: path.join(profileDir, "logs"),
    };

    return scoped;
  }

  private generateProfileId(): string {
    return `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
