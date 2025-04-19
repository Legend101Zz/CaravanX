import { BitcoinService } from "../core/bitcoin";
import { CaravanService } from "../core/caravan";
import { TransactionService } from "../core/transaction";
import { BitcoinRpcClient } from "../core/rpc";
import { ConfigManager } from "../core/config";

/**
 * Status of a script execution
 */
export enum ScriptExecutionStatus {
  NOT_STARTED = "not_started",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  ABORTED = "aborted",
}

/**
 * Type of script (format)
 */
export enum ScriptType {
  JAVASCRIPT = "javascript", // JavaScript script using our APIs
  JSON = "json", // Declarative JSON format
}

/**
 * Action type for declarative scripts
 */
export enum ActionType {
  CREATE_WALLET = "create_wallet",
  MINE_BLOCKS = "mine_blocks",
  CREATE_TRANSACTION = "create_transaction",
  REPLACE_TRANSACTION = "replace_transaction",
  SIGN_TRANSACTION = "sign_transaction",
  BROADCAST_TRANSACTION = "broadcast_transaction",
  CREATE_MULTISIG = "create_multisig",
  WAIT = "wait",
  ASSERT = "assert",
  CUSTOM = "custom",
}

/**
 * Script action with parameters
 */
export interface ScriptAction {
  type: ActionType;
  params: Record<string, any>;
  description?: string;
}

/**
 * Declarative script format
 */
export interface DeclarativeScript {
  name: string;
  description: string;
  version: string;
  actions: ScriptAction[];
  variables?: Record<string, any>;
}

/**
 * Script execution options
 */
export interface ScriptExecutionOptions {
  dryRun?: boolean; // Only summarize what would happen, don't execute
  verbose?: boolean; // Log detailed steps
  interactive?: boolean; // Ask for confirmation before each step
  params?: Record<string, any>; // Additional parameters to pass to the script
}

/**
 * Script execution context
 */
export interface ScriptExecutionContext {
  bitcoinService: BitcoinService;
  caravanService: CaravanService;
  transactionService: TransactionService;
  configManager: ConfigManager;
  rpcClient: BitcoinRpcClient;
  variables: Record<string, any>;
  wallets: Record<string, any>;
  transactions: Record<string, any>;
  blocks: string[];
  log: (message: string) => void;
  progress: (step: number, total: number, message: string) => void;
}

/**
 * Script execution result
 */
export interface ScriptExecutionResult {
  status: ScriptExecutionStatus;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  steps: {
    action: string;
    status: "success" | "failed" | "skipped";
    result?: any;
    error?: Error;
  }[];
  outputs: {
    wallets?: string[];
    transactions?: string[];
    blocks?: string[];
  };
  error?: Error;
}
