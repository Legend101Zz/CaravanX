//@ts-nocheck
import { TransactionService } from "../core/transaction";
import { CaravanService } from "../core/caravan";
import { BitcoinService } from "../core/bitcoin";
import { input, confirm, select, number, password } from "@inquirer/prompts";
import * as fs from "fs-extra";
import * as clipboard from "clipboardy";
import ora from "ora";
import {
  colors,
  displayCommandTitle,
  formatBitcoin,
  truncate,
  createTable,
  formatSuccess,
  formatWarning,
  formatError,
  boxText,
  keyValue,
  divider,
} from "../utils/terminal";

// Back option constant
const BACK_OPTION = "__BACK__";

/**
 * Commands for managing Bitcoin transactions and PSBTs
 */
export class TransactionCommands {
  private readonly transactionService: TransactionService;
  private readonly caravanService: CaravanService;
  private readonly bitcoinService: BitcoinService;

  constructor(
    transactionService: TransactionService,
    caravanService: CaravanService,
    bitcoinService: BitcoinService,
  ) {
    this.transactionService = transactionService;
    this.caravanService = caravanService;
    this.bitcoinService = bitcoinService;
  }

  /**
   * Add a back option to selection choices
   */
  private addBackOption(choices: any[], backLabel = "Back to menu"): any[] {
    return [...choices, { name: colors.muted(backLabel), value: BACK_OPTION }];
  }

  /**
   * Check if a value is the back option
   */
  private isBackOption(value: string): boolean {
    return value === BACK_OPTION;
  }

  /**
   * Custom text input with back option (using 'q' to go back)
   */
  private async inputWithBack(options: {
    message: string;
    default?: string;
    validate?: (input: string) => boolean | string;
  }): Promise<string> {
    const message = options.message + " (or 'q' to go back)";

    const result = await input({
      message,
      default: options.default,
      validate: (input) => {
        if (input.toLowerCase() === "q") return true;
        if (options.validate) return options.validate(input);
        return true;
      },
    });

    if (result.toLowerCase() === "q") {
      return BACK_OPTION;
    }

    return result;
  }

  /**
   * Custom password input with back option (using 'q' to go back)
   */
  private async passwordWithBack(options: {
    message: string;
    validate?: (input: string) => boolean | string;
  }): Promise<string> {
    const message = options.message + " (or 'q' to go back)";

    const result = await password({
      message,
      validate: (input) => {
        if (input.toLowerCase() === "q") return true;
        if (options.validate) return options.validate(input);
        return true;
      },
    });

    if (result.toLowerCase() === "q") {
      return BACK_OPTION;
    }

    return result;
  }

  /**
   * Custom number input with back option (using 'q' to go back)
   */
  private async numberWithBack(options: {
    message: string;
    default?: number;
    validate?: (input: number | undefined) => boolean | string;
  }): Promise<number | string> {
    const message = options.message + " (or 'q' to go back)";

    try {
      const result = await number({
        message,
        default: options.default,
        validate: (input) => {
          if (input === undefined && options.validate) {
            return options.validate(input);
          }
          return true;
        },
      });

      return result;
    } catch (error) {
      // If the user entered 'q', it will throw an error since 'q' is not a number
      if (error.toString().includes("q")) {
        return BACK_OPTION;
      }
      throw error;
    }
  }

  /**
   * Handle spinner errors and return false to indicate operation should be canceled
   */
  private handleSpinnerError(
    spinner: any,
    errorMessage: string,
    error: any,
  ): false {
    spinner.fail(errorMessage);
    console.error(formatError(`${errorMessage}: ${error.message}`));
    console.log(colors.info("Press Enter to return to menu..."));
    return false;
  }

