/**
 * Caravan-X Logger
 *
 * Centralized logging with level-based filtering and optional file output.
 * Replaces scattered console.log/console.error calls throughout the codebase.
 *
 * Levels (from quietest to noisiest):
 *   silent  → only errors (no stack traces)
 *   normal  → errors + warnings + info + success (default)
 *   verbose → all above + step-by-step operation details
 *   debug   → everything including raw commands, RPC payloads, stack traces
 *
 * Usage:
 *   import { log } from '../utils/logger';
 *
 *   log.info('Starting container...');
 *   log.debug('Running command:', cmd);
 *   log.error('Failed to start', error);
 *   log.step(3, 10, 'Checking ports...');
 */

import chalk from "chalk";
import boxen from "boxen";
import * as fs from "fs-extra";
import * as path from "path";
import { CaravanXError, ErrorCategory } from "./errors";
import { colors } from "./terminal";

// ---------------------------------------------------------------------------
// Log levels — numeric so we can do simple >= comparisons
// ---------------------------------------------------------------------------
export enum LogLevel {
  SILENT = 0,
  NORMAL = 1,
  VERBOSE = 2,
  DEBUG = 3,
}

/** Map string names (from CLI/config) to enum values */
export function parseLogLevel(input: string | undefined): LogLevel {
  switch (input?.toLowerCase()) {
    case "silent":
    case "quiet":
      return LogLevel.SILENT;
    case "verbose":
      return LogLevel.VERBOSE;
    case "debug":
      return LogLevel.DEBUG;
    case "normal":
    default:
      return LogLevel.NORMAL;
  }
}

// ---------------------------------------------------------------------------
// File logger — writes everything to disk regardless of terminal level
// ---------------------------------------------------------------------------
class FileLogger {
  private logDir: string;
  private logPath: string;
  private stream: fs.WriteStream | null = null;
  private enabled: boolean;

  // max 5MB per file, keep 3 rotations
  private readonly MAX_SIZE = 5 * 1024 * 1024;
  private readonly MAX_FILES = 3;

  constructor(logDir: string, enabled: boolean = true) {
    this.logDir = logDir;
    this.logPath = path.join(logDir, "caravan-x.log");
    this.enabled = enabled;
  }

  /** Set up directory + rotate if needed */
  async initialize(): Promise<void> {
    if (!this.enabled) return;

    try {
      await fs.ensureDir(this.logDir);
      await this.rotateIfNeeded();

      this.stream = fs.createWriteStream(this.logPath, { flags: "a" });

      // write session header
      const sep = "=".repeat(60);
      this.stream.write(
        `\n${sep}\n` +
          `Caravan-X session started at ${new Date().toISOString()}\n` +
          `${sep}\n\n`,
      );
    } catch (err) {
      // file logging is best-effort — don't crash the app
      console.error(chalk.dim("Could not initialize file logging:"), err);
      this.enabled = false;
    }
  }

  /** Rotate caravan-x.log → caravan-x.1.log → caravan-x.2.log etc */
  private async rotateIfNeeded(): Promise<void> {
    try {
      if (!(await fs.pathExists(this.logPath))) return;

      const stats = await fs.stat(this.logPath);
      if (stats.size < this.MAX_SIZE) return;

      // shift existing rotations: .2 → .3, .1 → .2
      for (let i = this.MAX_FILES - 1; i >= 1; i--) {
        const from = path.join(this.logDir, `caravan-x.${i}.log`);
        const to = path.join(this.logDir, `caravan-x.${i + 1}.log`);
        if (await fs.pathExists(from)) {
          await fs.move(from, to, { overwrite: true });
        }
      }

      // current → .1
      await fs.move(this.logPath, path.join(this.logDir, "caravan-x.1.log"), {
        overwrite: true,
      });
    } catch {
      // best-effort rotation
    }
  }

