import { Command } from "commander";
import CaravanRegtestManager from "./index";
import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import * as fs from "fs-extra";
import * as path from "path";

// Set up the command line interface
const program = new Command();

program
  .name("caravan-regtest")
  .description("Terminal-based utility for managing Caravan in regtest mode")
  .version("0.1.0");

// List wallets command
program
  .command("list-wallets")
  .description("List all available wallets")
  .action(async () => {
    const app = new CaravanRegtestManager();
    try {
      await app.walletCommands.listWallets();
    } catch (error) {
      console.error(chalk.red("\nError listing wallets:"), error);
    }
  });

// Create wallet command
program
  .command("create-wallet")
  .description("Create a new wallet")
  .action(async () => {
    const app = new CaravanRegtestManager();
    try {
      await app.walletCommands.createWallet();
    } catch (error) {
      console.error(chalk.red("\nError creating wallet:"), error);
    }
  });

// Create private key wallet command
program
  .command("create-key-wallet")
  .description("Create a wallet with a known private key")
  .action(async () => {
    const app = new CaravanRegtestManager();
    try {
      await app.walletCommands.createPrivateKeyWallet();
    } catch (error) {
      console.error(chalk.red("\nError creating private key wallet:"), error);
    }
  });

// List Caravan wallets command
program
  .command("list-caravan")
  .description("List all Caravan wallet configurations")
  .action(async () => {
    const app = new CaravanRegtestManager();
    try {
      await app.multisigCommands.listCaravanWallets();
    } catch (error) {
      console.error(chalk.red("\nError listing Caravan wallets:"), error);
    }
  });

// Create Caravan wallet command
program
  .command("create-caravan")
  .description("Create a new Caravan multisig wallet")
  .action(async () => {
    const app = new CaravanRegtestManager();
    try {
      await app.multisigCommands.createCaravanWallet();
    } catch (error) {
      console.error(chalk.red("\nError creating Caravan wallet:"), error);
    }
  });

// Fund wallet command
program
  .command("fund-wallet")
  .description("Fund a wallet with new coins (using mining)")
  .option("-w, --wallet <name>", "Wallet name to fund")
  .action(async (options) => {
    const app = new CaravanRegtestManager();
    try {
      await app.walletCommands.fundWallet(options.wallet);
    } catch (error) {
      console.error(chalk.red("\nError funding wallet:"), error);
    }
  });

// Create PSBT command
program
  .command("create-psbt")
  .description("Create a new PSBT from a wallet")
  .action(async () => {
    const app = new CaravanRegtestManager();
    try {
      await app.transactionCommands.createPSBT();
    } catch (error) {
      console.error(chalk.red("\nError creating PSBT:"), error);
    }
  });

// Sign PSBT command
program
  .command("sign-psbt")
  .description("Sign a PSBT with a wallet")
  .option("-f, --file <path>", "Path to PSBT file")
  .option("-w, --wallet <name>", "Wallet name to sign with")
  .action(async (options) => {
    const app = new CaravanRegtestManager();
    try {
      let psbtBase64;
      if (options.file) {
        psbtBase64 = (await fs.readFile(options.file, "utf8")).trim();
      }
      await app.transactionCommands.signPSBTWithWallet(
        psbtBase64,
        options.wallet,
      );
    } catch (error) {
      console.error(chalk.red("\nError signing PSBT:"), error);
    }
  });

// Sign PSBT with private key command
program
  .command("sign-psbt-key")
  .description("Sign a PSBT with a private key")
  .action(async () => {
    const app = new CaravanRegtestManager();
    try {
      await app.transactionCommands.signPSBTWithPrivateKey();
    } catch (error) {
      console.error(chalk.red("\nError signing PSBT with private key:"), error);
    }
  });

// Import Caravan wallet from file
program
  .command("import-caravan")
  .description("Import a Caravan wallet configuration from a file")
  .requiredOption("-f, --file <path>", "Path to Caravan wallet JSON file")
  .action(async (options) => {
    const app = new CaravanRegtestManager();
    try {
      if (!fs.existsSync(options.file)) {
        console.error(chalk.red(`File not found: ${options.file}`));
        return;
      }

      const config = await fs.readJson(options.file);
      if (!config.name || !config.quorum || !config.extendedPublicKeys) {
        console.error(chalk.red("Invalid Caravan wallet configuration."));
        return;
      }

      const fileName = path.basename(options.file);
      console.log(
        chalk.cyan(
          `\nImporting Caravan wallet configuration from ${fileName}...`,
        ),
      );

      // Import the configuration
      const caravanConfig = config;
      const savedFileName =
        await app.caravanService.saveCaravanWalletConfig(caravanConfig);

      console.log(
        chalk.green(
          `\nCaravan wallet "${caravanConfig.name}" imported successfully!`,
        ),
      );

      // Ask if user wants to create a watch-only wallet
      const createWatch = await confirm({
        message: "Create a watch-only wallet for this multisig wallet?",
        default: true,
      });

      if (createWatch) {
        await app.multisigCommands.createWatchWallet(caravanConfig);
      }
    } catch (error) {
      console.error(chalk.red("\nError importing Caravan wallet:"), error);
    }
  });

// Start the interactive app (default command)
program
  .command("start", { isDefault: true })
  .description("Start the interactive application")
  .action(async () => {
    const app = new CaravanRegtestManager();
    try {
      await app.start();
    } catch (error) {
      console.error(chalk.red("\nError starting application:"), error);
    }
  });

program.parse(process.argv);
