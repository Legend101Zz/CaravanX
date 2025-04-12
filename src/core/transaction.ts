import { BitcoinRpcClient } from "./rpc";
import { PSBTOutput, FinalizedPSBT } from "../types/bitcoin";
import { CaravanWalletConfig } from "../types/caravan";
import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import * as ecc from "tiny-secp256k1";

// Initialize Bitcoin.js components
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

/**
 * Service for handling PSBTs (Partially Signed Bitcoin Transactions)
 */
export class TransactionService {
  private readonly rpc: BitcoinRpcClient;
  private readonly network: bitcoin.networks.Network;

  constructor(rpc: BitcoinRpcClient, isRegtest = true) {
    this.rpc = rpc;
    // Use the appropriate network
    this.network = isRegtest
      ? bitcoin.networks.regtest
      : bitcoin.networks.testnet;
  }

  /**
   * Create a new PSBT from a wallet
   */
  async createPSBT(
    wallet: string,
    outputs: Record<string, number>[],
  ): Promise<string> {
    try {
      const result = await this.rpc.createPSBT(wallet, outputs);
      return result.psbt;
    } catch (error) {
      console.error(`Error creating PSBT in wallet "${wallet}":`, error);
      throw error;
    }
  }

  /**
   * Decode a PSBT to get detailed information
   */
  async decodePSBT(psbtBase64: string): Promise<any> {
    try {
      return await this.rpc.decodePSBT(psbtBase64);
    } catch (error) {
      console.error("Error decoding PSBT:", error);
      throw error;
    }
  }
}
