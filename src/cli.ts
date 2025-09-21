#!/usr/bin/env node

import { Command } from "commander";
import CaravanRegtestManager from "./index";
import { confirm, input } from "@inquirer/prompts";
import * as fs from "fs-extra";
import * as path from "path";
import ora from "ora";
import {
  colors,
  caravanLogo,
  formatSuccess,
  formatWarning,
  formatError,
  boxText,
} from "./utils/terminal";
import { addScriptCommandsToCLI } from "./scripting/cli-integration";

// Display the Caravan logo
console.log(caravanLogo);

// Set up the command line interface
const program = new Command();

program
  .name("caravan-regtest")
  .description("Terminal-based utility for managing Caravan in regtest mode")
  .version("1.0.0")
  .addHelpText(
    "before",
    colors.info("A terminal-based utility for Bitcoin multisig wallet testing"),
  )
  .option("--json", "Output results in JSON format", false);

// List wallets command
program
  .command("list-wallets")
  .description("List all available wallets")
  .action(async () => {
    const spinner = ora("Initializing...").start();
    const app = new CaravanRegtestManager();
    spinner.succeed("Initialized");

    try {
      await app.walletCommands.listWallets();
    } catch (error) {
      console.error(formatError("Error listing wallets:"), error);
    }
  });

// Create wallet command
program
  .command("create-wallet")
  .description("Create a new wallet")
  .option("-n, --name <n>", "Name for the new wallet")
  .option("-w, --watch-only", "Create watch-only wallet (no private keys)")
  .option("-b, --blank", "Create blank wallet (no keys or addresses)")
  .action(async (options) => {
    const spinner = ora("Initializing...").start();
    const app = new CaravanRegtestManager();
    spinner.succeed("Initialized");

    try {
      // If a name was provided, use it directly
      if (options.name) {
        console.log(
          formatSuccess(`Creating wallet with name: ${options.name}`),
        );
        // Here you would implement direct wallet creation with the provided options
      } else {
        await app.walletCommands.createWallet();
      }
    } catch (error) {
      console.error(formatError("Error creating wallet:"), error);
    }
  });

// Create private key wallet command
// program
//   .command("create-key-wallet")
//   .description("Create a wallet with a known private key")
//   .option("-n, --name <n>", "Name for the new wallet")
//   .option("-k, --key <key>", "Private key in WIF format (optional)")
//   .action(async (options) => {
//     const spinner = ora("Initializing...").start();
//     const app = new CaravanRegtestManager();
//     spinner.succeed("Initialized");

//     try {
//       await app.walletCommands.createPrivateKeyWallet();
//     } catch (error) {
//       console.error(formatError("Error creating private key wallet:"), error);
//     }
//   });

// List Caravan wallets command
program
  .command("list-caravan")
  .description("List all Caravan wallet configurations")
  .action(async () => {
    const spinner = ora("Initializing...").start();
    const app = new CaravanRegtestManager();
    spinner.succeed("Initialized");

    try {
      await app.multisigCommands.listCaravanWallets();
    } catch (error) {
      console.error(formatError("Error listing Caravan wallets:"), error);
    }
  });

// Create Caravan wallet command
program
  .command("create-caravan")
  .description("Create a new Caravan multisig wallet")
  .action(async () => {
    const spinner = ora("Initializing...").start();
    const app = new CaravanRegtestManager();
    spinner.succeed("Initialized");

    try {
      await app.multisigCommands.createCaravanWallet();
    } catch (error) {
      console.error(formatError("Error creating Caravan wallet:"), error);
    }
  });

// Spend from Caravan wallet command
program
  .command("spend-caravan")
  .description("Spend funds from a Caravan multisig wallet")
  .action(async () => {
    const spinner = ora("Initializing...").start();
    const app = new CaravanRegtestManager();
    spinner.succeed("Initialized");

    try {
      await app.multisigCommands.spendFromCaravanWallet();
    } catch (error) {
      console.error(formatError("Error spending from Caravan wallet:"), error);
    }
  });

// Fund wallet command
program
  .command("fund-wallet")
  .description("Fund a wallet with new coins (using mining)")
  .option("-w, --wallet <n>", "Wallet name to fund")
  .option("-b, --blocks <number>", "Number of blocks to mine", "1")
  .action(async (options) => {
    const spinner = ora("Initializing...").start();
    const app = new CaravanRegtestManager();
    spinner.succeed("Initialized");

    try {
      await app.walletCommands.fundWallet(options.wallet);
    } catch (error) {
      console.error(formatError("Error funding wallet:"), error);
    }
  });

