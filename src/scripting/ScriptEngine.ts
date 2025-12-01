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
import { MultisigCommands } from "../commands/multisig";
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
  private readonly multisigCommands: MultisigCommands;
  private templatesDir: string;

  constructor(
    bitcoinService: BitcoinService,
    caravanService: CaravanService,
    transactionService: TransactionService,
    configManager: ConfigManager,
    rpcClient: BitcoinRpcClient,
    multisigCommands: MultisigCommands,
  ) {
    super();
    this.bitcoinService = bitcoinService;
    this.caravanService = caravanService;
    this.transactionService = transactionService;
    this.configManager = configManager;
    this.rpcClient = rpcClient;
    this.multisigCommands = multisigCommands;

    // Set up templates directory
    this.templatesDir = path.join(__dirname, "templates");

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
  /**
   * Generate a summary of what a script will do
   */
  generateScriptSummary(script: string | DeclarativeScript): string {
    try {
      let summary = "";

      if (typeof script === "string") {
        // JavaScript script
        // Extract comments as a basic summary
        const comments = script.match(/\/\*\*([\s\S]*?)\*\//g) || [];
        const descriptionComment = comments.find((c) =>
          c.includes("@description"),
        );

        summary += chalk.bold.cyan("JavaScript Script Summary\n");

        if (descriptionComment) {
          const description = descriptionComment
            .replace(/\/\*\*|\*\/|\*/g, "")
            .trim();
          summary += `${description}\n\n`;
        }

        // Extract name and version
        const nameComment = comments.find((c) => c.includes("@name"));
        const versionComment = comments.find((c) => c.includes("@version"));

        if (nameComment) {
          const name = nameComment.match(/@name\s+(.*?)(\r?\n|$)/)?.[1]?.trim();
          if (name) summary += `Name: ${name}\n`;
        }

        if (versionComment) {
          const version = versionComment
            .match(/@version\s+(.*?)(\r?\n|$)/)?.[1]
            ?.trim();
          if (version) summary += `Version: ${version}\n\n`;
        }

        // Count certain API calls to give a rough idea of what the script does
        const createWalletCount = (script.match(/createWallet/g) || []).length;
        const mineBlocksCount = (
          script.match(/generateToAddress|generateBlock/g) || []
        ).length;
        const createTxCount = (script.match(/createPSBT|sendToAddress/g) || [])
          .length;
        const signTxCount = (
          script.match(/signPSBT|processPSBT|signTransaction/g) || []
        ).length;
        const broadcastCount = (
          script.match(/broadcastTransaction|sendRawTransaction/g) || []
        ).length;

        summary += `This script includes approximately:\n`;
        summary += `- ${createWalletCount} wallet creation operations\n`;
        summary += `- ${mineBlocksCount} block generation operations\n`;
        summary += `- ${createTxCount} transaction creation operations\n`;
        summary += `- ${signTxCount} transaction signing operations\n`;
        summary += `- ${broadcastCount} transaction broadcast operations\n`;

        // Look for complex operations
        if (script.includes("multisig") || script.includes("quorum")) {
          summary += `- Multisig wallet operations\n`;
        }

        if (
          script.includes("replaceFee") ||
          script.includes("rbf") ||
          script.includes("replaceByFee") ||
          script.includes("REPLACE_TRANSACTION")
        ) {
          summary += `- Replace-by-fee (RBF) operations\n`;
        }

        if (
          script.includes("cpfp") ||
          script.includes("childPaysForParent") ||
          script.includes("Child Pays For Parent")
        ) {
          summary += `- Child-pays-for-parent (CPFP) operations\n`;
        }

        if (
          script.includes("timelock") ||
          script.includes("nLockTime") ||
          script.includes("checkSequenceVerify") ||
          script.includes("CSV") ||
          script.includes("checkLockTimeVerify") ||
          script.includes("CLTV")
        ) {
          summary += `- Timelock operations\n`;
        }

        // Warn about potentially destructive operations
        if (
          script.includes("deleteWallet") ||
          script.includes("removeWallet")
        ) {
          summary += chalk.yellow(
            "\n⚠️ Warning: This script contains wallet deletion operations\n",
          );
        }

        if (
          script.includes("abandonTransaction") ||
          script.includes("abandon transaction")
        ) {
          summary += chalk.yellow(
            "\n⚠️ Warning: This script contains transaction abandonment operations\n",
          );
        }

        if (
          script.includes("invalidateBlock") ||
          script.includes("invalidate block")
        ) {
          summary += chalk.yellow(
            "\n⚠️ Warning: This script contains block invalidation operations\n",
          );
        }
      } else {
        // Declarative script
        summary += chalk.bold.cyan(`Script: ${script.name}\n`);
        summary += `${script.description || "No description provided"}\n\n`;
        summary += `Version: ${script.version || "1.0.0"}\n`;
        summary += `Contains ${script.actions.length} actions:\n\n`;

        // Group by action type for a more compact summary
        const actionCounts = script.actions.reduce(
          (acc, action) => {
            acc[action.type] = (acc[action.type] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

        Object.entries(actionCounts).forEach(([type, count]) => {
          summary += `- ${count} ${type.replace(/_/g, " ").toLowerCase()} operations\n`;
        });

        // List each action with its description
        summary += "\nDetailed action list:\n";
        script.actions.forEach((action, index) => {
          const desc =
            action.description ||
            `Execute ${action.type.replace(/_/g, " ").toLowerCase()}`;
          summary += `${index + 1}. ${desc}\n`;

          // Add details for specific action types
          switch (action.type) {
            case ActionType.CREATE_WALLET:
              summary += `   Create wallet "${action.params.name}"\n`;
              if (action.params.options) {
                const options = [];
                if (action.params.options.disablePrivateKeys)
                  options.push("without private keys");
                if (action.params.options.blank) options.push("blank");
                if (action.params.options.descriptorWallet)
                  options.push("descriptor wallet");

                if (options.length > 0) {
                  summary += `   Options: ${options.join(", ")}\n`;
                }
              }
              break;

            case ActionType.MINE_BLOCKS:
              const target = action.params.toWallet
                ? `to wallet "${action.params.toWallet}"`
                : `to address "${action.params.toAddress}"`;
              summary += `   Mine ${action.params.count} blocks ${target}\n`;
              break;

            case ActionType.CREATE_TRANSACTION:
              let outputSummary = "";
              if (
                action.params.outputs &&
                Array.isArray(action.params.outputs)
              ) {
                action.params.outputs.forEach((output: any) => {
                  const address = Object.keys(output)[0];
                  const amount = output[address];
                  if (outputSummary) outputSummary += ", ";
                  outputSummary += `${formatBitcoin(amount)} to ${truncate(address, 8)}`;
                });
              }
              summary += `   Send from "${action.params.fromWallet}": ${outputSummary}\n`;

              if (action.params.feeRate) {
                summary += `   With fee rate: ${action.params.feeRate} sat/vB\n`;
              }

              if (action.params.rbf) {
                summary += `   Enabled for RBF (Replace-By-Fee)\n`;
              }
              break;

            case ActionType.SIGN_TRANSACTION:
              if (action.params.wallet) {
                summary += `   Sign with wallet "${action.params.wallet}"\n`;
              } else if (action.params.privateKey) {
                summary += `   Sign with private key\n`;
              }
              break;

            case ActionType.BROADCAST_TRANSACTION:
              if (action.params.txid) {
                summary += `   Broadcast transaction with ID: ${truncate(action.params.txid, 10)}\n`;
              } else if (action.params.psbt) {
                summary += `   Broadcast PSBT transaction\n`;
              }
              break;

            case ActionType.REPLACE_TRANSACTION:
              summary += `   Replace transaction "${truncate(action.params.txid, 8)}"\n`;
              if (action.params.newFeeRate) {
                summary += `   With new fee rate: ${action.params.newFeeRate} sat/vB\n`;
              }
              if (action.params.newOutputs) {
                summary += `   And ${action.params.newOutputs.length} new output(s)\n`;
              }
              break;

            case ActionType.CREATE_MULTISIG:
              summary += `   Create ${action.params.requiredSigners}-of-${action.params.totalSigners} multisig wallet\n`;
              summary += `   Using address type: ${action.params.addressType}\n`;
              break;

            case ActionType.WAIT:
              summary += `   Wait for ${action.params.seconds} seconds\n`;
              break;

            case ActionType.ASSERT:
              summary += `   Verify: ${
                typeof action.params.condition === "string"
                  ? action.params.condition
                  : "condition is met"
              }\n`;
              summary += `   Error if not: "${action.params.message}"\n`;
              break;

            case ActionType.CUSTOM:
              summary += `   Execute custom code\n`;
              // Optionally show a snippet of the code (first line or limited chars)
              if (action.params.code) {
                const codePreview = action.params.code
                  .split("\n")[0]
                  .substring(0, 50);
                summary += `   Code snippet: ${codePreview}${action.params.code.length > 50 ? "..." : ""}\n`;
              }
              break;
          }
        });
      }

      return summary;
    } catch (error: any) {
      return `Error generating summary: ${error.message}`;
    }
  }

  /**
   * Execute a script
   */
  async executeScript(
    script: string | DeclarativeScript,
    options: ScriptExecutionOptions = {},
  ): Promise<ScriptExecutionResult> {
    const result: ScriptExecutionResult = {
      status: ScriptExecutionStatus.NOT_STARTED,
      startTime: new Date(),
      steps: [],
      outputs: {
        wallets: [],
        transactions: [],
        blocks: [],
      },
    };

    try {
      // Create execution context
      const context: ScriptExecutionContext = {
        bitcoinService: this.bitcoinService,
        caravanService: this.caravanService,
        transactionService: this.transactionService,
        configManager: this.configManager,
        rpcClient: this.rpcClient,
        multisigCommands: this.multisigCommands,
        variables: { ...(options.params || {}) },
        wallets: {},
        transactions: {},
        blocks: [],
        log: (message: string) => {
          if (options.verbose) {
            console.log(message);
          }
          this.emit("log", message);
        },
        progress: (step: number, total: number, message: string) => {
          this.emit("progress", { step, total, message });
        },
      };

      // Start execution
      result.status = ScriptExecutionStatus.RUNNING;
      this.emit("start", { script, options });

      if (options.dryRun) {
        // Just generate summary for dry run
        const summary = this.generateScriptSummary(script);
        console.log(chalk.cyan("Dry run - script would do the following:"));
        console.log(summary);

        result.status = ScriptExecutionStatus.COMPLETED;
        result.endTime = new Date();
        result.duration = result.endTime.getTime() - result.startTime.getTime();

        this.emit("complete", result);
        return result;
      }

      if (typeof script === "string") {
        // Execute JavaScript script
        await this.executeJavaScriptScript(script, context, result, options);
      } else {
        // Execute declarative script
        await this.executeDeclarativeScript(script, context, result, options);
      }

      // Update result
      result.status = ScriptExecutionStatus.COMPLETED;
      result.endTime = new Date();
      result.duration = result.endTime.getTime() - result.startTime.getTime();

      // Gather outputs
      result.outputs.wallets = Object.keys(context.wallets);
      result.outputs.transactions = Object.keys(context.transactions);
      result.outputs.blocks = context.blocks;

      this.emit("complete", result);
      return result;
    } catch (error: any) {
      result.status = ScriptExecutionStatus.FAILED;
      result.endTime = new Date();
      result.duration = result.endTime.getTime() - result.startTime.getTime();
      result.error = error;

      this.emit("error", { error, result });
      throw error;
    }
  }

  /**
   * Execute a JavaScript script
   */
  private async executeJavaScriptScript(
    script: string,
    context: ScriptExecutionContext,
    result: ScriptExecutionResult,
    options: ScriptExecutionOptions,
  ): Promise<void> {
    try {
      // Create a VM to execute the script in a sandboxed environment
      const vm = new VM({
        timeout: 30000, // 30 seconds timeout
        sandbox: {
          // Expose the context to the script
          bitcoinService: context.bitcoinService,
          caravanService: context.caravanService,
          transactionService: context.transactionService,
          configManager: context.configManager,
          rpcClient: context.rpcClient,
          multisigCommands: context.multisigCommands,
          variables: context.variables,
          wallets: context.wallets,
          transactions: context.transactions,
          blocks: context.blocks,
          console: {
            log: context.log,
            error: (message: string) => {
              context.log(chalk.red(`ERROR: ${message}`));
              this.emit("error", { message, result });
            },
            warn: (message: string) => {
              context.log(chalk.yellow(`WARNING: ${message}`));
              this.emit("warning", { message, result });
            },
          },
          progress: context.progress,
          // Helper functions
          formatBitcoin,
          truncate,
          // Allow setTimeout and setInterval
          setTimeout,
          clearTimeout,
          setInterval,
          clearInterval,
        },
      });

      // If interactive, ask for confirmation before executing the script
      if (options.interactive) {
        const summary = this.generateScriptSummary(script);
        console.log(chalk.cyan("Script Summary:"));
        console.log(summary);

        // Get confirmation from user via inquirer
        const { confirm } = await import("@inquirer/prompts");

        const userConfirmed = await confirm({
          message: "Do you want to execute this script?",
          default: false, // Default to "No" for safety
        });

        if (!userConfirmed) {
          result.status = ScriptExecutionStatus.ABORTED;
          throw new Error("Script execution aborted by user");
        }
      }

      // Execute the script
      await vm.run(script);
    } catch (error: any) {
      throw new Error(`Script execution failed: ${error.message}`);
    }
  }

  /**
   * Execute a declarative script
   */
  private async executeDeclarativeScript(
    script: DeclarativeScript,
    context: ScriptExecutionContext,
    result: ScriptExecutionResult,
    options: ScriptExecutionOptions,
  ): Promise<void> {
    try {
      // Initialize variables
      if (script.variables) {
        context.variables = { ...context.variables, ...script.variables };
      }

      // If interactive, ask for confirmation before executing the script
      if (options.interactive) {
        const summary = this.generateScriptSummary(script);
        console.log(chalk.cyan("Script Summary:"));
        console.log(summary);

        // Simulate confirmation
        const confirm = true; // In a real implementation, this would be a user prompt
        if (!confirm) {
          result.status = ScriptExecutionStatus.ABORTED;
          throw new Error("Script execution aborted by user");
        }
      }

      // Execute each action in sequence
      for (let i = 0; i < script.actions.length; i++) {
        const action = script.actions[i];
        const actionResult = {
          action: action.type,
          status: "success" as "success" | "failed" | "skipped",
          result: undefined as any,
          error: undefined as Error | undefined,
        };

        try {
          // Progress reporting
          context.progress(
            i + 1,
            script.actions.length,
            action.description ||
              `Executing ${action.type.replace(/_/g, " ").toLowerCase()}`,
          );

          // If interactive mode, ask for confirmation before each action
          if (options.interactive) {
            console.log(
              chalk.cyan(
                `\nAction ${i + 1}/${script.actions.length}: ${action.type}`,
              ),
            );
            console.log(chalk.gray(JSON.stringify(action.params, null, 2)));

            // Simulate confirmation
            const confirm = true; // In a real implementation, this would be a user prompt
            if (!confirm) {
              actionResult.status = "skipped";
              result.steps.push(actionResult);
              continue;
            }
          }

          // Process variable references in params (e.g., ${variableName})
          const processedParams = this.processVariableReferences(
            action.params,
            context.variables,
          );

          // Execute the action
          actionResult.result = await this.executeAction(
            action.type as ActionType,
            processedParams,
            context,
          );

          // Log action result if verbose
          if (options.verbose) {
            context.log(formatSuccess(`Completed action: ${action.type}`));
            if (actionResult.result) {
              context.log(JSON.stringify(actionResult.result, null, 2));
            }
          }
        } catch (error: any) {
          actionResult.status = "failed";
          actionResult.error = error;

          context.log(
            formatError(`Action failed: ${action.type} - ${error.message}`),
          );

          // Add the step to the result
          result.steps.push(actionResult);

          // Stop execution on error
          throw error;
        }

        // Add the step to the result
        result.steps.push(actionResult);
      }
    } catch (error: any) {
      throw new Error(`Script execution failed: ${error.message}`);
    }
  }

  /**
   * Execute a single action
   */
  private async executeAction(
    type: ActionType,
    params: any,
    context: ScriptExecutionContext,
  ): Promise<any> {
    switch (type) {
      case ActionType.CREATE_WALLET:
        return this.executeCreateWallet(params, context);

      case ActionType.MINE_BLOCKS:
        return this.executeMineBlocks(params, context);

      case ActionType.CREATE_TRANSACTION:
        return this.executeCreateTransaction(params, context);

      case ActionType.REPLACE_TRANSACTION:
        return this.executeReplaceTransaction(params, context);

      case ActionType.SIGN_TRANSACTION:
        return this.executeSignTransaction(params, context);

      case ActionType.BROADCAST_TRANSACTION:
        return this.executeBroadcastTransaction(params, context);

      case ActionType.CREATE_MULTISIG:
        return this.executeCreateMultisig(params, context);

      case ActionType.WAIT:
        return this.executeWait(params);

      case ActionType.ASSERT:
        return this.executeAssert(params, context);

      case ActionType.CUSTOM:
        return this.executeCustom(params, context);

      default:
        throw new Error(`Unknown action type: ${type}`);
    }
  }

  /**
   * Execute CUSTOM action
   */
  private async executeCustom(
    params: any,
    context: ScriptExecutionContext,
  ): Promise<any> {
    try {
      const { code } = params;

      if (!code || typeof code !== "string") {
        throw new Error("CUSTOM action requires a code parameter as a string");
      }

      // Use Function constructor to create a function that can access the context
      const executeFunction = new Function(
        "context",
        `
        return (async () => {
          try {
            ${code}
          } catch (error) {
            console.error("Error in custom code:", error.message);
            throw error;
          }
        })();
      `,
      );

      // Execute the function with the context
      const result = await executeFunction(context);

      // Set variable if name is provided
      if (params.variableName && result !== undefined) {
        context.variables[params.variableName] = result;
      }

      return result;
    } catch (error: any) {
      context.log(`Error executing custom code: ${error.message}`);
      throw new Error(`Custom code execution failed: ${error.message}`);
    }
  }

  /**
   * Process variable references in parameters
   */
  private processVariableReferences(
    params: any,
    variables: Record<string, any>,
  ): any {
    if (typeof params === "string") {
      // Replace variable references in strings
      return params.replace(/\${([^}]+)}/g, (match, varName) => {
        return variables[varName] !== undefined ? variables[varName] : match;
      });
    } else if (Array.isArray(params)) {
      // Process array elements
      return params.map((item) =>
        this.processVariableReferences(item, variables),
      );
    } else if (params !== null && typeof params === "object") {
      // Process object properties
      const result: Record<string, any> = {};
      for (const key in params) {
        result[key] = this.processVariableReferences(params[key], variables);
      }
      return result;
    }

    // Return primitive values as is
    return params;
  }

  /**
   * Execute CREATE_WALLET action
   */
  private async executeCreateWallet(
    params: any,
    context: ScriptExecutionContext,
  ): Promise<any> {
    const { name, options = {} } = params;

    // Create the wallet
    const result = await context.bitcoinService.createWallet(name, options);

    // Store wallet info in context
    context.wallets[name] = { name, created: new Date() };

    // Set variable if name is provided
    if (params.variableName) {
      context.variables[params.variableName] = name;
    }

    return result;
  }

  /**
   * Execute MINE_BLOCKS action
   */
  private async executeMineBlocks(
    params: any,
    context: ScriptExecutionContext,
  ): Promise<any> {
    const { count, toWallet, toAddress } = params;

    let address: string;

    if (toAddress) {
      // Use provided address
      address = toAddress;
    } else if (toWallet) {
      // Generate address from wallet
      address = await context.bitcoinService.getNewAddress(toWallet);
    } else {
      throw new Error("Either toWallet or toAddress parameter is required");
    }

    // Mine blocks
    const blockHashes = await context.bitcoinService.generateToAddress(
      count,
      address,
    );

    // Add block hashes to context
    context.blocks.push(...blockHashes);

    // Set variable if name is provided
    if (params.variableName) {
      context.variables[params.variableName] = blockHashes;
    }

    return { blockHashes, count, address };
  }

  /**
   * Execute CREATE_TRANSACTION action
   */
  private async executeCreateTransaction(
    params: any,
    context: ScriptExecutionContext,
  ): Promise<any> {
    const { fromWallet, outputs, feeRate } = params;

    // Create PSBT
    const psbt = await context.transactionService.createPSBT(
      fromWallet,
      outputs,
    );

    // Generate a txid for reference
    const txid = `pending_${Math.random().toString(36).substring(2, 15)}`;

    // Store transaction info in context
    context.transactions[txid] = {
      psbt,
      fromWallet,
      outputs,
      feeRate,
      status: "created",
      created: new Date(),
    };

    // Set variable if name is provided
    if (params.variableName) {
      context.variables[params.variableName] = { txid, psbt };
    }

    return { txid, psbt };
  }

  /**
   * Execute REPLACE_TRANSACTION action (RBF)
   */
  private async executeReplaceTransaction(
    params: any,
    context: ScriptExecutionContext,
  ): Promise<any> {
    const { txid, newOutputs, newFeeRate } = params;

    // Get the original transaction
    const tx = context.transactions[txid];
    if (!tx) {
      throw new Error(`Transaction not found: ${txid}`);
    }

    // Create a new PSBT with increased fee rate
    const newPsbt = await context.transactionService.createPSBT(
      tx.fromWallet,
      newOutputs || tx.outputs,
      { rbf: true, feeRate: newFeeRate },
    );

    // Generate a new txid for reference
    const newTxid = `pending_${Math.random().toString(36).substring(2, 15)}`;

    // Store new transaction info in context
    context.transactions[newTxid] = {
      psbt: newPsbt,
      fromWallet: tx.fromWallet,
      outputs: newOutputs || tx.outputs,
      feeRate: newFeeRate,
      replacesTransaction: txid,
      status: "created",
      created: new Date(),
    };

    // Update original transaction status
    context.transactions[txid].status = "replaced";
    context.transactions[txid].replacedBy = newTxid;

    // Set variable if name is provided
    if (params.variableName) {
      context.variables[params.variableName] = { txid: newTxid, psbt: newPsbt };
    }

    return { txid: newTxid, psbt: newPsbt, replacedTxid: txid };
  }

  /**
   * Execute SIGN_TRANSACTION action
   */
  private async executeSignTransaction(
    params: any,
    context: ScriptExecutionContext,
  ): Promise<any> {
    const { txid, wallet, privateKey } = params;

    // Get the transaction
    const tx = context.transactions[txid];
    if (!tx) {
      throw new Error(`Transaction not found: ${txid}`);
    }

    let signedPsbt: string;

    if (wallet) {
      // Sign with wallet
      signedPsbt = await context.transactionService.processPSBT(
        wallet,
        tx.psbt,
      );
    } else if (privateKey) {
      // Sign with private key
      signedPsbt = await context.transactionService.signPSBTWithPrivateKey(
        tx.psbt,
        privateKey,
      );
    } else {
      throw new Error("Either wallet or privateKey parameter is required");
    }

    // Update transaction info in context
    context.transactions[txid].psbt = signedPsbt;
    context.transactions[txid].status = "signed";
    context.transactions[txid].signedAt = new Date();

    // Set variable if name is provided
    if (params.variableName) {
      context.variables[params.variableName] = signedPsbt;
    }

    return { txid, signedPsbt };
  }

  /**
   * Execute BROADCAST_TRANSACTION action
   */
  private async executeBroadcastTransaction(
    params: any,
    context: ScriptExecutionContext,
  ): Promise<any> {
    const { txid, psbt } = params;

    let transactionPsbt: string;

    if (psbt) {
      // Use provided PSBT
      transactionPsbt = psbt;
    } else if (txid) {
      // Get the transaction from context
      const tx = context.transactions[txid];
      if (!tx) {
        throw new Error(`Transaction not found: ${txid}`);
      }
      transactionPsbt = tx.psbt;
    } else {
      throw new Error("Either txid or psbt parameter is required");
    }

    // Finalize the PSBT
    const finalized =
      await context.transactionService.finalizePSBT(transactionPsbt);

    if (!finalized.complete) {
      throw new Error("PSBT is not complete, cannot broadcast");
    }

    // Broadcast the transaction
    const broadcastTxid = await context.transactionService.broadcastTransaction(
      finalized.hex,
    );

    // Update transaction info in context if we have it
    if (txid && context.transactions[txid]) {
      context.transactions[txid].status = "broadcasted";
      context.transactions[txid].broadcastedAt = new Date();
      context.transactions[txid].broadcastTxid = broadcastTxid;
    }

    // Add the new transaction if we don't have it
    if (!txid || !context.transactions[txid]) {
      context.transactions[broadcastTxid] = {
        psbt: transactionPsbt,
        status: "broadcasted",
        broadcastedAt: new Date(),
        finalHex: finalized.hex,
      };
    }

    // Set variable if name is provided
    if (params.variableName) {
      context.variables[params.variableName] = broadcastTxid;
    }

    return { broadcastTxid, hex: finalized.hex };
  }

  /**
   * Execute CREATE_MULTISIG action
   */
  private async executeCreateMultisig(
    params: any,
    context: ScriptExecutionContext,
  ): Promise<any> {
    // Create the multisig wallet
    const wallet = await context.multisigCommands.createCaravanWallet();

    // Set variable if name is provided
    if (params.variableName) {
      context.variables[params.variableName] = wallet;
    }

    return wallet;
  }

  /**
   * Execute WAIT action
   */
  private async executeWait(params: any): Promise<any> {
    const { seconds } = params;

    if (typeof seconds !== "number" || seconds <= 0) {
      throw new Error("WAIT action requires a positive seconds parameter");
    }

    // Wait for the specified number of seconds
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));

    return { seconds };
  }

  /**
   * Execute ASSERT action
   */
  private async executeAssert(
    params: any,
    context: ScriptExecutionContext,
  ): Promise<any> {
    const { condition, message } = params;

    let result: boolean;

    if (typeof condition === "string") {
      // Evaluate the condition in the context
      try {
        // Replace variable references
        const processedCondition = this.processVariableReferences(
          condition,
          context.variables,
        );
        // Use Function constructor to evaluate the condition
        result = new Function(
          "context",
          `with(context) { return ${processedCondition}; }`,
        )(context);
      } catch (error: any) {
        throw new Error(
          `Failed to evaluate assertion condition: ${error.message}`,
        );
      }
    } else if (typeof condition === "boolean") {
      result = condition;
    } else {
      throw new Error("Assertion condition must be a string or boolean");
    }

    if (!result) {
      throw new Error(message || "Assertion failed");
    }

    return { result: true };
  }

  /**
   * Get all available script templates
   */
  async getScriptTemplates(): Promise<
    { name: string; path: string; description: string }[]
  > {
    try {
      const files = await fs.readdir(this.templatesDir);
      const templates = [];

      for (const file of files) {
        const filePath = path.join(this.templatesDir, file);
        const stat = await fs.stat(filePath);

        if (stat.isFile() && (file.endsWith(".js") || file.endsWith(".json"))) {
          try {
            const content = await fs.readFile(filePath, "utf8");
            let description = "";

            if (file.endsWith(".json")) {
              // Extract description from JSON
              const json = JSON.parse(content);
              description = json.description || "";
            } else {
              // Extract first comment block as description
              const match = content.match(/\/\*\*([\s\S]*?)\*\//);
              if (match) {
                description = match[1].replace(/\*/g, "").trim();
              }
            }

            templates.push({
              name: file,
              path: filePath,
              description,
            });
          } catch (error) {
            console.error(`Error reading template ${file}:`, error);
          }
        }
      }

      return templates;
    } catch (error) {
      console.error("Error reading script templates:", error);
      return [];
    }
  }

  /**
   * Create a new script template
   */
  async createScriptTemplate(
    name: string,
    content: string,
    type: ScriptType,
  ): Promise<string> {
    try {
      // Generate filename based on name and type
      const filename = `${name.replace(/\s+/g, "_").toLowerCase()}.${type === ScriptType.JAVASCRIPT ? "js" : "json"}`;
      const filePath = path.join(this.templatesDir, filename);

      // Check if file already exists
      if (await fs.pathExists(filePath)) {
        throw new Error(`Template already exists: ${filename}`);
      }

      // Write the template file
      await fs.writeFile(filePath, content);

      return filePath;
    } catch (error: any) {
      throw new Error(`Failed to create script template: ${error.message}`);
    }
  }

  /**
   * Save a script to a file
   */
  async saveScript(
    name: string,
    content: string | DeclarativeScript,
    type: ScriptType,
  ): Promise<string> {
    try {
      // Generate filename based on name and type
      const filename = `${name.replace(/\s+/g, "_").toLowerCase()}.${type === ScriptType.JAVASCRIPT ? "js" : "json"}`;
      const filePath = path.join(
        this.configManager.getConfig().appDir,
        "scripts",
        filename,
      );

      // Ensure the scripts directory exists
      await fs.ensureDir(path.dirname(filePath));

      // Write the script file
      if (typeof content === "string") {
        await fs.writeFile(filePath, content);
      } else {
        await fs.writeJson(filePath, content, { spaces: 2 });
      }

      return filePath;
    } catch (error: any) {
      throw new Error(`Failed to save script: ${error.message}`);
    }
  }
}
