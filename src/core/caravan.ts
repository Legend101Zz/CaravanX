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
}
