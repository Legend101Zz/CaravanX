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
