import * as fs from "fs-extra";
import * as path from "path";
import chalk from "chalk";
import { input, confirm, select, number } from "@inquirer/prompts";
import ora from "ora";
import { VM } from "vm2";

import { ScriptType } from "../types/scripting";
import { ScriptEngine } from "../scripting/ScriptEngine";
import { ConfigManager } from "../core/config";
import { BitcoinRpcClient } from "../core/rpc";
import { BitcoinService } from "../core/bitcoin";
import { CaravanService } from "../core/caravan";
import { MultisigCommands } from "./multisig";
import { TransactionService } from "../core/transaction";
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
 * Commands for managing blockchain scripting scenarios
 */
export class ScriptCommands {
  private readonly scriptEngine: ScriptEngine;
  private readonly configManager: ConfigManager;
  private readonly bitcoinService: BitcoinService;
  private readonly caravanService: CaravanService;
  private readonly transactionService: TransactionService;
  private readonly rpcClient: BitcoinRpcClient;
  private readonly multisigCommands: MultisigCommands;

  constructor(
    configManager: ConfigManager,
    bitcoinService: BitcoinService,
    caravanService: CaravanService,
    transactionService: TransactionService,
    rpcClient: BitcoinRpcClient,
    multisigCommands: MultisigCommands,
  ) {
    this.configManager = configManager;
    this.bitcoinService = bitcoinService;
    this.caravanService = caravanService;
    this.transactionService = transactionService;
    this.rpcClient = rpcClient;
    this.multisigCommands = multisigCommands;

    // Initialize the script engine
    this.scriptEngine = new ScriptEngine(
      bitcoinService,
      caravanService,
      transactionService,
      configManager,
      rpcClient,
      multisigCommands,
    );
  }

