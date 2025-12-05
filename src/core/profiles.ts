import * as fs from "fs-extra";
import * as path from "path";
import {
  ConfigProfile,
  ProfilesIndex,
  EnhancedAppConfig,
  SetupMode,
} from "../types/config";

/**
 * Manages multiple configuration profiles for Caravan-X
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

  /**
   * Initialize profile directory structure
   */
  async initialize(): Promise<void> {
    await fs.ensureDir(this.profilesDir);

    if (!(await fs.pathExists(this.indexPath))) {
      const emptyIndex: ProfilesIndex = {
        activeProfileId: null,
        profiles: [],
      };
      await fs.writeJson(this.indexPath, emptyIndex, { spaces: 2 });
    }
  }

  /**
   * Get the profiles index
   */
  async getIndex(): Promise<ProfilesIndex> {
    await this.initialize();
    return await fs.readJson(this.indexPath);
  }

  /**
   * Save the profiles index
   */
  private async saveIndex(index: ProfilesIndex): Promise<void> {
    await fs.writeJson(this.indexPath, index, { spaces: 2 });
  }

  /**
   * List all profiles
   */
  async listProfiles(): Promise<ProfilesIndex["profiles"]> {
    const index = await this.getIndex();
    return index.profiles;
  }

  /**
   * Get profiles by mode
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
   * Get a specific profile
   */
  async getProfile(profileId: string): Promise<ConfigProfile | null> {
    const index = await this.getIndex();
    const profileEntry = index.profiles.find((p) => p.id === profileId);

    if (!profileEntry) return null;

    try {
      const config = await fs.readJson(profileEntry.configPath);
      return {
        id: profileEntry.id,
        name: profileEntry.name,
        mode: profileEntry.mode,
        createdAt: profileEntry.createdAt,
        lastUsedAt: profileEntry.lastUsedAt,
        config,
      };
    } catch (error) {
      console.error(`Error loading profile ${profileId}:`, error);
      return null;
    }
  }

  /**
   * Get the active profile
   */
  async getActiveProfile(): Promise<ConfigProfile | null> {
    const index = await this.getIndex();
    if (!index.activeProfileId) return null;
    return this.getProfile(index.activeProfileId);
  }

  /**
   * Create a new profile
   */
  async createProfile(
    name: string,
    mode: SetupMode,
    config: EnhancedAppConfig,
  ): Promise<ConfigProfile> {
    const index = await this.getIndex();

    const id = this.generateProfileId();
    const now = new Date().toISOString();
    const configPath = path.join(this.profilesDir, `${id}.json`);

    // Save the config file
    await fs.writeJson(configPath, config, { spaces: 2 });

    // Update index
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
      config,
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
    const profileEntry = index.profiles.find((p) => p.id === profileId);

    if (!profileEntry) {
      throw new Error(`Profile ${profileId} not found`);
    }

    await fs.writeJson(profileEntry.configPath, config, { spaces: 2 });
    profileEntry.lastUsedAt = new Date().toISOString();
    await this.saveIndex(index);
  }

  /**
   * Rename a profile
   */
  async renameProfile(profileId: string, newName: string): Promise<void> {
    const index = await this.getIndex();
    const profileEntry = index.profiles.find((p) => p.id === profileId);

    if (!profileEntry) {
      throw new Error(`Profile ${profileId} not found`);
    }

    profileEntry.name = newName;
    await this.saveIndex(index);
  }

  /**
   * Set the active profile
   */
  async setActiveProfile(profileId: string): Promise<void> {
    const index = await this.getIndex();
    const profileEntry = index.profiles.find((p) => p.id === profileId);

    if (!profileEntry) {
      throw new Error(`Profile ${profileId} not found`);
    }

    index.activeProfileId = profileId;
    profileEntry.lastUsedAt = new Date().toISOString();
    await this.saveIndex(index);
  }

  /**
   * Delete a profile
   */
  async deleteProfile(profileId: string): Promise<void> {
    const index = await this.getIndex();
    const profileIndex = index.profiles.findIndex((p) => p.id === profileId);

    if (profileIndex === -1) {
      throw new Error(`Profile ${profileId} not found`);
    }

    const profile = index.profiles[profileIndex];

    // Delete config file
    if (await fs.pathExists(profile.configPath)) {
      await fs.remove(profile.configPath);
    }

    // Remove from index
    index.profiles.splice(profileIndex, 1);

    // Clear active if it was deleted
    if (index.activeProfileId === profileId) {
      index.activeProfileId = null;
    }

    await this.saveIndex(index);
  }

  /**
   * Generate a unique profile ID
   */
  private generateProfileId(): string {
    return `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
