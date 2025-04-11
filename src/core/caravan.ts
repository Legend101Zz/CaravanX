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
}
