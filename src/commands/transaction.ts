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
   * Create a PSBT from a watch-only wallet
   */
  async createPSBT(): Promise<string | null> {
    displayCommandTitle("Create New PSBT");

    try {
      // First, list all wallets
      const walletsSpinner = ora("Loading wallets...").start();
      const wallets = await this.bitcoinService.listWallets();
      walletsSpinner.succeed("Wallets loaded");

      if (wallets.length === 0) {
        console.log(formatWarning("No wallets found."));
        return null;
      }

      // Select the wallet
      const selectedWallet = await select({
        message: "Select a wallet to create the PSBT from:",
        choices: wallets.map((w) => ({
          name: colors.highlight(w),
          value: w,
        })),
      });

      // Get wallet info to show balance
      const infoSpinner = ora(
        `Loading wallet information for ${selectedWallet}...`,
      ).start();
      const walletInfo =
        await this.bitcoinService.getWalletInfo(selectedWallet);
      infoSpinner.succeed("Wallet information loaded");

      console.log(keyValue("Selected wallet", selectedWallet));
      console.log(
        keyValue("Available balance", formatBitcoin(walletInfo.balance)),
      );

      if (walletInfo.balance <= 0) {
        console.log(
          formatWarning("Wallet has no funds. Please fund it first."),
        );
        return null;
      }

      // Configure outputs
      const outputs = [];
      let totalAmount = 0;

      // Ask for number of outputs
      const numOutputs = await number({
        message: "How many outputs do you want to create?",
        validate: (input) =>
          input! > 0 ? true : "Please enter a positive number",
        default: 1,
      });

      console.log(divider());
      console.log(colors.header("Output Configuration"));

      // Collect output details
      for (let i = 0; i < numOutputs!; i++) {
        console.log(colors.info(`\nOutput #${i + 1}:`));

        const address = await input({
          message: `Enter destination address for output #${i + 1}:`,
          validate: (input) =>
            input.trim() !== "" ? true : "Please enter a valid address",
        });

        const amount = await number({
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

      // Confirm
      const confirm = await select({
        message: "Proceed with creating the PSBT?",
        choices: [
          { name: colors.success("Yes, create PSBT"), value: "yes" },
          { name: colors.error("No, cancel"), value: "no" },
        ],
      });

      if (confirm === "no") {
        console.log(formatWarning("PSBT creation cancelled."));
        return null;
      }

      // Create the PSBT
      const createSpinner = ora("Creating PSBT...").start();
      const psbt = await this.transactionService.createPSBT(
        selectedWallet,
        outputs,
      );
      createSpinner.succeed("PSBT created successfully");

      if (!psbt) {
        console.log(formatError("Failed to create PSBT."));
        return null;
      }

      // Handle the PSBT
      const action = await select({
        message: "What would you like to do with the PSBT?",
        choices: [
          { name: colors.highlight("Save to file"), value: "file" },
          { name: colors.highlight("Copy to clipboard"), value: "clipboard" },
          { name: colors.highlight("Display"), value: "display" },
          { name: colors.highlight("Process with this wallet"), value: "sign" },
        ],
      });

      switch (action) {
        case "file": {
          const filename = await input({
            message: "Enter file name:",
            default: "unsigned-psbt.txt",
          });

          const saveSpinner = ora(`Saving PSBT to ${filename}...`).start();
          await fs.writeFile(filename, psbt);
          saveSpinner.succeed("PSBT saved");

          console.log(
            boxText(
              `The PSBT has been saved to ${colors.highlight(filename)}`,
              { title: "PSBT Saved", titleColor: colors.success },
            ),
          );
          break;
        }
        case "clipboard":
          const clipboardSpinner = ora("Copying PSBT to clipboard...").start();
          await clipboard.write(psbt);
          clipboardSpinner.succeed("PSBT copied to clipboard");
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
      return null;
    }
  }

  /**
   * Sign a PSBT with a wallet
   */
  async signPSBTWithWallet(
    psbtBase64?: string,
    walletName?: string,
  ): Promise<string | null> {
    displayCommandTitle("Sign PSBT with Wallet");

    try {
      // If no PSBT provided, get it from the user
      if (!psbtBase64) {
        const source = await select({
          message: "How would you like to provide the PSBT?",
          choices: [
            { name: colors.highlight("Load from file"), value: "file" },
            { name: colors.highlight("Paste Base64 string"), value: "paste" },
            {
              name: colors.highlight("Read from clipboard"),
              value: "clipboard",
            },
          ],
        });

        switch (source) {
          case "file": {
            const filename = await input({
              message: "Enter path to PSBT file:",
              validate: (input) =>
                fs.existsSync(input) ? true : "File does not exist",
            });

            const readSpinner = ora(`Reading PSBT from ${filename}...`).start();
            psbtBase64 = (await fs.readFile(filename, "utf8")).trim();
            readSpinner.succeed("PSBT loaded from file");
            break;
          }
          case "paste": {
            psbtBase64 = await input({
              message: "Paste the base64-encoded PSBT:",
              validate: (input) =>
                input.trim() !== "" ? true : "Please enter a valid PSBT",
            });

            psbtBase64 = psbtBase64.trim();
            break;
          }
          case "clipboard":
            try {
              const clipboardSpinner = ora("Reading from clipboard...").start();
              psbtBase64 = await clipboard.read();
              clipboardSpinner.succeed("PSBT read from clipboard");
            } catch (error) {
              console.error(
                formatError("Error reading from clipboard:"),
                error,
              );
              return null;
            }
            break;
        }
      }

      // Try to decode the PSBT for inspection
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

      // If no wallet provided, ask user to select one
      if (!walletName) {
        const walletsSpinner = ora("Loading wallets...").start();
        const wallets = await this.bitcoinService.listWallets();
        walletsSpinner.succeed("Wallets loaded");

        if (wallets.length === 0) {
          console.log(formatWarning("No wallets found."));
          return null;
        }

        walletName = await select({
          message: "Select a wallet to sign with:",
          choices: wallets.map((w) => ({
            name: colors.highlight(w),
            value: w,
          })),
        });
      }

      // Sign the PSBT with the selected wallet
      console.log(colors.info(`\nSigning PSBT with wallet "${walletName}"...`));

      const signSpinner = ora("Signing PSBT...").start();
      const signedPsbt = await this.transactionService.processPSBT(
        walletName,
        psbtBase64,
      );
      signSpinner.succeed("PSBT signed successfully");

      // Handle the signed PSBT
      const action = await select({
        message: "What would you like to do with the signed PSBT?",
        choices: [
          { name: colors.highlight("Save to file"), value: "file" },
          { name: colors.highlight("Copy to clipboard"), value: "clipboard" },
          { name: colors.highlight("Display"), value: "display" },
          {
            name: colors.highlight("Try to finalize and broadcast"),
            value: "finalize",
          },
        ],
      });

      switch (action) {
        case "file": {
          const filename = await input({
            message: "Enter file name:",
            default: "signed-psbt.txt",
          });

          const saveSpinner = ora(
            `Saving signed PSBT to ${filename}...`,
          ).start();
          await fs.writeFile(filename, signedPsbt);
          saveSpinner.succeed("Signed PSBT saved");

          console.log(
            boxText(
              `The signed PSBT has been saved to ${colors.highlight(filename)}`,
              { title: "Signed PSBT Saved", titleColor: colors.success },
            ),
          );
          break;
        }
        case "clipboard":
          const clipboardSpinner = ora(
            "Copying signed PSBT to clipboard...",
          ).start();
          await clipboard.write(signedPsbt);
          clipboardSpinner.succeed("Signed PSBT copied to clipboard");
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
      return null;
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
  async signPSBTWithPrivateKey(): Promise<any | null> {
    displayCommandTitle("Sign PSBT with Private Key");

    try {
      // Get the PSBT from the user
      const source = await select({
        message: "How would you like to provide the PSBT?",
        choices: [
          { name: colors.highlight("Load from file"), value: "file" },
          { name: colors.highlight("Paste Base64 string"), value: "paste" },
          { name: colors.highlight("Read from clipboard"), value: "clipboard" },
        ],
      });

      let psbtBase64: string;

      switch (source) {
        case "file": {
          const filename = await input({
            message: "Enter path to PSBT file:",
            validate: (input) =>
              fs.existsSync(input) ? true : "File does not exist",
          });

          const readSpinner = ora(`Reading PSBT from ${filename}...`).start();
          psbtBase64 = (await fs.readFile(filename, "utf8")).trim();
          readSpinner.succeed("PSBT loaded from file");
          break;
        }
        case "paste": {
          psbtBase64 = await input({
            message: "Paste the base64-encoded PSBT:",
            validate: (input) =>
              input.trim() !== "" ? true : "Please enter a valid PSBT",
          });

          psbtBase64 = psbtBase64.trim();
          break;
        }
        case "clipboard":
          try {
            const clipboardSpinner = ora("Reading from clipboard...").start();
            psbtBase64 = await clipboard.read();
            clipboardSpinner.succeed("PSBT read from clipboard");
          } catch (error) {
            console.error(formatError("Error reading from clipboard:"), error);
            return null;
          }
          break;
      }

      // Try to detect if this is a Caravan PSBT
      const detectSpinner = ora("Analyzing PSBT...").start();
      const caravanWallets = await this.caravanService.listCaravanWallets();
      const caravanConfig =
        await this.transactionService.detectCaravanWalletForPSBT(
          psbtBase64,
          caravanWallets,
        );
      detectSpinner.succeed("PSBT analysis complete");

      let privateKey: string;

      if (caravanConfig) {
        console.log(
          boxText(
            `This PSBT belongs to Caravan wallet: ${colors.highlight(caravanConfig.name)}`,
            { title: "Caravan PSBT Detected", titleColor: colors.success },
          ),
        );

        // Load private key data for this wallet
        const keyDataSpinner = ora("Loading private key data...").start();
        const keyData =
          await this.caravanService.loadCaravanPrivateKeyData(caravanConfig);
        keyDataSpinner.succeed("Key data loaded");

        if (keyData && keyData.keyData.some((k) => k.privateKey)) {
          console.log(
            formatSuccess("Found configured private keys for this wallet."),
          );

          // Let user select which key to use
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
              choices: keyOptions,
            });

            privateKey = availableKeys[keyIndex].privateKey;
          } else {
            console.log(formatWarning("No private keys available."));

            // Ask for manual entry
            privateKey = await password({
              message: "Enter the private key (WIF format):",
              validate: (input) =>
                input.trim() !== "" ? true : "Please enter a valid private key",
            });

            privateKey = privateKey.trim();
          }
        } else {
          console.log(
            formatWarning("No private key data found for this wallet."),
          );

          // Ask for manual entry
          privateKey = await password({
            message: "Enter the private key (WIF format):",
            validate: (input) =>
              input.trim() !== "" ? true : "Please enter a valid private key",
          });

          privateKey = privateKey.trim();
        }

        // For Caravan, we need to extract signatures in a special format
        console.log(colors.info("\nSigning PSBT for Caravan..."));

        const signSpinner = ora("Extracting signatures for Caravan...").start();
        const signedResult =
          await this.transactionService.extractSignaturesForCaravan(
            psbtBase64,
            privateKey,
          );
        signSpinner.succeed("PSBT signed successfully for Caravan");

        // Handle the signed result
        const action = await select({
          message: "What would you like to do with the Caravan signature data?",
          choices: [
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
          ],
        });

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
            const filename = await input({
              message: "Enter file name:",
              default: "caravan-signatures.json",
            });

            const saveSpinner = ora(
              `Saving signatures to ${filename}...`,
            ).start();
            await fs.writeFile(filename, caravanJson);
            saveSpinner.succeed("Caravan signature data saved");

            console.log(
              boxText(
                `The signature data has been saved to ${colors.highlight(filename)}`,
                { title: "Signatures Saved", titleColor: colors.success },
              ),
            );
            break;
          }
          case "clipboard":
            const clipboardSpinner = ora(
              "Copying signatures to clipboard...",
            ).start();
            await clipboard.write(caravanJson);
            clipboardSpinner.succeed("Signature data copied to clipboard");
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

        // Ask for private key
        privateKey = await password({
          message: "Enter the private key (WIF format):",
          validate: (input) =>
            input.trim() !== "" ? true : "Please enter a valid private key",
        });

        privateKey = privateKey.trim();

        // Sign the PSBT
        console.log(colors.info("\nSigning PSBT with private key..."));

        const signSpinner = ora("Signing PSBT...").start();
        const signedPsbt = await this.transactionService.signPSBTWithPrivateKey(
          psbtBase64,
          privateKey,
        );
        signSpinner.succeed("PSBT signed successfully");

        return this.handleSignedPSBT(signedPsbt);
      }
    } catch (error) {
      console.error(formatError("Error signing PSBT with private key:"), error);
      return null;
    }
  }

  /**
   * Helper method to handle a signed PSBT
   */
  private async handleSignedPSBT(signedPsbt: string): Promise<string | null> {
    const action = await select({
      message: "What would you like to do with the signed PSBT?",
      choices: [
        { name: colors.highlight("Save to file"), value: "file" },
        { name: colors.highlight("Copy to clipboard"), value: "clipboard" },
        { name: colors.highlight("Display"), value: "display" },
        {
          name: colors.highlight("Try to finalize and broadcast"),
          value: "finalize",
        },
      ],
    });

    switch (action) {
      case "file": {
        const filename = await input({
          message: "Enter file name:",
          default: "signed-psbt.txt",
        });

        const saveSpinner = ora(`Saving signed PSBT to ${filename}...`).start();
        await fs.writeFile(filename, signedPsbt);
        saveSpinner.succeed("Signed PSBT saved");

        console.log(
          boxText(
            `The signed PSBT has been saved to ${colors.highlight(filename)}`,
            { title: "Signed PSBT Saved", titleColor: colors.success },
          ),
        );
        break;
      }
      case "clipboard":
        const clipboardSpinner = ora(
          "Copying signed PSBT to clipboard...",
        ).start();
        await clipboard.write(signedPsbt);
        clipboardSpinner.succeed("Signed PSBT copied to clipboard");
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
  async finalizeAndBroadcastPSBT(psbtBase64?: string): Promise<string | null> {
    displayCommandTitle("Finalize and Broadcast PSBT");

    try {
      // If no PSBT provided, get it from the user
      if (!psbtBase64) {
        const source = await select({
          message: "How would you like to provide the PSBT?",
          choices: [
            { name: colors.highlight("Load from file"), value: "file" },
            { name: colors.highlight("Paste Base64 string"), value: "paste" },
            {
              name: colors.highlight("Read from clipboard"),
              value: "clipboard",
            },
          ],
        });

        switch (source) {
          case "file": {
            const filename = await input({
              message: "Enter path to PSBT file:",
              validate: (input) =>
                fs.existsSync(input) ? true : "File does not exist",
            });

            const readSpinner = ora(`Reading PSBT from ${filename}...`).start();
            psbtBase64 = (await fs.readFile(filename, "utf8")).trim();
            readSpinner.succeed("PSBT loaded from file");
            break;
          }
          case "paste": {
            psbtBase64 = await input({
              message: "Paste the base64-encoded PSBT:",
              validate: (input) =>
                input.trim() !== "" ? true : "Please enter a valid PSBT",
            });

            psbtBase64 = psbtBase64.trim();
            break;
          }
          case "clipboard":
            try {
              const clipboardSpinner = ora("Reading from clipboard...").start();
              psbtBase64 = await clipboard.read();
              clipboardSpinner.succeed("PSBT read from clipboard");
            } catch (error) {
              console.error(
                formatError("Error reading from clipboard:"),
                error,
              );
              return null;
            }
            break;
        }
      }

      // Finalize the PSBT
      console.log(colors.info("\nFinalizing PSBT..."));

      const finalizeSpinner = ora("Finalizing PSBT...").start();
      const finalizedPsbt =
        await this.transactionService.finalizePSBT(psbtBase64);
      finalizeSpinner.succeed("PSBT finalization complete");

      if (!finalizedPsbt.complete) {
        console.log(
          boxText(
            formatWarning(
              "PSBT is not complete yet. Additional signatures may be required.",
            ),
            { title: "Incomplete PSBT", titleColor: colors.warning },
          ),
        );

        // Show PSBT details
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

        // Ask if user wants to try signing with another key
        const signAgain = await confirm({
          message: "Would you like to sign with another key?",
          default: true,
        });

        if (signAgain) {
          // Ask how to sign
          const method = await select({
            message: "How would you like to sign?",
            choices: [
              { name: colors.highlight("Sign with wallet"), value: "wallet" },
              {
                name: colors.highlight("Sign with private key"),
                value: "privkey",
              },
            ],
          });

          if (method === "wallet") {
            return this.signPSBTWithWallet(psbtBase64);
          } else {
            return this.signPSBTWithPrivateKey();
          }
        }

        // Handle the incomplete PSBT
        const action = await select({
          message: "What would you like to do with the PSBT?",
          choices: [
            { name: colors.highlight("Save to file"), value: "file" },
            { name: colors.highlight("Copy to clipboard"), value: "clipboard" },
            { name: colors.highlight("Display"), value: "display" },
          ],
        });

        switch (action) {
          case "file": {
            const filename = await input({
              message: "Enter file name:",
              default: "incomplete-psbt.txt",
            });

            const saveSpinner = ora(`Saving PSBT to ${filename}...`).start();
            await fs.writeFile(filename, psbtBase64);
            saveSpinner.succeed("PSBT saved");

            console.log(
              boxText(
                `The incomplete PSBT has been saved to ${colors.highlight(filename)}`,
                { title: "PSBT Saved", titleColor: colors.info },
              ),
            );
            break;
          }
          case "clipboard":
            const clipboardSpinner = ora(
              "Copying PSBT to clipboard...",
            ).start();
            await clipboard.write(psbtBase64);
            clipboardSpinner.succeed("PSBT copied to clipboard");
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

        return null;
      }

      console.log(
        boxText(formatSuccess("PSBT finalized successfully!"), {
          title: "PSBT Ready for Broadcast",
          titleColor: colors.success,
        }),
      );

      // Ask if user wants to broadcast the transaction
      const broadcast = await confirm({
        message: "Would you like to broadcast the transaction?",
        default: true,
      });

      if (broadcast) {
        console.log(colors.info("\nBroadcasting transaction..."));

        const broadcastSpinner = ora(
          "Broadcasting transaction to network...",
        ).start();
        const txid = await this.transactionService.broadcastTransaction(
          finalizedPsbt.hex,
        );
        broadcastSpinner.succeed("Transaction broadcast successfully");

        console.log(
          boxText(`Transaction ID: ${colors.highlight(txid)}`, {
            title: "Transaction Broadcast",
            titleColor: colors.success,
          }),
        );

        // Ask if user wants to mine a block to confirm the transaction
        const mineBlock = await confirm({
          message: "Mine a block to confirm the transaction?",
          default: true,
        });

        if (mineBlock) {
          // Get a wallet for mining
          const walletsSpinner = ora("Loading wallets for mining...").start();
          const wallets = await this.bitcoinService.listWallets();
          walletsSpinner.succeed("Wallets loaded");

          if (wallets.length === 0) {
            console.log(formatWarning("\nNo wallets found for mining."));
            return txid;
          }

          const miningWallet = await select({
            message: "Select a wallet to mine to:",
            choices: wallets.map((w) => ({
              name: colors.highlight(w),
              value: w,
            })),
          });

          const addressSpinner = ora(
            `Generating address for mining...`,
          ).start();
          const miningAddress =
            await this.bitcoinService.getNewAddress(miningWallet);
          addressSpinner.succeed(`Mining to address: ${miningAddress}`);

          const mineSpinner = ora("Mining a block...").start();
          const blockHashes = await this.bitcoinService.generateToAddress(
            1,
            miningAddress,
          );
          mineSpinner.succeed("Block mined successfully");

          console.log(
            boxText(`Block hash: ${colors.highlight(blockHashes[0])}`, {
              title: "Block Mined",
              titleColor: colors.success,
            }),
          );
        }

        return txid;
      } else {
        // Handle the transaction hex
        const action = await select({
          message: "What would you like to do with the transaction hex?",
          choices: [
            { name: colors.highlight("Save to file"), value: "file" },
            { name: colors.highlight("Copy to clipboard"), value: "clipboard" },
            { name: colors.highlight("Display"), value: "display" },
          ],
        });

        switch (action) {
          case "file": {
            const filename = await input({
              message: "Enter file name:",
              default: "transaction.hex",
            });

            const saveSpinner = ora(
              `Saving transaction hex to ${filename}...`,
            ).start();
            await fs.writeFile(filename, finalizedPsbt.hex);
            saveSpinner.succeed("Transaction hex saved");

            console.log(
              boxText(
                `The transaction hex has been saved to ${colors.highlight(filename)}`,
                { title: "Transaction Saved", titleColor: colors.success },
              ),
            );
            break;
          }
          case "clipboard":
            const clipboardSpinner = ora(
              "Copying transaction hex to clipboard...",
            ).start();
            await clipboard.write(finalizedPsbt.hex);
            clipboardSpinner.succeed("Transaction hex copied to clipboard");
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
      return null;
    }
  }

  /**
   * Analyze a PSBT (decode and show details)
   */
  async analyzePSBT(): Promise<any | null> {
    displayCommandTitle("Analyze PSBT");

    try {
      // Get the PSBT from the user
      const source = await select({
        message: "How would you like to provide the PSBT?",
        choices: [
          { name: colors.highlight("Load from file"), value: "file" },
          { name: colors.highlight("Paste Base64 string"), value: "paste" },
          { name: colors.highlight("Read from clipboard"), value: "clipboard" },
        ],
      });

      let psbtBase64: string;

      switch (source) {
        case "file": {
          const filename = await input({
            message: "Enter path to PSBT file:",
            validate: (input) =>
              fs.existsSync(input) ? true : "File does not exist",
          });

          const readSpinner = ora(`Reading PSBT from ${filename}...`).start();
          psbtBase64 = (await fs.readFile(filename, "utf8")).trim();
          readSpinner.succeed("PSBT loaded from file");
          break;
        }
        case "paste": {
          psbtBase64 = await input({
            message: "Paste the base64-encoded PSBT:",
            validate: (input) =>
              input.trim() !== "" ? true : "Please enter a valid PSBT",
          });

          psbtBase64 = psbtBase64.trim();
          break;
        }
        case "clipboard":
          try {
            const clipboardSpinner = ora("Reading from clipboard...").start();
            psbtBase64 = await clipboard.read();
            clipboardSpinner.succeed("PSBT read from clipboard");
          } catch (error) {
            console.error(formatError("Error reading from clipboard:"), error);
            return null;
          }
          break;
      }

      // Try to detect if this is a Caravan PSBT
      const detectSpinner = ora(
        "Detecting if this is a Caravan PSBT...",
      ).start();
      const caravanWallets = await this.caravanService.listCaravanWallets();
      const caravanConfig =
        await this.transactionService.detectCaravanWalletForPSBT(
          psbtBase64,
          caravanWallets,
        );

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

      // Decode the PSBT
      const decodeSpinner = ora("Decoding PSBT...").start();
      const decodedPsbt = await this.transactionService.decodePSBT(psbtBase64);
      decodeSpinner.succeed("PSBT decoded successfully");

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

      // Ask for detail level
      const level = await select({
        message: "How much detail would you like to see?",
        choices: [
          { name: colors.highlight("Basic"), value: "basic" },
          { name: colors.highlight("Detailed"), value: "detailed" },
          { name: colors.highlight("Raw JSON"), value: "raw" },
        ],
      });

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

      // Ask if user wants to save the decoded PSBT
      const save = await confirm({
        message: "Would you like to save the decoded PSBT to a file?",
        default: false,
      });

      if (save) {
        const filename = await input({
          message: "Enter file name:",
          default: "decoded-psbt.json",
        });

        const saveSpinner = ora(
          `Saving decoded PSBT to ${filename}...`,
        ).start();
        await fs.writeJson(filename, decodedPsbt, { spaces: 2 });
        saveSpinner.succeed("Decoded PSBT saved");

        console.log(formatSuccess(`Decoded PSBT saved to ${filename}`));
      }

      // Ask what action to take next
      const action = await select({
        message: "What would you like to do with this PSBT?",
        choices: [
          { name: colors.highlight("Sign with wallet"), value: "wallet" },
          { name: colors.highlight("Sign with private key"), value: "privkey" },
          {
            name: colors.highlight("Try to finalize and broadcast"),
            value: "finalize",
          },
          { name: colors.highlight("Nothing, just exit"), value: "exit" },
        ],
      });

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
      return null;
    }
  }
}
