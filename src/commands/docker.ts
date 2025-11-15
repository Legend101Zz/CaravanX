/**
 * Docker Commands for Caravan-X
 */
import { select, confirm, input } from "@inquirer/prompts";
import chalk from "chalk";
import { DockerService } from "../core/docker";

// Color utilities
const colors = {
  primary: chalk.hex("#F7931A"),
  success: chalk.hex("#28a745"),
  warning: chalk.hex("#ffc107"),
  error: chalk.hex("#dc3545"),
  info: chalk.hex("#17a2b8"),
  muted: chalk.hex("#6c757d"),
};

function displayCommandTitle(title: string): void {
  console.log("\n" + colors.primary(`${"=".repeat(50)}`));
  console.log(colors.primary(`  ${title}`));
  console.log(colors.primary(`${"=".repeat(50)}`) + "\n");
}

export class DockerCommands {
  private dockerService: DockerService;

  constructor(dockerService: DockerService) {
    this.dockerService = dockerService;
  }

  async showDockerMenu(): Promise<void> {
    displayCommandTitle("🐳 Docker Management");

    const action = await select({
      message: "What would you like to do?",
      choices: [
        { name: "📊 Container Status", value: "status" },
        {
          name: "🚀 Complete Setup (Container + Nginx + Wallet)",
          value: "complete_setup",
        },
        { name: "🧪 Test Connection", value: "test_connection" },
        { name: "📡 Show Connection Info", value: "connection_info" },
        { name: "📡 Show Connection Info", value: "connection_info" },
        { name: "▶️  Start Container", value: "start" },
        { name: "⏸️  Stop Container", value: "stop" },
        { name: "🔄 Restart Container", value: "restart" },
        { name: "🌐 Setup Nginx Proxy", value: "nginx" },
        { name: "💼 Create Watch-Only Wallet", value: "wallet" },
        { name: "🗑️  Remove Container", value: "remove" },
        { name: "📜 View Logs", value: "logs" },
        { name: "🐚 Open Shell", value: "shell" },
        { name: "🔧 Troubleshoot Port Issues", value: "troubleshoot" },
        { name: "🔙 Back", value: "back" },
      ],
    });

    try {
      switch (action) {
        case "complete_setup":
          await this.dockerService.completeSetup();
          break;
        case "test_connection":
          await this.dockerService.testConnection();
          break;
        case "connection_info":
          await this.dockerService.displayConnectionInfo();
          break;
        case "nginx":
          await this.dockerService.setupNginxProxy();
          break;
        case "wallet":
          const walletName = await input({
            message: "Enter wallet name:",
            default: "caravan_watcher",
          });
          await this.dockerService.createWatchOnlyWallet(walletName);
          break;
        case "status":
          await this.showStatus();
          break;
        case "start":
          await this.startContainerWithErrorHandling();
          break;
        case "stop":
          await this.dockerService.stopContainer();
          break;
        case "restart":
          await this.dockerService.restartContainer();
          break;
        case "remove":
          const confirmRemove = await confirm({
            message: "Are you sure you want to remove the container?",
            default: false,
          });
          if (confirmRemove) {
            await this.dockerService.removeContainer();
          }
          break;
        case "logs":
          await this.showLogs();
          break;
        case "shell":
          await this.dockerService.openShell();
          break;
        case "troubleshoot":
          await this.troubleshootPorts();
          break;
        case "back":
          return;
      }
    } catch (error: any) {
      await this.displayDockerError(error);
    }

    if (action !== "back") {
      await input({ message: "\nPress Enter to continue..." });
      await this.showDockerMenu();
    }
  }

  private async showStatus(): Promise<void> {
    const status = await this.dockerService.getContainerStatus();

    console.log(chalk.bold("\n📊 Container Status\n"));

    if (status.running) {
      console.log(colors.success("✅ Status: Running"));
      console.log(colors.info(`📦 Container ID: ${status.containerId}`));
      console.log(colors.info(`🔌 RPC Port: ${status.ports?.rpc}`));
      console.log(colors.info(`🌐 P2P Port: ${status.ports?.p2p}`));
      console.log(colors.info(`🔗 Network: ${status.network}`));
    } else {
      console.log(colors.warning("⏸️  Status: Not Running"));
      if (status.containerId) {
        console.log(
          colors.info(`📦 Container ID: ${status.containerId} (stopped)`),
        );
      } else {
        console.log(colors.muted("No container found"));
      }
    }
  }