  /**
   * Get the script engine instance
   */
  getScriptEngine(): ScriptEngine {
    return this.scriptEngine;
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
   * List available script templates
   */
  async listScriptTemplates(): Promise<void> {
    displayCommandTitle("Available Script Templates");

    try {
      const loadingSpinner = ora("Loading script templates...").start();
      const templates = await this.scriptEngine.getScriptTemplates();
      loadingSpinner.succeed("Templates loaded");

      if (templates.length === 0) {
        console.log(formatWarning("No script templates found."));
        return;
      }

      // Prepare data for table
      const tableRows = templates.map((template, index) => [
        (index + 1).toString(),
        colors.highlight(template.name),
        template.description.substring(0, 60) +
          (template.description.length > 60 ? "..." : ""),
        template.path.endsWith(".js")
          ? colors.success("JavaScript")
          : colors.info("JSON"),
      ]);

      // Display table
      console.log(
        createTable(["#", "Template Name", "Description", "Type"], tableRows),
      );

      // Ask if user wants to view or run a template
      const actionChoices = [
        { name: colors.highlight("View template details"), value: "view" },
        { name: colors.highlight("Run a template script"), value: "run" },
        { name: colors.muted("Back to menu"), value: BACK_OPTION },
      ];

      const action = await select({
        message: "What would you like to do?",
        choices: actionChoices,
      });

      if (this.isBackOption(action)) {
        return;
      }

      if (action === "view") {
        await this.viewTemplateDetails(templates);
      } else if (action === "run") {
        await this.runScriptTemplate(templates);
      }
    } catch (error) {
      console.error(formatError("Error listing script templates:"), error);
    }
  }

  /**
   * View details of a specific template
   */
  private async viewTemplateDetails(templates: any[]): Promise<void> {
    try {
      const templateOptions = templates.map((template, index) => ({
        name: `${index + 1}. ${colors.highlight(template.name)}`,
        value: index,
      }));

      const selectedTemplateIndex: any = await select({
        message: "Select a template to view:",
        choices: this.addBackOption(templateOptions),
      });

      if (this.isBackOption(selectedTemplateIndex)) {
        return;
      }

      const selectedTemplate = templates[selectedTemplateIndex];
      const templatePath = selectedTemplate.path;

      // Load the template content
      const loadingSpinner = ora(
        `Loading template: ${selectedTemplate.name}...`,
      ).start();
      const scriptContent = await this.scriptEngine.loadScript(templatePath);
      loadingSpinner.succeed("Template loaded");

      // Generate a summary
      const summary = this.scriptEngine.generateScriptSummary(scriptContent);

      // Display template details
      console.log(
        boxText(summary, {
          title: `Template: ${selectedTemplate.name}`,
          titleColor: colors.header,
        }),
      );

      // Display template content
      const viewContentChoices = [
        {
          name: colors.highlight("View full script content"),
          value: "content",
        },
        { name: colors.highlight("Run this script"), value: "run" },
        { name: colors.muted("Back to template list"), value: BACK_OPTION },
      ];

      const viewAction = await select({
        message: "What would you like to do next?",
        choices: viewContentChoices,
      });

      if (this.isBackOption(viewAction)) {
        await this.listScriptTemplates();
        return;
      }

      if (viewAction === "content") {
        // Display the content of the template
        console.clear();
        displayCommandTitle(`Template: ${selectedTemplate.name}`);

        if (typeof scriptContent === "string") {
          // JavaScript content
          console.log(colors.code(scriptContent));
        } else {
          // JSON content
          console.log(colors.code(JSON.stringify(scriptContent, null, 2)));
        }

        // Wait for user to continue
        await input({ message: "Press Enter to continue..." });
        await this.viewTemplateDetails(templates);
      } else if (viewAction === "run") {
        // Run the template
        await this.executeScript(scriptContent, selectedTemplate.name);
      }
    } catch (error) {
      console.error(formatError("Error viewing template details:"), error);
    }
  }

  /**
   * Run a script template
   */
  private async runScriptTemplate(templates: any[]): Promise<void> {
    try {
      const templateOptions = templates.map((template, index) => ({
        name: `${index + 1}. ${colors.highlight(template.name)}`,
        value: index,
      }));

      const selectedTemplateIndex: any = await select({
        message: "Select a template to run:",
        choices: this.addBackOption(templateOptions),
      });

      if (this.isBackOption(selectedTemplateIndex)) {
        return;
      }

      const selectedTemplate = templates[selectedTemplateIndex];
      const templatePath = selectedTemplate.path;

      // Load the template content
      const loadingSpinner = ora(
        `Loading template: ${selectedTemplate.name}...`,
      ).start();
      const scriptContent = await this.scriptEngine.loadScript(templatePath);
      loadingSpinner.succeed("Template loaded");

      // Execute the script
      await this.executeScript(scriptContent, selectedTemplate.name);
    } catch (error) {
      console.error(formatError("Error running script template:"), error);
    }
  }

  /**
   * Execute a script with validation and confirmation
   */
  public async executeScript(script: any, name: string): Promise<void> {
    try {
      // Validate the script
      const validationSpinner = ora("Validating script...").start();
      const validationResult = this.scriptEngine.validateScript(script);

      if (!validationResult.valid) {
        validationSpinner.fail("Script validation failed");
        console.log(formatError("Validation errors:"));
        validationResult.errors.forEach((error) => {
          console.log(`  - ${error}`);
        });
        return;
      }

      validationSpinner.succeed("Script is valid");

      // Generate script summary
      const summary = this.scriptEngine.generateScriptSummary(script);
      console.log(
        boxText(summary, {
          title: `Script Summary: ${name}`,
          titleColor: colors.info,
        }),
      );

      // Ask for confirmation
      const confirmRun = await confirm({
        message: "Do you want to execute this script?",
        default: true,
      });

      if (!confirmRun) {
        console.log(formatWarning("Script execution cancelled."));
        return;
      }

      // Ask for execution options
      console.log(colors.header("\nExecution Options:"));

      const dryRun = await confirm({
        message: "Run in dry-run mode (no actual changes)?",
        default: false,
      });

      const verbose = await confirm({
        message: "Enable verbose logging?",
        default: true,
      });

      const interactive = await confirm({
        message: "Run in interactive mode (confirm each step)?",
        default: false,
      });

      // Execute the script
      const executionSpinner = ora("Executing script...").start();

      // Set up progress event handling
      this.scriptEngine.on("progress", (progress) => {
        executionSpinner.text = `Executing step ${progress.step}/${progress.total}: ${progress.message}`;
      });

      this.scriptEngine.on("log", (message) => {
        // Only show log messages in verbose mode
        if (verbose) {
          executionSpinner.stop();
          console.log(message);
          executionSpinner.start();
        }
      });

      try {
        const result = await this.scriptEngine.executeScript(script, {
          dryRun,
          verbose,
          interactive,
        });

        executionSpinner.succeed("Script execution completed");

        // Display execution summary
        console.log(
          boxText(
            `Status: ${colors.success(result.status)}\n` +
              `Duration: ${colors.highlight((result.duration! / 1000).toFixed(2))} seconds\n` +
              `Steps completed: ${colors.highlight(result.steps.filter((s) => s.status === "success").length.toString())} of ${result.steps.length}\n` +
              `Started: ${new Date(result.startTime).toLocaleString()}\n` +
              `Ended: ${new Date(result.endTime!).toLocaleString()}`,
            { title: "Execution Results", titleColor: colors.success },
          ),
        );

        // Display outputs
        if (result.outputs.wallets && result.outputs.wallets.length > 0) {
          console.log(colors.header("\nWallets created:"));
          result.outputs.wallets.forEach((wallet) => {
            console.log(`  - ${colors.highlight(wallet)}`);
          });
        }

        if (
          result.outputs.transactions &&
          result.outputs.transactions.length > 0
        ) {
          console.log(colors.header("\nTransactions created:"));
          result.outputs.transactions.forEach((tx) => {
            console.log(`  - ${colors.highlight(tx)}`);
          });
        }

        if (result.outputs.blocks && result.outputs.blocks.length > 0) {
          console.log(colors.header("\nBlocks mined:"));
          console.log(`  - ${result.outputs.blocks.length} blocks`);
        }
      } catch (error: any) {
        executionSpinner.fail("Script execution failed");
        console.log(formatError(`Error: ${error.message}`));
      }
    } catch (error) {
      console.error(formatError("Error executing script:"), error);
    }
  }

  /**
   * Create a new script
   */
  async createNewScript(): Promise<void> {
    displayCommandTitle("Create New Script");

    try {
      // Ask for script type
      const scriptType = await select({
        message: "Select script type:",
        choices: [
          {
            name: colors.highlight("JavaScript (Programmatic)"),
            value: ScriptType.JAVASCRIPT,
          },
          {
            name: colors.highlight("JSON (Declarative)"),
            value: ScriptType.JSON,
          },
          { name: colors.muted("Back to menu"), value: BACK_OPTION },
        ],
      });

      if (this.isBackOption(scriptType)) {
        return;
      }

      // Ask for script name
      const scriptName = await input({
        message: "Enter a name for your script:",
        validate: (input) =>
          input.trim() !== "" ? true : "Script name is required",
      });

      // Ask for script description
      const scriptDescription = await input({
        message: "Enter a description for your script:",
        validate: (input) =>
          input.trim() !== "" ? true : "Script description is required",
      });

      let scriptContent: string;

      if (scriptType === ScriptType.JAVASCRIPT) {
        // Create a JavaScript template
        scriptContent = this.createJavaScriptTemplate(
          scriptName,
          scriptDescription,
        );
      } else {
        // Create a JSON template
        scriptContent = this.createJSONTemplate(scriptName, scriptDescription);
      }

      // Show script preview
      console.log(colors.header("\nScript Preview:"));
      console.log(colors.code(scriptContent));

      // Ask to save or edit
      const action = await select({
        message: "What would you like to do with this script?",
        choices: [
          { name: colors.highlight("Save script"), value: "save" },
          {
            name: colors.highlight("Edit script before saving"),
            value: "edit",
          },
          { name: colors.muted("Cancel"), value: "cancel" },
        ],
      });

      if (action === "cancel") {
        console.log(formatWarning("Script creation cancelled."));
        return;
      }

      if (action === "edit") {
        console.log(
          formatWarning("External editing not implemented in this demo."),
        );
        // In a real implementation, you would launch an editor here
      }

      // Save the script
      if (action === "save" || action === "edit") {
        const saveSpinner = ora("Saving script...").start();

        try {
          const scriptPath = await this.scriptEngine.saveScript(
            scriptName,
            scriptContent,
            //@ts-expect-error
            scriptType,
          );

          saveSpinner.succeed(`Script saved to: ${scriptPath}`);

          // Ask if user wants to run the script now
          const runNow = await confirm({
            message: "Would you like to run this script now?",
            default: false,
          });

          if (runNow) {
            // Parse the content according to type
            const parsedContent =
              scriptType === ScriptType.JSON
                ? JSON.parse(scriptContent)
                : scriptContent;

            await this.executeScript(parsedContent, scriptName);
          }
        } catch (error: any) {
          saveSpinner.fail("Failed to save script");
          console.log(formatError(`Error: ${error.message}`));
        }
      }
    } catch (error) {
      console.error(formatError("Error creating script:"), error);
    }
  }

  /**
   * Create a JavaScript template
   */
  private createJavaScriptTemplate(name: string, description: string): string {
    return `/**
 * @name ${name}
 * @description ${description}
 * @version 1.0.0
 * @author Caravan Regtest Manager
 */

// Global configuration
const config = {
  // Add your configuration parameters here
  walletName: 'script_wallet',
};

// Main function to run the script
async function runScript() {
  try {
    console.log('Running script: ${name}');

    // Create a wallet
    await bitcoinService.createWallet(config.walletName, {
      disablePrivateKeys: false
    });

    // Mine some blocks to fund the wallet
    const address = await bitcoinService.getNewAddress(config.walletName);
    const blockHashes = await bitcoinService.generateToAddress(5, address);

    console.log(\`Mined \${blockHashes.length} blocks to fund wallet\`);

    // Add your script logic here

    return {
      success: true,
      message: 'Script completed successfully'
    };
  } catch (error) {
    console.error(\`Error in script: \${error.message}\`);
    throw error;
  }
}

// Run the script
runScript()
  .then(result => {
    console.log('Script completed successfully!');
    console.log(result);
  })
  .catch(error => {
    console.error('Script failed:', error.message);
  });
`;
  }

  /**
   * Create a JSON template
   */
  private createJSONTemplate(name: string, description: string): string {
    const template = {
      name,
      description,
      version: "1.0.0",
      variables: {
        walletName: "script_wallet",
        amount: 1.0,
      },
      actions: [
        {
          type: "CREATE_WALLET",
          description: "Create a wallet for testing",
          params: {
            name: "${walletName}",
            options: {
              disablePrivateKeys: false,
            },
            variableName: "wallet",
          },
        },
        {
          type: "MINE_BLOCKS",
          description: "Mine blocks to fund the wallet",
          params: {
            toWallet: "${walletName}",
            count: 5,
            variableName: "blocks",
          },
        },
        // Add more actions as needed
      ],
    };

    return JSON.stringify(template, null, 2);
  }

  /**
   * Run a custom script from file
   */
  async runCustomScript(): Promise<void> {
    displayCommandTitle("Run Custom Script");

    try {
      // Options for loading a script
      const loadOptions = [
        { name: colors.highlight("Load from file"), value: "file" },
        { name: colors.highlight("Import from templates"), value: "template" },
        { name: colors.muted("Back to menu"), value: BACK_OPTION },
      ];

      const loadFrom = await select({
        message: "How would you like to load the script?",
        choices: loadOptions,
      });

      if (this.isBackOption(loadFrom)) {
        return;
      }

      let scriptContent;
      let scriptName;

      if (loadFrom === "file") {
        // Get file path from user
        const filePath = await input({
          message: "Enter the path to the script file:",
          validate: (input) => {
            if (!input.trim()) return "File path is required";
            if (!fs.existsSync(input)) return "File not found";
            return true;
          },
        });

        // Load the script
        const loadingSpinner = ora("Loading script...").start();
        scriptContent = await this.scriptEngine.loadScript(filePath);
        scriptName = path.basename(filePath);
        loadingSpinner.succeed("Script loaded");
      } else {
        // Load from templates
        const loadingSpinner = ora("Loading templates...").start();
        const templates = await this.scriptEngine.getScriptTemplates();
        loadingSpinner.succeed("Templates loaded");

        if (templates.length === 0) {
          console.log(formatWarning("No templates found."));
          return;
        }

        // Let user select a template
        const templateOptions = templates.map((template, index) => ({
          name: `${index + 1}. ${colors.highlight(template.name)}`,
          value: index,
        }));

        const selectedTemplateIndex: any = await select({
          message: "Select a template:",
          choices: this.addBackOption(templateOptions),
        });

        if (this.isBackOption(selectedTemplateIndex)) {
          return;
        }

        const selectedTemplate = templates[selectedTemplateIndex];
        scriptContent = await this.scriptEngine.loadScript(
          selectedTemplate.path,
        );
        scriptName = selectedTemplate.name;
      }

      // Execute the script
      await this.executeScript(scriptContent, scriptName);
    } catch (error) {
      console.error(formatError("Error running custom script:"), error);
    }
  }

  /**
   * Manage saved scripts
   */
  async manageScripts(): Promise<void> {
    displayCommandTitle("Manage Scripts");

    try {
      // Get the scripts directory
      const scriptsDir = path.join(
        this.configManager.getConfig().appDir,
        "scripts",
      );
      await fs.ensureDir(scriptsDir);

      // List all scripts
      const listingSpinner = ora("Loading saved scripts...").start();
      const files = await fs.readdir(scriptsDir);
      const scriptFiles = files.filter(
        (file) => file.endsWith(".js") || file.endsWith(".json"),
      );
      listingSpinner.succeed("Scripts loaded");

      if (scriptFiles.length === 0) {
        console.log(formatWarning("No saved scripts found."));
        return;
      }

      // List the scripts
      const scripts = [];

      for (const file of scriptFiles) {
        const filePath = path.join(scriptsDir, file);
        try {
          const content = await fs.readFile(filePath, "utf8");
          let name = file;
          let description = "";

          if (file.endsWith(".json")) {
            // Extract from JSON
            const json = JSON.parse(content);
            if (json.name) name = json.name;
            if (json.description) description = json.description;
          } else {
            // Extract from JS comments
            const nameMatch = content.match(/@name\s+(.+)/);
            const descMatch = content.match(/@description\s+(.+)/);
            if (nameMatch) name = nameMatch[1].trim();
            if (descMatch) description = descMatch[1].trim();
          }

          scripts.push({
            file,
            path: filePath,
            name,
            description,
            type: file.endsWith(".js")
              ? ScriptType.JAVASCRIPT
              : ScriptType.JSON,
          });
        } catch (error: any) {
          console.log(
            formatWarning(`Could not read script ${file}: ${error.message}`),
          );
        }
      }

      // Display scripts table
      const tableRows = scripts.map((script, index) => [
        (index + 1).toString(),
        colors.highlight(script.name),
        script.description.substring(0, 60) +
          (script.description.length > 60 ? "..." : ""),
        script.type === ScriptType.JAVASCRIPT
          ? colors.success("JavaScript")
          : colors.info("JSON"),
      ]);

      console.log(
        createTable(["#", "Script Name", "Description", "Type"], tableRows),
      );

      // Ask what to do with scripts
      const action = await select({
        message: "What would you like to do?",
        choices: [
          { name: colors.highlight("Run a script"), value: "run" },
          { name: colors.highlight("View script details"), value: "view" },
          { name: colors.highlight("Delete a script"), value: "delete" },
          { name: colors.muted("Back to menu"), value: BACK_OPTION },
        ],
      });

      if (this.isBackOption(action)) {
        return;
      }

      // Select a script
      const scriptOptions = scripts.map((script, index) => ({
        name: `${index + 1}. ${colors.highlight(script.name)}`,
        value: index,
      }));

      const selectedIndex: any = await select({
        message: `Select a script to ${action}:`,
        choices: this.addBackOption(scriptOptions),
      });

      if (this.isBackOption(selectedIndex)) {
        return await this.manageScripts();
      }

      const selectedScript = scripts[selectedIndex];

      if (action === "run") {
        // Run the script
        const loadingSpinner = ora(
          `Loading script: ${selectedScript.name}...`,
        ).start();
        const scriptContent = await this.scriptEngine.loadScript(
          selectedScript.path,
        );
        loadingSpinner.succeed("Script loaded");

        await this.executeScript(scriptContent, selectedScript.name);
      } else if (action === "view") {
        // View script details
        console.clear();
        displayCommandTitle(`Script: ${selectedScript.name}`);

        // Read content
        const content = await fs.readFile(selectedScript.path, "utf8");
        console.log(colors.code(content));

        // Wait for user to continue
        await input({ message: "Press Enter to continue..." });
        await this.manageScripts();
      } else if (action === "delete") {
        // Confirm deletion
        const confirmDelete = await confirm({
          message: `Are you sure you want to delete the script "${selectedScript.name}"?`,
          default: false,
        });

        if (confirmDelete) {
          const deleteSpinner = ora(
            `Deleting script: ${selectedScript.name}...`,
          ).start();
          await fs.remove(selectedScript.path);
          deleteSpinner.succeed("Script deleted");
        } else {
          console.log(formatWarning("Deletion cancelled."));
        }

        // Go back to manage scripts
        await this.manageScripts();
      }
    } catch (error) {
      console.error(formatError("Error managing scripts:"), error);
    }
  }

  /**
   * Run health privacy test
   */
  async runHealthPrivacyTest(): Promise<void> {
    displayCommandTitle("Caravan Health Privacy Test");

    try {
      console.log(
        boxText(
          "This test creates three multisig wallets with different privacy characteristics:\n\n" +
            "🔒 GOOD Privacy: No UTXO mixing, no address reuse, varied amounts\n" +
            "⚠️  MODERATE Privacy: Some UTXO mixing, no address reuse\n" +
            "❌ BAD Privacy: Heavy address reuse, UTXO mixing, round amounts\n\n" +
            "The resulting wallets can be imported into Caravan to test the Health package.",
          { title: "Health Privacy Test", titleColor: colors.info },
        ),
      );

      const confirmRun = await confirm({
        message: "Run the health privacy test?",
        default: true,
      });

      if (!confirmRun) {
        return;
      }

      const templatePath = path.join(
        this.scriptEngine.getTemplatesDir(),
        "health_privacy_test.js",
      );

      if (await fs.pathExists(templatePath)) {
        const scriptContent = await this.scriptEngine.loadScript(templatePath);
        await this.executeScript(scriptContent, "Health Privacy Test");
      } else {
        console.log(formatError("Health privacy test script not found."));
        console.log(
          formatWarning(
            "Make sure health_privacy_test.js is in the templates directory.",
          ),
        );
      }
    } catch (error) {
      console.error(formatError("Error in health privacy test:"), error);
    }
  }

  /**
   * Run multisig RBF test
   */
  async runMultisigRBFTest(): Promise<void> {
    displayCommandTitle("Multisig RBF Test");

    try {
      console.log(
        boxText(
          "This test demonstrates Replace-By-Fee (RBF) with multisig wallets:\n\n" +
            "1. Creates a 2-of-3 multisig wallet\n" +
            "2. Sends a transaction with LOW fee (1 sat/vB)\n" +
            "3. Replaces it with HIGH fee transaction (10 sat/vB)\n" +
            "4. Verifies the replacement was successful",
          { title: "Multisig RBF Test", titleColor: colors.info },
        ),
      );

      const confirmRun = await confirm({
        message: "Run the multisig RBF test?",
        default: true,
      });

      if (!confirmRun) {
        return;
      }

      const templatePath = path.join(
        this.scriptEngine.getTemplatesDir(),
        "multisig_rbf_test.js",
      );

      if (await fs.pathExists(templatePath)) {
        const scriptContent = await this.scriptEngine.loadScript(templatePath);
        await this.executeScript(scriptContent, "Multisig RBF Test");
      } else {
        console.log(formatError("Multisig RBF test script not found."));
      }
    } catch (error) {
      console.error(formatError("Error in multisig RBF test:"), error);
    }
  }

  /**
   * Run multisig CPFP test
   */
  async runMultisigCPFPTest(): Promise<void> {
    displayCommandTitle("Multisig CPFP Test");

    try {
      console.log(
        boxText(
          "This test demonstrates Child-Pays-For-Parent (CPFP) with multisig:\n\n" +
            "1. Creates a 2-of-3 multisig wallet\n" +
            "2. Sends a PARENT transaction with LOW fee (1 sat/vB)\n" +
            "3. Creates a CHILD transaction spending parent output\n" +
            "4. Child has HIGH fee (50 sat/vB) to pull parent into block\n" +
            "5. Both transactions confirm together",
          { title: "Multisig CPFP Test", titleColor: colors.info },
        ),
      );

      const confirmRun = await confirm({
        message: "Run the multisig CPFP test?",
        default: true,
      });

      if (!confirmRun) {
        return;
      }

      const templatePath = path.join(
        this.scriptEngine.getTemplatesDir(),
        "multisig_cpfp_test.js",
      );

      if (await fs.pathExists(templatePath)) {
        const scriptContent = await this.scriptEngine.loadScript(templatePath);
        await this.executeScript(scriptContent, "Multisig CPFP Test");
      } else {
        console.log(formatError("Multisig CPFP test script not found."));
      }
    } catch (error) {
      console.error(formatError("Error in multisig CPFP test:"), error);
    }
  }
}
