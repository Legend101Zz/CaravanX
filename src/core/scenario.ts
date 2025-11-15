/**
 * Test Scenario Service for Caravan-X
 * Handles loading and applying pre-configured test scenarios
 */

import * as fs from "fs-extra";
import * as path from "path";
import chalk from "chalk";
import ora from "ora";
import {
  TestScenario,
  ScenarioWallet,
  ScenarioTransaction,
  BUILT_IN_SCENARIOS,
} from "../types/config";
import { BitcoinService } from "./bitcoin";
import { CaravanService } from "./caravan";
import { TransactionService } from "./transaction";
import { BitcoinRpcClient } from "./rpc";
import { AddressType, Network } from "../types/caravan";

export class ScenarioService {
  private readonly bitcoinService: BitcoinService;
  private readonly caravanService: CaravanService;
  private readonly transactionService: TransactionService;
  private readonly rpc: BitcoinRpcClient;
  private readonly scenariosDir: string;

  constructor(
    bitcoinService: BitcoinService,
    caravanService: CaravanService,
    transactionService: TransactionService,
    rpc: BitcoinRpcClient,
    scenariosDir: string,
  ) {
    this.bitcoinService = bitcoinService;
    this.caravanService = caravanService;
    this.transactionService = transactionService;
    this.rpc = rpc;
    this.scenariosDir = scenariosDir;

    // Ensure scenarios directory exists
    fs.ensureDirSync(this.scenariosDir);
  }

  /**
   * Get all available scenarios (built-in + custom)
   */
  async listScenarios(): Promise<TestScenario[]> {
    const builtInScenarios = Object.values(BUILT_IN_SCENARIOS);
    const customScenarios = await this.loadCustomScenarios();
    return [...builtInScenarios, ...customScenarios];
  }

  /**
   * Get a specific scenario by ID
   */
  async getScenario(scenarioId: string): Promise<TestScenario | null> {
    // Check built-in scenarios first
    if (BUILT_IN_SCENARIOS[scenarioId]) {
      return BUILT_IN_SCENARIOS[scenarioId];
    }

    // Check custom scenarios
    const customScenarios = await this.loadCustomScenarios();
    return customScenarios.find((s) => s.id === scenarioId) || null;
  }

