import chalk from "chalk";
import boxen from "boxen";

export const logger = {
  info: (message: string) => {
    console.log(chalk.cyan("ℹ"), message);
  },

  success: (message: string) => {
    console.log(chalk.green("✓"), message);
  },

  warn: (message: string) => {
    console.log(chalk.yellow("⚠"), message);
  },

  error: (message: string, error?: any) => {
    console.log(chalk.red("✗"), message);
    if (error) {
      if (error.message) {
        console.log(chalk.gray("  Error:"), chalk.red(error.message));
      }
      if (process.env.DEBUG && error.stack) {
        console.log(chalk.gray(error.stack));
      }
    }
  },

  debug: (message: string, ...args: any[]) => {
    if (process.env.DEBUG) {
      console.log(chalk.gray("🔍"), message, ...args);
    }
  },

  box: (
    message: string,
    options?: {
      title?: string;
      type?: "info" | "success" | "warning" | "error";
    },
  ) => {
    const colors = {
      info: "cyan",
      success: "green",
      warning: "yellow",
      error: "red",
    };

    console.log(
      boxen(message, {
        title: options?.title,
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: colors[options?.type || "info"] as any,
      }),
    );
  },
};
