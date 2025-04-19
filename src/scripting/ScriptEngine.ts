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

  /**
   * Validate a script
   */
  validateScript(script: string | DeclarativeScript): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    try {
      if (typeof script === "string") {
        // Validate JavaScript script
        try {
          // Basic syntax validation
          new Function(script);
        } catch (e: any) {
          errors.push(`Syntax error: ${e.message}`);
        }
      } else {
        // Validate declarative script (JSON format)
        if (!script.name) {
          errors.push("Script name is required");
        }

        if (!script.description) {
          errors.push("Script description is recommended");
        }

        if (!script.version) {
          errors.push("Script version is recommended");
        }

        if (
          !script.actions ||
          !Array.isArray(script.actions) ||
          script.actions.length === 0
        ) {
          errors.push("Script must have at least one action");
        } else {
          // Validate each action
          script.actions.forEach((action, index) => {
            if (!action.type) {
              errors.push(`Action #${index + 1} is missing a type`);
            } else if (
              !Object.values(ActionType).includes(action.type as ActionType)
            ) {
              errors.push(
                `Action #${index + 1} has invalid type: ${action.type}`,
              );
            }

            if (!action.params || typeof action.params !== "object") {
              errors.push(`Action #${index + 1} is missing parameters`);
            } else {
              // Validate parameters based on action type
              switch (action.type) {
                case ActionType.CREATE_WALLET:
                  if (!action.params.name) {
                    errors.push(
                      `Action #${index + 1}: CREATE_WALLET requires a name parameter`,
                    );
                  }

                  if (
                    action.params.options &&
                    typeof action.params.options !== "object"
                  ) {
                    errors.push(
                      `Action #${index + 1}: CREATE_WALLET options parameter must be an object`,
                    );
                  }
                  break;

                case ActionType.MINE_BLOCKS:
                  if (
                    typeof action.params.count !== "number" ||
                    action.params.count <= 0
                  ) {
                    errors.push(
                      `Action #${index + 1}: MINE_BLOCKS requires a positive count parameter`,
                    );
                  }

                  if (!action.params.toWallet && !action.params.toAddress) {
                    errors.push(
                      `Action #${index + 1}: MINE_BLOCKS requires either toWallet or toAddress parameter`,
                    );
                  }
                  break;

                case ActionType.CREATE_TRANSACTION:
                  if (!action.params.fromWallet) {
                    errors.push(
                      `Action #${index + 1}: CREATE_TRANSACTION requires a fromWallet parameter`,
                    );
                  }

                  if (
                    !action.params.outputs ||
                    !Array.isArray(action.params.outputs) ||
                    action.params.outputs.length === 0
                  ) {
                    errors.push(
                      `Action #${index + 1}: CREATE_TRANSACTION requires outputs parameter as an array`,
                    );
                  } else {
                    // Validate each output has an address and amount
                    action.params.outputs.forEach((output, outputIndex) => {
                      if (
                        typeof output !== "object" ||
                        Object.keys(output).length !== 1
                      ) {
                        errors.push(
                          `Action #${index + 1}: Output #${outputIndex + 1} must be an object with a single key-value pair`,
                        );
                      } else {
                        const address = Object.keys(output)[0];
                        const amount = output[address];

                        if (!address || address.trim().length === 0) {
                          errors.push(
                            `Action #${index + 1}: Output #${outputIndex + 1} is missing an address`,
                          );
                        }

                        if (typeof amount !== "number" || amount <= 0) {
                          errors.push(
                            `Action #${index + 1}: Output #${outputIndex + 1} requires a positive amount`,
                          );
                        }
                      }
                    });
                  }

                  if (
                    action.params.feeRate !== undefined &&
                    (typeof action.params.feeRate !== "number" ||
                      action.params.feeRate < 0)
                  ) {
                    errors.push(
                      `Action #${index + 1}: CREATE_TRANSACTION feeRate must be a non-negative number`,
                    );
                  }
                  break;

                case ActionType.REPLACE_TRANSACTION:
                  if (!action.params.txid) {
                    errors.push(
                      `Action #${index + 1}: REPLACE_TRANSACTION requires a txid parameter`,
                    );
                  }

                  if (
                    action.params.newFeeRate !== undefined &&
                    (typeof action.params.newFeeRate !== "number" ||
                      action.params.newFeeRate <= 0)
                  ) {
                    errors.push(
                      `Action #${index + 1}: REPLACE_TRANSACTION newFeeRate must be a positive number`,
                    );
                  }

                  if (
                    action.params.newOutputs &&
                    (!Array.isArray(action.params.newOutputs) ||
                      action.params.newOutputs.length === 0)
                  ) {
                    errors.push(
                      `Action #${index + 1}: REPLACE_TRANSACTION newOutputs must be a non-empty array`,
                    );
                  }
                  break;

                case ActionType.SIGN_TRANSACTION:
                  if (!action.params.txid) {
                    errors.push(
                      `Action #${index + 1}: SIGN_TRANSACTION requires a txid parameter`,
                    );
                  }

                  if (!action.params.wallet && !action.params.privateKey) {
                    errors.push(
                      `Action #${index + 1}: SIGN_TRANSACTION requires either wallet or privateKey parameter`,
                    );
                  }
                  break;

                case ActionType.BROADCAST_TRANSACTION:
                  if (!action.params.txid && !action.params.psbt) {
                    errors.push(
                      `Action #${index + 1}: BROADCAST_TRANSACTION requires either txid or psbt parameter`,
                    );
                  }
                  break;

                case ActionType.CREATE_MULTISIG:
                  if (!action.params.name) {
                    errors.push(
                      `Action #${index + 1}: CREATE_MULTISIG requires a name parameter`,
                    );
                  }

                  if (
                    typeof action.params.requiredSigners !== "number" ||
                    action.params.requiredSigners <= 0
                  ) {
                    errors.push(
                      `Action #${index + 1}: CREATE_MULTISIG requires a positive requiredSigners parameter`,
                    );
                  }

                  if (
                    typeof action.params.totalSigners !== "number" ||
                    action.params.totalSigners <= 0
                  ) {
                    errors.push(
                      `Action #${index + 1}: CREATE_MULTISIG requires a positive totalSigners parameter`,
                    );
                  }

                  if (
                    action.params.requiredSigners > action.params.totalSigners
                  ) {
                    errors.push(
                      `Action #${index + 1}: CREATE_MULTISIG requiredSigners cannot be greater than totalSigners`,
                    );
                  }

                  if (!action.params.addressType) {
                    errors.push(
                      `Action #${index + 1}: CREATE_MULTISIG requires an addressType parameter`,
                    );
                  } else if (
                    !["P2SH", "P2WSH", "P2SH-P2WSH"].includes(
                      action.params.addressType,
                    )
                  ) {
                    errors.push(
                      `Action #${index + 1}: CREATE_MULTISIG addressType must be one of: P2SH, P2WSH, P2SH-P2WSH`,
                    );
                  }
                  break;

                case ActionType.WAIT:
                  if (
                    typeof action.params.seconds !== "number" ||
                    action.params.seconds <= 0
                  ) {
                    errors.push(
                      `Action #${index + 1}: WAIT requires a positive seconds parameter`,
                    );
                  }
                  break;

                case ActionType.ASSERT:
                  if (!action.params.condition) {
                    errors.push(
                      `Action #${index + 1}: ASSERT requires a condition parameter`,
                    );
                  }

                  if (
                    typeof action.params.condition !== "string" &&
                    typeof action.params.condition !== "boolean"
                  ) {
                    errors.push(
                      `Action #${index + 1}: ASSERT condition must be a string or boolean`,
                    );
                  }

                  if (!action.params.message) {
                    errors.push(
                      `Action #${index + 1}: ASSERT requires a message parameter`,
                    );
                  }
                  break;

                case ActionType.CUSTOM:
                  if (
                    !action.params.code ||
                    typeof action.params.code !== "string"
                  ) {
                    errors.push(
                      `Action #${index + 1}: CUSTOM requires a code parameter as a string`,
                    );
                  }

                  try {
                    // Basic validation of the code
                    new Function("context", action.params.code);
                  } catch (e: any) {
                    errors.push(
                      `Action #${index + 1}: CUSTOM code has syntax error: ${e.message}`,
                    );
                  }
                  break;

                default:
                  errors.push(
                    `Action #${index + 1}: Unknown action type ${action.type}`,
                  );
              }

              // Validate the variableName parameter if present
              if (
                action.params.variableName !== undefined &&
                typeof action.params.variableName !== "string"
              ) {
                errors.push(
                  `Action #${index + 1}: variableName must be a string`,
                );
              }
            }
          });
        }

        // Validate variable references
        if (script.variables && script.actions) {
          this.validateVariableReferences(script, errors);
        }
      }
    } catch (error: any) {
      errors.push(`Validation error: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate that variable references are valid
   */
  private validateVariableReferences(
    script: DeclarativeScript,
    errors: string[],
  ): void {
    const variables = new Set<string>(Object.keys(script.variables || {}));

    // Track variables created by actions
    let actionIndex = 0;
    for (const action of script.actions) {
      actionIndex++;

      if (action.params && typeof action.params === "object") {
        // Add any variables created by this action
        if (
          action.params.variableName &&
          typeof action.params.variableName === "string"
        ) {
          variables.add(action.params.variableName);
        }

        // Check variable references in parameters
        for (const [paramName, paramValue] of Object.entries(action.params)) {
          if (typeof paramValue === "string") {
            this.checkVariableReferencesInString(
              paramValue,
              variables,
              actionIndex,
              errors,
            );
          } else if (Array.isArray(paramValue)) {
            for (const item of paramValue) {
              if (typeof item === "string") {
                this.checkVariableReferencesInString(
                  item,
                  variables,
                  actionIndex,
                  errors,
                );
              } else if (typeof item === "object" && item !== null) {
                this.checkVariableReferencesInObject(
                  item,
                  variables,
                  actionIndex,
                  errors,
                );
              }
            }
          } else if (typeof paramValue === "object" && paramValue !== null) {
            this.checkVariableReferencesInObject(
              paramValue,
              variables,
              actionIndex,
              errors,
            );
          }
        }
      }
    }
  }

  /**
   * Check for variable references in a string
   */
  private checkVariableReferencesInString(
    str: string,
    variables: Set<string>,
    actionIndex: number,
    errors: string[],
  ): void {
    const matches = str.match(/\${([^}]+)}/g) || [];

    for (const match of matches) {
      const varName = match.substring(2, match.length - 1);
      if (!variables.has(varName)) {
        errors.push(
          `Action #${actionIndex}: Reference to undefined variable "${varName}"`,
        );
      }
    }
  }

  /**
   * Check for variable references in an object
   */
  private checkVariableReferencesInObject(
    obj: object,
    variables: Set<string>,
    actionIndex: number,
    errors: string[],
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string") {
        this.checkVariableReferencesInString(
          value,
          variables,
          actionIndex,
          errors,
        );
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "string") {
            this.checkVariableReferencesInString(
              item,
              variables,
              actionIndex,
              errors,
            );
          } else if (typeof item === "object" && item !== null) {
            this.checkVariableReferencesInObject(
              item,
              variables,
              actionIndex,
              errors,
            );
          }
        }
      } else if (typeof value === "object" && value !== null) {
        this.checkVariableReferencesInObject(
          value,
          variables,
          actionIndex,
          errors,
        );
      }
    }
  }
}
