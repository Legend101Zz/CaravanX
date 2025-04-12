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
}
