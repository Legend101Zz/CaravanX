/**
 * Caravan-X Error Classification System
 *
 * Turns raw errors (Docker daemon output, RPC failures, etc.) into
 * structured, user-friendly errors with actionable suggestions.
 *
 * Usage:
 *   try { ... }
 *   catch (e) { throw CaravanXError.from(e) }
 *
 * Or directly:
 *   throw new CaravanXError({ category: ErrorCategory.PORT, ... })
 */

// ---------------------------------------------------------------------------
// Error categories — every error in the system maps to one of these
// ---------------------------------------------------------------------------
export enum ErrorCategory {
  DOCKER = "DOCKER",
  RPC = "RPC",
  PORT = "PORT",
  NETWORK = "NETWORK",
  CONFIG = "CONFIG",
  FILESYSTEM = "FILESYSTEM",
  PLATFORM = "PLATFORM",
  WALLET = "WALLET",
  TRANSACTION = "TRANSACTION",
  SNAPSHOT = "SNAPSHOT",
  SCRIPT = "SCRIPT",
  UNKNOWN = "UNKNOWN",
}

// ---------------------------------------------------------------------------
// Nice labels + emoji for terminal display per category
// ---------------------------------------------------------------------------
const CATEGORY_META: Record<ErrorCategory, { label: string; emoji: string }> = {
  [ErrorCategory.DOCKER]: { label: "Docker Error", emoji: "🐳" },
  [ErrorCategory.RPC]: { label: "RPC Connection Error", emoji: "📡" },
  [ErrorCategory.PORT]: { label: "Port Conflict", emoji: "🔌" },
  [ErrorCategory.NETWORK]: { label: "Network Error", emoji: "🌐" },
  [ErrorCategory.CONFIG]: { label: "Configuration Error", emoji: "⚙️" },
  [ErrorCategory.FILESYSTEM]: { label: "File System Error", emoji: "📁" },
  [ErrorCategory.PLATFORM]: { label: "Platform Mismatch", emoji: "💻" },
  [ErrorCategory.WALLET]: { label: "Wallet Error", emoji: "👛" },
  [ErrorCategory.TRANSACTION]: { label: "Transaction Error", emoji: "💸" },
  [ErrorCategory.SNAPSHOT]: { label: "Snapshot Error", emoji: "📸" },
  [ErrorCategory.SCRIPT]: { label: "Script Error", emoji: "📜" },
  [ErrorCategory.UNKNOWN]: { label: "Unexpected Error", emoji: "❌" },
};

// ---------------------------------------------------------------------------
// The main error class
// ---------------------------------------------------------------------------
export interface CaravanXErrorOptions {
  category: ErrorCategory;
  userMessage: string; // what the user sees (plain english)
  suggestions?: string[]; // actionable tips shown as bullet points
  rawError?: Error | string; // the original error for debug output
  command?: string; // the command that was run (e.g. docker run ...)
  exitCode?: number; // for CLI non-interactive mode
}

export class CaravanXError extends Error {
  readonly category: ErrorCategory;
  readonly userMessage: string;
  readonly suggestions: string[];
  readonly rawError?: Error | string;
  readonly command?: string;
  readonly exitCode: number;

  // category metadata shortcuts
  readonly emoji: string;
  readonly label: string;

  constructor(opts: CaravanXErrorOptions) {
    // super gets the userMessage so Error.message is human-readable
    super(opts.userMessage);
    this.name = "CaravanXError";
    this.category = opts.category;
    this.userMessage = opts.userMessage;
    this.suggestions = opts.suggestions || [];
    this.rawError = opts.rawError;
    this.command = opts.command;
    this.exitCode = opts.exitCode || 1;

    const meta = CATEGORY_META[this.category];
    this.emoji = meta.emoji;
    this.label = meta.label;
  }

