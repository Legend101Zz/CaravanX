import { TransactionService } from "../core/transaction";
import { CaravanService } from "../core/caravan";
import { BitcoinService } from "../core/bitcoin";
import { input, confirm, select, number, password } from "@inquirer/prompts";
import chalk from "chalk";
import * as fs from "fs-extra";
import * as clipboard from "clipboardy";

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
    console.log(chalk.cyan("\n=== Create New PSBT ==="));

    try {
      // First, list all wallets
      const wallets = await this.bitcoinService.listWallets();

      if (wallets.length === 0) {
        console.log(chalk.yellow("No wallets found."));
        return null;
      }

      // Select the wallet
      const selectedWallet = await select({
        message: "Select a wallet to create the PSBT from:",
        choices: wallets.map((w) => ({ name: w, value: w })),
      });

      // Get wallet info to show balance
      const walletInfo =
        await this.bitcoinService.getWalletInfo(selectedWallet);
      console.log(chalk.green(`\nWallet "${selectedWallet}" selected.`));
      console.log(chalk.green(`Available balance: ${walletInfo.balance} BTC`));

      if (walletInfo.balance <= 0) {
        console.log(chalk.yellow("Wallet has no funds. Please fund it first."));
        return null;
      }

      // Configure outputs
      const outputs = [];
      let totalAmount = 0;

      // Ask for number of outputs
      const numOutputs = await number({
        message: "How many outputs do you want to create?",
        validate: (input) =>
          input > 0 ? true : "Please enter a positive number",
        default: 1,
      });

      // Collect output details
      for (let i = 0; i < numOutputs; i++) {
        console.log(chalk.cyan(`\nOutput #${i + 1}:`));

        const address = await input({
          message: `Enter destination address for output #${i + 1}:`,
          validate: (input) =>
            input.trim() !== "" ? true : "Please enter a valid address",
        });

        const amount = await number({
          message: `Enter amount in BTC for output #${i + 1}:`,
          validate: (input) => {
            if (isNaN(input) || input <= 0) {
              return "Please enter a valid positive amount";
            }
            if (totalAmount + input > walletInfo.balance) {
              return `Total amount (${totalAmount + input} BTC) exceeds balance (${walletInfo.balance} BTC)`;
            }
            return true;
          },
        });

        outputs.push({ [address]: amount });
        totalAmount += amount;
      }

      // Create the PSBT
      console.log(chalk.cyan("\nCreating PSBT..."));
      const psbt = await this.transactionService.createPSBT(
        selectedWallet,
        outputs,
      );

      if (!psbt) {
        console.log(chalk.red("Failed to create PSBT."));
        return null;
      }

      console.log(chalk.green("\nPSBT created successfully!"));

      // Handle the PSBT
      const action = await select({
        message: "What would you like to do with the PSBT?",
        choices: [
          { name: "Save to file", value: "file" },
          { name: "Copy to clipboard", value: "clipboard" },
          { name: "Display", value: "display" },
          { name: "Process with this wallet", value: "sign" },
        ],
      });

      switch (action) {
        case "file": {
          const filename = await input({
            message: "Enter file name:",
            default: "unsigned-psbt.txt",
          });

          await fs.writeFile(filename, psbt);
          console.log(chalk.green(`\nPSBT saved to ${filename}`));
          break;
        }
        case "clipboard":
          await clipboard.write(psbt);
          console.log(chalk.green("\nPSBT copied to clipboard."));
          break;
        case "display":
          console.log(chalk.cyan("\nPSBT (Base64):"));
          console.log(psbt);
          break;
        case "sign":
          // Process the PSBT with the same wallet
          return this.signPSBTWithWallet(psbt, selectedWallet);
      }

      return psbt;
    } catch (error) {
      console.error(chalk.red("\nError creating PSBT:"), error);
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
    console.log(chalk.cyan("\n=== Sign PSBT with Wallet ==="));

    try {
      // If no PSBT provided, get it from the user
      if (!psbtBase64) {
        const source = await select({
          message: "How would you like to provide the PSBT?",
          choices: [
            { name: "Load from file", value: "file" },
            { name: "Paste Base64 string", value: "paste" },
            { name: "Read from clipboard", value: "clipboard" },
          ],
        });

        switch (source) {
          case "file": {
            const filename = await input({
              message: "Enter path to PSBT file:",
              validate: (input) =>
                fs.existsSync(input) ? true : "File does not exist",
            });

            psbtBase64 = (await fs.readFile(filename, "utf8")).trim();
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
              psbtBase64 = await clipboard.read();
              console.log(chalk.green("PSBT read from clipboard."));
            } catch (error) {
              console.error(chalk.red("Error reading from clipboard:"), error);
              return null;
            }
            break;
        }
      }

      // Try to decode the PSBT for inspection
      try {
        const decodedPsbt =
          await this.transactionService.decodePSBT(psbtBase64);

        console.log(chalk.green("\nPSBT Decoded Successfully:"));
        console.log(chalk.cyan("Transaction Details:"));

        // Display inputs
        console.log(chalk.cyan("\nInputs:"));
        decodedPsbt.inputs.forEach((input, index) => {
          console.log(`Input #${index + 1}:`);
          if (input.has_utxo) {
            console.log(`  TXID: ${decodedPsbt.tx.vin[index].txid}`);
            console.log(`  VOUT: ${decodedPsbt.tx.vin[index].vout}`);
            console.log(`  Amount: ${input.utxo.amount} BTC`);
            console.log(
              `  Address: ${input.utxo.scriptPubKey.address || "Unknown"}`,
            );
          } else {
            console.log(`  TXID: ${decodedPsbt.tx.vin[index].txid}`);
            console.log(`  VOUT: ${decodedPsbt.tx.vin[index].vout}`);
          }
        });

        // Display outputs
        console.log(chalk.cyan("\nOutputs:"));
        decodedPsbt.tx.vout.forEach((output, index) => {
          console.log(`Output #${index + 1}:`);
          console.log(`  Amount: ${output.value} BTC`);
          console.log(`  Address: ${output.scriptPubKey.address || "Unknown"}`);
        });

        // Display fee
        if (decodedPsbt.fee) {
          console.log(chalk.cyan("\nFee:"));
          console.log(`  ${decodedPsbt.fee} BTC`);
        }
      } catch (error) {
        console.error(chalk.yellow("\nWarning: Could not decode PSBT:"), error);
      }

      // If no wallet provided, ask user to select one
      if (!walletName) {
        const wallets = await this.bitcoinService.listWallets();

        if (wallets.length === 0) {
          console.log(chalk.yellow("No wallets found."));
          return null;
        }

        walletName = await select({
          message: "Select a wallet to sign with:",
          choices: wallets.map((w) => ({ name: w, value: w })),
        });
      }

      // Sign the PSBT with the selected wallet
      console.log(chalk.cyan(`\nSigning PSBT with wallet "${walletName}"...`));

      const signedPsbt = await this.transactionService.processPSBT(
        walletName,
        psbtBase64,
      );

      console.log(chalk.green("\nPSBT signed successfully!"));

      // Handle the signed PSBT
      const action = await select({
        message: "What would you like to do with the signed PSBT?",
        choices: [
          { name: "Save to file", value: "file" },
          { name: "Copy to clipboard", value: "clipboard" },
          { name: "Display", value: "display" },
          { name: "Try to finalize and broadcast", value: "finalize" },
        ],
      });

      switch (action) {
        case "file": {
          const filename = await input({
            message: "Enter file name:",
            default: "signed-psbt.txt",
          });

          await fs.writeFile(filename, signedPsbt);
          console.log(chalk.green(`\nSigned PSBT saved to ${filename}`));
          break;
        }
        case "clipboard":
          await clipboard.write(signedPsbt);
          console.log(chalk.green("\nSigned PSBT copied to clipboard."));
          break;
        case "display":
          console.log(chalk.cyan("\nSigned PSBT (Base64):"));
          console.log(signedPsbt);
          break;
        case "finalize":
          return this.finalizeAndBroadcastPSBT(signedPsbt);
      }

      return signedPsbt;
    } catch (error) {
      console.error(chalk.red("\nError signing PSBT:"), error);
      return null;
    }
  }

  /**
   * Sign a PSBT with a private key
   */
  async signPSBTWithPrivateKey(): Promise<any | null> {
    console.log(chalk.cyan("\n=== Sign PSBT with Private Key ==="));

    try {
      // Get the PSBT from the user
      const source = await select({
        message: "How would you like to provide the PSBT?",
        choices: [
          { name: "Load from file", value: "file" },
          { name: "Paste Base64 string", value: "paste" },
          { name: "Read from clipboard", value: "clipboard" },
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

          psbtBase64 = (await fs.readFile(filename, "utf8")).trim();
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
            psbtBase64 = await clipboard.read();
            console.log(chalk.green("PSBT read from clipboard."));
          } catch (error) {
            console.error(chalk.red("Error reading from clipboard:"), error);
            return null;
          }
          break;
      }

      // Try to detect if this is a Caravan PSBT
      const caravanWallets = await this.caravanService.listCaravanWallets();
      const caravanConfig =
        await this.transactionService.detectCaravanWalletForPSBT(
          psbtBase64,
          caravanWallets,
        );

      let privateKey: string;

      if (caravanConfig) {
        console.log(
          chalk.green(
            `\nThis PSBT belongs to Caravan wallet: ${caravanConfig.name}`,
          ),
        );

        // Load private key data for this wallet
        const keyData =
          await this.caravanService.loadCaravanPrivateKeyData(caravanConfig);

        if (keyData && keyData.keyData.some((k) => k.privateKey)) {
          console.log(
            chalk.green("\nFound configured private keys for this wallet."),
          );

          // Let user select which key to use
          const availableKeys = keyData.keyData.filter((k) => k.privateKey);

          const keyOptions = availableKeys.map((key, index) => {
            const xpub = key.xpub;
            const keyName =
              caravanConfig.extendedPublicKeys.find((k) => k.xpub === xpub)
                ?.name || `Key #${index + 1}`;

            return {
              name: `${keyName} (${xpub.substring(0, 8)}...)`,
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
            console.log(chalk.yellow("No private keys available."));

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
            chalk.yellow("No private key data found for this wallet."),
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
        console.log(chalk.cyan("\nSigning PSBT for Caravan..."));

        const signedResult =
          await this.transactionService.extractSignaturesForCaravan(
            psbtBase64,
            privateKey,
          );

        console.log(chalk.green("\nPSBT signed successfully!"));

        // Handle the signed result
        const action = await select({
          message: "What would you like to do with the Caravan signature data?",
          choices: [
            { name: "Save to file (JSON format)", value: "file" },
            { name: "Copy to clipboard (JSON format)", value: "clipboard" },
            { name: "Display", value: "display" },
            { name: "Just continue with the base64 PSBT", value: "psbt" },
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

            await fs.writeFile(filename, caravanJson);
            console.log(
              chalk.green(`\nCaravan signature data saved to ${filename}`),
            );
            break;
          }
          case "clipboard":
            await clipboard.write(caravanJson);
            console.log(
              chalk.green("\nCaravan signature data copied to clipboard."),
            );
            break;
          case "display":
            console.log(chalk.cyan("\nCaravan signature data (JSON):"));
            console.log(caravanJson);
            break;
          case "psbt":
            return this.handleSignedPSBT(signedResult.base64);
        }

        return signedResult;
      } else {
        // Standard PSBT signing
        console.log(
          chalk.cyan("\nStandard PSBT signing (not Caravan-specific)."),
        );

        // Ask for private key
        privateKey = await password({
          message: "Enter the private key (WIF format):",
          validate: (input) =>
            input.trim() !== "" ? true : "Please enter a valid private key",
        });

        privateKey = privateKey.trim();

        // Sign the PSBT
        console.log(chalk.cyan("\nSigning PSBT with private key..."));

        const signedPsbt = await this.transactionService.signPSBTWithPrivateKey(
          psbtBase64,
          privateKey,
        );

        console.log(chalk.green("\nPSBT signed successfully!"));

        return this.handleSignedPSBT(signedPsbt);
      }
    } catch (error) {
      console.error(chalk.red("\nError signing PSBT with private key:"), error);
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
        { name: "Save to file", value: "file" },
        { name: "Copy to clipboard", value: "clipboard" },
        { name: "Display", value: "display" },
        { name: "Try to finalize and broadcast", value: "finalize" },
      ],
    });

    switch (action) {
      case "file": {
        const filename = await input({
          message: "Enter file name:",
          default: "signed-psbt.txt",
        });

        await fs.writeFile(filename, signedPsbt);
        console.log(chalk.green(`\nSigned PSBT saved to ${filename}`));
        break;
      }
      case "clipboard":
        await clipboard.write(signedPsbt);
        console.log(chalk.green("\nSigned PSBT copied to clipboard."));
        break;
      case "display":
        console.log(chalk.cyan("\nSigned PSBT (Base64):"));
        console.log(signedPsbt);
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
    console.log(chalk.cyan("\n=== Finalize and Broadcast PSBT ==="));

    try {
      // If no PSBT provided, get it from the user
      if (!psbtBase64) {
        const source = await select({
          message: "How would you like to provide the PSBT?",
          choices: [
            { name: "Load from file", value: "file" },
            { name: "Paste Base64 string", value: "paste" },
            { name: "Read from clipboard", value: "clipboard" },
          ],
        });

        switch (source) {
          case "file": {
            const filename = await input({
              message: "Enter path to PSBT file:",
              validate: (input) =>
                fs.existsSync(input) ? true : "File does not exist",
            });

            psbtBase64 = (await fs.readFile(filename, "utf8")).trim();
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
              psbtBase64 = await clipboard.read();
              console.log(chalk.green("PSBT read from clipboard."));
            } catch (error) {
              console.error(chalk.red("Error reading from clipboard:"), error);
              return null;
            }
            break;
        }
      }

      // Finalize the PSBT
      console.log(chalk.cyan("\nFinalizing PSBT..."));

      const finalizedPsbt =
        await this.transactionService.finalizePSBT(psbtBase64);

      if (!finalizedPsbt.complete) {
        console.log(
          chalk.yellow(
            "\nPSBT is not complete yet. Additional signatures may be required.",
          ),
        );

        // Show PSBT details
        try {
          const decodedPsbt =
            await this.transactionService.decodePSBT(psbtBase64);

          console.log(chalk.cyan("\nPSBT Details:"));
          console.log(`Inputs: ${decodedPsbt.tx.vin.length}`);
          console.log(`Outputs: ${decodedPsbt.tx.vout.length}`);

          if (decodedPsbt.fee) {
            console.log(`Fee: ${decodedPsbt.fee} BTC`);
          }
        } catch (error) {
          console.error(chalk.yellow("Could not decode PSBT:"), error);
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
              { name: "Sign with wallet", value: "wallet" },
              { name: "Sign with private key", value: "privkey" },
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
            { name: "Save to file", value: "file" },
            { name: "Copy to clipboard", value: "clipboard" },
            { name: "Display", value: "display" },
          ],
        });

        switch (action) {
          case "file": {
            const filename = await input({
              message: "Enter file name:",
              default: "incomplete-psbt.txt",
            });

            await fs.writeFile(filename, psbtBase64);
            console.log(chalk.green(`\nPSBT saved to ${filename}`));
            break;
          }
          case "clipboard":
            await clipboard.write(psbtBase64);
            console.log(chalk.green("\nPSBT copied to clipboard."));
            break;
          case "display":
            console.log(chalk.cyan("\nPSBT (Base64):"));
            console.log(psbtBase64);
            break;
        }

        return null;
      }

      console.log(chalk.green("\nPSBT finalized successfully!"));

      // Ask if user wants to broadcast the transaction
      const broadcast = await confirm({
        message: "Would you like to broadcast the transaction?",
        default: true,
      });

      if (broadcast) {
        console.log(chalk.cyan("\nBroadcasting transaction..."));

        const txid = await this.transactionService.broadcastTransaction(
          finalizedPsbt.hex,
        );

        console.log(chalk.green("\nTransaction broadcast successfully!"));
        console.log(chalk.green(`Transaction ID: ${txid}`));

        // Ask if user wants to mine a block to confirm the transaction
        const mineBlock = await confirm({
          message: "Mine a block to confirm the transaction?",
          default: true,
        });

        if (mineBlock) {
          // Get a wallet for mining
          const wallets = await this.bitcoinService.listWallets();

          if (wallets.length === 0) {
            console.log(chalk.yellow("\nNo wallets found for mining."));
            return txid;
          }

          const miningWallet = await select({
            message: "Select a wallet to mine to:",
            choices: wallets.map((w) => ({ name: w, value: w })),
          });

          const miningAddress =
            await this.bitcoinService.getNewAddress(miningWallet);

          console.log(
            chalk.cyan(`\nMining block to address ${miningAddress}...`),
          );

          const blockHashes = await this.bitcoinService.generateToAddress(
            1,
            miningAddress,
          );

          console.log(chalk.green("\nBlock mined successfully!"));
          console.log(chalk.green(`Block hash: ${blockHashes[0]}`));
        }

        return txid;
      } else {
        // Handle the transaction hex
        const action = await select({
          message: "What would you like to do with the transaction hex?",
          choices: [
            { name: "Save to file", value: "file" },
            { name: "Copy to clipboard", value: "clipboard" },
            { name: "Display", value: "display" },
          ],
        });

        switch (action) {
          case "file": {
            const filename = await input({
              message: "Enter file name:",
              default: "transaction.hex",
            });

            await fs.writeFile(filename, finalizedPsbt.hex);
            console.log(chalk.green(`\nTransaction hex saved to ${filename}`));
            break;
          }
          case "clipboard":
            await clipboard.write(finalizedPsbt.hex);
            console.log(chalk.green("\nTransaction hex copied to clipboard."));
            break;
          case "display":
            console.log(chalk.cyan("\nTransaction hex:"));
            console.log(finalizedPsbt.hex);
            break;
        }

        return finalizedPsbt.hex;
      }
    } catch (error) {
      console.error(
        chalk.red("\nError finalizing and broadcasting PSBT:"),
        error,
      );
      return null;
    }
  }

  /**
   * Analyze a PSBT (decode and show details)
   */
  async analyzePSBT(): Promise<any | null> {
    console.log(chalk.cyan("\n=== Analyze PSBT ==="));

    try {
      // Get the PSBT from the user
      const source = await select({
        message: "How would you like to provide the PSBT?",
        choices: [
          { name: "Load from file", value: "file" },
          { name: "Paste Base64 string", value: "paste" },
          { name: "Read from clipboard", value: "clipboard" },
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

          psbtBase64 = (await fs.readFile(filename, "utf8")).trim();
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
            psbtBase64 = await clipboard.read();
            console.log(chalk.green("PSBT read from clipboard."));
          } catch (error) {
            console.error(chalk.red("Error reading from clipboard:"), error);
            return null;
          }
          break;
      }

      // Try to detect if this is a Caravan PSBT
      const caravanWallets = await this.caravanService.listCaravanWallets();
      const caravanConfig =
        await this.transactionService.detectCaravanWalletForPSBT(
          psbtBase64,
          caravanWallets,
        );

      if (caravanConfig) {
        console.log(
          chalk.green(
            `\nThis PSBT belongs to Caravan wallet: ${caravanConfig.name}`,
          ),
        );
        console.log(
          chalk.green(
            `Quorum: ${caravanConfig.quorum.requiredSigners} of ${caravanConfig.quorum.totalSigners}`,
          ),
        );
      }

      // Decode the PSBT
      console.log(chalk.cyan("\nDecoding PSBT..."));

      const decodedPsbt = await this.transactionService.decodePSBT(psbtBase64);

      console.log(chalk.green("\nPSBT Decoded Successfully:"));

      // Display basic information
      console.log(chalk.cyan("\nTransaction Details:"));
      console.log(`Version: ${decodedPsbt.tx.version}`);
      console.log(`Locktime: ${decodedPsbt.tx.locktime}`);
      console.log(`Inputs: ${decodedPsbt.tx.vin.length}`);
      console.log(`Outputs: ${decodedPsbt.tx.vout.length}`);

      if (decodedPsbt.fee) {
        console.log(`Fee: ${decodedPsbt.fee} BTC`);
        console.log(
          `Fee rate: ${decodedPsbt.fee / (decodedPsbt.tx.vsize / 1000)} BTC/kB`,
        );
      }

      // Ask for detail level
      const level = await select({
        message: "How much detail would you like to see?",
        choices: [
          { name: "Basic", value: "basic" },
          { name: "Detailed", value: "detailed" },
          { name: "Raw JSON", value: "raw" },
        ],
      });

      if (level === "detailed" || level === "raw") {
        // Display inputs
        console.log(chalk.cyan("\nInputs:"));
        decodedPsbt.inputs.forEach((input, index) => {
          console.log(`\nInput #${index + 1}:`);
          console.log(`  TXID: ${decodedPsbt.tx.vin[index].txid}`);
          console.log(`  VOUT: ${decodedPsbt.tx.vin[index].vout}`);
          console.log(`  Sequence: ${decodedPsbt.tx.vin[index].sequence}`);

          if (input.has_utxo) {
            console.log(`  Amount: ${input.utxo.amount} BTC`);
            console.log(
              `  Script Type: ${input.utxo.scriptPubKey.type || "Unknown"}`,
            );
            console.log(
              `  Address: ${input.utxo.scriptPubKey.address || "Unknown"}`,
            );
          }

          if (input.has_sighash) {
            console.log(`  Sighash: ${input.sighash_type}`);
          }

          if (input.partial_signatures) {
            console.log(`  Signatures: ${input.partial_signatures.length}`);

            input.partial_signatures.forEach((sig, sigIndex) => {
              console.log(
                `    Signature #${sigIndex + 1}: ${sig.pubkey ? sig.pubkey.substring(0, 8) + "..." : "Unknown"}`,
              );
            });
          }
        });

        // Display outputs
        console.log(chalk.cyan("\nOutputs:"));
        decodedPsbt.tx.vout.forEach((output, index) => {
          console.log(`\nOutput #${index + 1}:`);
          console.log(`  Amount: ${output.value} BTC`);
          console.log(
            `  Script Type: ${output.scriptPubKey.type || "Unknown"}`,
          );
          console.log(`  Address: ${output.scriptPubKey.address || "Unknown"}`);
        });
      }

      // Display raw JSON if requested
      if (level === "raw") {
        console.log(chalk.cyan("\nRaw PSBT Data:"));
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

        await fs.writeJson(filename, decodedPsbt, { spaces: 2 });
        console.log(chalk.green(`\nDecoded PSBT saved to ${filename}`));
      }

      // Ask what action to take next
      const action = await select({
        message: "What would you like to do with this PSBT?",
        choices: [
          { name: "Sign with wallet", value: "wallet" },
          { name: "Sign with private key", value: "privkey" },
          { name: "Try to finalize and broadcast", value: "finalize" },
          { name: "Nothing, just exit", value: "exit" },
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
      console.error(chalk.red("\nError analyzing PSBT:"), error);
      return null;
    }
  }
}