  /**
   * Create a PSBT from a watch-only wallet
   */
  async createPSBT(): Promise<string | false | null> {
    displayCommandTitle("Create New PSBT");

    try {
      // First, list all wallets with proper error handling
      const walletsSpinner = ora("Loading wallets...").start();
      let wallets;

      try {
        wallets = await this.bitcoinService.listWallets();
        walletsSpinner.succeed("Wallets loaded");
      } catch (error) {
        return this.handleSpinnerError(
          walletsSpinner,
          "Error loading wallets",
          error,
        );
      }

      if (wallets.length === 0) {
        console.log(formatWarning("No wallets found."));
        return false;
      }

      // Select the wallet with back option
      const selectedWallet = await select({
        message: "Select a wallet to create the PSBT from:",
        choices: this.addBackOption(
          wallets.map((w) => ({
            name: colors.highlight(w),
            value: w,
          })),
        ),
      });

      // Check if user wants to go back
      if (this.isBackOption(selectedWallet)) {
        return false;
      }

      // Get wallet info with proper error handling
      const infoSpinner = ora(
        `Loading wallet information for ${selectedWallet}...`,
      ).start();
      let walletInfo;

      try {
        walletInfo = await this.bitcoinService.getWalletInfo(selectedWallet);
        infoSpinner.succeed("Wallet information loaded");
      } catch (error) {
        return this.handleSpinnerError(
          infoSpinner,
          "Error loading wallet information",
          error,
        );
      }

      console.log(keyValue("Selected wallet", selectedWallet));
      console.log(
        keyValue("Available balance", formatBitcoin(walletInfo.balance)),
      );

      if (walletInfo.balance <= 0) {
        console.log(
          formatWarning("Wallet has no funds. Please fund it first."),
        );
        return false;
      }

      // Configure outputs
      const outputs = [];
      let totalAmount = 0;

      // Ask for number of outputs with back option
      const numOutputs = await this.numberWithBack({
        message: "How many outputs do you want to create?",
        validate: (input) =>
          input! > 0 ? true : "Please enter a positive number",
        default: 1,
      });

      // Check if user wants to go back
      if (this.isBackOption(numOutputs)) {
        return false;
      }

      console.log(divider());
      console.log(colors.header("Output Configuration"));

      // Collect output details
      for (let i = 0; i < numOutputs!; i++) {
        console.log(colors.info(`\nOutput #${i + 1}:`));

        // Get address with back option
        const address = await this.inputWithBack({
          message: `Enter destination address for output #${i + 1}:`,
          validate: (input) =>
            input.trim() !== "" ? true : "Please enter a valid address",
        });

        // Check if user wants to go back
        if (this.isBackOption(address)) {
          return false;
        }

        // Get amount with back option
        const amount = await this.numberWithBack({
          message: `Enter amount in BTC for output #${i + 1}:`,
          validate: (input) => {
            if (isNaN(input!) || input! <= 0) {
              return "Please enter a valid positive amount";
            }
            if (totalAmount + input! > walletInfo.balance) {
              return `Total amount (${formatBitcoin(totalAmount + input!)}) exceeds balance (${formatBitcoin(walletInfo.balance)})`;
            }
            return true;
          },
        });

        // Check if user wants to go back
        if (this.isBackOption(amount)) {
          return false;
        }

        outputs.push({ [address]: amount });
        totalAmount += amount!;

        console.log(
          keyValue(
            `Output #${i + 1}`,
            `${formatBitcoin(amount!)} to ${address}`,
          ),
        );
      }

      // Show summary
      console.log(divider());
      console.log(colors.header("Transaction Summary"));
      console.log(keyValue("Total amount", formatBitcoin(totalAmount)));
      console.log(keyValue("From wallet", selectedWallet));
      console.log(keyValue("Number of outputs", numOutputs!.toString()));

      // Confirm with back option
      const confirmOptions = [
        { name: colors.success("Yes, create PSBT"), value: "yes" },
        { name: colors.error("No, cancel"), value: "no" },
      ];

      const confirmChoice = await select({
        message: "Proceed with creating the PSBT?",
        choices: this.addBackOption(confirmOptions),
      });

      // Check if user wants to go back
      if (this.isBackOption(confirmChoice) || confirmChoice === "no") {
        console.log(formatWarning("PSBT creation cancelled."));
        return false;
      }

      // Create the PSBT with proper error handling
      const createSpinner = ora("Creating PSBT...").start();
      let psbt;

      try {
        psbt = await this.transactionService.createPSBT(
          selectedWallet,
          outputs,
        );
        createSpinner.succeed("PSBT created successfully");
      } catch (error) {
        return this.handleSpinnerError(
          createSpinner,
          "Error creating PSBT",
          error,
        );
      }

      if (!psbt) {
        console.log(formatError("Failed to create PSBT."));
        return false;
      }

      // Handle the PSBT with back option
      const actionOptions = [
        { name: colors.highlight("Save to file"), value: "file" },
        { name: colors.highlight("Copy to clipboard"), value: "clipboard" },
        { name: colors.highlight("Display"), value: "display" },
        { name: colors.highlight("Process with this wallet"), value: "sign" },
      ];

      const action = await select({
        message: "What would you like to do with the PSBT?",
        choices: this.addBackOption(actionOptions),
      });

      // Check if user wants to go back
      if (this.isBackOption(action)) {
        return false;
      }

      switch (action) {
        case "file": {
          // Get filename with back option
          const filename = await this.inputWithBack({
            message: "Enter file name:",
            default: "unsigned-psbt.txt",
          });

          // Check if user wants to go back
          if (this.isBackOption(filename)) {
            return false;
          }

          // Save with proper error handling
          const saveSpinner = ora(`Saving PSBT to ${filename}...`).start();
          try {
            await fs.writeFile(filename, psbt);
            saveSpinner.succeed("PSBT saved");
          } catch (error) {
            return this.handleSpinnerError(
              saveSpinner,
              `Error saving to ${filename}`,
              error,
            );
          }

          console.log(
            boxText(
              `The PSBT has been saved to ${colors.highlight(filename)}`,
              { title: "PSBT Saved", titleColor: colors.success },
            ),
          );
          break;
        }
        case "clipboard":
          // Copy with proper error handling
          const clipboardSpinner = ora("Copying PSBT to clipboard...").start();
          try {
            await clipboard.write(psbt);
            clipboardSpinner.succeed("PSBT copied to clipboard");
          } catch (error) {
            return this.handleSpinnerError(
              clipboardSpinner,
              "Error copying to clipboard",
              error,
            );
          }
          break;
        case "display":
          console.log(
            boxText(colors.code(psbt), {
              title: "PSBT (Base64)",
              titleColor: colors.info,
            }),
          );
          break;
        case "sign":
          // Process the PSBT with the same wallet
          return this.signPSBTWithWallet(psbt, selectedWallet);
      }

      return psbt;
    } catch (error) {
      console.error(formatError("Error creating PSBT:"), error);
      return false;
    }
  }