  private async showLogs(): Promise<void> {
    console.log(chalk.dim("\n=== Container Logs (Last 50 lines) ===\n"));
    const logs = await this.dockerService.getLogs(50);
    console.log(logs);
  }

  private async startContainerWithErrorHandling(): Promise<void> {
    try {
      await this.dockerService.startContainer();
    } catch (error: any) {
      if (
        error.message.includes("port") &&
        error.message.includes("already in use")
      ) {
        await this.handlePortConflict(error);
      } else if (error.message.includes("platform")) {
        await this.handlePlatformMismatch(error);
      } else {
        throw error;
      }
    }
  }

  private async handlePortConflict(error: any): Promise<void> {
    console.log("\n" + colors.error("⚠️  Port Conflict Detected"));
    console.log(
      colors.warning(
        "\nOne or more ports required by the container are already in use.",
      ),
    );
    console.log(colors.muted("\nThis usually means:"));
    console.log(
      colors.muted(
        "  • Another Bitcoin Core instance is running on the same port",
      ),
    );
    console.log(
      colors.muted("  • A previous container wasn't properly cleaned up"),
    );
    console.log(
      colors.muted("  • Another application is using ports 18443 or 18444"),
    );

    const action = await select({
      message: "\nHow would you like to proceed?",
      choices: [
        {
          name: "🔍 Check what's using the ports",
          value: "check",
        },
        {
          name: "🗑️  Remove any existing Caravan-X containers",
          value: "cleanup",
        },
        {
          name: "❌ Cancel",
          value: "cancel",
        },
      ],
    });

    if (action === "check") {
      await this.troubleshootPorts();
    } else if (action === "cleanup") {
      await this.cleanupContainers();
    }
  }

  private async handlePlatformMismatch(error: any): Promise<void> {
    console.log("\n" + colors.warning("⚠️  Platform Mismatch Detected"));
    console.log(
      colors.info(
        "\nYour system is using ARM64 architecture (Apple Silicon/M1/M2/M3),",
      ),
    );
    console.log(
      colors.info("but the Docker image is built for AMD64 (Intel/x86)."),
    );
    console.log(
      colors.muted(
        "\nThis may cause performance issues or compatibility problems.",
      ),
    );

    const proceed = await confirm({
      message: "Would you like to continue anyway? (Docker will use emulation)",
      default: true,
    });

    if (proceed) {
      console.log(
        colors.info(
          "\n💡 Tip: Consider using a native ARM64 Bitcoin Core image for better performance.",
        ),
      );
    }
  }

  private async troubleshootPorts(): Promise<void> {
    displayCommandTitle("🔧 Port Troubleshooting");

    console.log(colors.info("Checking ports 18443 and 18444...\n"));

    try {
      const { exec } = require("child_process");
      const { promisify } = require("util");
      const execAsync = promisify(exec);

      // Check port 18443 (RPC)
      console.log(colors.primary("Checking port 18443 (Bitcoin RPC):"));
      try {
        const { stdout: rpcCheck } = await execAsync(
          "lsof -i :18443 || netstat -an | grep 18443 || echo 'Port appears free'",
        );
        if (rpcCheck.includes("Port appears free")) {
          console.log(colors.success("  ✅ Port 18443 is available\n"));
        } else {
          console.log(colors.error("  ❌ Port 18443 is in use:"));
          console.log(colors.muted(`  ${rpcCheck.trim()}\n`));
        }
      } catch (e) {
        console.log(colors.muted("  Unable to check port status\n"));
      }

      // Check port 18444 (P2P)
      console.log(colors.primary("Checking port 18444 (Bitcoin P2P):"));
      try {
        const { stdout: p2pCheck } = await execAsync(
          "lsof -i :18444 || netstat -an | grep 18444 || echo 'Port appears free'",
        );
        if (p2pCheck.includes("Port appears free")) {
          console.log(colors.success("  ✅ Port 18444 is available\n"));
        } else {
          console.log(colors.error("  ❌ Port 18444 is in use:"));
          console.log(colors.muted(`  ${p2pCheck.trim()}\n`));
        }
      } catch (e) {
        console.log(colors.muted("  Unable to check port status\n"));
      }

      // Check for Docker containers
      console.log(colors.primary("Checking for Docker containers:"));
      try {
        const { stdout: dockerCheck } = await execAsync(
          "docker ps -a --filter name=caravan",
        );
        if (dockerCheck.includes("caravan")) {
          console.log(colors.warning("  Found Caravan-related containers:"));
          console.log(colors.muted(`  ${dockerCheck}\n`));
        } else {
          console.log(colors.success("  ✅ No Caravan containers found\n"));
        }
      } catch (e) {
        console.log(colors.muted("  Unable to check Docker containers\n"));
      }
    } catch (error) {
      console.log(colors.error("Error during troubleshooting:"), error);
    }

    const action = await select({
      message: "What would you like to do?",
      choices: [
        {
          name: "🗑️  Clean up all Caravan-X containers",
          value: "cleanup",
        },
        {
          name: "🔙 Back to Docker menu",
          value: "back",
        },
      ],
    });

    if (action === "cleanup") {
      await this.cleanupContainers();
    }
  }

