/**
 * Snapshot Commands for Caravan-X
 */

import { select, input, confirm, checkbox } from "@inquirer/prompts";
import chalk from "chalk";
import { SnapshotService } from "../core/snapshot";
import { colors, displayCommandTitle } from "../utils/terminal";
import Table from "cli-table3";

export class SnapshotCommands {
  private snapshotService: SnapshotService;

  constructor(snapshotService: SnapshotService) {
    this.snapshotService = snapshotService;
  }

  async showSnapshotMenu(): Promise<void> {
    displayCommandTitle("Blockchain Snapshots");

    const action = await select({
      message: "What would you like to do?",
      choices: [
        { name: "📸 Create Snapshot", value: "create" },
        { name: "📋 List Snapshots", value: "list" },
        { name: "♻️  Restore Snapshot", value: "restore" },
        { name: "🔍 Compare Snapshots", value: "diff" },
        { name: "🗑️  Delete Snapshot", value: "delete" },
        { name: "🔙 Back", value: "back" },
      ],
    });

    switch (action) {
      case "create":
        await this.createSnapshot();
        break;
      case "list":
        await this.listSnapshots();
        break;
      case "restore":
        await this.restoreSnapshot();
        break;
      case "diff":
        await this.compareSnapshots();
        break;
      case "delete":
        await this.deleteSnapshot();
        break;
      case "back":
        return;
    }

    if (action !== "back") {
      await this.showSnapshotMenu();
    }
  }

  private async createSnapshot(): Promise<void> {
    const name = await input({
      message: "Snapshot name:",
      required: true,
    });

    const description = await input({
      message: "Description (optional):",
    });

    const snapshot = await this.snapshotService.createSnapshot({
      name,
      description,
    });

    console.log(colors.success(`\n✅ Snapshot created: ${snapshot.name}`));
    console.log(colors.info(`Block height: ${snapshot.blockHeight}`));
    console.log(colors.info(`ID: ${snapshot.id}`));
  }

  private async listSnapshots(): Promise<void> {
    const snapshots = await this.snapshotService.listSnapshots();

    if (snapshots.length === 0) {
      console.log(colors.warning("\nNo snapshots found."));
      return;
    }

    const table = new Table({
      head: ["Name", "Block Height", "Created", "Wallets"],
      colWidths: [25, 15, 20, 30],
    });

    for (const snapshot of snapshots) {
      table.push([
        snapshot.name,
        snapshot.blockHeight,
        new Date(snapshot.createdAt).toLocaleString(),
        snapshot.wallets.join(", "),
      ]);
    }

    console.log("\n" + table.toString());
  }

  private async restoreSnapshot(): Promise<void> {
    const snapshots = await this.snapshotService.listSnapshots();

    if (snapshots.length === 0) {
      console.log(colors.warning("\nNo snapshots available to restore."));
      return;
    }

    const snapshotId = await select({
      message: "Select snapshot to restore:",
      choices: snapshots.map((s) => ({
        name: `${s.name} (height: ${s.blockHeight})`,
        value: s.id,
      })),
    });

    const confirmRestore = await confirm({
      message: "This will replace your current blockchain state. Continue?",
      default: false,
    });

    if (confirmRestore) {
      await this.snapshotService.restoreSnapshot(snapshotId, {
        stopBitcoin: true,
        restartBitcoin: false,
      });
    }
  }

  private async compareSnapshots(): Promise<void> {
    const snapshots = await this.snapshotService.listSnapshots();

    if (snapshots.length < 2) {
      console.log(colors.warning("\nNeed at least 2 snapshots to compare."));
      return;
    }

    const snapshot1 = await select({
      message: "Select first snapshot:",
      choices: snapshots.map((s) => ({
        name: `${s.name} (height: ${s.blockHeight})`,
        value: s.id,
      })),
    });

    const snapshot2 = await select({
      message: "Select second snapshot:",
      choices: snapshots.map((s) => ({
        name: `${s.name} (height: ${s.blockHeight})`,
        value: s.id,
      })),
    });

    const diff = await this.snapshotService.diffSnapshots(snapshot1, snapshot2);

    console.log(chalk.bold("\n🔍 Snapshot Comparison\n"));
    console.log(`${diff.snapshot1.name} → ${diff.snapshot2.name}`);
    console.log(`Block height difference: ${diff.heightDiff}`);
    console.log(
      `Wallets added: ${diff.walletsDiff.added.join(", ") || "none"}`,
    );
    console.log(
      `Wallets removed: ${diff.walletsDiff.removed.join(", ") || "none"}`,
    );
  }

  private async deleteSnapshot(): Promise<void> {
    const snapshots = await this.snapshotService.listSnapshots();

    if (snapshots.length === 0) {
      console.log(colors.warning("\nNo snapshots to delete."));
      return;
    }

    const snapshotIds = await checkbox({
      message: "Select snapshots to delete:",
      choices: snapshots.map((s) => ({
        name: `${s.name} (height: ${s.blockHeight})`,
        value: s.id,
      })),
    });

    if (snapshotIds.length === 0) {
      return;
    }

    const confirmDelete = await confirm({
      message: `Delete ${snapshotIds.length} snapshot(s)?`,
      default: false,
    });

    if (confirmDelete) {
      for (const id of snapshotIds) {
        await this.snapshotService.deleteSnapshot(id);
      }
    }
  }
}