  /**
   * Sign a PSBT with a wallet
   */
  async signPSBTWithWallet(
    psbtBase64?: string,
    walletName?: string,
  ): Promise<string | false | null> {
    displayCommandTitle("Sign PSBT with Wallet");

    try {
      // If no PSBT provided, get it from the user
      if (!psbtBase64) {
        // Add back option to source selection
        const sourceOptions = [
          { name: colors.highlight("Load from file"), value: "file" },
          { name: colors.highlight("Paste Base64 string"), value: "paste" },
          {
            name: colors.highlight("Read from clipboard"),
            value: "clipboard",
          },
        ];

        const source = await select({
          message: "How would you like to provide the PSBT?",
          choices: this.addBackOption(sourceOptions),
        });

        // Check if user wants to go back
        if (this.isBackOption(source)) {
          return false;
        }

        switch (source) {
          case "file": {
            // Get filename with back option
            const filename = await this.inputWithBack({
              message: "Enter path to PSBT file:",
              validate: (input) =>
                fs.existsSync(input) ? true : "File does not exist",
            });

            // Check if user wants to go back
            if (this.isBackOption(filename)) {
              return false;
            }

            // Read with proper error handling
            const readSpinner = ora(`Reading PSBT from ${filename}...`).start();
            try {
              psbtBase64 = (await fs.readFile(filename, "utf8")).trim();
              readSpinner.succeed("PSBT loaded from file");
            } catch (error) {
              return this.handleSpinnerError(
                readSpinner,
                `Error reading from ${filename}`,
                error,
              );
            }
            break;
          }
          case "paste": {
            // Get PSBT string with back option
            const pastedPsbt = await this.inputWithBack({
              message: "Paste the base64-encoded PSBT:",
              validate: (input) =>
                input.trim() !== "" ? true : "Please enter a valid PSBT",
            });

            // Check if user wants to go back
            if (this.isBackOption(pastedPsbt)) {
              return false;
            }

            psbtBase64 = pastedPsbt.trim();
            break;
          }
          case "clipboard":
            // Read from clipboard with proper error handling
            try {
              const clipboardSpinner = ora("Reading from clipboard...").start();
              psbtBase64 = await clipboard.read();
              clipboardSpinner.succeed("PSBT read from clipboard");
            } catch (error) {
              console.error(
                formatError("Error reading from clipboard:"),
                error,
              );
              return false;
            }
            break;
        }
      }

      // Try to decode the PSBT for inspection with proper error handling
      try {
        const decodeSpinner = ora("Decoding PSBT...").start();
        const decodedPsbt =
          await this.transactionService.decodePSBT(psbtBase64);
        decodeSpinner.succeed("PSBT decoded successfully");

        console.log(
          boxText(this.formatPSBTSummary(decodedPsbt), {
            title: "PSBT Summary",
            titleColor: colors.info,
          }),
        );
      } catch (error) {
        console.log(formatWarning("Could not decode PSBT for inspection."));
      }

      // If no wallet provided, ask user to select one with back option
      if (!walletName) {
        const walletsSpinner = ora("Loading wallets...").start();
        let wallets;

        try {
          wallets = await this.bitcoinService.listWallets();
          walletsSpinner.succeed("Wallets loaded");
        } catch (error) {
          return this.handleSpinnerError(
            walletsSpinner,
            "Error loading wallets",
            error,
          );
        }

        if (wallets.length === 0) {
          console.log(formatWarning("No wallets found."));
          return false;
        }

        // Add back option to wallet selection
        walletName = await select({
          message: "Select a wallet to sign with:",
          choices: this.addBackOption(
            wallets.map((w) => ({
              name: colors.highlight(w),
              value: w,
            })),
          ),
        });

        // Check if user wants to go back
        if (this.isBackOption(walletName)) {
          return false;
        }
      }

      // Sign the PSBT with the selected wallet
      console.log(colors.info(`\nSigning PSBT with wallet "${walletName}"...`));

      // Sign with proper error handling
      const signSpinner = ora("Signing PSBT...").start();
      let signedPsbt;

      try {
        signedPsbt = await this.transactionService.processPSBT(
          walletName,
          psbtBase64,
        );
        signSpinner.succeed("PSBT signed successfully");
      } catch (error) {
        return this.handleSpinnerError(
          signSpinner,
          "Error signing PSBT",
          error,
        );
      }

      // Handle the signed PSBT with back option
      const actionOptions = [
        { name: colors.highlight("Save to file"), value: "file" },
        { name: colors.highlight("Copy to clipboard"), value: "clipboard" },
        { name: colors.highlight("Display"), value: "display" },
        {
          name: colors.highlight("Try to finalize and broadcast"),
          value: "finalize",
        },
      ];

      const action = await select({
        message: "What would you like to do with the signed PSBT?",
        choices: this.addBackOption(actionOptions),
      });

      // Check if user wants to go back
      if (this.isBackOption(action)) {
        return false;
      }

      switch (action) {
        case "file": {
          // Get filename with back option
          const filename = await this.inputWithBack({
            message: "Enter file name:",
            default: "signed-psbt.txt",
          });

          // Check if user wants to go back
          if (this.isBackOption(filename)) {
            return false;
          }

          // Save with proper error handling
          const saveSpinner = ora(
            `Saving signed PSBT to ${filename}...`,
          ).start();
          try {
            await fs.writeFile(filename, signedPsbt);
            saveSpinner.succeed("Signed PSBT saved");
          } catch (error) {
            return this.handleSpinnerError(
              saveSpinner,
              `Error saving to ${filename}`,
              error,
            );
          }

          console.log(
            boxText(
              `The signed PSBT has been saved to ${colors.highlight(filename)}`,
              { title: "Signed PSBT Saved", titleColor: colors.success },
            ),
          );
          break;
        }
        case "clipboard":
          // Copy with proper error handling
          const clipboardSpinner = ora(
            "Copying signed PSBT to clipboard...",
          ).start();
          try {
            await clipboard.write(signedPsbt);
            clipboardSpinner.succeed("Signed PSBT copied to clipboard");
          } catch (error) {
            return this.handleSpinnerError(
              clipboardSpinner,
              "Error copying to clipboard",
              error,
            );
          }
          break;
        case "display":
          console.log(
            boxText(colors.code(signedPsbt), {
              title: "Signed PSBT (Base64)",
              titleColor: colors.info,
            }),
          );
          break;
        case "finalize":
          return this.finalizeAndBroadcastPSBT(signedPsbt);
      }

      return signedPsbt;
    } catch (error) {
      console.error(formatError("Error signing PSBT:"), error);
      return false;
    }
  }

  /**
   * Format a decoded PSBT for display
   */
  private formatPSBTSummary(decodedPsbt: any): string {
    let summary = "";

    // Display inputs
    summary += colors.header("Inputs:") + "\n";
    decodedPsbt.inputs.forEach((input, index) => {
      summary += `Input #${index + 1}:\n`;
      if (input.has_utxo) {
        summary += `  TXID: ${truncate(decodedPsbt.tx.vin[index].txid, 10)}\n`;
        summary += `  VOUT: ${decodedPsbt.tx.vin[index].vout}\n`;
        summary += `  Amount: ${formatBitcoin(input.utxo.amount)}\n`;
        summary += `  Address: ${input.utxo.scriptPubKey.address || "Unknown"}\n`;
      } else {
        summary += `  TXID: ${truncate(decodedPsbt.tx.vin[index].txid, 10)}\n`;
        summary += `  VOUT: ${decodedPsbt.tx.vin[index].vout}\n`;
      }
      summary += "\n";
    });

    // Display outputs
    summary += colors.header("Outputs:") + "\n";
    decodedPsbt.tx.vout.forEach((output, index) => {
      summary += `Output #${index + 1}:\n`;
      summary += `  Amount: ${formatBitcoin(output.value)}\n`;
      summary += `  Address: ${output.scriptPubKey.address || "Unknown"}\n\n`;
    });

    // Display fee
    if (decodedPsbt.fee) {
      summary += colors.header("Fee:") + "\n";
      summary += `  ${formatBitcoin(decodedPsbt.fee)}\n`;

      // Calculate fee rate
      if (decodedPsbt.tx.vsize) {
        const feeRate = decodedPsbt.fee / (decodedPsbt.tx.vsize / 1000);
        summary += `  Rate: ${feeRate.toFixed(2)} BTC/kB\n`;
      }
    }

    return summary;
  }

