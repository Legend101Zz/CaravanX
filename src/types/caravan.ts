/**
 * Extended public key information
 */
export interface ExtendedPublicKey {
  name: string;
  xpub: string;
  bip32Path: string;
  method?: string;
  xfp?: string;
}

/**
 * Caravan wallet configuration structure
 */
export interface CaravanWalletConfig {
  name: string;
  addressType: string;
  network: string;
  quorum: {
    requiredSigners: number;
    totalSigners: number;
  };
  extendedPublicKeys: ExtendedPublicKey[];
  startingAddressIndex?: number;
  uuid?: string;
  client?: {
    type: string;
    url?: string;
    username?: string;
    password?: string;
    walletName?: string;
  };
  ledgerPolicyHmacs?: string[];
}

/**
 * Private key data for a Caravan wallet
 */
export interface CaravanKeyData {
  caravanName: string;
  caravanFile: string;
  configHash: string;
  lastUpdated: string;
  keyData: Array<{
    xpub: string;
    wallet?: string;
    privateKey?: string;
    keyIsEncrypted?: boolean;
    manuallyEntered?: boolean;
    extractedFromAddress?: string;
  }>;
}

/**
 * Address types supported by Caravan
 */
export enum AddressType {
  P2SH = "P2SH",
  P2WSH = "P2WSH",
  P2SH_P2WSH = "P2SH-P2WSH",
}

/**
 * Bitcoin networks
 */
export enum Network {
  MAINNET = "mainnet",
  TESTNET = "testnet",
  REGTEST = "regtest",
  SIGNET = "signet",
}
