/**
 * Scenario Commands for Caravan-X
 */

import { select } from "@inquirer/prompts";
import chalk from "chalk";
import { ScenarioService } from "../core/scenario";
import { colors, displayCommandTitle } from "../utils/terminal";
import Table from "cli-table3";

export class ScenarioCommands {
  private scenarioService: ScenarioService;

  constructor(scenarioService: ScenarioService) {
    this.scenarioService = scenarioService;
  }

  async showScenarioMenu(): Promise<void> {
    displayCommandTitle("Test Scenarios");

    const action = await select({
      message: "What would you like to do?",
      choices: [
        { name: "📋 List Scenarios", value: "list" },
        { name: "🎬 Apply Scenario", value: "apply" },
        { name: "🔙 Back", value: "back" },
      ],
    });

    switch (action) {
      case "list":
        await this.listScenarios();
        break;
      case "apply":
        await this.applyScenario();
        break;
      case "back":
        return;
    }

    if (action !== "back") {
      await this.showScenarioMenu();
    }
  }

  private async listScenarios(): Promise<void> {
    const scenarios = await this.scenarioService.listScenarios();

    const table = new Table({
      head: ["Name", "Description", "Block Height"],
      colWidths: [25, 50, 15],
    });

    for (const scenario of scenarios) {
      table.push([
        scenario.name,
        scenario.description || "",
        scenario.blockHeight,
      ]);
    }

    console.log("\n" + table.toString());
  }

  private async applyScenario(): Promise<void> {
    const scenarios = await this.scenarioService.listScenarios();

    const scenarioId = await select({
      message: "Select scenario to apply:",
      choices: scenarios.map((s) => ({
        name: s.name,
        value: s.id,
        description: s.description,
      })),
    });

    await this.scenarioService.applyScenario(scenarioId);
  }
}