  /**
   * Sign a PSBT with a private key
   */
  async signPSBTWithPrivateKey(): Promise<any | false | null> {
    displayCommandTitle("Sign PSBT with Private Key");

    try {
      // Get the PSBT from the user with back option
      const sourceOptions = [
        { name: colors.highlight("Load from file"), value: "file" },
        { name: colors.highlight("Paste Base64 string"), value: "paste" },
        { name: colors.highlight("Read from clipboard"), value: "clipboard" },
      ];

      const source = await select({
        message: "How would you like to provide the PSBT?",
        choices: this.addBackOption(sourceOptions),
      });

      // Check if user wants to go back
      if (this.isBackOption(source)) {
        return false;
      }

      let psbtBase64: string;

      switch (source) {
        case "file": {
          // Get filename with back option
          const filename = await this.inputWithBack({
            message: "Enter path to PSBT file:",
            validate: (input) =>
              fs.existsSync(input) ? true : "File does not exist",
          });

          // Check if user wants to go back
          if (this.isBackOption(filename)) {
            return false;
          }

          // Read with proper error handling
          const readSpinner = ora(`Reading PSBT from ${filename}...`).start();
          try {
            psbtBase64 = (await fs.readFile(filename, "utf8")).trim();
            readSpinner.succeed("PSBT loaded from file");
          } catch (error) {
            return this.handleSpinnerError(
              readSpinner,
              `Error reading from ${filename}`,
              error,
            );
          }
          break;
        }
        case "paste": {
          // Get PSBT string with back option
          const pastedPsbt = await this.inputWithBack({
            message: "Paste the base64-encoded PSBT:",
            validate: (input) =>
              input.trim() !== "" ? true : "Please enter a valid PSBT",
          });

          // Check if user wants to go back
          if (this.isBackOption(pastedPsbt)) {
            return false;
          }

          psbtBase64 = pastedPsbt.trim();
          break;
        }
        case "clipboard":
          // Read from clipboard with proper error handling
          try {
            const clipboardSpinner = ora("Reading from clipboard...").start();
            psbtBase64 = await clipboard.read();
            clipboardSpinner.succeed("PSBT read from clipboard");
          } catch (error) {
            return this.handleSpinnerError(
              clipboardSpinner,
              "Error reading from clipboard",
              error,
            );
          }
          break;
      }

      // Try to detect if this is a Caravan PSBT with proper error handling
      const detectSpinner = ora("Analyzing PSBT...").start();
      let caravanWallets;
      let caravanConfig;

      try {
        caravanWallets = await this.caravanService.listCaravanWallets();
        caravanConfig =
          await this.transactionService.detectCaravanWalletForPSBT(
            psbtBase64,
            caravanWallets,
          );
        detectSpinner.succeed("PSBT analysis complete");
      } catch (error) {
        return this.handleSpinnerError(
          detectSpinner,
          "Error analyzing PSBT",
          error,
        );
      }

      let privateKey: string;

      if (caravanConfig) {
        console.log(
          boxText(
            `This PSBT belongs to Caravan wallet: ${colors.highlight(caravanConfig.name)}`,
            { title: "Caravan PSBT Detected", titleColor: colors.success },
          ),
        );

        // Load private key data with proper error handling
        const keyDataSpinner = ora("Loading private key data...").start();
        let keyData;

        try {
          keyData =
            await this.caravanService.loadCaravanPrivateKeyData(caravanConfig);
          keyDataSpinner.succeed("Key data loaded");
        } catch (error) {
          keyDataSpinner.warn("Could not load key data");
          console.log(formatWarning("Will proceed with manual key entry"));
          keyData = null;
        }

        if (keyData && keyData.keyData.some((k) => k.privateKey)) {
          console.log(
            formatSuccess("Found configured private keys for this wallet."),
          );

          // Let user select which key to use with back option
          const availableKeys = keyData.keyData.filter((k) => k.privateKey);

          const keyOptions = availableKeys.map((key, index) => {
            const xpub = key.xpub;
            const keyName =
              caravanConfig.extendedPublicKeys.find((k) => k.xpub === xpub)
                ?.name || `Key #${index + 1}`;

            return {
              name: colors.highlight(`${keyName} (${truncate(xpub, 8)})`),
              value: index,
            };
          });

          if (keyOptions.length > 0) {
            const keyIndex = await select({
              message: "Select a key to sign with:",
              choices: this.addBackOption(keyOptions),
            });

            // Check if user wants to go back
            if (this.isBackOption(keyIndex)) {
              return false;
            }

            privateKey = availableKeys[keyIndex].privateKey;
          } else {
            console.log(formatWarning("No private keys available."));

            // Ask for manual entry with back option
            privateKey = await this.passwordWithBack({
              message: "Enter the private key (WIF format):",
              validate: (input) =>
                input.trim() !== "" ? true : "Please enter a valid private key",
            });

            // Check if user wants to go back
            if (this.isBackOption(privateKey)) {
              return false;
            }

            privateKey = privateKey.trim();
          }
        } else {
          console.log(
            formatWarning("No private key data found for this wallet."),
          );

          // Ask for manual entry with back option
          privateKey = await this.passwordWithBack({
            message: "Enter the private key (WIF format):",
            validate: (input) =>
              input.trim() !== "" ? true : "Please enter a valid private key",
          });

          // Check if user wants to go back
          if (this.isBackOption(privateKey)) {
            return false;
          }

          privateKey = privateKey.trim();
        }

        // For Caravan, we need to extract signatures with proper error handling
        console.log(colors.info("\nSigning PSBT for Caravan..."));

        const signSpinner = ora("Extracting signatures for Caravan...").start();
        let signedResult;

        try {
          signedResult =
            await this.transactionService.extractSignaturesForCaravan(
              psbtBase64,
              privateKey,
            );
          signSpinner.succeed("PSBT signed successfully for Caravan");
        } catch (error) {
          return this.handleSpinnerError(
            signSpinner,
            "Error signing PSBT",
            error,
          );
        }

        // Handle the signed result with back option
        const actionOptions = [
          {
            name: colors.highlight("Save to file (JSON format)"),
            value: "file",
          },
          {
            name: colors.highlight("Copy to clipboard (JSON format)"),
            value: "clipboard",
          },
          { name: colors.highlight("Display"), value: "display" },
          {
            name: colors.highlight("Just continue with the base64 PSBT"),
            value: "psbt",
          },
        ];

        const action = await select({
          message: "What would you like to do with the Caravan signature data?",
          choices: this.addBackOption(actionOptions),
        });

        // Check if user wants to go back
        if (this.isBackOption(action)) {
          return false;
        }

        // Format the output as JSON
        const caravanJson = JSON.stringify(
          {
            hex: signedResult.base64,
            signatures: signedResult.signatures,
            signingPubKey: signedResult.signingPubKey,
          },
          null,
          2,
        );

        switch (action) {
          case "file": {
            // Get filename with back option
            const filename = await this.inputWithBack({
              message: "Enter file name:",
              default: "caravan-signatures.json",
            });

            // Check if user wants to go back
            if (this.isBackOption(filename)) {
              return false;
            }

            // Save with proper error handling
            const saveSpinner = ora(
              `Saving signatures to ${filename}...`,
            ).start();
            try {
              await fs.writeFile(filename, caravanJson);
              saveSpinner.succeed("Caravan signature data saved");
            } catch (error) {
              return this.handleSpinnerError(
                saveSpinner,
                `Error saving to ${filename}`,
                error,
              );
            }

            console.log(
              boxText(
                `The signature data has been saved to ${colors.highlight(filename)}`,
                { title: "Signatures Saved", titleColor: colors.success },
              ),
            );
            break;
          }
          case "clipboard":
            // Copy with proper error handling
            const clipboardSpinner = ora(
              "Copying signatures to clipboard...",
            ).start();
            try {
              await clipboard.write(caravanJson);
              clipboardSpinner.succeed("Signature data copied to clipboard");
            } catch (error) {
              return this.handleSpinnerError(
                clipboardSpinner,
                "Error copying to clipboard",
                error,
              );
            }
            break;
          case "display":
            console.log(
              boxText(colors.code(caravanJson), {
                title: "Caravan Signature Data (JSON)",
                titleColor: colors.info,
              }),
            );
            break;
          case "psbt":
            return this.handleSignedPSBT(signedResult.base64);
        }

        return signedResult;
      } else {
        // Standard PSBT signing
        console.log(
          colors.info("\nStandard PSBT signing (not Caravan-specific)."),
        );

        // Ask for private key with back option
        privateKey = await this.passwordWithBack({
          message: "Enter the private key (WIF format):",
          validate: (input) =>
            input.trim() !== "" ? true : "Please enter a valid private key",
        });

        // Check if user wants to go back
        if (this.isBackOption(privateKey)) {
          return false;
        }

        privateKey = privateKey.trim();

        // Sign the PSBT with proper error handling
        console.log(colors.info("\nSigning PSBT with private key..."));

        const signSpinner = ora("Signing PSBT...").start();
        let signedPsbt;

        try {
          signedPsbt = await this.transactionService.signPSBTWithPrivateKey(
            psbtBase64,
            privateKey,
          );
          signSpinner.succeed("PSBT signed successfully");
        } catch (error) {
          return this.handleSpinnerError(
            signSpinner,
            "Error signing PSBT",
            error,
          );
        }

        return this.handleSignedPSBT(signedPsbt);
      }
    } catch (error) {
      console.error(formatError("Error signing PSBT with private key:"), error);
      return false;
    }
  }