  private async cleanupContainers(): Promise<void> {
    console.log("\n" + colors.info("🗑️  Cleaning up Caravan-X containers..."));

    try {
      const { exec } = require("child_process");
      const { promisify } = require("util");
      const execAsync = promisify(exec);

      // Stop all caravan containers
      console.log(colors.muted("  Stopping containers..."));
      try {
        await execAsync(
          "docker stop $(docker ps -aq --filter name=caravan) 2>/dev/null",
        );
      } catch (e) {
        // Ignore errors if no containers found
      }

      // Remove all caravan containers
      console.log(colors.muted("  Removing containers..."));
      try {
        await execAsync(
          "docker rm $(docker ps -aq --filter name=caravan) 2>/dev/null",
        );
      } catch (e) {
        // Ignore errors if no containers found
      }

      console.log(colors.success("\n✅ Cleanup complete!\n"));

      const tryStart = await confirm({
        message: "Would you like to try starting the container now?",
        default: true,
      });

      if (tryStart) {
        await this.dockerService.startContainer();
      }
    } catch (error: any) {
      console.log(colors.error("Error during cleanup:"), error.message);
    }
  }

  private async displayDockerError(error: any): Promise<void> {
    const errorMessage = error.message || String(error);

    // Create a nice error box
    const boxWidth = 80;
    const lines = [
      "⚠️  Docker Error",
      "",
      ...this.wrapText(errorMessage, boxWidth - 4),
      "",
    ];

    // Determine error type and add helpful tips
    if (errorMessage.includes("port") && errorMessage.includes("in use")) {
      lines.push(
        "💡 Tip: Use 'Troubleshoot Port Issues' to identify what's using the ports",
      );
    } else if (errorMessage.includes("platform")) {
      lines.push(
        "💡 Tip: Your system architecture may not match the Docker image",
      );
    } else if (errorMessage.includes("docker: command not found")) {
      lines.push(
        "💡 Tip: Docker doesn't appear to be installed on your system",
      );
      lines.push("   Visit: https://docs.docker.com/get-docker/");
    } else if (errorMessage.includes("Cannot connect to the Docker daemon")) {
      lines.push("💡 Tip: Docker daemon is not running. Start Docker Desktop.");
    }

    // Draw the box
    console.log("\n" + colors.error("╔" + "═".repeat(boxWidth) + "╗"));
    lines.forEach((line) => {
      const padding = " ".repeat(
        Math.max(0, boxWidth - this.stripAnsi(line).length),
      );
      console.log(colors.error("║") + " " + line + padding + colors.error("║"));
    });
    console.log(colors.error("╚" + "═".repeat(boxWidth) + "╝\n"));
  }

  private wrapText(text: string, maxWidth: number): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      if ((currentLine + word).length <= maxWidth) {
        currentLine += (currentLine ? " " : "") + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);

    return lines;
  }

  private stripAnsi(text: string): string {
    return text.replace(
      /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
      "",
    );
  }
}