// Create PSBT command
program
  .command("create-psbt")
  .description("Create a new PSBT from a wallet")
  .option("-w, --wallet <n>", "Wallet name to create PSBT from")
  .option(
    "-o, --output <address:amount>",
    "Output in format 'address:amount' (can be used multiple times)",
    (val, memo) => {
      //@ts-ignore
      memo.push(val);
      return memo;
    },
    [],
  )
  .action(async (options) => {
    const spinner = ora("Initializing...").start();
    const app = new CaravanRegtestManager();
    spinner.succeed("Initialized");

    try {
      await app.transactionCommands.createPSBT();
    } catch (error) {
      console.error(formatError("Error creating PSBT:"), error);
    }
  });

// Sign PSBT command
program
  .command("sign-psbt")
  .description("Sign a PSBT with a wallet")
  .option("-f, --file <path>", "Path to PSBT file")
  .option("-w, --wallet <n>", "Wallet name to sign with")
  .action(async (options) => {
    const spinner = ora("Initializing...").start();
    const app = new CaravanRegtestManager();
    spinner.succeed("Initialized");

    try {
      let psbtBase64;
      if (options.file) {
        const readSpinner = ora(`Reading PSBT from ${options.file}...`).start();
        psbtBase64 = (await fs.readFile(options.file, "utf8")).trim();
        readSpinner.succeed("PSBT loaded");
      }
      await app.transactionCommands.signPSBTWithWallet(
        psbtBase64,
        options.wallet,
      );
    } catch (error) {
      console.error(formatError("Error signing PSBT:"), error);
    }
  });

// Sign PSBT with private key command
program
  .command("sign-psbt-key")
  .description("Sign a PSBT with a private key")
  .option("-f, --file <path>", "Path to PSBT file")
  .option("-k, --key <key>", "Private key in WIF format")
  .action(async (options) => {
    const spinner = ora("Initializing...").start();
    const app = new CaravanRegtestManager();
    spinner.succeed("Initialized");

    try {
      await app.transactionCommands.signPSBTWithPrivateKey();
    } catch (error) {
      console.error(formatError("Error signing PSBT with private key:"), error);
    }
  });

// Command for changing config path
program
  .command("config-path")
  .description("Change configuration file location")
  .requiredOption("-p, --path <path>", "New path for config file")
  .action(async (options) => {
    try {
      const spinner = ora("Initializing...").start();
      const app = new CaravanRegtestManager();
      spinner.succeed("Initialized");

      const changeSpinner = ora(
        `Changing configuration path to ${options.path}...`,
      ).start();
      await app.configManager.changeConfigLocation(options.path);
      changeSpinner.succeed(`Configuration path changed to: ${options.path}`);
    } catch (error) {
      console.error(formatError("Error changing config path:"), error);
    }
  });

// Import Caravan wallet from file
program
  .command("import-caravan")
  .description("Import a Caravan wallet configuration from a file")
  .requiredOption("-f, --file <path>", "Path to Caravan wallet JSON file")
  .action(async (options) => {
    const spinner = ora("Initializing...").start();
    const app = new CaravanRegtestManager();
    spinner.succeed("Initialized");

    try {
      const checkSpinner = ora(`Checking file ${options.file}...`).start();
      if (!fs.existsSync(options.file)) {
        checkSpinner.fail(`File not found: ${options.file}`);
        return;
      }
      checkSpinner.succeed("File exists");

      const readSpinner = ora("Reading wallet configuration...").start();
      const config = await fs.readJson(options.file);

      if (!config.name || !config.quorum || !config.extendedPublicKeys) {
        readSpinner.fail("Invalid Caravan wallet configuration");
        return;
      }
      readSpinner.succeed("Configuration validated");

      const fileName = path.basename(options.file);
      console.log(
        boxText(`Importing configuration from ${colors.highlight(fileName)}`, {
          title: "Import Caravan Wallet",
          titleColor: colors.info,
        }),
      );

      // Import the configuration
      const importSpinner = ora(`Importing wallet "${config.name}"...`).start();
      const savedFileName =
        await app.caravanService.saveCaravanWalletConfig(config);
      importSpinner.succeed(
        `Caravan wallet "${config.name}" imported successfully!`,
      );

      // Ask if user wants to create a watch-only wallet
      const createWatch = await confirm({
        message: "Create a watch-only wallet for this multisig wallet?",
        default: true,
      });

      if (createWatch) {
        await app.multisigCommands.createWatchWallet(config);
      }
    } catch (error) {
      console.error(formatError("Error importing Caravan wallet:"), error);
    }
  });