  /**
   * Helper method to handle a signed PSBT
   */
  private async handleSignedPSBT(
    signedPsbt: string,
  ): Promise<string | false | null> {
    // Handle the signed PSBT with back option
    const actionOptions = [
      { name: colors.highlight("Save to file"), value: "file" },
      { name: colors.highlight("Copy to clipboard"), value: "clipboard" },
      { name: colors.highlight("Display"), value: "display" },
      {
        name: colors.highlight("Try to finalize and broadcast"),
        value: "finalize",
      },
    ];

    const action = await select({
      message: "What would you like to do with the signed PSBT?",
      choices: this.addBackOption(actionOptions),
    });

    // Check if user wants to go back
    if (this.isBackOption(action)) {
      return false;
    }

    switch (action) {
      case "file": {
        // Get filename with back option
        const filename = await this.inputWithBack({
          message: "Enter file name:",
          default: "signed-psbt.txt",
        });

        // Check if user wants to go back
        if (this.isBackOption(filename)) {
          return false;
        }

        // Save with proper error handling
        const saveSpinner = ora(`Saving signed PSBT to ${filename}...`).start();
        try {
          await fs.writeFile(filename, signedPsbt);
          saveSpinner.succeed("Signed PSBT saved");
        } catch (error) {
          return this.handleSpinnerError(
            saveSpinner,
            `Error saving to ${filename}`,
            error,
          );
        }

        console.log(
          boxText(
            `The signed PSBT has been saved to ${colors.highlight(filename)}`,
            { title: "Signed PSBT Saved", titleColor: colors.success },
          ),
        );
        break;
      }
      case "clipboard":
        // Copy with proper error handling
        const clipboardSpinner = ora(
          "Copying signed PSBT to clipboard...",
        ).start();
        try {
          await clipboard.write(signedPsbt);
          clipboardSpinner.succeed("Signed PSBT copied to clipboard");
        } catch (error) {
          return this.handleSpinnerError(
            clipboardSpinner,
            "Error copying to clipboard",
            error,
          );
        }
        break;
      case "display":
        console.log(
          boxText(colors.code(signedPsbt), {
            title: "Signed PSBT (Base64)",
            titleColor: colors.info,
          }),
        );
        break;
      case "finalize":
        return this.finalizeAndBroadcastPSBT(signedPsbt);
    }

    return signedPsbt;
  }

