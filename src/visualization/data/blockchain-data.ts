import { BitcoinRpcClient } from "../../core/rpc";
import {
  Block,
  Transaction,
  MempoolInfo,
  NetworkInfo,
  ChainInfo,
} from "./types";

/**
 * Service for fetching blockchain data for visualization
 */
export class BlockchainDataService {
  private readonly rpc: BitcoinRpcClient;

  constructor(rpc: BitcoinRpcClient) {
    this.rpc = rpc;
  }

  /**
   * Get basic chain information
   */
  async getChainInfo(): Promise<ChainInfo> {
    const info = await this.rpc.callRpc<any>("getblockchaininfo");
    return {
      chain: info.chain,
      blocks: info.blocks,
      headers: info.headers,
      bestBlockHash: info.bestblockhash,
      difficulty: info.difficulty,
      medianTime: info.mediantime,
      verificationProgress: info.verificationprogress,
      initialBlockDownload: info.initialblockdownload,
      pruned: info.pruned,
      sizeOnDisk: info.size_on_disk,
    };
  }

  /**
   * Get network information
   */
  async getNetworkInfo(): Promise<NetworkInfo> {
    const info = await this.rpc.callRpc<any>("getnetworkinfo");
    return {
      version: info.version,
      subversion: info.subversion,
      protocolVersion: info.protocolversion,
      connections: info.connections,
      connectionsIn: info.connections_in,
      connectionsOut: info.connections_out,
      localServices: info.localservices,
      networkActive: info.networkactive,
      warnings: info.warnings,
    };
  }

  /**
   * Get mempool information
   */
  async getMempoolInfo(): Promise<MempoolInfo> {
    const info = await this.rpc.callRpc<any>("getmempoolinfo");
    return {
      loaded: info.loaded,
      size: info.size,
      bytes: info.bytes,
      usage: info.usage,
      maxMempool: info.maxmempool,
      mempoolMinFee: info.mempoolminfee,
      minRelaytxFee: info.minrelaytxfee,
      unbroadcastCount: info.unbroadcastcount || 0,
    };
  }

  /**
   * Get mempool transactions
   */
  async getMempoolTransactions(): Promise<string[]> {
    return this.rpc.callRpc<string[]>("getrawmempool");
  }

  /**
   * Get block count
   */
  async getBlockCount(): Promise<number> {
    return this.rpc.callRpc<number>("getblockcount");
  }

  /**
   * Get a specific block by hash
   */
  async getBlock(hash: string, verbosity: number = 2): Promise<Block> {
    const block = await this.rpc.callRpc<any>("getblock", [hash, verbosity]);
    return {
      hash: block.hash,
      confirmations: block.confirmations,
      size: block.size,
      strippedSize: block.strippedsize,
      weight: block.weight,
      height: block.height,
      version: block.version,
      versionHex: block.versionHex,
      merkleRoot: block.merkleroot,
      tx: block.tx, // Array of transactions
      time: block.time,
      medianTime: block.mediantime,
      nonce: block.nonce,
      bits: block.bits,
      difficulty: block.difficulty,
      chainwork: block.chainwork,
      previousBlockHash: block.previousblockhash,
      nextBlockHash: block.nextblockhash,
    };
  }

  /**
   * Get a block by height
   */
  async getBlockByHeight(
    height: number,
    verbosity: number = 2,
  ): Promise<Block> {
    const hash = await this.rpc.callRpc<string>("getblockhash", [height]);
    return this.getBlock(hash, verbosity);
  }

  /**
   * Get the most recent blocks
   */
  async getRecentBlocks(count: number = 10): Promise<Block[]> {
    const blockCount = await this.getBlockCount();
    const blocks: Block[] = [];

    for (let i = 0; i < count && blockCount - i >= 0; i++) {
      const block = await this.getBlockByHeight(blockCount - i);
      blocks.push(block);
    }

    return blocks;
  }

  /**
   * Get detailed transaction information
   */
  async getTransaction(txid: string): Promise<Transaction> {
    const tx = await this.rpc.callRpc<any>("getrawtransaction", [txid, true]);
    return {
      txid: tx.txid,
      hash: tx.hash,
      version: tx.version,
      size: tx.size,
      vsize: tx.vsize,
      weight: tx.weight,
      locktime: tx.locktime,
      vin: tx.vin,
      vout: tx.vout,
      hex: tx.hex,
      blockhash: tx.blockhash,
      confirmations: tx.confirmations,
      time: tx.time,
      blocktime: tx.blocktime,
    };
  }

  /**
   * Get mining info
   */
  async getMiningInfo(): Promise<any> {
    return this.rpc.callRpc<any>("getmininginfo");
  }

  /**
   * Get wallet list
   */
  async getWalletList(): Promise<string[]> {
    return this.rpc.callRpc<string[]>("listwallets");
  }

  /**
   * Get UTXO set statistics
   */
  async getUTXOStats(): Promise<any> {
    return this.rpc.callRpc<any>("gettxoutsetinfo");
  }

  /**
   * Get blockchain data for visualization
   * Combines multiple queries for a complete visualization dataset
   */
  async getBlockchainVisualizationData(blockCount: number = 10): Promise<any> {
    const [
      chainInfo,
      networkInfo,
      mempoolInfo,
      recentBlocks,
      mempoolTxs,
      miningInfo,
      utxoStats,
    ] = await Promise.all([
      this.getChainInfo(),
      this.getNetworkInfo(),
      this.getMempoolInfo(),
      this.getRecentBlocks(blockCount),
      this.getMempoolTransactions(),
      this.getMiningInfo(),
      this.getUTXOStats(),
    ]);

    return {
      chainInfo,
      networkInfo,
      mempoolInfo,
      recentBlocks,
      mempoolTxs,
      miningInfo,
      utxoStats,
      timestamp: new Date().getTime(),
    };
  }
}