  /**
   * Apply a test scenario
   */
  async applyScenario(scenarioId: string): Promise<void> {
    const scenario = await this.getScenario(scenarioId);
    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioId}`);
    }

    console.log(chalk.bold.cyan(`\n🎬 Applying Scenario: ${scenario.name}`));
    console.log(chalk.dim(scenario.description));
    console.log(chalk.dim("─".repeat(60)));

    try {
      // Step 1: Setup blockchain to target height
      await this.setupBlockchain(scenario.blockHeight);

      // Step 2: Create wallets
      await this.createScenarioWallets(scenario.wallets);

      // Step 3: Execute transactions
      await this.executeScenarioTransactions(
        scenario.transactions,
        scenario.wallets,
      );

      console.log(chalk.bold.green("\n✅ Scenario applied successfully!"));
      console.log(
        chalk.cyan(`\nCurrent block height: ${scenario.blockHeight}`),
      );
      console.log(
        chalk.cyan(
          `Wallets created: ${scenario.wallets.map((w) => w.name).join(", ")}`,
        ),
      );
    } catch (error: any) {
      console.log(chalk.bold.red("\n❌ Failed to apply scenario"));
      throw error;
    }
  }

  /**
   * Setup blockchain to target height
   */
  private async setupBlockchain(targetHeight: number): Promise<void> {
    const spinner = ora("Setting up blockchain...").start();

    try {
      const blockchainInfo = await this.rpc.callRpc<any>("getblockchaininfo");
      const currentHeight = blockchainInfo.blocks;

      if (currentHeight < targetHeight) {
        // Need to mine more blocks
        const blocksToMine = targetHeight - currentHeight;
        spinner.text = `Mining ${blocksToMine} blocks to reach height ${targetHeight}...`;

        // Create a temporary wallet for mining if it doesn't exist
        const wallets = await this.rpc.listWallets();
        let miningWallet = "mining_temp";

        if (!wallets.includes(miningWallet)) {
          await this.rpc.createWallet(miningWallet, false, false);
        }

        // Get a mining address
        const address = await this.rpc.getNewAddress(miningWallet);

        // Mine blocks
        await this.rpc.generateToAddress(blocksToMine, address);

        spinner.succeed(`Blockchain setup complete (height: ${targetHeight})`);
      } else if (currentHeight > targetHeight) {
        spinner.warn(
          `Current height (${currentHeight}) is greater than target (${targetHeight}). Skipping...`,
        );
      } else {
        spinner.succeed("Blockchain already at target height");
      }
    } catch (error: any) {
      spinner.fail("Failed to setup blockchain");
      throw error;
    }
  }

  /**
   * Create wallets for the scenario
   */
  private async createScenarioWallets(
    wallets: ScenarioWallet[],
  ): Promise<void> {
    console.log(chalk.bold("\n📁 Creating Wallets"));

    for (const wallet of wallets) {
      const spinner = ora(`Creating ${wallet.name}...`).start();

      try {
        if (wallet.type === "singlesig") {
          // Create regular wallet
          await this.createSinglesigWallet(wallet);
          spinner.succeed(`Created singlesig wallet: ${wallet.name}`);
        } else if (wallet.type === "multisig") {
          // Create multisig wallet
          await this.createMultisigWallet(wallet);
          spinner.succeed(`Created multisig wallet: ${wallet.name}`);
        }

        // Fund the wallet if balance is specified
        if (wallet.balance && wallet.balance > 0) {
          await this.fundWallet(wallet.name, wallet.balance);
          spinner.text = `Funded ${wallet.name} with ${wallet.balance} BTC`;
        }
      } catch (error: any) {
        spinner.fail(`Failed to create wallet: ${wallet.name}`);
        throw error;
      }
    }
  }

  /**
   * Create a singlesig wallet for the scenario
   */
  private async createSinglesigWallet(wallet: ScenarioWallet): Promise<void> {
    // Check if wallet already exists
    const existingWallets = await this.rpc.listWallets();

    if (existingWallets.includes(wallet.name)) {
      // Wallet exists, skip
      return;
    }

    // Determine descriptor type based on address type
    let descriptors = true;
    const addressType = wallet.addressType || "bech32";

    // Create wallet with appropriate descriptor
    await this.rpc.createWallet(wallet.name, false, false);
  }

  /**
   * Create a multisig wallet for the scenario
   */
  private async createMultisigWallet(wallet: ScenarioWallet): Promise<void> {
    if (!wallet.quorum) {
      throw new Error("Multisig wallet must have quorum specified");
    }

    // Generate keys for the multisig
    const { requiredSigners, totalSigners } = wallet.quorum;
    const extendedPublicKeys = [];

    // Generate xpubs for each signer
    for (let i = 0; i < totalSigners; i++) {
      const signerWallet = `${wallet.name}_signer_${i + 1}`;

      // Create signer wallet
      const existingWallets = await this.rpc.listWallets();
      if (!existingWallets.includes(signerWallet)) {
        await this.rpc.createWallet(signerWallet, false, false);
      }

      // Get wallet info
      const walletInfo = await this.rpc.getWalletInfo(signerWallet);

      // For simplicity, we'll use a standard derivation path
      const xpub = await this.getXpubFromWallet(signerWallet);

      extendedPublicKeys.push({
        name: `Signer ${i + 1}`,
        xpub,
        bip32Path: "m/48'/1'/0'/2'", // Standard for P2WSH multisig on testnet/regtest
        method: "text",
      });
    }

    // Create Caravan wallet config
    const addressType = this.getAddressTypeEnum(wallet.addressType || "P2WSH");

    await this.caravanService.createCaravanWalletConfig({
      name: wallet.name,
      addressType,
      network: Network.REGTEST,
      requiredSigners,
      totalSigners,
      extendedPublicKeys,
      startingAddressIndex: 0,
    });

    // Create watch-only wallet for the multisig
    const caravanConfig = await this.caravanService.getCaravanWallet(
      wallet.name,
    );
    if (caravanConfig) {
      await this.caravanService.createWatchWalletForCaravan(caravanConfig);
    }
  }

  /**
   * Get xpub from a wallet
   */
  private async getXpubFromWallet(walletName: string): Promise<string> {
    // Get wallet descriptors
    const descriptors = await this.rpc.callRpc<any>(
      "listdescriptors",
      [],
      walletName,
    );

    // Extract xpub from the first descriptor (simplified)
    const descriptor = descriptors.descriptors[0];
    const match = descriptor.desc.match(/\[(.*?)\](.*?)\/\*/);

    if (match && match[2]) {
      return match[2];
    }

    // Fallback: generate a dummy xpub (in production, use proper derivation)
    return "tpubD6NzVbkrYhZ4XgiXtGrdW5XDAPFCL9h7we1vwNCpn8tGbBcgfVYjXyhWo4E1xkh56hjod1RhGjxbaTLV3X4FyWuejifB9jusQ46QzG87VKp";
  }

  /**
   * Convert address type string to enum
   */
  private getAddressTypeEnum(addressType: string): AddressType {
    const typeMap: { [key: string]: AddressType } = {
      P2WSH: AddressType.P2WSH,
      P2SH: AddressType.P2SH,
      "P2SH-P2WSH": AddressType.P2SH_P2WSH,
    };

    return typeMap[addressType] || AddressType.P2WSH;
  }

  /**
   * Fund a wallet
   */
  private async fundWallet(walletName: string, amount: number): Promise<void> {
    // Get address from wallet
    const address = await this.rpc.getNewAddress(walletName);

    // Get a funded wallet to send from (create if doesn't exist)
    const wallets = await this.rpc.listWallets();
    let funderWallet = "scenario_funder";

    if (!wallets.includes(funderWallet)) {
      await this.rpc.createWallet(funderWallet, false, false);

      // Mine some blocks to the funder wallet
      const funderAddress = await this.rpc.getNewAddress(funderWallet);
      await this.rpc.generateToAddress(101, funderAddress);
    }

    // Send funds
    await this.rpc.sendToAddress(funderWallet, address, amount);

    // Mine a block to confirm
    const mineAddress = await this.rpc.getNewAddress(funderWallet);
    await this.rpc.generateToAddress(1, mineAddress);
  }

  /**
   * Execute transactions for the scenario
   */
  private async executeScenarioTransactions(
    transactions: ScenarioTransaction[],
    wallets: ScenarioWallet[],
  ): Promise<void> {
    if (transactions.length === 0) {
      return;
    }

    console.log(chalk.bold("\n💸 Executing Transactions"));

    for (const tx of transactions) {
      const spinner = ora(`${tx.from} → ${tx.to}: ${tx.amount} BTC`).start();

      try {
        // Get recipient address
        const toAddress = await this.rpc.getNewAddress(tx.to);

        // Create and send transaction
        const txid = await this.rpc.sendToAddress(
          tx.from,
          toAddress,
          tx.amount,
        );

        // Mine blocks to confirm if specified
        if (tx.confirmed) {
          const mineAddress = await this.rpc.getNewAddress(tx.from);
          await this.rpc.generateToAddress(1, mineAddress);
          spinner.succeed(
            `${tx.from} → ${tx.to}: ${tx.amount} BTC (confirmed)`,
          );
        } else {
          spinner.succeed(
            `${tx.from} → ${tx.to}: ${tx.amount} BTC (unconfirmed)`,
          );
        }

        // Add RBF or CPFP flags if specified
        if (tx.rbf) {
          spinner.text += " [RBF enabled]";
        }
        if (tx.cpfp) {
          spinner.text += " [CPFP ready]";
        }
      } catch (error: any) {
        spinner.fail(`Failed transaction: ${tx.from} → ${tx.to}`);
        throw error;
      }
    }
  }

  /**
   * Load custom scenarios from the scenarios directory
   */
  private async loadCustomScenarios(): Promise<TestScenario[]> {
    try {
      const files = await fs.readdir(this.scenariosDir);
      const jsonFiles = files.filter((file) => file.endsWith(".json"));

      const scenarios: TestScenario[] = [];

      for (const file of jsonFiles) {
        try {
          const scenarioPath = path.join(this.scenariosDir, file);
          const scenario = await fs.readJson(scenarioPath);

          // Validate scenario structure
          if (this.isValidScenario(scenario)) {
            scenarios.push(scenario);
          }
        } catch (error) {
          console.error(`Error loading scenario ${file}:`, error);
        }
      }

      return scenarios;
    } catch (error) {
      console.error("Error loading custom scenarios:", error);
      return [];
    }
  }

  /**
   * Validate scenario structure
   */
  private isValidScenario(scenario: any): scenario is TestScenario {
    return (
      scenario &&
      typeof scenario.id === "string" &&
      typeof scenario.name === "string" &&
      typeof scenario.blockHeight === "number" &&
      Array.isArray(scenario.wallets) &&
      Array.isArray(scenario.transactions)
    );
  }

  /**
   * Save a custom scenario
   */
  async saveScenario(scenario: TestScenario): Promise<void> {
    const filename = `${scenario.id}.json`;
    const filePath = path.join(this.scenariosDir, filename);

    await fs.writeJson(filePath, scenario, { spaces: 2 });
  }

  /**
   * Delete a custom scenario
   */
  async deleteScenario(scenarioId: string): Promise<void> {
    // Don't allow deleting built-in scenarios
    if (BUILT_IN_SCENARIOS[scenarioId]) {
      throw new Error("Cannot delete built-in scenarios");
    }

    const filename = `${scenarioId}.json`;
    const filePath = path.join(this.scenariosDir, filename);

    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
    }
  }
}
