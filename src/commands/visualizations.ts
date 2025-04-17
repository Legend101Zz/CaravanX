//@ts-nocheck
import { input, confirm, select, number } from "@inquirer/prompts";
import { ConfigManager } from "../core/config";
import { BitcoinRpcClient } from "../core/rpc";
import { BitcoinService } from "../core/bitcoin";
import { VisualizationManager } from "../visualization/VisualizationManager";
import {
  colors,
  displayCommandTitle,
  formatSuccess,
  formatWarning,
  formatError,
  boxText,
  keyValue,
  divider,
} from "../utils/terminal";
import ora from "ora";
import open from "open";

/**
 * Commands for blockchain visualization
 */
export class VisualizationCommands {
  private readonly configManager: ConfigManager;
  private readonly bitcoinRpcClient: BitcoinRpcClient;
  private readonly bitcoinService: BitcoinService;
  private visualizationManager: VisualizationManager | null = null;

  constructor(
    configManager: ConfigManager,
    bitcoinRpcClient: BitcoinRpcClient,
    bitcoinService: BitcoinService,
  ) {
    this.configManager = configManager;
    this.bitcoinRpcClient = bitcoinRpcClient;
    this.bitcoinService = bitcoinService;
  }

  /**
   * Initialize visualization manager if not already initialized
   */
  private async getVisualizationManager(): Promise<VisualizationManager> {
    if (!this.visualizationManager) {
      this.visualizationManager = new VisualizationManager(
        this.bitcoinRpcClient,
        this.configManager,
      );
    }
    return this.visualizationManager;
  }

  /**
   * Start the blockchain visualization
   */
  async startVisualization(): Promise<void> {
    displayCommandTitle("Blockchain Visualization");

    try {
      // Check if Bitcoin Core is running
      const spinner = ora("Checking Bitcoin Core connection...").start();
      let bitcoinCoreRunning = false;

      try {
        const blockchainInfo =
          await this.bitcoinRpcClient.callRpc("getblockchaininfo");
        bitcoinCoreRunning =
          blockchainInfo && blockchainInfo.chain === "regtest";
        spinner.succeed("Connected to Bitcoin Core (regtest mode)");
      } catch (error) {
        spinner.fail("Could not connect to Bitcoin Core");
        console.log(
          formatError(
            "Bitcoin Core is not running or RPC connection failed. Visualization requires a working Bitcoin Core connection.",
          ),
        );
        return;
      }

      if (!bitcoinCoreRunning) {
        console.log(
          formatWarning(
            "Bitcoin Core is not running in regtest mode. Visualization requires regtest mode.",
          ),
        );
        return;
      }

      // Get visualization manager
      const vizManager = await this.getVisualizationManager();

      // Check if server is already running
      if (vizManager.isServerRunning()) {
        console.log(formatWarning("Visualization server is already running."));

        const openOptions = [
          { name: colors.highlight("Open in browser"), value: "open" },
          { name: colors.highlight("Restart server"), value: "restart" },
          { name: colors.highlight("Stop server"), value: "stop" },
          { name: colors.highlight("Do nothing"), value: "nothing" },
        ];

        const action = await select({
          message: "What would you like to do?",
          choices: openOptions,
        });

        switch (action) {
          case "open":
            console.log(colors.info("Opening visualization in browser..."));
            await open(vizManager.getServerUrl());
            break;
          case "restart":
            await vizManager.stop();
            await vizManager.start(true);
            break;
          case "stop":
            await vizManager.stop();
            break;
          case "nothing":
            console.log(colors.info("Visualization server remains running."));
            break;
        }

        return;
      }

      // Ask about port
      const port = await number({
        message: "Enter port for visualization server:",
        default: 3000,
      });

      // Start the visualization server
      const startSpinner = ora("Starting visualization server...").start();

      try {
        // Create a new visualization manager with the specified port
        this.visualizationManager = new VisualizationManager(
          this.bitcoinRpcClient,
          this.configManager,
          port,
        );

        await this.visualizationManager.start(false);
        startSpinner.succeed("Visualization server started");

        console.log(
          boxText(
            `The blockchain visualization is now running on port ${colors.highlight(port!.toString())}.\n\n` +
              `You can access it at: ${colors.highlight(`http://localhost:${port}/`)}\n\n` +
              `Keep this terminal window open to keep the visualization server running.\n` +
              `Press Ctrl+C or select "Stop visualization" from the menu to stop the server.`,
            { title: "Visualization Running", titleColor: colors.success },
          ),
        );

        // Ask to open in browser
        const openBrowser = await confirm({
          message: "Open visualization in browser?",
          default: true,
        });

        if (openBrowser) {
          console.log(colors.info("Opening visualization in browser..."));
          await open(`http://localhost:${port}/`);
        }
      } catch (error) {
        startSpinner.fail("Failed to start visualization server");
        console.error(formatError(`Error: ${error.message}`));
      }
    } catch (error) {
      console.error(formatError("Error starting visualization:"), error);
    }
  }

