/**
 * Block information
 */
export interface Block {
  hash: string;
  confirmations: number;
  size: number;
  strippedSize: number;
  weight: number;
  height: number;
  version: number;
  versionHex: string;
  merkleRoot: string;
  tx: any[]; // Can be transaction IDs or full transaction objects
  time: number;
  medianTime: number;
  nonce: number;
  bits: string;
  difficulty: number;
  chainwork: string;
  previousBlockHash?: string;
  nextBlockHash?: string;
}

/**
 * Transaction information
 */
export interface Transaction {
  txid: string;
  hash: string;
  version: number;
  size: number;
  vsize: number;
  weight: number;
  locktime: number;
  vin: any[];
  vout: any[];
  hex: string;
  blockhash?: string;
  confirmations?: number;
  time?: number;
  blocktime?: number;
}

/**
 * Mempool information
 */
export interface MempoolInfo {
  loaded: boolean;
  size: number;
  bytes: number;
  usage: number;
  maxMempool: number;
  mempoolMinFee: number;
  minRelaytxFee: number;
  unbroadcastCount: number;
}

/**
 * Network information
 */
export interface NetworkInfo {
  version: number;
  subversion: string;
  protocolVersion: number;
  connections: number;
  connectionsIn: number;
  connectionsOut: number;
  localServices: string;
  networkActive: boolean;
  warnings: string;
}

/**
 * Chain information
 */
export interface ChainInfo {
  chain: string;
  blocks: number;
  headers: number;
  bestBlockHash: string;
  difficulty: number;
  medianTime: number;
  verificationProgress: number;
  initialBlockDownload: boolean;
  pruned: boolean;
  sizeOnDisk: number;
}

/**
 * Block visualization data (simplified for UI)
 */
export interface BlockVisualizationData {
  hash: string;
  height: number;
  time: number;
  txCount: number;
  size: number;
  weight: number;
  confirmations: number;
  difficulty: number;
  miner?: string;
  fee?: number;
}

/**
 * Transaction visualization data (simplified for UI)
 */
export interface TransactionVisualizationData {
  txid: string;
  size: number;
  weight: number;
  fee?: number;
  feeRate?: number;
  confirmations: number;
  inputCount: number;
  outputCount: number;
  inputValue?: number;
  outputValue?: number;
  blockHeight?: number;
  blockTime?: number;
  isMempool: boolean;
}

/**
 * Blockchain visualization response
 */
export interface BlockchainVisualizationResponse {
  chain: string;
  blocks: BlockVisualizationData[];
  mempool: {
    txCount: number;
    txids: string[];
    size: number;
    fees: number;
  };
  stats: {
    difficulty: number;
    blockCount: number;
    mempoolSize: number;
    connections: number;
  };
  timestamp: number;
}