  /**
   * Finalize and broadcast a PSBT
   */
  async finalizeAndBroadcastPSBT(
    psbtBase64?: string,
  ): Promise<string | false | null> {
    displayCommandTitle("Finalize and Broadcast PSBT");

    try {
      // If no PSBT provided, get it from the user with back option
      if (!psbtBase64) {
        const sourceOptions = [
          { name: colors.highlight("Load from file"), value: "file" },
          { name: colors.highlight("Paste Base64 string"), value: "paste" },
          {
            name: colors.highlight("Read from clipboard"),
            value: "clipboard",
          },
        ];

        const source = await select({
          message: "How would you like to provide the PSBT?",
          choices: this.addBackOption(sourceOptions),
        });

        // Check if user wants to go back
        if (this.isBackOption(source)) {
          return false;
        }

        switch (source) {
          case "file": {
            // Get filename with back option
            const filename = await this.inputWithBack({
              message: "Enter path to PSBT file:",
              validate: (input) =>
                fs.existsSync(input) ? true : "File does not exist",
            });

            // Check if user wants to go back
            if (this.isBackOption(filename)) {
              return false;
            }

            // Read with proper error handling
            const readSpinner = ora(`Reading PSBT from ${filename}...`).start();
            try {
              psbtBase64 = (await fs.readFile(filename, "utf8")).trim();
              readSpinner.succeed("PSBT loaded from file");
            } catch (error) {
              return this.handleSpinnerError(
                readSpinner,
                `Error reading from ${filename}`,
                error,
              );
            }
            break;
          }
          case "paste": {
            // Get PSBT string with back option
            const pastedPsbt = await this.inputWithBack({
              message: "Paste the base64-encoded PSBT:",
              validate: (input) =>
                input.trim() !== "" ? true : "Please enter a valid PSBT",
            });

            // Check if user wants to go back
            if (this.isBackOption(pastedPsbt)) {
              return false;
            }

            psbtBase64 = pastedPsbt.trim();
            break;
          }
          case "clipboard":
            // Read from clipboard with proper error handling
            try {
              const clipboardSpinner = ora("Reading from clipboard...").start();
              psbtBase64 = await clipboard.read();
              clipboardSpinner.succeed("PSBT read from clipboard");
            } catch (error) {
              return this.handleSpinnerError(
                clipboardSpinner,
                "Error reading from clipboard",
                error,
              );
            }
            break;
        }
      }

      // Finalize the PSBT with proper error handling
      console.log(colors.info("\nFinalizing PSBT..."));

      const finalizeSpinner = ora("Finalizing PSBT...").start();
      let finalizedPsbt;

      try {
        finalizedPsbt = await this.transactionService.finalizePSBT(psbtBase64);
        finalizeSpinner.succeed("PSBT finalization complete");
      } catch (error) {
        return this.handleSpinnerError(
          finalizeSpinner,
          "Error finalizing PSBT",
          error,
        );
      }

      if (!finalizedPsbt.complete) {
        console.log(
          boxText(
            formatWarning(
              "PSBT is not complete yet. Additional signatures may be required.",
            ),
            { title: "Incomplete PSBT", titleColor: colors.warning },
          ),
        );

        // Show PSBT details with proper error handling
        try {
          const decodeSpinner = ora("Analyzing incomplete PSBT...").start();
          const decodedPsbt =
            await this.transactionService.decodePSBT(psbtBase64);
          decodeSpinner.succeed("PSBT analysis complete");

          console.log(
            boxText(
              `Inputs: ${colors.highlight(decodedPsbt.tx.vin.length.toString())}\n` +
                `Outputs: ${colors.highlight(decodedPsbt.tx.vout.length.toString())}\n` +
                (decodedPsbt.fee
                  ? `Fee: ${colors.highlight(formatBitcoin(decodedPsbt.fee))}`
                  : ""),
              { title: "PSBT Details", titleColor: colors.info },
            ),
          );
        } catch (error) {
          console.log(formatWarning("Could not decode PSBT for analysis."));
        }

        // Ask about signing again with back option
        const signOptions = [
          {
            name: colors.highlight("Yes, sign with another key"),
            value: "yes",
          },
          { name: colors.highlight("No, don't sign again"), value: "no" },
        ];

        const signAgain = await select({
          message: "Would you like to sign with another key?",
          choices: this.addBackOption(signOptions),
        });

        // Check if user wants to go back
        if (this.isBackOption(signAgain)) {
          return false;
        }

        if (signAgain === "yes") {
          // Ask how to sign with back option
          const methodOptions = [
            { name: colors.highlight("Sign with wallet"), value: "wallet" },
            {
              name: colors.highlight("Sign with private key"),
              value: "privkey",
            },
          ];

          const method = await select({
            message: "How would you like to sign?",
            choices: this.addBackOption(methodOptions),
          });

          // Check if user wants to go back
          if (this.isBackOption(method)) {
            return false;
          }

          if (method === "wallet") {
            return this.signPSBTWithWallet(psbtBase64);
          } else {
            return this.signPSBTWithPrivateKey();
          }
        }

        // Handle the incomplete PSBT with back option
        const actionOptions = [
          { name: colors.highlight("Save to file"), value: "file" },
          { name: colors.highlight("Copy to clipboard"), value: "clipboard" },
          { name: colors.highlight("Display"), value: "display" },
        ];

        const action = await select({
          message: "What would you like to do with the PSBT?",
          choices: this.addBackOption(actionOptions),
        });

        // Check if user wants to go back
        if (this.isBackOption(action)) {
          return false;
        }

        switch (action) {
          case "file": {
            // Get filename with back option
            const filename = await this.inputWithBack({
              message: "Enter file name:",
              default: "incomplete-psbt.txt",
            });

            // Check if user wants to go back
            if (this.isBackOption(filename)) {
              return false;
            }

            // Save with proper error handling
            const saveSpinner = ora(`Saving PSBT to ${filename}...`).start();
            try {
              await fs.writeFile(filename, psbtBase64);
              saveSpinner.succeed("PSBT saved");
            } catch (error) {
              return this.handleSpinnerError(
                saveSpinner,
                `Error saving to ${filename}`,
                error,
              );
            }

            console.log(
              boxText(
                `The incomplete PSBT has been saved to ${colors.highlight(filename)}`,
                { title: "PSBT Saved", titleColor: colors.info },
              ),
            );
            break;
          }
          case "clipboard":
            // Copy with proper error handling
            const clipboardSpinner = ora(
              "Copying PSBT to clipboard...",
            ).start();
            try {
              await clipboard.write(psbtBase64);
              clipboardSpinner.succeed("PSBT copied to clipboard");
            } catch (error) {
              return this.handleSpinnerError(
                clipboardSpinner,
                "Error copying to clipboard",
                error,
              );
            }
            break;
          case "display":
            console.log(
              boxText(colors.code(psbtBase64), {
                title: "Incomplete PSBT (Base64)",
                titleColor: colors.info,
              }),
            );
            break;
        }

        return false;
      }

      console.log(
        boxText(formatSuccess("PSBT finalized successfully!"), {
          title: "PSBT Ready for Broadcast",
          titleColor: colors.success,
        }),
      );

      // Ask about broadcasting with back option
      const broadcastOptions = [
        { name: colors.highlight("Yes, broadcast transaction"), value: "yes" },
        { name: colors.highlight("No, don't broadcast"), value: "no" },
      ];

      const broadcast = await select({
        message: "Would you like to broadcast the transaction?",
        choices: this.addBackOption(broadcastOptions),
      });

      // Check if user wants to go back
      if (this.isBackOption(broadcast)) {
        return false;
      }

      if (broadcast === "yes") {
        console.log(colors.info("\nBroadcasting transaction..."));

        // Broadcast with proper error handling
        const broadcastSpinner = ora(
          "Broadcasting transaction to network...",
        ).start();
        let txid;

        try {
          txid = await this.transactionService.broadcastTransaction(
            finalizedPsbt.hex,
          );
          broadcastSpinner.succeed("Transaction broadcast successfully");
        } catch (error) {
          return this.handleSpinnerError(
            broadcastSpinner,
            "Error broadcasting transaction",
            error,
          );
        }

        console.log(
          boxText(`Transaction ID: ${colors.highlight(txid)}`, {
            title: "Transaction Broadcast",
            titleColor: colors.success,
          }),
        );

        // Ask about mining with back option
        const mineOptions = [
          { name: colors.highlight("Yes, mine a block"), value: "yes" },
          { name: colors.highlight("No, don't mine"), value: "no" },
        ];

        const mineBlock = await select({
          message: "Mine a block to confirm the transaction?",
          choices: this.addBackOption(mineOptions),
        });

        // Check if user wants to go back
        if (this.isBackOption(mineBlock)) {
          return false;
        }

        if (mineBlock === "yes") {
          // Get a wallet for mining with proper error handling
          const walletsSpinner = ora("Loading wallets for mining...").start();
          let wallets;

          try {
            wallets = await this.bitcoinService.listWallets();
            walletsSpinner.succeed("Wallets loaded");
          } catch (error) {
            return this.handleSpinnerError(
              walletsSpinner,
              "Error loading wallets",
              error,
            );
          }

          if (wallets.length === 0) {
            console.log(formatWarning("\nNo wallets found for mining."));
            return txid;
          }

          // Select mining wallet with back option
          const miningWallet = await select({
            message: "Select a wallet to mine to:",
            choices: this.addBackOption(
              wallets.map((w) => ({
                name: colors.highlight(w),
                value: w,
              })),
            ),
          });

          // Check if user wants to go back
          if (this.isBackOption(miningWallet)) {
            return false;
          }

          // Generate mining address with proper error handling
          const addressSpinner = ora(
            `Generating address for mining...`,
          ).start();
          let miningAddress;

          try {
            miningAddress =
              await this.bitcoinService.getNewAddress(miningWallet);
            addressSpinner.succeed(`Mining to address: ${miningAddress}`);
          } catch (error) {
            return this.handleSpinnerError(
              addressSpinner,
              "Error generating mining address",
              error,
            );
          }

          // Mine block with proper error handling
          const mineSpinner = ora("Mining a block...").start();
          let blockHashes;

          try {
            blockHashes = await this.bitcoinService.generateToAddress(
              1,
              miningAddress,
            );
            mineSpinner.succeed("Block mined successfully");
          } catch (error) {
            return this.handleSpinnerError(
              mineSpinner,
              "Error mining block",
              error,
            );
          }

          console.log(
            boxText(`Block hash: ${colors.highlight(blockHashes[0])}`, {
              title: "Block Mined",
              titleColor: colors.success,
            }),
          );
        }

        return txid;
      } else {
        // Handle transaction hex with back option
        const actionOptions = [
          { name: colors.highlight("Save to file"), value: "file" },
          { name: colors.highlight("Copy to clipboard"), value: "clipboard" },
          { name: colors.highlight("Display"), value: "display" },
        ];

        const action = await select({
          message: "What would you like to do with the transaction hex?",
          choices: this.addBackOption(actionOptions),
        });

        // Check if user wants to go back
        if (this.isBackOption(action)) {
          return false;
        }

        switch (action) {
          case "file": {
            // Get filename with back option
            const filename = await this.inputWithBack({
              message: "Enter file name:",
              default: "transaction.hex",
            });

            // Check if user wants to go back
            if (this.isBackOption(filename)) {
              return false;
            }

            // Save with proper error handling
            const saveSpinner = ora(
              `Saving transaction hex to ${filename}...`,
            ).start();
            try {
              await fs.writeFile(filename, finalizedPsbt.hex);
              saveSpinner.succeed("Transaction hex saved");
            } catch (error) {
              return this.handleSpinnerError(
                saveSpinner,
                `Error saving to ${filename}`,
                error,
              );
            }

            console.log(
              boxText(
                `The transaction hex has been saved to ${colors.highlight(filename)}`,
                { title: "Transaction Saved", titleColor: colors.success },
              ),
            );
            break;
          }
          case "clipboard":
            // Copy with proper error handling
            const clipboardSpinner = ora(
              "Copying transaction hex to clipboard...",
            ).start();
            try {
              await clipboard.write(finalizedPsbt.hex);
              clipboardSpinner.succeed("Transaction hex copied to clipboard");
            } catch (error) {
              return this.handleSpinnerError(
                clipboardSpinner,
                "Error copying to clipboard",
                error,
              );
            }
            break;
          case "display":
            console.log(
              boxText(colors.code(finalizedPsbt.hex), {
                title: "Transaction hex",
                titleColor: colors.info,
              }),
            );
            break;
        }

        return finalizedPsbt.hex;
      }
    } catch (error) {
      console.error(
        formatError("Error finalizing and broadcasting PSBT:"),
        error,
      );
      return false;
    }
  }

