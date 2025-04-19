import { Command } from "commander";
import { ScriptEngine } from "./ScriptEngine";
import { ScriptType } from "../types/scripting";
import * as fs from "fs-extra";
import ora from "ora";
import {
  formatSuccess,
  formatWarning,
  formatError,
  boxText,
} from "../utils/terminal";

/**
 * Add script commands to the CLI
 * @param program The Commander program to add commands to
 * @param scriptEngine The script engine instance
 */
export function addScriptCommandsToCLI(
  program: Command,
  scriptEngine: ScriptEngine,
) {
  // List script templates command
  program
    .command("list-templates")
    .description("List available script templates")
    .action(async () => {
      const spinner = ora("Loading templates...").start();
      try {
        const templates = await scriptEngine.getScriptTemplates();
        spinner.succeed("Templates loaded");

        if (templates.length === 0) {
          console.log(formatWarning("No script templates found."));
          return;
        }

        console.log(
          formatSuccess(`Found ${templates.length} script templates:`),
        );
        templates.forEach((template, index) => {
          console.log(`${index + 1}. ${template.name}`);
          console.log(
            `   ${template.description?.substring(0, 80) || "No description"}${template.description?.length > 80 ? "..." : ""}`,
          );
          console.log(
            `   Type: ${template.path.endsWith(".js") ? "JavaScript" : "JSON"}`,
          );
          console.log();
        });
      } catch (error) {
        spinner.fail("Error loading templates");
        console.error(formatError("Error:"), error);
      }
    });

  // Run script command
  program
    .command("run-script")
    .description("Run a Bitcoin scenario script")
    .option("-f, --file <path>", "Path to script file")
    .option("-t, --template <name>", "Name of template to run")
    .option("-d, --dry-run", "Run in dry-run mode (no actual execution)")
    .option("-v, --verbose", "Enable verbose logging")
    .option("-i, --interactive", "Run in interactive mode (confirm each step)")
    .action(async (options) => {
      try {
        let scriptPath: string | undefined;
        let scriptContent: any;
        let scriptName: string;

        if (options.file) {
          // Load from file
          scriptPath = options.file;
          if (!fs.existsSync(scriptPath!)) {
            console.error(formatError(`Script file not found: ${scriptPath}`));
            return;
          }
          scriptName = scriptPath!;
        } else if (options.template) {
          // Load from template
          const spinner = ora("Loading templates...").start();
          const templates = await scriptEngine.getScriptTemplates();
          spinner.succeed("Templates loaded");

          // Find the template by name
          const template = templates.find(
            (t) =>
              t.name.toLowerCase() === options.template.toLowerCase() ||
              t.name.toLowerCase().includes(options.template.toLowerCase()),
          );

          if (!template) {
            console.error(
              formatError(`Template not found: ${options.template}`),
            );
            console.log(formatWarning("Available templates:"));
            templates.forEach((t) => console.log(`- ${t.name}`));
            return;
          }

          scriptPath = template.path;
          scriptName = template.name;
        } else {
          console.error(
            formatError("Either --file or --template option is required"),
          );
          return;
        }

        // Load the script
        const loadingSpinner = ora(
          `Loading script from ${scriptPath}...`,
        ).start();
        scriptContent = await scriptEngine.loadScript(scriptPath!);
        loadingSpinner.succeed("Script loaded");

        // Validate the script
        const validationSpinner = ora("Validating script...").start();
        const validationResult = scriptEngine.validateScript(scriptContent);

        if (!validationResult.valid) {
          validationSpinner.fail("Script validation failed");
          console.log(formatError("Validation errors:"));
          validationResult.errors.forEach((error) => {
            console.log(`  - ${error}`);
          });
          return;
        }

        validationSpinner.succeed("Script is valid");

        // Generate summary
        const summary = scriptEngine.generateScriptSummary(scriptContent);
        console.log(
          boxText(summary, {
            title: `Script Summary: ${scriptName}`,
            titleColor: (str: string) => str,
          }),
        );

        // Execute the script
        const executionSpinner = ora("Executing script...").start();

        // Set up event handlers
        scriptEngine.on("progress", (progress) => {
          executionSpinner.text = `Executing step ${progress.step}/${progress.total}: ${progress.message}`;
        });

        scriptEngine.on("log", (message) => {
          // Only show logs in verbose mode
          if (options.verbose) {
            executionSpinner.stop();
            console.log(message);
            executionSpinner.start();
          }
        });

        try {
          const result = await scriptEngine.executeScript(scriptContent, {
            dryRun: options.dryRun || false,
            verbose: options.verbose || false,
            interactive: options.interactive || false,
          });

          executionSpinner.succeed("Script execution completed");

          // Display results summary
          console.log(
            boxText(
              `Status: ${result.status}\n` +
                `Duration: ${(result.duration! / 1000).toFixed(2)} seconds\n` +
                `Steps completed: ${result.steps.filter((s) => s.status === "success").length} of ${result.steps.length}`,
              { title: "Execution Results", titleColor: (str: string) => str },
            ),
          );
        } catch (error: any) {
          executionSpinner.fail("Script execution failed");
          console.error(formatError(`Error: ${error.message}`));
        }
      } catch (error) {
        console.error(formatError("Error running script:"), error);
      }
    });

  // Create script command
  program
    .command("create-script")
    .description("Create a new Bitcoin scenario script")
    .option("-n, --name <name>", "Script name")
    .option("-d, --description <desc>", "Script description")
    .option("-t, --type <type>", "Script type (js or json)", "js")
    .option("-o, --output <path>", "Output file path")
    .action(async (options) => {
      try {
        const name = options.name || "new_script";
        const description = options.description || "A Bitcoin scenario script";
        const type =
          options.type.toLowerCase() === "json"
            ? ScriptType.JSON
            : ScriptType.JAVASCRIPT;

        // Create script content
        let scriptContent: string;
        if (type === ScriptType.JAVASCRIPT) {
          scriptContent = `/**
 * @name ${name}
 * @description ${description}
 * @version 1.0.0
 * @author Caravan Regtest Manager
 */

// Main function to run the script
async function runScript() {
  try {
    console.log('Running script: ${name}');

    // Create a wallet
    await bitcoinService.createWallet('${name.replace(/\s+/g, "_").toLowerCase()}_wallet', {
      disablePrivateKeys: false
    });

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
  });`;
        } else {
          // JSON template
          const template = {
            name,
            description,
            version: "1.0.0",
            variables: {
              walletName: name.replace(/\s+/g, "_").toLowerCase() + "_wallet",
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
              // Add more actions as needed
            ],
          };

          scriptContent = JSON.stringify(template, null, 2);
        }

        // Save the script
        let outputPath: string;
        if (options.output) {
          outputPath = options.output;
        } else {
          // Generate a default path
          outputPath = await scriptEngine.saveScript(name, scriptContent, type);
        }

        const saveSpinner = ora(`Saving script to ${outputPath}...`).start();

        if (options.output) {
          // Ensure directory exists
          await fs.ensureDir(require("path").dirname(outputPath));
          // Write the file directly
          await fs.writeFile(outputPath, scriptContent);
        }

        saveSpinner.succeed(`Script saved to: ${outputPath}`);

        console.log(formatSuccess("Script created successfully!"));
        console.log("You can run it with:");
        console.log(`  caravan-regtest run-script --file "${outputPath}"`);
      } catch (error) {
        console.error(formatError("Error creating script:"), error);
      }
    });
}