  /**
   * Stop the blockchain visualization
   */
  async stopVisualization(): Promise<void> {
    displayCommandTitle("Stop Visualization");

    try {
      const vizManager = await this.getVisualizationManager();

      if (!vizManager.isServerRunning()) {
        console.log(formatWarning("Visualization server is not running."));
        return;
      }

      const confirm = await select({
        message: "Stop the visualization server?",
        choices: [
          { name: colors.highlight("Yes, stop the server"), value: "yes" },
          { name: colors.highlight("No, keep it running"), value: "no" },
        ],
      });

      if (confirm === "yes") {
        const spinner = ora("Stopping visualization server...").start();
        await vizManager.stop();
        spinner.succeed("Visualization server stopped");
      } else {
        console.log(colors.info("Visualization server remains running."));
      }
    } catch (error) {
      console.error(formatError("Error stopping visualization:"), error);
    }
  }

  /**
   * Generate blocks to simulate blockchain activity
   */
  async simulateBlockchain(): Promise<void> {
    displayCommandTitle("Simulate Blockchain Activity");

    try {
      // Check if Bitcoin Core is running
      const spinner = ora("Checking Bitcoin Core connection...").start();
      try {
        await this.bitcoinRpcClient.callRpc("getblockchaininfo");
        spinner.succeed("Connected to Bitcoin Core");
      } catch (error) {
        spinner.fail("Could not connect to Bitcoin Core");
        console.log(
          formatError(
            "Bitcoin Core is not running or RPC connection failed. Simulation requires a working Bitcoin Core connection.",
          ),
        );
        return;
      }

      // Get list of wallets
      const walletsSpinner = ora("Loading wallets...").start();
      let wallets;

      try {
        wallets = await this.bitcoinService.listWallets();
        walletsSpinner.succeed("Wallets loaded");
      } catch (error) {
        walletsSpinner.fail("Error loading wallets");
        console.error(formatError(`Error: ${error.message}`));
        return;
      }

      if (!wallets || wallets.length === 0) {
        console.log(
          formatWarning("No wallets found. Please create a wallet first."),
        );
        return;
      }

      // Ask for simulation type
      const simulationType = await select({
        message: "What type of simulation would you like to run?",
        choices: [
          { name: colors.highlight("Generate blocks"), value: "blocks" },
          {
            name: colors.highlight("Create transactions"),
            value: "transactions",
          },
          {
            name: colors.highlight("Full simulation (blocks + transactions)"),
            value: "full",
          },
        ],
      });

      if (simulationType === "blocks" || simulationType === "full") {
        // Ask for wallet to mine to
        const miningWallet = await select({
          message: "Select a wallet to mine to:",
          choices: wallets.map((w) => ({
            name: colors.highlight(w),
            value: w,
          })),
        });

        // Ask for number of blocks
        const numBlocks = await number({
          message: "How many blocks would you like to mine?",
          default: 1,
        });

        // Get a mining address
        const addressSpinner = ora("Generating mining address...").start();
        let miningAddress;

        try {
          miningAddress = await this.bitcoinService.getNewAddress(miningWallet);
          addressSpinner.succeed(`Mining to address: ${miningAddress}`);
        } catch (error) {
          addressSpinner.fail("Error generating mining address");
          console.error(formatError(`Error: ${error.message}`));
          return;
        }

        // Mine blocks
        const miningSpinner = ora(`Mining ${numBlocks} blocks...`).start();
        try {
          const blockHashes = await this.bitcoinService.generateToAddress(
            numBlocks!,
            miningAddress,
          );
          miningSpinner.succeed(
            `Successfully mined ${blockHashes.length} blocks`,
          );

          console.log(
            boxText(
              `Mined ${colors.highlight(blockHashes.length.toString())} new blocks\n\n` +
                `Latest block hash: ${colors.highlight(blockHashes[blockHashes.length - 1])}`,
              { title: "Mining Complete", titleColor: colors.success },
            ),
          );
        } catch (error) {
          miningSpinner.fail("Error mining blocks");
          console.error(formatError(`Error: ${error.message}`));
          return;
        }
      }

      if (simulationType === "transactions" || simulationType === "full") {
        // Get wallet info to find one with funds
        const walletWithFunds = await this.findWalletWithFunds(wallets);

        if (!walletWithFunds) {
          console.log(
            formatWarning(
              "No wallet with funds found. Please fund a wallet first.",
            ),
          );
          return;
        }

        // Ask for number of transactions
        const numTransactions = await number({
          message: "How many transactions would you like to create?",
          default: 3,
        });

        // Create transactions
        await this.createRandomTransactions(
          walletWithFunds,
          wallets,
          numTransactions!,
        );
      }

      // If we're running a full simulation, ask to mine blocks again to confirm txs
      if (simulationType === "full") {
        const confirmTxs = await confirm({
          message:
            "Would you like to mine additional blocks to confirm the transactions?",
          default: true,
        });

        if (confirmTxs) {
          const miningWallet = wallets[0]; // Use the first wallet
          const confirmBlocks = 1;

          // Get a mining address
          const addressSpinner = ora("Generating mining address...").start();
          let miningAddress;

          try {
            miningAddress =
              await this.bitcoinService.getNewAddress(miningWallet);
            addressSpinner.succeed(`Mining to address: ${miningAddress}`);
          } catch (error) {
            addressSpinner.fail("Error generating mining address");
            console.error(formatError(`Error: ${error.message}`));
            return;
          }

          // Mine blocks
          const miningSpinner = ora(
            `Mining ${confirmBlocks} blocks to confirm transactions...`,
          ).start();
          try {
            const blockHashes = await this.bitcoinService.generateToAddress(
              confirmBlocks,
              miningAddress,
            );
            miningSpinner.succeed(
              `Successfully mined ${blockHashes.length} blocks`,
            );
          } catch (error) {
            miningSpinner.fail("Error mining confirmation blocks");
            console.error(formatError(`Error: ${error.message}`));
          }
        }
      }

      // Check if visualization is running and offer to open it
      const vizManager = await this.getVisualizationManager();

      if (vizManager.isServerRunning()) {
        const openViz = await confirm({
          message: "Would you like to open the blockchain visualization?",
          default: true,
        });

        if (openViz) {
          console.log(colors.info("Opening visualization in browser..."));
          await open(vizManager.getServerUrl());
        }
      } else {
        const startViz = await confirm({
          message: "Would you like to start the blockchain visualization?",
          default: true,
        });

        if (startViz) {
          await this.startVisualization();
        }
      }
    } catch (error) {
      console.error(formatError("Error simulating blockchain:"), error);
    }
  }

