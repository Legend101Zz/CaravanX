/**
 * Types for Caravan-X Environment Sharing System
 *
 * A .caravan-env archive packages everything needed to replicate
 * an exact regtest environment between developers:
 * - Blockchain data (blocks + chainstate)
 * - Bitcoin Core wallet files
 * - Caravan wallet configurations
 * - Key data for signing
 * - Shared configuration
 * - Integrity checksums
 */

/**
 * The manifest.json at the root of every .caravan-env archive.
 * This is the first file read during import to validate the archive.
 */
export interface EnvironmentManifest {
  /** Schema version for forward compatibility */
  version: string;

  /** Human-readable name for this environment */
  name: string;

  /** Optional description */
  description?: string;

  /** Who created this environment */
  createdBy?: string;

  /** When this environment was packaged */
  createdAt: string;

  /** Caravan-X version used to create the archive */
  caravanXVersion: string;

  /** Bitcoin Core version the environment was created with */
  bitcoinCoreVersion?: string;

  /** Target Bitcoin network */
  network: "regtest" | "signet" | "testnet";

  /** Blockchain state at time of export */
  blockchainState: {
    blockHeight: number;
    blockHash: string;
    chainWork?: string;
  };

  /** What's included in the archive */
  contents: {
    /** Binary blockchain data (blocks + chainstate dirs) */
    hasBlockchainData: boolean;

    /** Bitcoin Core wallet directories */
    bitcoinWallets: string[];

    /** Caravan multisig wallet configs */
    caravanWallets: string[];

    /** Key data files for signing */
    keyFiles: string[];

    /** Custom scenario scripts */
    scenarios: string[];

    /** Whether a declarative replay script is included */
    hasReplayScript: boolean;
  };

  /** SHA256 checksums for integrity verification */
  checksums: {
    /** Checksum of the entire blockchain data tarball */
    blockchainData?: string;

    /** Per-file checksums for configs and key data */
    files: Record<string, string>;
  };

  /** Mode the environment was created in */
  mode: "docker" | "manual";

  /** RPC configuration (credentials for the environment) */
  rpcConfig: {
    rpcUser: string;
    rpcPassword: string;
    rpcPort: number;
    p2pPort: number;
  };

  /** Docker configuration if created in Docker mode */
  docker?: {
    image: string;
    containerName: string;
    nginxPort?: number;
  };
}

/**
 * Descriptor export for a single Bitcoin Core wallet.
 * Created using `listdescriptors true` for signer wallets
 * and `listdescriptors` for watch-only wallets.
 */
export interface WalletDescriptorExport {
  walletName: string;
  walletType: "signer" | "watch-only" | "regular";
  isDescriptorWallet: boolean;
  hasPrivateKeys: boolean;
  descriptors: {
    desc: string;
    timestamp: number;
    active: boolean;
    internal?: boolean;
    range?: [number, number];
    next?: number;
  }[];
}

/**
 * Complete wallet export — descriptor data plus Caravan config
 */
export interface FullWalletExport {
  /** Bitcoin Core descriptor data */
  descriptorExport: WalletDescriptorExport;

  /** Caravan wallet config if this is part of a multisig setup */
  caravanConfig?: any;

  /** Associated key data */
  keyData?: any;

  /** Signer wallet names that belong to this multisig */
  signerWallets?: string[];

  /** Watch-only wallet name */
  watcherWallet?: string;
}

/**
 * Declarative replay script — describes how to reconstruct
 * the environment from scratch (without binary data).
 * This is the portable alternative to binary snapshots.
 */
export interface ReplayScript {
  version: string;
  name: string;
  description: string;

  /** Steps executed in order to rebuild the environment */
  steps: ReplayStep[];
}

export interface ReplayStep {
  /** Step type */
  type:
    | "create_wallet"
    | "import_descriptors"
    | "generate_blocks"
    | "send_transaction"
    | "create_multisig"
    | "import_caravan_config"
    | "fund_address"
    | "mine_to_address"
    | "wait";

  /** Human-readable description */
  description: string;

  /** Step-specific parameters */
  params: Record<string, any>;
}

/**
 * Options for environment export
 */
export interface EnvironmentExportOptions {
  /** Name for the environment */
  name: string;

  /** Optional description */
  description?: string;

  /** Creator name */
  createdBy?: string;

  /** Include binary blockchain data (recommended, larger file) */
  includeBlockchainData: boolean;

  /** Include wallet private keys in descriptor export */
  includePrivateKeys: boolean;

  /** Generate a declarative replay script */
  generateReplayScript: boolean;

  /** Specific wallets to include (empty = all) */
  walletFilter?: string[];

  /** Output file path */
  outputPath: string;
}

/**
 * Options for environment import
 */
export interface EnvironmentImportOptions {
  /** Path to the .caravan-env archive */
  archivePath: string;

  /** Import method */
  method: "binary" | "replay" | "auto";

  /** Override RPC credentials */
  rpcOverrides?: {
    rpcUser?: string;
    rpcPassword?: string;
    rpcPort?: number;
  };

  /** Skip integrity verification */
  skipVerification?: boolean;

  /** Force import even if environment already exists */
  force?: boolean;
}

/**
 * Result of an environment import operation
 */
export interface EnvironmentImportResult {
  success: boolean;
  method: "binary" | "replay";
  blockHeight: number;
  walletsImported: string[];
  caravanWalletsImported: string[];
  warnings: string[];
  errors: string[];
}
