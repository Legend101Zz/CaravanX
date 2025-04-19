import * as fs from "fs-extra";
import * as path from "path";
import { VM } from "vm2";
import { EventEmitter } from "events";
import chalk from "chalk";
import { BitcoinService } from "../core/bitcoin";
import { CaravanService } from "../core/caravan";
import { TransactionService } from "../core/transaction";
import { ConfigManager } from "../core/config";
import { BitcoinRpcClient } from "../core/rpc";
import {
  formatBitcoin,
  truncate,
  formatSuccess,
  formatWarning,
  formatError,
} from "../utils/terminal";
import {
  ScriptExecutionResult,
  ScriptExecutionStatus,
  ScriptType,
  ActionType,
  ScriptAction,
  DeclarativeScript,
  ScriptExecutionContext,
  ScriptExecutionOptions,
} from "../types/scripting";

/**
 * Class for managing script execution
 */
export class ScriptEngine extends EventEmitter {
  private readonly bitcoinService: BitcoinService;
  private readonly caravanService: CaravanService;
  private readonly transactionService: TransactionService;
  private readonly configManager: ConfigManager;
  private readonly rpcClient: BitcoinRpcClient;
  private templatesDir: string;

  constructor(
    bitcoinService: BitcoinService,
    caravanService: CaravanService,
    transactionService: TransactionService,
    configManager: ConfigManager,
    rpcClient: BitcoinRpcClient,
  ) {
    super();
    this.bitcoinService = bitcoinService;
    this.caravanService = caravanService;
    this.transactionService = transactionService;
    this.configManager = configManager;
    this.rpcClient = rpcClient;

    // Set up templates directory
    this.templatesDir = path.join(
      configManager.getConfig().appDir,
      "script_templates",
    );
    fs.ensureDirSync(this.templatesDir);
  }

  /**
   * Get the template directory path
   */
  getTemplatesDir(): string {
    return this.templatesDir;
  }

  /**
   * Load a script from file
   */
  async loadScript(filePath: string): Promise<string | DeclarativeScript> {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`Script file not found: ${filePath}`);
      }

      // Read the file
      const fileContent = await fs.readFile(filePath, "utf8");

      // Determine the script type based on file extension
      if (filePath.endsWith(".json")) {
        // Parse as JSON
        return JSON.parse(fileContent) as DeclarativeScript;
      } else {
        // Return as JavaScript
        return fileContent;
      }
    } catch (error: any) {
      throw new Error(`Failed to load script: ${error.message}`);
    }
  }
}