// Mining command
program
  .command("mine")
  .description("Mine blocks in regtest mode")
  .option("-n, --blocks <number>", "Number of blocks to mine", "1")
  .option("-a, --address <address>", "Address to mine to")
  .option(
    "-w, --wallet <n>",
    "Wallet to mine to (generates address automatically)",
  )
  .action(async (options) => {
    const spinner = ora("Initializing...").start();
    const app = new CaravanRegtestManager();
    spinner.succeed("Initialized");

    try {
      if (options.wallet) {
        // Mine to a wallet
        const mineSpinner = ora(
          `Mining ${options.blocks} blocks to wallet ${options.wallet}...`,
        ).start();
        const address = await app.bitcoinService.getNewAddress(options.wallet);
        const blockHashes = await app.bitcoinService.generateToAddress(
          parseInt(options.blocks),
          address,
        );
        mineSpinner.succeed(
          `Mined ${options.blocks} blocks to wallet ${options.wallet}`,
        );

        console.log(
          boxText(
            `Successfully mined ${blockHashes.length} blocks to address ${address}.\n` +
              `Latest block hash: ${blockHashes[blockHashes.length - 1]}`,
            { title: "Mining Complete", titleColor: colors.success },
          ),
        );
      } else if (options.address) {
        // Mine to an address
        const mineSpinner = ora(
          `Mining ${options.blocks} blocks to address ${options.address}...`,
        ).start();
        const blockHashes = await app.bitcoinService.generateToAddress(
          parseInt(options.blocks),
          options.address,
        );
        mineSpinner.succeed(
          `Mined ${options.blocks} blocks to address ${options.address}`,
        );

        console.log(
          boxText(
            `Successfully mined ${blockHashes.length} blocks.\n` +
              `Latest block hash: ${blockHashes[blockHashes.length - 1]}`,
            { title: "Mining Complete", titleColor: colors.success },
          ),
        );
      } else {
        console.log(
          formatWarning(
            "Please specify either a wallet or an address to mine to.",
          ),
        );
      }
    } catch (error) {
      console.error(formatError("Error mining blocks:"), error);
    }
  });

// Analyze PSBT command
program
  .command("analyze-psbt")
  .description("Analyze and decode a PSBT")
  .option("-f, --file <path>", "Path to PSBT file")
  .action(async (options) => {
    const spinner = ora("Initializing...").start();
    const app = new CaravanRegtestManager();
    spinner.succeed("Initialized");

    try {
      await app.transactionCommands.analyzePSBT();
    } catch (error) {
      console.error(formatError("Error analyzing PSBT:"), error);
    }
  });

// Finalize and broadcast PSBT command
program
  .command("finalize-psbt")
  .description("Finalize and broadcast a PSBT")
  .option("-f, --file <path>", "Path to PSBT file")
  .action(async (options) => {
    const spinner = ora("Initializing...").start();
    const app = new CaravanRegtestManager();
    spinner.succeed("Initialized");

    try {
      let psbtBase64;
      if (options.file) {
        const readSpinner = ora(`Reading PSBT from ${options.file}...`).start();
        psbtBase64 = (await fs.readFile(options.file, "utf8")).trim();
        readSpinner.succeed("PSBT loaded");
      }
      await app.transactionCommands.finalizeAndBroadcastPSBT(psbtBase64);
    } catch (error) {
      console.error(formatError("Error finalizing PSBT:"), error);
    }
  });

program
  .command("create-test-wallets")
  .description("Create test multisig wallets with different privacy levels")
  .option(
    "-n, --name <name>",
    "Base name for test wallets",
    "test_privacy_wallet",
  )
  .option("-t, --tx-count <count>", "Number of test transactions", "10")
  .option("-m, --required <m>", "Required signatures (M in M-of-N)", "1")
  .option("-s, --total <n>", "Total signers (N in M-of-N)", "2")
  .option(
    "-p, --privacy <level>",
    "Privacy level: good, moderate, bad, or all",
    "all",
  )
  .option(
    "-a, --address-type <type>",
    "Address type: p2wsh, p2sh-p2wsh, p2sh",
    "p2wsh",
  )
  .action(async (options) => {
    const spinner = ora("Initializing...").start();
    const app = new CaravanRegtestManager();
    spinner.succeed("Initialized");

    try {
      // Validate privacy level
      const validPrivacyLevels = ["good", "moderate", "bad", "all"];
      if (!validPrivacyLevels.includes(options.privacy.toLowerCase())) {
        console.error(formatError(`Invalid privacy level: ${options.privacy}`));
        console.log(formatWarning("Valid options: good, moderate, bad, all"));
        return;
      }

      // Validate address type
      const addressTypeMap: { [key: string]: any } = {
        p2wsh: "P2WSH",
        "p2sh-p2wsh": "P2SH_P2WSH",
        p2sh: "P2SH",
      };

      if (!addressTypeMap[options.addressType.toLowerCase()]) {
        console.error(
          formatError(`Invalid address type: ${options.addressType}`),
        );
        console.log(formatWarning("Valid options: p2wsh, p2sh-p2wsh, p2sh"));
        return;
      }

      // Call the method with CLI options
      await app.multisigCommands.createTestMultisigWalletsWithOptions({
        baseName: options.name,
        privacyLevel: options.privacy.toLowerCase(),
        addressType: addressTypeMap[options.addressType.toLowerCase()],
        requiredSigners: parseInt(options.required),
        totalSigners: parseInt(options.total),
        transactionCount: parseInt(options.txCount),
      });
    } catch (error) {
      console.error(formatError("Error creating test wallets:"), error);
    }
  });

