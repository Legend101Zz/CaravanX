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
}
