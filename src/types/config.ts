/**
 * Configuration for Bitcoin RPC connection
 */
export interface BitcoinRpcConfig {
  protocol: string;
  host: string;
  port: number;
  user: string;
  pass: string;
  dataDir: string;
}

/**
 * Main application configuration
 */
export interface AppConfig {
  bitcoin: BitcoinRpcConfig;
  appDir: string;
  caravanDir: string;
  keysDir: string;
}

/**
 * Default application configuration
 */
export const DEFAULT_CONFIG: AppConfig = {
  bitcoin: {
    protocol: "http",
    host: "127.0.0.1",
    port: 18443, // Default regtest port
    user: "user",
    pass: "pass",
    dataDir: process.env.HOME + "/.bitcoin",
  },
  appDir: process.env.HOME + "/.caravan-regtest",
  caravanDir: process.env.HOME + "/.caravan-regtest/wallets",
  keysDir: process.env.HOME + "/.caravan-regtest/keys",
};

/**
 * Other configuration types for Caravan-X
 * Supports Docker mode, Manual mode, snapshots, and shared configs
 */

/**
 * Setup mode for Caravan-X
 */
export enum SetupMode {
  DOCKER = "docker",
  MANUAL = "manual",
}

/**
 * Pre-configured test scenario
 */
export interface TestScenario {
  id: string;
  name: string;
  description: string;
  blockHeight: number;
  wallets: ScenarioWallet[];
  transactions: ScenarioTransaction[];
}

/**
 * Wallet configuration for a test scenario
 */
export interface ScenarioWallet {
  name: string;
  type: "singlesig" | "multisig";
  addressType?: string;
  balance?: number;
  utxos?: {
    txid: string;
    vout: number;
    amount: number;
    confirmations: number;
  }[];
  // For multisig
  quorum?: {
    requiredSigners: number;
    totalSigners: number;
  };
  extendedPublicKeys?: any[];
}

/**
 * Transaction configuration for a test scenario
 */
export interface ScenarioTransaction {
  from: string;
  to: string;
  amount: number;
  confirmed: boolean;
  rbf?: boolean;
  cpfp?: boolean;
  feeRate?: number;
}

/**
 * Blockchain snapshot configuration
 */
export interface BlockchainSnapshot {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  blockHeight: number;
  blockHash: string;
  wallets: string[];
  filePath: string;
  metadata?: {
    tags?: string[];
    scenario?: string;
  };
}

/**
 * Docker configuration
 */
export interface DockerConfig {
  enabled: boolean;
  image: string;
  containerName: string;
  ports: {
    rpc: number;
    p2p: number;
    nginx?: number;
  };
  volumes: {
    bitcoinData: string;
    coordinator: string;
  };
  network: string;
  autoStart: boolean;
}

/**
 * Shared configuration that can be versioned and shared
 */
export interface SharedConfig {
  version: string;
  name: string;
  description?: string;
  mode: SetupMode;

  // Bitcoin node configuration
  bitcoin: {
    network: "regtest" | "signet" | "testnet";
    rpcPort: number;
    p2pPort: number;
    rpcUser: string;
    rpcPassword: string;
  };

  // Docker-specific settings
  docker?: DockerConfig;

  // Initial blockchain state
  initialState: {
    blockHeight: number;
    preGenerateBlocks: boolean;
    wallets: ScenarioWallet[];
    transactions: ScenarioTransaction[];
  };

  // Coordinator settings
  coordinator?: {
    enabled: boolean;
    port: number;
    autoStart: boolean;
  };

  // Nginx proxy settings
  nginx?: {
    enabled: boolean;
    port: number;
    proxyRpc: boolean;
    proxyCoordinator: boolean;
  };

  // Snapshot settings
  snapshots?: {
    enabled: boolean;
    autoSnapshot: boolean;
    snapshotInterval?: number;
  };

  // Test scenarios to include
  scenarios?: string[];

  // Watch-only wallet name
  walletName?: string; //
}
/**
 * Extended app configuration
 */
export interface EnhancedAppConfig {
  // Existing config
  bitcoin: {
    protocol: string;
    host: string;
    port: number;
    user: string;
    pass: string;
    dataDir: string;
  };
  appDir: string;
  caravanDir: string;
  keysDir: string;

