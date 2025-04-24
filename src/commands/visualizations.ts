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
import chalk from "chalk";

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
        const blockchainInfo = (await this.bitcoinRpcClient.callRpc(
          "getblockchaininfo",
        )) as { chain: string };
        bitcoinCoreRunning = blockchainInfo.chain === "regtest";
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

        // Apply some animation to make the message more noticeable
        console.log("\n");
        console.log(chalk.bgGreenBright.black(" VISUALIZATION READY "));
        console.log("\n");

        console.log(
          boxText(
            `The blockchain visualization is now running on port ${colors.highlight(port!.toString())}.\n\n` +
              `You can access it at: ${colors.highlight(`http://localhost:${port}/`)}\n\n` +
              `This visualization includes:\n` +
              `${colors.success("✓")} Interactive block explorer\n` +
              `${colors.success("✓")} Real-time transaction monitoring\n` +
              `${colors.success("✓")} Network visualization\n` +
              `${colors.success("✓")} Mining activity logs\n` +
              `${colors.success("✓")} Animated blockchain updates\n\n` +
              `Keep this terminal window open to maintain the visualization server.\n` +
              `Press Ctrl+C or select "Stop visualization" from the menu to stop the server.`,
            {
              title: "Visualization Running",
              titleColor: colors.success,
            },
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
      } catch (error: any) {
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

      const confirmStop = await select({
        message: "Stop the visualization server?",
        choices: [
          { name: colors.highlight("Yes, stop the server"), value: "yes" },
          { name: colors.highlight("No, keep it running"), value: "no" },
        ],
      });

      if (confirmStop === "yes") {
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
      // First check if visualization is running
      const vizManager = await this.getVisualizationManager();
      const visualizationRunning = vizManager.isServerRunning();

      if (!visualizationRunning) {
        console.log(formatWarning("Visualization server is not running."));
        const startViz = await confirm({
          message: "Start visualization server before simulation?",
          default: true,
        });

        if (startViz) {
          await this.startVisualization();
        } else {
          console.log(
            formatWarning("Simulation works best with visualization running."),
          );
        }
      }

      // Check if Bitcoin Core is running
      const coreSpinner = ora("Checking Bitcoin Core connection...").start();
      try {
        await this.bitcoinRpcClient.callRpc("getblockchaininfo");
        coreSpinner.succeed("Connected to Bitcoin Core");
      } catch (error) {
        coreSpinner.fail("Could not connect to Bitcoin Core");
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
      } catch (error: any) {
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

      // Show simulation menu
      const simulationOptions = [
        {
          name: colors.highlight(
            "🚀 Quick simulation (5 blocks, 10 transactions)",
          ),
          value: "quick",
        },
        {
          name: colors.highlight(
            "🔄 Continuous simulation (blocks + transactions over time)",
          ),
          value: "continuous",
        },
        {
          name: colors.highlight("📊 Custom simulation (specify parameters)"),
          value: "custom",
        },
        {
          name: colors.highlight(
            "🧪 Agent-based simulation (miners and users)",
          ),
          value: "agents",
        },
      ];

      const simulationType = await select({
        message: "Select simulation type:",
        choices: simulationOptions,
      });

      // Source wallet with funds for transactions
      const sourceWallet = await this.findWalletWithFunds(wallets);

      if (!sourceWallet) {
        console.log(formatWarning("No wallet with funds found."));
        const fundWallet = await select({
          message: "Would you like to mine some blocks to fund a wallet first?",
          choices: [
            { name: colors.highlight("Yes, mine 5 blocks"), value: "yes" },
            { name: colors.highlight("No, cancel simulation"), value: "no" },
          ],
        });

        if (fundWallet === "no") {
          return;
        }

        // Mine some blocks to a wallet
        const miningWallet = wallets[0];
        const fundingSpinner = ora(
          `Mining 5 blocks to ${miningWallet}...`,
        ).start();
        try {
          const address = await this.bitcoinService.getNewAddress(miningWallet);
          await this.bitcoinService.generateToAddress(5, address);
          fundingSpinner.succeed(`Successfully funded wallet: ${miningWallet}`);
        } catch (error: any) {
          fundingSpinner.fail("Error mining blocks");
          console.error(formatError(`Error: ${error.message}`));
          return;
        }
      }

      switch (simulationType) {
        case "quick":
          await this.runQuickSimulation(wallets);
          break;
        case "continuous":
          await this.runContinuousSimulation(wallets);
          break;
        case "custom":
          await this.runCustomSimulation(wallets);
          break;
        case "agents":
          await this.runAgentBasedSimulation(wallets);
          break;
      }

      // If visualization is running, offer to open it
      if (visualizationRunning || vizManager.isServerRunning()) {
        const openViz = await confirm({
          message: "Open visualization in browser to see results?",
          default: true,
        });

        if (openViz) {
          console.log(colors.info("Opening visualization in browser..."));
          await open(vizManager.getServerUrl());
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

      spinner.warn("No wallet with funds found");
      return null;
    } catch (error) {
      console.error("Error finding wallet with funds:", error);
      return null;
    }
  }

  /**
   * Run a quick simulation (predefined parameters)
   */
  private async runQuickSimulation(wallets: string[]): Promise<void> {
    try {
      console.log(
        boxText(
          "This simulation will:\n" +
            "1. Mine 5 blocks\n" +
            "2. Create 10 random transactions\n" +
            "3. Mine 1 more block to confirm transactions",
          { title: "Quick Simulation", titleColor: colors.header },
        ),
      );

      const confirm = await select({
        message: "Start quick simulation?",
        choices: [
          { name: colors.highlight("Yes, start simulation"), value: "yes" },
          { name: colors.highlight("No, cancel"), value: "no" },
        ],
      });

      if (confirm === "no") {
        return;
      }

      // Step 1: Mine 5 blocks
      const miningWallet = wallets[0];
      const miningSpinner = ora(
        `Mining 5 blocks to ${miningWallet}...`,
      ).start();

      try {
        const address = await this.bitcoinService.getNewAddress(miningWallet);
        await this.bitcoinService.generateToAddress(5, address);
        miningSpinner.succeed("Successfully mined 5 blocks");
      } catch (error: any) {
        miningSpinner.fail("Error mining blocks");
        console.error(formatError(`Error: ${error.message}`));
        return;
      }

      // Step 2: Create transactions
      const txSpinner = ora("Creating 10 random transactions...").start();

      try {
        const sourceWallet = await this.findWalletWithFunds(wallets);

        if (!sourceWallet) {
          txSpinner.fail("No wallet with funds found");
          return;
        }

        const sourceInfo =
          await this.bitcoinService.getWalletInfo(sourceWallet);
        const amountPerTx = sourceInfo.balance / 15; // Divide by 15 to ensure enough for fees

        for (let i = 0; i < 10; i++) {
          // Generate a new address
          const destAddress = await this.bitcoinService.getNewAddress(
            wallets[Math.floor(Math.random() * wallets.length)],
          );

          // Add randomness to amount
          const randomFactor = 0.5 + Math.random();
          const amount = Math.min(
            amountPerTx * randomFactor,
            sourceInfo.balance * 0.1,
          );

          // Send transaction
          await this.bitcoinService.sendToAddress(
            sourceWallet,
            destAddress,
            amount,
          );

          txSpinner.text = `Created transaction ${i + 1}/10`;
        }

        txSpinner.succeed("Created 10 random transactions");
      } catch (error: any) {
        txSpinner.fail("Error creating transactions");
        console.error(formatError(`Error: ${error.message}`));
        return;
      }

      // Step 3: Mine 1 more block to confirm transactions
      const confirmSpinner = ora(
        "Mining 1 block to confirm transactions...",
      ).start();

      try {
        const address = await this.bitcoinService.getNewAddress(wallets[0]);
        await this.bitcoinService.generateToAddress(1, address);
        confirmSpinner.succeed("Successfully mined confirmation block");
      } catch (error: any) {
        confirmSpinner.fail("Error mining confirmation block");
        console.error(formatError(`Error: ${error.message}`));
      }

      console.log(formatSuccess("\nQuick simulation completed successfully!"));
      console.log("You can now view the results in the visualization.");
    } catch (error) {
      console.error(formatError("Error running quick simulation:"), error);
    }
  }

  /**
   * Run a continuous simulation (blocks + transactions over time)
   */
  private async runContinuousSimulation(wallets: string[]): Promise<void> {
    try {
      console.log(
        boxText(
          "This simulation will create blocks and transactions continuously over time.\n\n" +
            "You can specify:\n" +
            "- Duration (in seconds)\n" +
            "- Block interval (in seconds)\n" +
            "- Transactions per interval",
          { title: "Continuous Simulation", titleColor: colors.header },
        ),
      );

      // Get simulation parameters
      const duration = await number({
        message: "Enter simulation duration (seconds):",
        default: 60,
      });

      const blockInterval = await number({
        message: "Enter block interval (seconds):",
        default: 10,
      });

      const txPerInterval = await number({
        message: "Enter transactions per interval:",
        default: 3,
      });

      const sourceWallet = await this.findWalletWithFunds(wallets);
      if (!sourceWallet) {
        console.log(
          formatWarning("No wallet with funds found for transactions."),
        );
        return;
      }

      console.log(formatSuccess("\nStarting continuous simulation..."));
      console.log(colors.info(`Duration: ${duration} seconds`));
      console.log(colors.info(`Block interval: ${blockInterval} seconds`));
      console.log(colors.info(`Transactions per interval: ${txPerInterval}`));

      let elapsedTime = 0;
      const updateInterval = Math.min(blockInterval!, 5); // Update at least every 5 seconds
      const startTime = Date.now();

      const simulationInterval = setInterval(async () => {
        const now = Date.now();
        elapsedTime = Math.floor((now - startTime) / 1000);

        if (elapsedTime >= duration!) {
          clearInterval(simulationInterval);
          console.log(formatSuccess("\nContinuous simulation completed!"));
          return;
        }

        // Update progress
        const progress = Math.floor((elapsedTime / duration!) * 100);
        console.log(
          colors.info(
            `Simulation progress: ${progress}% (${elapsedTime}/${duration} seconds)`,
          ),
        );

        // Mine block if it's time
        if (elapsedTime % blockInterval! === 0) {
          try {
            const address = await this.bitcoinService.getNewAddress(wallets[0]);
            await this.bitcoinService.generateToAddress(1, address);
            console.log(formatSuccess("Mined a new block"));
          } catch (error) {
            console.error(formatError("Error mining block:"), error);
          }
        }

        // Create transactions
        if (elapsedTime % updateInterval === 0) {
          try {
            const sourceInfo =
              await this.bitcoinService.getWalletInfo(sourceWallet);

            if (sourceInfo.balance <= 0) {
              console.log(
                formatWarning(
                  "Source wallet has no more funds for transactions.",
                ),
              );
              return;
            }

            const amountPerTx = sourceInfo.balance / (txPerInterval! * 5); // Ensure enough for future txs

            for (let i = 0; i < Math.min(txPerInterval!, 5); i++) {
              // Generate a new address
              const destAddress = await this.bitcoinService.getNewAddress(
                wallets[Math.floor(Math.random() * wallets.length)],
              );

              // Add randomness to amount
              const randomFactor = 0.5 + Math.random();
              const amount = Math.min(
                amountPerTx * randomFactor,
                sourceInfo.balance * 0.1,
              );

              // Send transaction
              await this.bitcoinService.sendToAddress(
                sourceWallet,
                destAddress,
                amount,
              );
            }

            console.log(formatSuccess(`Created ${txPerInterval} transactions`));
          } catch (error) {
            console.error(formatError("Error creating transactions:"), error);
          }
        }
      }, updateInterval * 1000);

      // Allow user to stop simulation early
      console.log(colors.warning("\nPress Ctrl+C to stop simulation early"));
    } catch (error) {
      console.error(formatError("Error running continuous simulation:"), error);
    }
  }

  /**
   * Run a custom simulation (user-defined parameters)
   */
  private async runCustomSimulation(wallets: string[]): Promise<void> {
    try {
      console.log(
        boxText(
          "This simulation allows you to specify custom parameters for blocks and transactions.",
          { title: "Custom Simulation", titleColor: colors.header },
        ),
      );

      // Ask for simulation parameters
      const simulateBlocks = await confirm({
        message: "Would you like to simulate block mining?",
        default: true,
      });

      let numBlocks = 0;
      let blockInterval = 0;

      if (simulateBlocks) {
        numBlocks = (await number({
          message: "How many blocks would you like to mine?",
          default: 10,
        })) as number;

        blockInterval = (await number({
          message: "Interval between blocks (seconds, 0 for all at once):",
          default: 0,
        })) as number;
      }

      let simulateTxs = await confirm({
        message: "Would you like to simulate transactions?",
        default: true,
      });

      let numTransactions = 0;
      let txInterval = 0;

      if (simulateTxs) {
        numTransactions = (await number({
          message: "How many transactions would you like to create?",
          default: 20,
        })) as number;

        txInterval = (await number({
          message:
            "Interval between transactions (seconds, 0 for all at once):",
          default: 0,
        })) as number;
      }

      const confirmFinalBlock = await confirm({
        message: "Mine a final block to confirm transactions?",
        default: true,
      });

      // Start simulation
      console.log(formatSuccess("\nStarting custom simulation..."));

      // Source wallet for transactions
      let sourceWallet: string | null = null;

      if (simulateTxs) {
        sourceWallet = await this.findWalletWithFunds(wallets);

        if (!sourceWallet) {
          console.log(
            formatWarning("No wallet with funds found for transactions."),
          );

          const mineFirst = await confirm({
            message: "Would you like to mine some blocks first to get funds?",
            default: true,
          });

          if (mineFirst) {
            sourceWallet = wallets[0];
            const address =
              await this.bitcoinService.getNewAddress(sourceWallet);
            const spinner = ora("Mining initial blocks for funding...").start();

            try {
              await this.bitcoinService.generateToAddress(5, address);
              spinner.succeed("Mined 5 blocks for funding");
            } catch (error: any) {
              spinner.fail("Error mining funding blocks");
              console.error(formatError(`Error: ${error.message}`));
              return;
            }
          } else {
            console.log(
              formatWarning("Cannot create transactions without funds."),
            );
            simulateTxs = false;
          }
        }
      }

      // Mine blocks
      if (simulateBlocks) {
        if (blockInterval === 0) {
          // Mine all blocks at once
          const spinner = ora(`Mining ${numBlocks} blocks...`).start();

          try {
            const address = await this.bitcoinService.getNewAddress(wallets[0]);
            await this.bitcoinService.generateToAddress(numBlocks, address);
            spinner.succeed(`Mined ${numBlocks} blocks`);
          } catch (error: any) {
            spinner.fail("Error mining blocks");
            console.error(formatError(`Error: ${error.message}`));
            return;
          }
        } else {
          // Mine blocks with interval
          console.log(
            colors.info(
              `Mining ${numBlocks} blocks with ${blockInterval}s interval...`,
            ),
          );

          for (let i = 0; i < numBlocks; i++) {
            const spinner = ora(
              `Mining block ${i + 1}/${numBlocks}...`,
            ).start();

            try {
              const address = await this.bitcoinService.getNewAddress(
                wallets[0],
              );
              await this.bitcoinService.generateToAddress(1, address);
              spinner.succeed(`Mined block ${i + 1}/${numBlocks}`);

              if (i < numBlocks - 1) {
                await new Promise((resolve) =>
                  setTimeout(resolve, blockInterval * 1000),
                );
              }
            } catch (error: any) {
              spinner.fail(`Error mining block ${i + 1}`);
              console.error(formatError(`Error: ${error.message}`));
              break;
            }
          }
        }
      }

      // Create transactions
      if (simulateTxs && sourceWallet) {
        if (txInterval === 0) {
          // Create all transactions at once
          const spinner = ora(
            `Creating ${numTransactions} transactions...`,
          ).start();

          try {
            const sourceInfo =
              await this.bitcoinService.getWalletInfo(sourceWallet);
            const amountPerTx = sourceInfo.balance / (numTransactions * 1.5); // Allow for fees

            for (let i = 0; i < numTransactions; i++) {
              const destAddress = await this.bitcoinService.getNewAddress(
                wallets[Math.floor(Math.random() * wallets.length)],
              );

              const randomFactor = 0.5 + Math.random();
              const amount = Math.min(
                amountPerTx * randomFactor,
                sourceInfo.balance * 0.1,
              );

              await this.bitcoinService.sendToAddress(
                sourceWallet,
                destAddress,
                amount,
              );

              spinner.text = `Created transaction ${i + 1}/${numTransactions}`;
            }

            spinner.succeed(`Created ${numTransactions} transactions`);
          } catch (error: any) {
            spinner.fail("Error creating transactions");
            console.error(formatError(`Error: ${error.message}`));
          }
        } else {
          // Create transactions with interval
          console.log(
            colors.info(
              `Creating ${numTransactions} transactions with ${txInterval}s interval...`,
            ),
          );

          for (let i = 0; i < numTransactions; i++) {
            const spinner = ora(
              `Creating transaction ${i + 1}/${numTransactions}...`,
            ).start();

            try {
              const sourceInfo =
                await this.bitcoinService.getWalletInfo(sourceWallet);

              if (sourceInfo.balance <= 0) {
                spinner.warn("Source wallet has no more funds");
                break;
              }

              const amountPerTx =
                sourceInfo.balance / (numTransactions - i + 1) / 2;
              const destAddress = await this.bitcoinService.getNewAddress(
                wallets[Math.floor(Math.random() * wallets.length)],
              );

              const randomFactor = 0.5 + Math.random();
              const amount = Math.min(
                amountPerTx * randomFactor,
                sourceInfo.balance * 0.1,
              );

              await this.bitcoinService.sendToAddress(
                sourceWallet,
                destAddress,
                amount,
              );

              spinner.succeed(
                `Created transaction ${i + 1}/${numTransactions}`,
              );

              if (i < numTransactions - 1) {
                await new Promise((resolve) =>
                  setTimeout(resolve, txInterval * 1000),
                );
              }
            } catch (error: any) {
              spinner.fail(`Error creating transaction ${i + 1}`);
              console.error(formatError(`Error: ${error.message}`));
              break;
            }
          }
        }
      }

      // Mine final block to confirm transactions
      if (confirmFinalBlock && simulateTxs) {
        const spinner = ora(
          "Mining final block to confirm transactions...",
        ).start();

        try {
          const address = await this.bitcoinService.getNewAddress(wallets[0]);
          await this.bitcoinService.generateToAddress(1, address);
          spinner.succeed("Mined confirmation block");
        } catch (error: any) {
          spinner.fail("Error mining confirmation block");
          console.error(formatError(`Error: ${error.message}`));
        }
      }

      console.log(formatSuccess("\nCustom simulation completed successfully!"));
    } catch (error) {
      console.error(formatError("Error running custom simulation:"), error);
    }
  }

  /**
   * Run an agent-based simulation (miners and users)
   */
  private async runAgentBasedSimulation(wallets: string[]): Promise<void> {
    try {
      console.log(
        boxText(
          "This simulation creates virtual agents to simulate a blockchain network:\n\n" +
            "- 🧑‍🔧 Miners: Generate blocks at varying speeds\n" +
            "- 👥 Users: Create transactions with different patterns\n" +
            "- 🏪 Merchants: Receive payments regularly\n\n" +
            "Note: This is a simplified simulation for demonstration.",
          { title: "Agent-Based Simulation", titleColor: colors.header },
        ),
      );

      // Get simulation parameters
      const duration = await number({
        message: "Enter simulation duration (seconds):",
        default: 120,
      });

      const minerCount = await number({
        message: "Enter number of miners (1-5):",
        default: 3,
      });

      const userCount = await number({
        message: "Enter number of users (1-10):",
        default: 5,
      });

      // Validate wallet count
      if (wallets.length < 3) {
        console.log(
          formatWarning(
            `Need at least 3 wallets for simulation, but only have ${wallets.length}.`,
          ),
        );

        const createWallets = await confirm({
          message: "Create additional wallets?",
          default: true,
        });

        if (createWallets) {
          const spinner = ora("Creating additional wallets...").start();

          try {
            for (let i = wallets.length; i < 3; i++) {
              await this.bitcoinService.createWallet(`sim_wallet_${i}`);
            }

            // Refresh wallet list
            wallets = await this.bitcoinService.listWallets();
            spinner.succeed(`Now have ${wallets.length} wallets`);
          } catch (error: any) {
            spinner.fail("Error creating wallets");
            console.error(formatError(`Error: ${error.message}`));
            return;
          }
        } else {
          console.log(
            formatWarning("Cannot run simulation without enough wallets."),
          );
          return;
        }
      }

      // Ensure we have funds
      const sourceWallet = await this.findWalletWithFunds(wallets);

      if (!sourceWallet) {
        console.log(formatWarning("No wallet with funds found."));

        const mineFunds = await confirm({
          message: "Mine initial blocks for funding?",
          default: true,
        });

        if (mineFunds) {
          const spinner = ora("Mining initial blocks for funding...").start();

          try {
            const address = await this.bitcoinService.getNewAddress(wallets[0]);
            await this.bitcoinService.generateToAddress(10, address);
            spinner.succeed("Mined 10 blocks for funding");
          } catch (error: any) {
            spinner.fail("Error mining funding blocks");
            console.error(formatError(`Error: ${error.message}`));
            return;
          }
        } else {
          console.log(formatWarning("Cannot run simulation without funds."));
          return;
        }
      }

      // Show simulation plan
      console.log(formatSuccess("\nStarting agent-based simulation..."));
      console.log(colors.info(`Duration: ${duration} seconds`));
      console.log(colors.info(`Miners: ${minerCount}`));
      console.log(colors.info(`Users: ${userCount}`));

      // Assign roles to wallets
      const minerWallets = wallets.slice(
        0,
        Math.min(minerCount!, wallets.length),
      );
      const userWallets = wallets.slice(
        0,
        Math.min(userCount!, wallets.length),
      );
      const merchantWallet = wallets[wallets.length - 1];

      console.log(colors.info(`Miner wallets: ${minerWallets.join(", ")}`));
      console.log(colors.info(`User wallets: ${userWallets.join(", ")}`));
      console.log(colors.info(`Merchant wallet: ${merchantWallet}`));

      // Fund user wallets
      const fundingSpinner = ora(
        "Distributing funds to user wallets...",
      ).start();

      try {
        const fundingWallet = await this.findWalletWithFunds(wallets);

        if (fundingWallet) {
          const fundingInfo =
            await this.bitcoinService.getWalletInfo(fundingWallet);
          const fundPerWallet = fundingInfo.balance / (userWallets.length + 1);

          for (const userWallet of userWallets) {
            if (userWallet !== fundingWallet) {
              const address =
                await this.bitcoinService.getNewAddress(userWallet);
              await this.bitcoinService.sendToAddress(
                fundingWallet,
                address,
                fundPerWallet * 0.9,
              );
            }
          }

          fundingSpinner.succeed("Funds distributed to user wallets");

          // Mine a block to confirm funding transactions
          await this.bitcoinService.generateToAddress(
            1,
            await this.bitcoinService.getNewAddress(minerWallets[0]),
          );
        }
      } catch (error: any) {
        fundingSpinner.fail("Error distributing funds");
        console.error(formatError(`Error: ${error.message}`));
      }

      let elapsedTime = 0;
      const startTime = Date.now();

      // Setup agent behaviors
      const miners = minerWallets.map((wallet, index) => ({
        wallet,
        speed: Math.max(10, 30 - index * 5), // Miners have different speeds (10-30s)
        lastMineTime: 0,
      }));

      const users = userWallets.map((wallet, index) => ({
        wallet,
        frequency: Math.max(5, 20 - index * 3), // Users have different transaction frequencies (5-20s)
        lastTxTime: 0,
        pattern: index % 3, // Different transaction patterns (0: regular, 1: burst, 2: random)
      }));

      // Start simulation loop
      console.log(formatSuccess("\nSimulation running... (agents are active)"));

      const simulationInterval = setInterval(async () => {
        const now = Date.now();
        elapsedTime = Math.floor((now - startTime) / 1000);

        if (elapsedTime >= duration!) {
          clearInterval(simulationInterval);
          console.log(formatSuccess("\nAgent-based simulation completed!"));
          return;
        }

        // Update progress every 10 seconds
        if (elapsedTime % 10 === 0) {
          const progress = Math.floor((elapsedTime / duration!) * 100);
          console.log(
            colors.info(
              `Simulation progress: ${progress}% (${elapsedTime}/${duration} seconds)`,
            ),
          );
        }

        // Miners behavior
        for (const miner of miners) {
          if (elapsedTime - miner.lastMineTime >= miner.speed) {
            try {
              const address = await this.bitcoinService.getNewAddress(
                miner.wallet,
              );
              await this.bitcoinService.generateToAddress(1, address);
              miner.lastMineTime = elapsedTime;
              console.log(
                formatSuccess(`Miner ${miner.wallet} found a new block!`),
              );
            } catch (error) {
              console.error(
                formatError(`Error with miner ${miner.wallet}:`),
                error,
              );
            }
          }
        }

        // Users behavior
        for (const user of users) {
          const shouldCreateTx =
            user.pattern === 0
              ? elapsedTime - user.lastTxTime >= user.frequency // Regular
              : user.pattern === 1
                ? elapsedTime % 30 < 5 && elapsedTime - user.lastTxTime >= 5 // Burst
                : Math.random() < 0.1; // Random

          if (shouldCreateTx) {
            try {
              const userInfo = await this.bitcoinService.getWalletInfo(
                user.wallet,
              );

              if (userInfo.balance > 0.001) {
                // Randomly choose between merchant and other users
                const isMerchant = Math.random() < 0.7; // 70% to merchant
                const destWallet = isMerchant
                  ? merchantWallet
                  : userWallets[Math.floor(Math.random() * userWallets.length)];

                const destAddress =
                  await this.bitcoinService.getNewAddress(destWallet);
                const amount = Math.min(
                  0.001 + Math.random() * 0.01,
                  userInfo.balance * 0.5,
                );

                await this.bitcoinService.sendToAddress(
                  user.wallet,
                  destAddress,
                  amount,
                );

                user.lastTxTime = elapsedTime;
                console.log(
                  colors.info(
                    `User ${user.wallet} sent ${amount.toFixed(4)} BTC to ${isMerchant ? "merchant" : "another user"}`,
                  ),
                );
              }
            } catch (error) {
              console.error(
                formatError(`Error with user ${user.wallet}:`),
                error,
              );
            }
          }
        }
      }, 1000); // Check every second

      // Allow user to stop simulation early
      console.log(colors.warning("\nPress Ctrl+C to stop simulation early"));
    } catch (error) {
      console.error(
        formatError("Error running agent-based simulation:"),
        error,
      );
    }
  }
}