  /** Append a line to the log file (always debug-level detail) */
  write(level: string, message: string, extra?: string): void {
    if (!this.enabled || !this.stream) return;

    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level.padEnd(7)}] ${message}`;
    this.stream.write(line + "\n");

    if (extra) {
      // indent extra detail for readability
      const indented = extra
        .split("\n")
        .map((l) => `    ${l}`)
        .join("\n");
      this.stream.write(indented + "\n");
    }
  }

  /** Flush and close */
  async close(): Promise<void> {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
  }

  getLogPath(): string {
    return this.logPath;
  }
}

// ---------------------------------------------------------------------------
// Logger configuration
// ---------------------------------------------------------------------------
export interface LoggerConfig {
  level: LogLevel;
  fileLogging: boolean;
  logDir: string;
}

const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.NORMAL,
  fileLogging: true,
  logDir: path.join(process.env.HOME || "~", ".caravan-x", "logs"),
};

// ---------------------------------------------------------------------------
// Main Logger class — instantiated as a singleton
// ---------------------------------------------------------------------------
class Logger {
  private level: LogLevel;
  private fileLogger: FileLogger;
  private initialized: boolean = false;

  constructor() {
    // start with defaults, reconfigure later via init()
    this.level = DEFAULT_CONFIG.level;
    this.fileLogger = new FileLogger(
      DEFAULT_CONFIG.logDir,
      DEFAULT_CONFIG.fileLogging,
    );
  }

  /**
   * Initialize with resolved config.
   * Called once during app startup after CLI args + config.json are merged.
   */
  async init(config: Partial<LoggerConfig> = {}): Promise<void> {
    const merged = { ...DEFAULT_CONFIG, ...config };
    this.level = merged.level;

    this.fileLogger = new FileLogger(merged.logDir, merged.fileLogging);
    await this.fileLogger.initialize();
    this.initialized = true;

    this.debug(
      `Logger initialized — level=${LogLevel[this.level]}, ` +
        `fileLogging=${merged.fileLogging}, logDir=${merged.logDir}`,
    );
  }

  /** Update level on the fly (e.g. from settings menu) */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  getLevelName(): string {
    return LogLevel[this.level].toLowerCase();
  }

  getLogFilePath(): string {
    return this.fileLogger.getLogPath();
  }

  // -------------------------------------------------------------------------
  // Core log methods — each checks level before printing
  // -------------------------------------------------------------------------

  /** General info — shown at NORMAL and above */
  info(message: string): void {
    this.fileLogger.write("INFO", message);
    if (this.level >= LogLevel.NORMAL) {
      console.log(chalk.cyan("ℹ"), message);
    }
  }

  /** Success — shown at NORMAL and above */
  success(message: string): void {
    this.fileLogger.write("SUCCESS", message);
    if (this.level >= LogLevel.NORMAL) {
      console.log(chalk.green("✓"), message);
    }
  }

  /** Warning — shown at NORMAL and above */
  warn(message: string): void {
    this.fileLogger.write("WARN", message);
    if (this.level >= LogLevel.NORMAL) {
      console.log(chalk.yellow("⚠"), message);
    }
  }

  /**
   * Error — ALWAYS shown (even in silent mode).
   * Accepts raw errors or CaravanXErrors.
   * At debug level, includes stack trace + raw error in terminal.
   * Always writes full detail to file.
   */
  error(message: string, error?: any): void {
    // always write full details to file
    const rawMsg = error?.message || error ? String(error) : "";
    const stack = error?.stack || "";
    this.fileLogger.write("ERROR", message, `${rawMsg}\n${stack}`);

    // terminal output — always show at least the message
    console.log(chalk.red("✗"), message);

    if (error && this.level >= LogLevel.NORMAL) {
      if (error.message && error.message !== message) {
        console.log(chalk.gray("  →"), chalk.red(error.message));
      }
    }

    // debug level: show stack trace in terminal too
    if (error?.stack && this.level >= LogLevel.DEBUG) {
      console.log(chalk.dim(error.stack));
    }
  }

  /**
   * Verbose — shown at VERBOSE and above.
   * For step-by-step operational detail during commands.
   */
  verbose(message: string): void {
    this.fileLogger.write("VERBOSE", message);
    if (this.level >= LogLevel.VERBOSE) {
      console.log(chalk.dim("  →"), chalk.dim(message));
    }
  }

  /**
   * Debug — shown at DEBUG level only.
   * For raw commands, RPC payloads, internal state, etc.
   */
  debug(message: string, ...args: any[]): void {
    const extra = args.length
      ? args
          .map((a) => (typeof a === "string" ? a : JSON.stringify(a, null, 2)))
          .join("\n")
      : undefined;

    this.fileLogger.write("DEBUG", message, extra);

    if (this.level >= LogLevel.DEBUG) {
      console.log(chalk.gray("🔍"), chalk.dim(message));
      if (extra) {
        console.log(chalk.dim(extra));
      }
    }
  }

  /**
   * Step — for progress-style messages (e.g. "Step 3/10: Checking ports")
   * Shown at VERBOSE and above.
   */
  step(current: number, total: number, message: string): void {
    const stepMsg = `[${current}/${total}] ${message}`;
    this.fileLogger.write("STEP", stepMsg);
    if (this.level >= LogLevel.VERBOSE) {
      console.log(
        chalk.dim(`  ${colors.accent(`[${current}/${total}]`)}`),
        chalk.dim(message),
      );
    }
  }

  /**
   * Command — logs shell commands being executed.
   * Shown at DEBUG level only (these can contain credentials).
   */
  command(cmd: string): void {
    // redact passwords in file logs too
    const redacted = cmd.replace(/(-rpcpassword[= ])\S+/g, "$1***");
    this.fileLogger.write("CMD", redacted);
    if (this.level >= LogLevel.DEBUG) {
      console.log(chalk.gray("  $"), chalk.dim(redacted));
    }
  }

  /**
   * RPC — logs RPC method calls for debugging.
   * Shown at DEBUG level only.
   */
  rpc(method: string, params?: any[], wallet?: string): void {
    const detail = wallet ? `[wallet=${wallet}] ` : "";
    const paramStr = params?.length
      ? JSON.stringify(params).substring(0, 200)
      : "[]";
    this.fileLogger.write("RPC", `${detail}${method}(${paramStr})`);
    if (this.level >= LogLevel.DEBUG) {
      console.log(
        chalk.gray("  ⚡"),
        chalk.dim(`${detail}${method}(${paramStr})`),
      );
    }
  }

  /**
   * Display a classified CaravanXError with the pretty error box.
   * This is the primary way to show errors to users.
   */
  displayError(error: CaravanXError): void {
    // always write full detail to file regardless of level
    this.fileLogger.write(
      "ERROR",
      `[${error.category}] ${error.userMessage}`,
      [
        error.command ? `Command: ${error.command}` : "",
        error.rawError
          ? `Raw: ${error.rawError instanceof Error ? error.rawError.message : error.rawError}`
          : "",
        error.rawError instanceof Error && error.rawError.stack
          ? error.rawError.stack
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );

    // --- build the terminal box ---
    const lines: string[] = [];

    // header
    lines.push(chalk.red.bold(`${error.emoji}  ${error.label}`));
    lines.push("");

    // user message (wrap to ~70 chars)
    const wrapped = this.wrapText(error.userMessage, 68);
    wrapped.forEach((line) => lines.push(chalk.white(line)));
    lines.push("");

    // suggestions
    if (error.suggestions.length > 0) {
      lines.push(chalk.yellow("💡 Try one of these:"));
      error.suggestions.forEach((s) => {
        lines.push(chalk.dim(`   → ${s}`));
      });
      lines.push("");
    }

    // footer — always point to log file + debug flag
    lines.push(chalk.dim(`📄 Full log: ${this.fileLogger.getLogPath()}`));
    if (this.level < LogLevel.DEBUG) {
      lines.push(chalk.dim("🔍 Run with --debug for full error details"));
    }

    // debug-level extras: raw error + command
    if (this.level >= LogLevel.DEBUG) {
      if (error.command) {
        lines.push("");
        lines.push(chalk.dim("Command that failed:"));
        // redact passwords
        const redacted = error.command.replace(
          /(-rpcpassword[= ])\S+/g,
          "$1***",
        );
        lines.push(chalk.dim(`  $ ${redacted}`));
      }
      if (error.rawError) {
        lines.push("");
        lines.push(chalk.dim("Raw error:"));
        const raw =
          error.rawError instanceof Error
            ? error.rawError.stack || error.rawError.message
            : String(error.rawError);
        raw.split("\n").forEach((l) => lines.push(chalk.dim(`  ${l}`)));
      }
    }

    // render the box using boxen (consistent with rest of the codebase)
    console.log(
      boxen(lines.join("\n"), {
        padding: 1,
        margin: { top: 1, bottom: 1, left: 0, right: 0 },
        borderStyle: "round",
        borderColor: "red",
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Convenience: the old boxed-info style for non-error boxes
  // -------------------------------------------------------------------------
  box(
    message: string,
    options?: {
      title?: string;
      type?: "info" | "success" | "warning" | "error";
    },
  ): void {
    const colorMap = {
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
        borderColor: colorMap[options?.type || "info"] as any,
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  private wrapText(text: string, maxWidth: number): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";

    for (const word of words) {
      if ((current + " " + word).trim().length <= maxWidth) {
        current = (current + " " + word).trim();
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  /** Clean shutdown — flush file logger */
  async shutdown(): Promise<void> {
    await this.fileLogger.close();
  }
}

// ---------------------------------------------------------------------------
// Singleton export — import { log } from '../utils/logger'
// ---------------------------------------------------------------------------
export const log = new Logger();
