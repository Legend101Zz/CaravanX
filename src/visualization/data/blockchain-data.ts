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
  public readonly rpc: BitcoinRpcClient;
  private cachedTxCount: number = 0;
  private lastBlockHeight: number = 0;
  private cachedUtxoStats: any = null;
  private utxoStatsLastFetched: number = 0;
  private static readonly UTXO_STATS_CACHE_MS = 30000; // Cache UTXO stats for 30s (it's expensive)

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
      tx: block.tx,
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
      try {
        const block = await this.getBlockByHeight(blockCount - i);
        blocks.push(block);
      } catch (error) {
        console.error(
          `Error fetching block at height ${blockCount - i}:`,
          error,
        );
        // Continue to next block instead of failing entirely
      }
    }

    return blocks;
  }

  /**
   * Get a new address from a wallet
   */
  async getNewAddress(wallet: string): Promise<string> {
    try {
      return await this.rpc.callRpc<string>("getnewaddress", [], wallet);
    } catch (error) {
      console.error(`Error getting new address for wallet ${wallet}:`, error);
      throw error;
    }
  }

  /**
   * Get detailed transaction information
   * FIX: Use getrawtransaction first (works for any tx), fall back to wallet gettransaction
   */
  async getTransaction(txid: string): Promise<Transaction> {
    try {
      // Primary: getrawtransaction with verbose=true works for any tx (mempool or confirmed)
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
    } catch (rawError) {
      // Fallback: try wallet-based gettransaction (has fee info etc.)
      try {
        const wallets = await this.rpc.listWallets();
        for (const wallet of wallets) {
          try {
            const tx = await this.rpc.getTransaction(wallet, txid);
            // gettransaction returns different format, need to decode
            if (tx.hex) {
              const decoded = await this.rpc.callRpc<any>(
                "decoderawtransaction",
                [tx.hex],
              );
              return {
                txid: decoded.txid,
                hash: decoded.hash || decoded.txid,
                version: decoded.version,
                size: decoded.size,
                vsize: decoded.vsize,
                weight: decoded.weight,
                locktime: decoded.locktime,
                vin: decoded.vin,
                vout: decoded.vout,
                hex: tx.hex,
                blockhash: tx.blockhash,
                confirmations: tx.confirmations,
                time: tx.time,
                blocktime: tx.blocktime,
              };
            }
            // If no hex, return what we can
            return {
              txid: tx.txid || txid,
              hash: tx.txid || txid,
              version: 0,
              size: 0,
              vsize: 0,
              weight: 0,
              locktime: 0,
              vin: [],
              vout: [],
              hex: "",
              blockhash: tx.blockhash,
              confirmations: tx.confirmations,
              time: tx.time,
              blocktime: tx.blocktime,
            };
          } catch (e) {
            // This wallet doesn't know about this tx, try next
            continue;
          }
        }
      } catch (walletError) {
        // No wallets available
      }

      console.error(`Error getting transaction ${txid}:`, rawError);
      throw rawError;
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
   * Get wallet info for a specific wallet
   */
  async getWalletInfo(wallet: string): Promise<any> {
    try {
      return await this.rpc.callRpc<any>("getwalletinfo", [], wallet);
    } catch (error) {
      console.error(`Error getting wallet info for ${wallet}:`, error);
      return null;
    }
  }

  /**
   * Get balance for a specific wallet
   */
  async getWalletBalance(wallet: string): Promise<number> {
    try {
      const balance = await this.rpc.callRpc<number>("getbalance", [], wallet);
      return balance;
    } catch (error) {
      console.error(`Error getting balance for ${wallet}:`, error);
      return 0;
    }
  }

  /**
   * Get UTXO set statistics - CACHED to avoid repeated expensive calls
   * gettxoutsetinfo is very expensive and can take seconds on large chains
   */
  async getUTXOStats(): Promise<any> {
    const now = Date.now();
    if (
      this.cachedUtxoStats &&
      now - this.utxoStatsLastFetched <
        BlockchainDataService.UTXO_STATS_CACHE_MS
    ) {
      return this.cachedUtxoStats;
    }

    try {
      const stats = await this.rpc.callRpc<any>("gettxoutsetinfo");
      this.cachedUtxoStats = stats;
      this.utxoStatsLastFetched = now;
      return stats;
    } catch (error) {
      console.error("Error getting UTXO stats:", error);
      // Return cached if available, otherwise return empty
      return (
        this.cachedUtxoStats || {
          height: 0,
          bestblock: "",
          transactions: 0,
          txouts: 0,
          total_amount: 0,
        }
      );
    }
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
      this.getUTXOStats(), // Now cached
    ]);

    // FIX: Calculate total tx count properly using block height tracking
    const totalTxCount = this.calculateTotalTxCount(
      recentBlocks,
      chainInfo.blocks,
    );

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
   * FIX: Handle both verbosity=1 (txids as strings) and verbosity=2 (full tx objects)
   */
  private extractMinerInfo(block: Block): string {
    try {
      if (!block.tx || block.tx.length === 0) return "Unknown";

      // Get coinbase transaction (first tx in block)
      const firstTx = block.tx[0];
      let coinbaseTx: any;

      if (typeof firstTx === "string") {
        // verbosity=1: tx[0] is just a txid string, we don't have the full data
        return `Miner-${block.height}`;
      } else {
        // verbosity=2: tx[0] is the full transaction object
        coinbaseTx = firstTx;
      }

      if (!coinbaseTx || !coinbaseTx.vin || coinbaseTx.vin.length === 0)
        return "Unknown";

      // Look for miner data in coinbase
      const coinbaseData = coinbaseTx.vin[0].coinbase;
      if (!coinbaseData) return "Unknown";

      // Convert hex to ASCII and look for recognizable patterns
      const coinbaseAscii = Buffer.from(coinbaseData, "hex")
        .toString("ascii")
        .replace(/[^\x20-\x7E]/g, "");

      // In regtest, just show block height
      return `Miner-${block.height}`;
    } catch (error) {
      console.error("Error extracting miner info:", error);
      return "Unknown";
    }
  }

  /**
   * Calculate estimated block fee from coinbase output vs block subsidy
   */
  private calculateBlockFee(block: Block): number {
    try {
      if (!block.tx || block.tx.length === 0) return 0;

      const firstTx = block.tx[0];
      if (typeof firstTx === "string") return 0;

      // Coinbase output total
      const coinbaseValue =
        firstTx.vout?.reduce(
          (sum: number, out: any) => sum + (out.value || 0),
          0,
        ) || 0;

      // In regtest, subsidy is 50 BTC initially, halving every 150 blocks
      const halvings = Math.floor(block.height / 150);
      const subsidy = 50 / Math.pow(2, halvings);

      // Fee = coinbase output - subsidy
      const fee = coinbaseValue - subsidy;
      return fee > 0 ? fee : 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Calculate mempool fees
   */
  private calculateMempoolFees(mempoolInfo: MempoolInfo): number {
    return (mempoolInfo.bytes * mempoolInfo.mempoolMinFee) / 100000000;
  }

  /**
   * Calculate total transaction count
   * FIX: Use block height and average txs per block for estimation,
   * don't accumulate infinitely
   */
  private calculateTotalTxCount(
    blocks: Block[],
    totalBlockCount: number,
  ): number {
    try {
      if (blocks.length === 0) return this.cachedTxCount;

      // Count transactions in the recent blocks we have
      const recentTxCount = blocks.reduce(
        (sum, block) => sum + (block.tx?.length || 0),
        0,
      );

      // Average txs per block from our sample
      const avgTxPerBlock = recentTxCount / blocks.length;

      // Estimate total based on full chain height
      const estimated = Math.round(avgTxPerBlock * totalBlockCount);

      this.cachedTxCount = estimated;
      return estimated;
    } catch (error) {
      console.error("Error calculating total tx count:", error);
      return this.cachedTxCount;
    }
  }

  /**
   * Mine blocks - implementation for the real-time visualization
   */
  async mineBlocks(numBlocks: number, address?: string): Promise<string[]> {
    try {
      if (!address) {
        const wallets = await this.rpc.listWallets();
        if (wallets.length === 0) {
          throw new Error("No wallets available for mining");
        }
        address = await this.rpc.callRpc<string>(
          "getnewaddress",
          [],
          wallets[0],
        );
      }
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
   */
  async checkForNewBlocks(): Promise<Block | null> {
    try {
      const currentHeight = await this.getBlockCount();
      if (currentHeight > this.lastBlockHeight) {
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
   */
  async checkForNewMempoolTransactions(
    previousTxids: string[],
  ): Promise<string[]> {
    try {
      const currentTxids = await this.getMempoolTransactions();
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
