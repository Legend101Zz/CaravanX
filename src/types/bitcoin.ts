/**
 * Unspent Transaction Output
 */
export interface UTXO {
  txid: string;
  vout: number;
  address?: string;
  label?: string;
  scriptPubKey?: string;
  amount: number;
  confirmations: number;
  spendable: boolean;
  solvable: boolean;
  desc?: string;
  safe: boolean;
}

/**
 * Transaction input
 */
export interface TransactionInput {
  txid: string;
  vout: number;
  scriptSig?: {
    asm: string;
    hex: string;
  };
  txinwitness?: string[];
  sequence: number;
}

/**
 * Transaction output
 */
export interface TransactionOutput {
  value: number;
  n: number;
  scriptPubKey: {
    asm: string;
    hex: string;
    reqSigs?: number;
    type: string;
    addresses?: string[];
    address?: string;
  };
}

/**
 * Full transaction
 */
export interface Transaction {
  txid: string;
  hash: string;
  version: number;
  size: number;
  vsize: number;
  weight: number;
  locktime: number;
  vin: TransactionInput[];
  vout: TransactionOutput[];
  hex: string;
  blockhash?: string;
  confirmations?: number;
  time?: number;
  blocktime?: number;
}

/**
 * PSBT-related types
 */
export interface PSBTOutput {
  address: string;
  amount: number;
}

export interface PSBTResult {
  psbt: string;
  fee: number;
  changepos: number;
}

export interface FinalizedPSBT {
  hex: string;
  psbt: string;
  complete: boolean;
}