  /**
   * Analyze a PSBT (decode and show details)
   */
  async analyzePSBT(): Promise<any | false | null> {
    displayCommandTitle("Analyze PSBT");

    try {
      // Get the PSBT with back option
      const sourceOptions = [
        { name: colors.highlight("Load from file"), value: "file" },
        { name: colors.highlight("Paste Base64 string"), value: "paste" },
        { name: colors.highlight("Read from clipboard"), value: "clipboard" },
      ];

      const source = await select({
        message: "How would you like to provide the PSBT?",
        choices: this.addBackOption(sourceOptions),
      });

      // Check if user wants to go back
      if (this.isBackOption(source)) {
        return false;
      }

      let psbtBase64: string;

      switch (source) {
        case "file": {
          // Get filename with back option
          const filename = await this.inputWithBack({
            message: "Enter path to PSBT file:",
            validate: (input) =>
              fs.existsSync(input) ? true : "File does not exist",
          });

          // Check if user wants to go back
          if (this.isBackOption(filename)) {
            return false;
          }

          // Read with proper error handling
          const readSpinner = ora(`Reading PSBT from ${filename}...`).start();
          try {
            psbtBase64 = (await fs.readFile(filename, "utf8")).trim();
            readSpinner.succeed("PSBT loaded from file");
          } catch (error) {
            return this.handleSpinnerError(
              readSpinner,
              `Error reading from ${filename}`,
              error,
            );
          }
          break;
        }
        case "paste": {
          // Get PSBT string with back option
          const pastedPsbt = await this.inputWithBack({
            message: "Paste the base64-encoded PSBT:",
            validate: (input) =>
              input.trim() !== "" ? true : "Please enter a valid PSBT",
          });

          // Check if user wants to go back
          if (this.isBackOption(pastedPsbt)) {
            return false;
          }

          psbtBase64 = pastedPsbt.trim();
          break;
        }
        case "clipboard":
          // Read from clipboard with proper error handling
          try {
            const clipboardSpinner = ora("Reading from clipboard...").start();
            psbtBase64 = await clipboard.read();
            clipboardSpinner.succeed("PSBT read from clipboard");
          } catch (error) {
            return this.handleSpinnerError(
              clipboardSpinner,
              "Error reading from clipboard",
              error,
            );
          }
          break;
      }

      // Detect Caravan PSBT with proper error handling
      const detectSpinner = ora(
        "Detecting if this is a Caravan PSBT...",
      ).start();
      let caravanWallets;
      let caravanConfig;

      try {
        caravanWallets = await this.caravanService.listCaravanWallets();
        caravanConfig =
          await this.transactionService.detectCaravanWalletForPSBT(
            psbtBase64,
            caravanWallets,
          );
      } catch (error) {
        detectSpinner.warn("Error detecting Caravan wallet");
        console.log(
          formatWarning("Could not check if this is a Caravan PSBT."),
        );
        caravanConfig = null;
      }

      if (caravanConfig) {
        detectSpinner.succeed("Caravan wallet detected");
        console.log(
          boxText(
            `PSBT belongs to Caravan wallet: ${colors.highlight(caravanConfig.name)}\n` +
              `Quorum: ${colors.highlight(`${caravanConfig.quorum.requiredSigners} of ${caravanConfig.quorum.totalSigners}`)}`,
            { title: "Caravan Wallet Information", titleColor: colors.success },
          ),
        );
      } else {
        detectSpinner.succeed("PSBT analysis complete");
      }

      // Decode the PSBT with proper error handling
      const decodeSpinner = ora("Decoding PSBT...").start();
      let decodedPsbt;

      try {
        decodedPsbt = await this.transactionService.decodePSBT(psbtBase64);
        decodeSpinner.succeed("PSBT decoded successfully");
      } catch (error) {
        return this.handleSpinnerError(
          decodeSpinner,
          "Error decoding PSBT",
          error,
        );
      }

      // Display basic information
      const basicInfo = `
${keyValue("Version", decodedPsbt.tx.version.toString())}
${keyValue("Locktime", decodedPsbt.tx.locktime.toString())}
${keyValue("Inputs", decodedPsbt.tx.vin.length.toString())}
${keyValue("Outputs", decodedPsbt.tx.vout.length.toString())}
${
  decodedPsbt.fee
    ? keyValue("Fee", formatBitcoin(decodedPsbt.fee)) +
      "\n" +
      keyValue(
        "Fee rate",
        `${(decodedPsbt.fee / (decodedPsbt.tx.vsize / 1000)).toFixed(8)} BTC/kB`,
      )
    : ""
}`;

      console.log(
        boxText(basicInfo, {
          title: "Transaction Details",
          titleColor: colors.header,
        }),
      );

      // Ask for detail level with back option
      const levelOptions = [
        { name: colors.highlight("Basic"), value: "basic" },
        { name: colors.highlight("Detailed"), value: "detailed" },
        { name: colors.highlight("Raw JSON"), value: "raw" },
      ];

      const level = await select({
        message: "How much detail would you like to see?",
        choices: this.addBackOption(levelOptions),
      });

      // Check if user wants to go back
      if (this.isBackOption(level)) {
        return false;
      }

      if (level === "detailed" || level === "raw") {
        // Display inputs
        console.log("\n" + colors.header("=== Inputs ==="));
        decodedPsbt.inputs.forEach((input, index) => {
          const inputInfo = `
Input #${index + 1}:
  ${keyValue("TXID", truncate(decodedPsbt.tx.vin[index].txid, 15))}
  ${keyValue("VOUT", decodedPsbt.tx.vin[index].vout.toString())}
  ${keyValue("Sequence", decodedPsbt.tx.vin[index].sequence.toString())}
  ${
    input.has_utxo
      ? keyValue("Amount", formatBitcoin(input.utxo.amount)) +
        "\n  " +
        keyValue("Script Type", input.utxo.scriptPubKey.type || "Unknown") +
        "\n  " +
        keyValue("Address", input.utxo.scriptPubKey.address || "Unknown")
      : ""
  }
  ${input.has_sighash ? keyValue("Sighash", input.sighash_type.toString()) : ""}
  ${
    input.partial_signatures
      ? keyValue("Signatures", input.partial_signatures.length.toString()) +
        input.partial_signatures
          .map(
            (sig, sigIndex) =>
              `\n    Signature #${sigIndex + 1}: ${sig.pubkey ? truncate(sig.pubkey, 8) : "Unknown"}`,
          )
          .join("")
      : ""
  }`;

          console.log(boxText(inputInfo, { padding: 1 }));
        });

        // Display outputs
        console.log("\n" + colors.header("=== Outputs ==="));
        decodedPsbt.tx.vout.forEach((output, index) => {
          const outputInfo = `
Output #${index + 1}:
  ${keyValue("Amount", formatBitcoin(output.value))}
  ${keyValue("Script Type", output.scriptPubKey.type || "Unknown")}
  ${keyValue("Address", output.scriptPubKey.address || "Unknown")}`;

          console.log(boxText(outputInfo, { padding: 1 }));
        });
      }

      // Display raw JSON if requested
      if (level === "raw") {
        console.log("\n" + colors.header("=== Raw PSBT Data ==="));
        console.log(JSON.stringify(decodedPsbt, null, 2));
      }

      // Ask about saving with back option
      const saveOptions = [
        { name: colors.highlight("Yes, save decoded PSBT"), value: "yes" },
        { name: colors.highlight("No, skip saving"), value: "no" },
      ];

      const save = await select({
        message: "Would you like to save the decoded PSBT to a file?",
        choices: this.addBackOption(saveOptions),
      });

      // Check if user wants to go back
      if (this.isBackOption(save)) {
        return false;
      }

      if (save === "yes") {
        // Get filename with back option
        const filename = await this.inputWithBack({
          message: "Enter file name:",
          default: "decoded-psbt.json",
        });

        // Check if user wants to go back
        if (this.isBackOption(filename)) {
          return false;
        }

        // Save with proper error handling
        const saveSpinner = ora(
          `Saving decoded PSBT to ${filename}...`,
        ).start();
        try {
          await fs.writeJson(filename, decodedPsbt, { spaces: 2 });
          saveSpinner.succeed("Decoded PSBT saved");
        } catch (error) {
          return this.handleSpinnerError(
            saveSpinner,
            `Error saving to ${filename}`,
            error,
          );
        }

        console.log(formatSuccess(`Decoded PSBT saved to ${filename}`));
      }

      // Ask what action to take next with back option
      const actionOptions = [
        { name: colors.highlight("Sign with wallet"), value: "wallet" },
        { name: colors.highlight("Sign with private key"), value: "privkey" },
        {
          name: colors.highlight("Try to finalize and broadcast"),
          value: "finalize",
        },
        { name: colors.highlight("Nothing, just exit"), value: "exit" },
      ];

      const action = await select({
        message: "What would you like to do with this PSBT?",
        choices: this.addBackOption(actionOptions),
      });

      // Check if user wants to go back
      if (this.isBackOption(action)) {
        return false;
      }

      switch (action) {
        case "wallet":
          return this.signPSBTWithWallet(psbtBase64);
        case "privkey":
          return this.signPSBTWithPrivateKey();
        case "finalize":
          return this.finalizeAndBroadcastPSBT(psbtBase64);
        case "exit":
          return decodedPsbt;
      }

      return decodedPsbt;
    } catch (error) {
      console.error(formatError("Error analyzing PSBT:"), error);
      return false;
    }
  }
}