  /**
   * Find a wallet with funds
   */
  private async findWalletWithFunds(wallets: string[]): Promise<string | null> {
    try {
      const spinner = ora("Looking for a wallet with funds...").start();

      for (const wallet of wallets) {
        try {
          const info = await this.bitcoinService.getWalletInfo(wallet);
          if (info.balance > 0) {
            spinner.succeed(
              `Found wallet with funds: ${wallet} (${info.balance} BTC)`,
            );
            return wallet;
          }
        } catch (error) {
          console.error(`Error checking wallet ${wallet}:`, error);
        }
      }

      spinner.fail("No wallet with funds found");
      return null;
    } catch (error) {
      console.error("Error finding wallet with funds:", error);
      return null;
    }
  }

  /**
   * Create random transactions
   */
  private async createRandomTransactions(
    sourceWallet: string,
    wallets: string[],
    count: number,
  ): Promise<void> {
    try {
      // Get source wallet balance
      const infoSpinner = ora(`Checking balance of ${sourceWallet}...`).start();
      let sourceInfo;

      try {
        sourceInfo = await this.bitcoinService.getWalletInfo(sourceWallet);
        infoSpinner.succeed(
          `Source wallet balance: ${formatBitcoin(sourceInfo.balance)}`,
        );
      } catch (error) {
        infoSpinner.fail("Error checking wallet balance");
        console.error(formatError(`Error: ${error.message}`));
        return;
      }

      if (sourceInfo.balance <= 0) {
        console.log(
          formatWarning("Source wallet has no funds. Please fund it first."),
        );
        return;
      }

      // Calculate amount per transaction (leave some for fees)
      const amountPerTx = sourceInfo.balance / (count * 1.1);

      // Filter out source wallet from destination wallets
      const destWallets = wallets.filter((w) => w !== sourceWallet);

      if (destWallets.length === 0) {
        console.log(
          formatWarning(
            "No destination wallets found. Please create another wallet.",
          ),
        );
        return;
      }

      console.log(
        colors.info(
          `Creating ${count} transactions of approximately ${formatBitcoin(amountPerTx)} each`,
        ),
      );

      for (let i = 0; i < count; i++) {
        // Randomly select a destination wallet
        const destWallet =
          destWallets[Math.floor(Math.random() * destWallets.length)];

        // Generate an address from the destination wallet
        const addressSpinner = ora(
          `Generating address from wallet ${destWallet}...`,
        ).start();
        let destAddress;

        try {
          destAddress = await this.bitcoinService.getNewAddress(destWallet);
          addressSpinner.succeed(
            `Transaction ${i + 1}/${count}: ${sourceWallet} -> ${destWallet} (${destAddress.substring(0, 8)}...)`,
          );
        } catch (error) {
          addressSpinner.fail("Error generating address");
          console.error(formatError(`Error: ${error.message}`));
          continue;
        }

        // Send transaction
        const txSpinner = ora("Sending transaction...").start();
        try {
          // Add some randomness to the amount
          const randomFactor = 0.5 + Math.random();
          const amount = Math.min(
            amountPerTx * randomFactor,
            sourceInfo.balance * 0.9,
          );

          const txid = await this.bitcoinService.sendToAddress(
            sourceWallet,
            destAddress,
            amount,
          );
          txSpinner.succeed(`Transaction sent: ${txid.substring(0, 8)}...`);
        } catch (error) {
          txSpinner.fail("Error sending transaction");
          console.error(formatError(`Error: ${error.message}`));
        }
      }

      console.log(
        boxText(
          `Created ${colors.highlight(count.toString())} transactions.\n\n` +
            `These transactions will initially be in the mempool (unconfirmed).\n` +
            `You can mine blocks to confirm them.`,
          { title: "Transactions Created", titleColor: colors.success },
        ),
      );
    } catch (error) {
      console.error(formatError("Error creating transactions:"), error);
    }
  }
}