  // New fields
  mode: SetupMode;
  sharedConfig?: SharedConfig;

  // Docker configuration
  docker?: DockerConfig;

  // Snapshot configuration
  snapshots: {
    enabled: boolean;
    directory: string;
    autoSnapshot: boolean;
  };

  // Scenarios directory
  scenariosDir: string;

  // Active scenario (if any)
  activeScenario?: string;
}

/**
 * Default Docker configuration
 */
export const DEFAULT_DOCKER_CONFIG: DockerConfig = {
  enabled: false,
  image: "bitcoin/bitcoin:27.0",
  containerName: "caravan-x-bitcoin",
  ports: {
    rpc: 18443,
    p2p: 18444,
    nginx: 8080,
  },
  volumes: {
    bitcoinData: "/var/lib/caravan-x/bitcoin",
    coordinator: "/var/lib/caravan-x/coordinator",
  },
  network: "caravan-x-network",
  autoStart: true,
};

/**
 * Pre-configured test scenarios
 */
export const BUILT_IN_SCENARIOS: { [key: string]: TestScenario } = {
  "basic-rbf": {
    id: "basic-rbf",
    name: "Basic RBF (Replace-By-Fee)",
    description:
      "A simple RBF scenario with an unconfirmed transaction that can be replaced",
    blockHeight: 101,
    wallets: [
      {
        name: "alice",
        type: "singlesig",
        balance: 50,
      },
      {
        name: "bob",
        type: "singlesig",
        balance: 0,
      },
    ],
    transactions: [
      {
        from: "alice",
        to: "bob",
        amount: 1,
        confirmed: false,
        rbf: true,
        feeRate: 1,
      },
    ],
  },
  "cpfp-chain": {
    id: "cpfp-chain",
    name: "CPFP (Child-Pays-For-Parent)",
    description:
      "A parent transaction with low fee and a child transaction that bumps the fee",
    blockHeight: 101,
    wallets: [
      {
        name: "alice",
        type: "singlesig",
        balance: 50,
      },
      {
        name: "bob",
        type: "singlesig",
        balance: 0,
      },
    ],
    transactions: [
      {
        from: "alice",
        to: "bob",
        amount: 5,
        confirmed: false,
        feeRate: 1,
      },
      {
        from: "bob",
        to: "alice",
        amount: 1,
        confirmed: false,
        cpfp: true,
        feeRate: 10,
      },
    ],
  },
  "multisig-2-of-3": {
    id: "multisig-2-of-3",
    name: "Multisig 2-of-3 Setup",
    description: "A 2-of-3 multisig wallet with initial funding",
    blockHeight: 101,
    wallets: [
      {
        name: "funder",
        type: "singlesig",
        balance: 100,
      },
      {
        name: "multisig_2of3",
        type: "multisig",
        balance: 10,
        quorum: {
          requiredSigners: 2,
          totalSigners: 3,
        },
      },
    ],
    transactions: [
      {
        from: "funder",
        to: "multisig_2of3",
        amount: 10,
        confirmed: true,
      },
    ],
  },
  "timelock-test": {
    id: "timelock-test",
    name: "Timelock Transactions",
    description: "Transactions with various timelocks (absolute and relative)",
    blockHeight: 101,
    wallets: [
      {
        name: "alice",
        type: "singlesig",
        balance: 50,
      },
      {
        name: "bob",
        type: "singlesig",
        balance: 50,
      },
    ],
    transactions: [
      {
        from: "alice",
        to: "bob",
        amount: 5,
        confirmed: true,
      },
    ],
  },
  "address-types": {
    id: "address-types",
    name: "Different Address Types",
    description:
      "Wallets with different address types (P2PKH, P2WPKH, P2WSH, P2TR)",
    blockHeight: 101,
    wallets: [
      {
        name: "legacy_wallet",
        type: "singlesig",
        addressType: "legacy",
        balance: 25,
      },
      {
        name: "segwit_wallet",
        type: "singlesig",
        addressType: "p2sh-segwit",
        balance: 25,
      },
      {
        name: "native_segwit_wallet",
        type: "singlesig",
        addressType: "bech32",
        balance: 25,
      },
      {
        name: "taproot_wallet",
        type: "singlesig",
        addressType: "bech32m",
        balance: 25,
      },
    ],
    transactions: [],
  },
};
