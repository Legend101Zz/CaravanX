import * as fs from "fs-extra";
import * as path from "path";
import * as crypto from "crypto";
import { BitcoinRpcClient } from "./rpc";
import {
  CaravanWalletConfig,
  ExtendedPublicKey,
  CaravanKeyData,
  AddressType,
  Network,
} from "../types/caravan";

/**
 * Service for managing Caravan wallets
 */
export class CaravanService {
  private readonly rpc: BitcoinRpcClient;
  private readonly caravanDir: string;
  private readonly keysDir: string;

  constructor(rpc: BitcoinRpcClient, caravanDir: string, keysDir: string) {
    this.rpc = rpc;
    this.caravanDir = caravanDir;
    this.keysDir = keysDir;

    // Ensure directories exist
    fs.ensureDirSync(this.caravanDir);
    fs.ensureDirSync(this.keysDir);
  }

  /**
   * Get the path to the Caravan configuration directory
   */
  getCaravanDir(): string {
    return this.caravanDir;
  }

  /**
   * Convert BIP32 path from 'h' notation to apostrophe notation
   * Example: "m/84h/1h/0h" becomes "m/84'/1'/0'"
   */
  convertBip32PathFormat(path: string): string {
    // If the path already uses apostrophes, return it as is
    if (path.includes("'")) {
      return path;
    }

    // Replace 'h' with apostrophes
    return path.replace(/h/g, "'");
  }

  /**
   * Format a Caravan wallet config for export
   * This handles any needed conversions (like BIP32 path format)
   */
  formatCaravanConfigForExport(
    config: CaravanWalletConfig,
  ): CaravanWalletConfig {
    const formattedConfig = { ...config };

    // Convert BIP32 paths in extended public keys
    if (formattedConfig.extendedPublicKeys) {
      formattedConfig.extendedPublicKeys =
        formattedConfig.extendedPublicKeys.map((key) => ({
          ...key,
          bip32Path: this.convertBip32PathFormat(key.bip32Path),
        }));
    }

    return formattedConfig;
  }

  /**
   * List all Caravan wallet configurations
   */
  async listCaravanWallets(): Promise<CaravanWalletConfig[]> {
    try {
      const files = await fs.readdir(this.caravanDir);
      const jsonFiles = files.filter((file) => file.endsWith(".json"));

      const configs: CaravanWalletConfig[] = [];

      for (const file of jsonFiles) {
        try {
          const configPath = path.join(this.caravanDir, file);
          const config = await fs.readJson(configPath);

          if (config.name && config.quorum && config.extendedPublicKeys) {
            configs.push({
              ...config,
              filename: file,
            });
          }
        } catch (error) {
          console.error(`Error reading ${file}:`, error);
        }
      }

      return configs;
    } catch (error) {
      console.error("Error listing Caravan wallet configs:", error);
      return [];
    }
  }

  /**
   * Get a specific Caravan wallet by name
   */
  async getCaravanWallet(name: string): Promise<CaravanWalletConfig | null> {
    const wallets = await this.listCaravanWallets();
    return wallets.find((wallet) => wallet.name === name) || null;
  }

  /**
   * Save a Caravan wallet configuration
   */
  async saveCaravanWalletConfig(config: CaravanWalletConfig): Promise<string> {
    const filename = `${config.name.replace(/[^a-zA-Z0-9]/g, "_")}.json`;
    const configPath = path.join(this.caravanDir, filename);

    await fs.writeJson(configPath, config, { spaces: 2 });
    return filename;
  }

  /**
   * Create a new Caravan wallet configuration
   */
  async createCaravanWalletConfig({
    name,
    addressType,
    network,
    requiredSigners,
    totalSigners,
    extendedPublicKeys,
    startingAddressIndex = 0,
  }: {
    name: string;
    addressType: AddressType;
    network: Network;
    requiredSigners: number;
    totalSigners: number;
    extendedPublicKeys: ExtendedPublicKey[];
    startingAddressIndex?: number;
  }): Promise<CaravanWalletConfig> {
    // Generate UUID for the wallet (optional but useful for consistent wallet identification)
    const uuid = crypto.randomBytes(16).toString("hex");

    const config: CaravanWalletConfig = {
      name,
      addressType,
      network,
      quorum: {
        requiredSigners,
        totalSigners,
      },
      extendedPublicKeys,
      startingAddressIndex,
      uuid,
    };

    await this.saveCaravanWalletConfig(config);
    return config;
  }
  /**
   * Create a watch-only wallet for a Caravan wallet configuration
   */
  async createWatchWalletForCaravan(
    caravanConfig: CaravanWalletConfig,
  ): Promise<string> {
    // Create a safe wallet name
    const safeWalletName = `${caravanConfig.name.replace(/\s+/g, "_").toLowerCase()}_watch`;

    try {
      // Create the wallet
      await this.rpc.createWallet(safeWalletName, true, false);

      // Build descriptors from the Caravan config
      const descriptors = this.buildDescriptorsFromCaravanConfig(caravanConfig);

      // Import descriptors into the wallet
      await this.rpc.importDescriptors(safeWalletName, descriptors);

      return safeWalletName;
    } catch (error) {
      console.error(
        `Error creating watch-only wallet for ${caravanConfig.name}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Build wallet descriptors from a Caravan configuration
   */
  private buildDescriptorsFromCaravanConfig(
    caravanConfig: CaravanWalletConfig,
  ): any[] {
    const { requiredSigners } = caravanConfig.quorum;
    const xpubs = caravanConfig.extendedPublicKeys.map(
      (key) => `${key.xpub}/0/*`,
    );
    const changeXpubs = caravanConfig.extendedPublicKeys.map(
      (key) => `${key.xpub}/1/*`,
    );

    let receiveDescriptor: string;
    let changeDescriptor: string;

    // Build descriptors based on address type
    switch (caravanConfig.addressType) {
      case AddressType.P2WSH:
        receiveDescriptor = `wsh(multi(${requiredSigners},${xpubs.join(",")}))`;
        changeDescriptor = `wsh(multi(${requiredSigners},${changeXpubs.join(",")}))`;
        break;
      case AddressType.P2SH_P2WSH:
        receiveDescriptor = `sh(wsh(multi(${requiredSigners},${xpubs.join(",")})))`;
        changeDescriptor = `sh(wsh(multi(${requiredSigners},${changeXpubs.join(",")})))`;
        break;
      case AddressType.P2SH:
        receiveDescriptor = `sh(multi(${requiredSigners},${xpubs.join(",")}))`;
        changeDescriptor = `sh(multi(${requiredSigners},${changeXpubs.join(",")}))`;
        break;
      default:
        throw new Error(
          `Unsupported address type: ${caravanConfig.addressType}`,
        );
    }
    return [
      {
        desc: receiveDescriptor,
        timestamp: "now",
        active: true,
        internal: false,
      },
      {
        desc: changeDescriptor,
        timestamp: "now",
        active: true,
        internal: true,
      },
    ];
  }
}
