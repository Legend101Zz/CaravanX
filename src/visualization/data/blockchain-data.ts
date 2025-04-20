import { BitcoinRpcClient } from "../../core/rpc";
import {
  Block,
  Transaction,
  MempoolInfo,
  NetworkInfo,
  ChainInfo,
  BlockchainVisualizationResponse,
} from "../types/types";

/**
 * Service for fetching blockchain data for visualization
 */
export class BlockchainDataService {
  private readonly rpc: BitcoinRpcClient;
  private cachedTxCount: number = 0;
  private lastBlockHeight: number = 0;

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
    try {
      // First try to get from wallet (which has more info)
      const wallets = await this.rpc.listWallets();

      if (wallets.length > 0) {
        try {
          const tx = await this.rpc.getTransaction(wallets[0], txid);
          return {
            txid: tx.txid,
            hash: tx.hash || tx.txid,
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
        } catch (e) {
          // Continue to try with getrawtransaction if wallet doesn't have this tx
        }
      }

      // Fallback to getrawtransaction
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
    } catch (error) {
      console.error(`Error getting transaction ${txid}:`, error);
      throw error;
    }
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
  async getBlockchainVisualizationData(
    blockCount: number = 10,
  ): Promise<BlockchainVisualizationResponse> {
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

    // Calculate total transaction count
    const totalTxCount = this.calculateTotalTxCount(
      recentBlocks,
      this.cachedTxCount,
    );

    // Store for next time
    this.cachedTxCount = totalTxCount;

    // Create blockchain visualization response with enhanced data
    return {
      chain: chainInfo.chain,
      blocks: recentBlocks.map((block) => ({
        hash: block.hash,
        height: block.height,
        time: block.time,
        txCount: block.tx?.length || 0,
        size: block.size,
        weight: block.weight,
        confirmations: block.confirmations,
        difficulty: block.difficulty,
        miner: this.extractMinerInfo(block),
        fee: this.calculateBlockFee(block),
      })),
      mempool: {
        txCount: mempoolTxs.length,
        txids: mempoolTxs,
        size: mempoolInfo.bytes,
        fees: this.calculateMempoolFees(mempoolInfo),
      },
      stats: {
        difficulty: chainInfo.difficulty,
        blockCount: chainInfo.blocks,
        mempoolSize: mempoolInfo.size,
        connections: networkInfo.connections,
        totalTxCount: totalTxCount,
      },
      chainInfo,
      networkInfo,
      mempoolInfo,
      miningInfo,
      utxoStats,
      timestamp: new Date().getTime(),
    };
  }

  /**
   * Extract miner information from coinbase transaction
   */
  private extractMinerInfo(block: Block): string {
    try {
      if (!block.tx || block.tx.length === 0) return "Unknown";

      // Get coinbase transaction (first tx in block)
      const coinbaseTx =
        typeof block.tx[0] === "string"
          ? null // Need to fetch transaction if only have txid
          : block.tx[0];

      if (!coinbaseTx || !coinbaseTx.vin || coinbaseTx.vin.length === 0)
        return "Unknown";

      // Look for miner data in coinbase
      const coinbaseData = coinbaseTx.vin[0].coinbase;
      if (!coinbaseData) return "Unknown";

      // Convert hex to ASCII and look for recognizable patterns
      const coinbaseAscii = Buffer.from(coinbaseData, "hex")
        .toString("ascii")
        .replace(/[^\x20-\x7E]/g, ""); // Remove non-printable chars

      // Look for common miner strings
      if (coinbaseAscii.includes("Bitmain")) return "Bitmain";
      if (coinbaseAscii.includes("AntPool")) return "AntPool";
      if (coinbaseAscii.includes("F2Pool")) return "F2Pool";
      if (coinbaseAscii.includes("ViaBTC")) return "ViaBTC";
      if (coinbaseAscii.includes("SlushPool")) return "SlushPool";

      // If nothing found, use a generic name with block height
      return `Miner-${block.height}`;
    } catch (error) {
      console.error("Error extracting miner info:", error);
      return "Unknown";
    }
  }

  /**
   * Calculate estimated block fee
   */
  private calculateBlockFee(block: Block): number {
    try {
      // Simple estimation based on block reward for regtest
      // In a full implementation, you would calculate this from the transactions
      return 0; // Placeholder
    } catch (error) {
      console.error("Error calculating block fee:", error);
      return 0;
    }
  }

  /**
   * Calculate mempool fees
   */
  private calculateMempoolFees(mempoolInfo: MempoolInfo): number {
    // Simple estimate based on size and minimum fee rate
    return (mempoolInfo.bytes * mempoolInfo.mempoolMinFee) / 100000000;
  }

  /**
   * Calculate total transaction count (approximate)
   */
  private calculateTotalTxCount(blocks: Block[], cachedCount: number): number {
    try {
      // Count transactions in provided blocks
      const txCount = blocks.reduce(
        (sum, block) => sum + (block.tx?.length || 0),
        0,
      );

      // If we already have a cached count, use it as a base
      if (cachedCount > 0) {
        return cachedCount + txCount;
      }

      // Otherwise, estimate based on average transactions per block
      const avgTxPerBlock = txCount / blocks.length;
      return Math.round(avgTxPerBlock * blocks[0].height);
    } catch (error) {
      console.error("Error calculating total tx count:", error);
      return cachedCount;
    }
  }

  /**
   * Mine blocks - implementation for the real-time visualization
   */
  async mineBlocks(numBlocks: number, address?: string): Promise<string[]> {
    try {
      // Get an address if none provided
      if (!address) {
        const wallets = await this.rpc.listWallets();
        if (wallets.length === 0) {
          throw new Error("No wallets available for mining");
        }

        // Use the first wallet to generate an address
        address = await this.rpc.callRpc<string>(
          "getnewaddress",
          [],
          wallets[0],
        );
      }

      // Generate blocks
      const blockHashes = await this.rpc.generateToAddress(numBlocks, address);

      return blockHashes;
    } catch (error) {
      console.error("Error mining blocks:", error);
      throw error;
    }
  }

  /**
   * Create transaction - implementation for the real-time visualization
   */
  async createTransaction(
    fromWallet: string,
    toAddress: string,
    amount: number,
  ): Promise<any> {
    try {
      // Send to address
      const txid = await this.rpc.callRpc<string>(
        "sendtoaddress",
        [toAddress, amount],
        fromWallet,
      );

      return { txid, success: true };
    } catch (error) {
      console.error("Error creating transaction:", error);
      throw error;
    }
  }

  /**
   * Check for new blocks since last check
   * Returns the new block if one was found
   */
  async checkForNewBlocks(): Promise<Block | null> {
    try {
      const currentHeight = await this.getBlockCount();

      if (currentHeight > this.lastBlockHeight) {
        // New block found
        const newBlock = await this.getBlockByHeight(currentHeight);
        this.lastBlockHeight = currentHeight;
        return newBlock;
      }

      return null;
    } catch (error) {
      console.error("Error checking for new blocks:", error);
      return null;
    }
  }

  /**
   * Check for new mempool transactions
   * Returns an array of new transaction IDs
   */
  async checkForNewMempoolTransactions(
    previousTxids: string[],
  ): Promise<string[]> {
    try {
      const currentTxids = await this.getMempoolTransactions();

      // Find transactions in current mempool that weren't in previous mempool
      const newTxids = currentTxids.filter(
        (txid) => !previousTxids.includes(txid),
      );

      return newTxids;
    } catch (error) {
      console.error("Error checking for new mempool transactions:", error);
      return [];
    }
  }
}