// Blockchain info command
program
  .command("blockchain-info")
  .description("Show blockchain information")
  .action(async () => {
    const spinner = ora("Initializing...").start();
    const app = new CaravanRegtestManager();
    spinner.succeed("Initialized");

    try {
      // Otherwise use the RPC client directly
      const infoSpinner = ora("Fetching blockchain information...").start();
      const info = await app.bitcoinService.rpc.getBlockchainInfo();
      infoSpinner.succeed("Blockchain information fetched");

      console.log(
        boxText(
          `Chain: ${colors.highlight(info.chain)}\n` +
            `Blocks: ${colors.highlight(info.blocks.toString())}\n` +
            `Headers: ${colors.highlight(info.headers.toString())}\n` +
            `Best Block Hash: ${colors.highlight(info.bestblockhash)}\n` +
            `Difficulty: ${colors.highlight(info.difficulty.toString())}\n` +
            `Size on Disk: ${colors.highlight(`${(info.size_on_disk / 1000000).toFixed(2)} MB`)}\n` +
            `Verification Progress: ${colors.highlight(`${(info.verificationprogress * 100).toFixed(2)}%`)}`,
          { title: "Blockchain Status", titleColor: colors.header },
        ),
      );
    } catch (error) {
      console.error(formatError("Error getting blockchain info:"), error);
    }
  });

// Visualization commands
program
  .command("start-visualization")
  .description("Start the blockchain visualization server")
  .option(
    "-p, --port <port>",
    "Port to use for the visualization server",
    "3000",
  )
  .option("-n, --no-browser", "Don't open browser automatically")
  .action(async (options) => {
    const spinner = ora("Initializing...").start();
    const app = new CaravanRegtestManager();
    spinner.succeed("Initialized");

    try {
      // Force the port to be a number
      const port = parseInt(options.port);

      // Start visualization with browser option
      await app.visualizationCommands.startVisualization();
    } catch (error) {
      console.error(formatError("Error starting visualization:"), error);
    }
  });

program
  .command("stop-visualization")
  .description("Stop the blockchain visualization server")
  .action(async () => {
    const spinner = ora("Initializing...").start();
    const app = new CaravanRegtestManager();
    spinner.succeed("Initialized");

    try {
      await app.visualizationCommands.stopVisualization();
    } catch (error) {
      console.error(formatError("Error stopping visualization:"), error);
    }
  });

program
  .command("simulate-blockchain")
  .description("Simulate blockchain activity for testing")
  .option("-b, --blocks <number>", "Number of blocks to generate", "1")
  .option(
    "-t, --transactions <number>",
    "Number of transactions to create",
    "3",
  )
  .option("-w, --wallet <name>", "Wallet to use for mining")
  .action(async (options) => {
    const spinner = ora("Initializing...").start();
    const app = new CaravanRegtestManager();
    spinner.succeed("Initialized");

    try {
      await app.visualizationCommands.simulateBlockchain();
    } catch (error) {
      console.error(formatError("Error simulating blockchain:"), error);
    }
  });

// Sign Caravan PSBT command
program
  .command("sign-caravan-psbt")
  .description("Sign a Caravan PSBT and generate importable signature JSON")
  .option("-f, --file <path>", "Path to PSBT file")
  .option("-k, --key <key>", "Private key in WIF format for signing")
  .option("-o, --output <path>", "Output path for signature JSON file")
  .action(async (options) => {
    const spinner = ora("Initializing...").start();
    const app = new CaravanRegtestManager();
    spinner.succeed("Initialized");

    try {
      await app.multisigCommands.signCaravanPSBT();
    } catch (error) {
      console.error(formatError("Error signing Caravan PSBT:"), error);
    }
  });

// Start the interactive app (default command)
program
  .command("start", { isDefault: true })
  .description("Start the interactive application")
  .action(async () => {
    const spinner = ora("Starting Caravan Regtest Manager...").start();
    const app = new CaravanRegtestManager();
    spinner.succeed("Caravan Regtest Manager started");

    // Add script commands to CLI if launched from CLI
    if (process.argv.length > 2 && process.argv[1].includes("cli")) {
      // Create a ScriptEngine instance and add commands to CLI
      const scriptEngine = app.scriptCommands.getScriptEngine(); // You'll need to add this method
      addScriptCommandsToCLI(program, scriptEngine);
    }

    try {
      await app.start();
    } catch (error) {
      console.error(formatError("Error starting application:"), error);
    }
  });

program.parse(process.argv);