  /**
   * The main factory — takes ANY raw error and pattern-matches it
   * into a classified CaravanXError. This is the single place where
   * we map messy error strings to clean user-facing messages.
   */
  static from(error: any, context?: { command?: string }): CaravanXError {
    // Already classified? just return it
    if (error instanceof CaravanXError) return error;

    const msg = error?.message || String(error);
    const stderr = error?.stderr || "";
    const combined = `${msg} ${stderr}`.toLowerCase();
    const cmd = context?.command || error?.cmd;

    // ----- Port conflicts -----
    if (
      combined.includes("address already in use") ||
      combined.includes("port is already allocated") ||
      combined.includes("bind: address already in use")
    ) {
      // try to extract the port number from the error
      const portMatch = msg.match(/(?::(\d{4,5}))|(?:port\s+(\d{4,5}))/i);
      const port = portMatch ? portMatch[1] || portMatch[2] : "unknown";

      return new CaravanXError({
        category: ErrorCategory.PORT,
        userMessage: `Port ${port} is already in use by another process.`,
        suggestions: [
          `Run: caravan-x docker cleanup`,
          `Change the port in Settings → Docker Settings`,
          `Check what's using it: lsof -i :${port}`,
          `Kill the process: kill $(lsof -ti :${port})`,
        ],
        rawError: error,
        command: cmd,
      });
    }

    // ----- Docker not installed -----
    if (
      combined.includes("docker: command not found") ||
      combined.includes("docker is not installed")
    ) {
      return new CaravanXError({
        category: ErrorCategory.DOCKER,
        userMessage: "Docker is not installed on this system.",
        suggestions: [
          "Install Docker Desktop: https://docs.docker.com/get-docker/",
          "After installing, restart your terminal",
          "Or use Manual mode to connect to an existing Bitcoin Core",
        ],
        rawError: error,
        command: cmd,
      });
    }

    // ----- Docker daemon not running -----
    if (
      combined.includes("cannot connect to the docker daemon") ||
      combined.includes("is the docker daemon running") ||
      combined.includes("docker daemon is not running")
    ) {
      return new CaravanXError({
        category: ErrorCategory.DOCKER,
        userMessage: "Docker daemon is not running.",
        suggestions: [
          "Start Docker Desktop from your Applications",
          "Or run: open -a Docker (macOS)",
          "Or run: sudo systemctl start docker (Linux)",
          "Wait a few seconds after starting, then try again",
        ],
        rawError: error,
        command: cmd,
      });
    }

    // ----- Docker container name conflict -----
    if (
      combined.includes("is already in use by container") ||
      combined.includes("conflict. the container name")
    ) {
      const nameMatch = msg.match(/name\s+"?\/?([\w-]+)"?/i);
      const name = nameMatch ? nameMatch[1] : "unknown";

      return new CaravanXError({
        category: ErrorCategory.DOCKER,
        userMessage: `Container "${name}" already exists.`,
        suggestions: [
          `Remove it: docker rm -f ${name}`,
          `Or run: caravan-x docker cleanup`,
          `Use a different container name in Settings`,
        ],
        rawError: error,
        command: cmd,
      });
    }

    // ----- Docker image pull failures -----
    if (
      combined.includes("pull access denied") ||
      combined.includes("manifest unknown") ||
      combined.includes("repository does not exist")
    ) {
      return new CaravanXError({
        category: ErrorCategory.DOCKER,
        userMessage: "Failed to pull the Docker image.",
        suggestions: [
          "Check your internet connection",
          "Verify the image name in your config",
          "Default image: bitcoin/bitcoin:27.0",
          "Try: docker pull bitcoin/bitcoin:27.0",
        ],
        rawError: error,
        command: cmd,
      });
    }

    // ----- Platform / architecture mismatch -----
    if (
      combined.includes("platform") ||
      combined.includes("exec format error") ||
      combined.includes("rosetta")
    ) {
      return new CaravanXError({
        category: ErrorCategory.PLATFORM,
        userMessage:
          "Architecture mismatch between your system and Docker image.",
        suggestions: [
          "Apple Silicon (M1/M2/M3) detected — image is AMD64",
          "Docker will use emulation (slower but works)",
          "Add --platform linux/amd64 flag (Caravan-X does this automatically)",
          "Or find a native ARM64 Bitcoin Core image",
        ],
        rawError: error,
        command: cmd,
      });
    }

    // ----- RPC connection refused -----
    if (
      combined.includes("econnrefused") ||
      combined.includes("connection refused")
    ) {
      const urlMatch = msg.match(/(https?:\/\/[^\s]+)/);
      const url = urlMatch ? urlMatch[1] : "configured endpoint";

      return new CaravanXError({
        category: ErrorCategory.RPC,
        userMessage: `Cannot connect to Bitcoin Core at ${url}.`,
        suggestions: [
          "Is Bitcoin Core running? Check: bitcoin-cli -regtest getblockchaininfo",
          "If using Docker: docker ps | grep caravan",
          "Verify host/port in Settings → Edit Current Config",
          "Default regtest RPC port is 18443",
        ],
        rawError: error,
        command: cmd,
      });
    }

    // ----- RPC auth failure -----
    if (
      combined.includes("401") ||
      combined.includes("authentication failed") ||
      combined.includes("incorrect rpcuser or rpcpassword")
    ) {
      return new CaravanXError({
        category: ErrorCategory.RPC,
        userMessage: "RPC authentication failed — wrong username or password.",
        suggestions: [
          "Check credentials in Settings → Edit Current Config → RPC Settings",
          "Verify bitcoin.conf has matching rpcuser/rpcpassword",
          "Docker mode: credentials are set during setup",
        ],
        rawError: error,
        command: cmd,
      });
    }

    // ----- RPC 502 / proxy error -----
    if (combined.includes("502") || combined.includes("bad gateway")) {
      return new CaravanXError({
        category: ErrorCategory.RPC,
        userMessage: "Proxy cannot reach Bitcoin Core (502 Bad Gateway).",
        suggestions: [
          "If using Docker, ensure all containers are running: docker ps",
          "Restart containers: caravan-x docker restart",
          "Check nginx proxy logs: docker logs caravan-x-nginx",
        ],
        rawError: error,
        command: cmd,
      });
    }

    // ----- RPC timeout -----
    if (combined.includes("timeout") || combined.includes("etimedout")) {
      return new CaravanXError({
        category: ErrorCategory.RPC,
        userMessage: "Connection to Bitcoin Core timed out.",
        suggestions: [
          "Bitcoin Core might be busy (initial sync, reindex, etc.)",
          "Try again in a few seconds",
          "Check if the process is alive: docker ps or ps aux | grep bitcoind",
        ],
        rawError: error,
        command: cmd,
      });
    }

    // ----- Wallet errors -----
    if (
      combined.includes("wallet") &&
      (combined.includes("already exists") ||
        combined.includes("already loaded"))
    ) {
      return new CaravanXError({
        category: ErrorCategory.WALLET,
        userMessage: "A wallet with that name already exists or is loaded.",
        suggestions: [
          "Choose a different wallet name",
          "Or unload the existing wallet first",
          "List loaded wallets with: bitcoin-cli -regtest listwallets",
        ],
        rawError: error,
        command: cmd,
      });
    }

    if (combined.includes("wallet") && combined.includes("not found")) {
      return new CaravanXError({
        category: ErrorCategory.WALLET,
        userMessage: "Wallet not found.",
        suggestions: [
          "Check the wallet name — names are case-sensitive",
          "List available wallets from the Bitcoin Wallets menu",
          "The wallet may need to be loaded first",
        ],
        rawError: error,
        command: cmd,
      });
    }

    // ----- Filesystem permissions -----
    if (
      combined.includes("eacces") ||
      combined.includes("permission denied") ||
      combined.includes("eperm")
    ) {
      return new CaravanXError({
        category: ErrorCategory.FILESYSTEM,
        userMessage: "Permission denied — cannot access a file or directory.",
        suggestions: [
          "Check ownership of ~/.caravan-x directory",
          "Try: chmod -R u+rw ~/.caravan-x",
          "If using Docker volumes, check Docker file sharing settings",
        ],
        rawError: error,
        command: cmd,
      });
    }

    // ----- Filesystem not found -----
    if (combined.includes("enoent") || combined.includes("no such file")) {
      return new CaravanXError({
        category: ErrorCategory.FILESYSTEM,
        userMessage: "File or directory not found.",
        suggestions: [
          "The path may not exist yet — try running setup again",
          "Check your config paths in Settings → Edit Current Config",
        ],
        rawError: error,
        command: cmd,
      });
    }

    // ----- Config parse errors -----
    if (
      combined.includes("unexpected token") ||
      combined.includes("json parse") ||
      combined.includes("is not valid json")
    ) {
      return new CaravanXError({
        category: ErrorCategory.CONFIG,
        userMessage: "Configuration file is corrupted or has invalid JSON.",
        suggestions: [
          "Delete ~/.caravan-x/config.json and re-run setup",
          "Or fix the JSON manually (check for trailing commas, etc.)",
        ],
        rawError: error,
        command: cmd,
      });
    }

    // ----- Insufficient funds (transaction) -----
    if (
      combined.includes("insufficient funds") ||
      combined.includes("not enough") ||
      combined.includes("fee exceeds")
    ) {
      return new CaravanXError({
        category: ErrorCategory.TRANSACTION,
        userMessage: "Insufficient funds for this transaction.",
        suggestions: [
          "Mine more blocks to get coinbase rewards: mine --blocks 10",
          "Check wallet balance from the Wallets menu",
          "Coinbase rewards need 100 confirmations to be spendable",
        ],
        rawError: error,
        command: cmd,
      });
    }

    // ----- Fallback: unknown error -----
    return new CaravanXError({
      category: ErrorCategory.UNKNOWN,
      userMessage: msg.length > 200 ? msg.substring(0, 200) + "..." : msg,
      suggestions: [
        "Run with --debug flag for full error details",
        "Check the log file: ~/.caravan-x/logs/caravan-x.log",
        "Report this issue: https://github.com/Legend101Zz/CaravanX/issues",
      ],
      rawError: error,
      command: cmd,
    });
  }
}
