import { Ora } from "ora";
import chalk from "chalk";

/**
 * Consistent color scheme for the application
 */
export const colors = {
  primary: chalk.hex("#F7931A"), // Bitcoin orange
  secondary: chalk.hex("#1C2C5B"), // Dark blue
  accent: chalk.hex("#00ACED"), // Light blue
  success: chalk.hex("#28a745"), // Green
  warning: chalk.hex("#ffc107"), // Yellow
  error: chalk.hex("#dc3545"), // Red
  info: chalk.hex("#17a2b8"), // Teal
  muted: chalk.hex("#6c757d"), // Gray
  header: chalk.bold.hex("#F7931A"), // Bold orange for headers
  commandName: chalk.bold.hex("#1C2C5B"), // Bold dark blue for command names
  subtle: chalk.hex("#adb5bd"), // Lighter gray for less important text
  highlight: chalk.hex("#0366d6").bold, // Bright blue for highlighting important values
  bitcoin: chalk.hex("#F7931A").bold, // Bitcoin orange bold for Bitcoin-related terms
  code: chalk.hex("#e83e8c"), // Pink for code/technical elements
};

/**
 * ASCII art logo for Caravan
 */
export const caravanLogo = `
    ${colors.primary("   ______                                    ")}
    ${colors.primary("  / ____/___ __________ __   _____ ____     ")}
    ${colors.primary(" / /   / __ \`/ ___/ __ \`/ | / / _ \\/ __ \\   ")}
    ${colors.primary("/ /___/ /_/ / /  / /_/ /| |/ / /_/ / / / /   ")}
    ${colors.primary("\\____/\\__,_/_/   \\__,_/ |___/\\__,_/_/ /_/    ")}

    ${colors.accent("========== R E G T E S T   M O D E ==========")}
    `;

/**
 * Format numbers with commas for better readability
 */
export function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format Bitcoin amounts with appropriate precision
 */
export function formatBitcoin(amount: number): string {
  // For small amounts, show more decimal places
  if (amount < 0.001) {
    return `${amount.toFixed(8)} BTC`;
  } else if (amount < 0.1) {
    return `${amount.toFixed(6)} BTC`;
  } else {
    return `${amount.toFixed(4)} BTC`;
  }
}

/**
 * Truncate strings like transaction IDs or hashes for display
 */
export function truncate(str: string, length: number = 8): string {
  if (!str || str.length <= length * 2) return str;
  return `${str.substring(0, length)}...${str.substring(str.length - length)}`;
}

/**
 * Create a simple box around text
 */
export function boxText(
  text: string,
  options?: {
    padding?: number;
    title?: string;
    //@ts-ignore
    titleColor?: chalk.Chalk;
  },
): string {
  const padding = options?.padding || 2;
  const title = options?.title || "";
  const titleColor = options?.titleColor || colors.header;

  const lines = text.split("\n");
  const width = Math.max(...lines.map((line) => line.length)) + padding * 2;

  let result = "╔" + "═".repeat(width) + "╗\n";

  // Add title if provided
  if (title) {
    const titlePadding = Math.floor((width - title.length) / 2);
    result =
      "╔" +
      "═".repeat(titlePadding) +
      titleColor(` ${title} `) +
      "═".repeat(width - titlePadding - title.length - 2) +
      "╗\n";
  }

  // Add padding at top
  for (let i = 0; i < padding / 2; i++) {
    result += "║" + " ".repeat(width) + "║\n";
  }

  // Add content with padding
  for (const line of lines) {
    const leftPadding = Math.floor((width - line.length) / 2);
    const rightPadding = width - leftPadding - line.length;
    result +=
      "║" + " ".repeat(leftPadding) + line + " ".repeat(rightPadding) + "║\n";
  }

  // Add padding at bottom
  for (let i = 0; i < padding / 2; i++) {
    result += "║" + " ".repeat(width) + "║\n";
  }

  result += "╚" + "═".repeat(width) + "╝";

  return result;
}

/**
 * Display a command title with consistent formatting
 */
export function displayCommandTitle(title: string): void {
  const separator = "═".repeat(title.length + 10);
  console.log("\n" + colors.header(separator));
  console.log(colors.header(`     ${title}     `));
  console.log(colors.header(separator) + "\n");
}

/**
 * Clear the terminal
 */
export function clearScreen(): void {
  console.clear();
}

/**
 * Create a table with column headers
 */
export function createTable(headers: string[], rows: string[][]): string {
  // Calculate column widths
  const columnWidths = headers.map((header, index) => {
    const maxRowLength = Math.max(
      header.length,
      ...rows.map((row) => (row[index] || "").toString().length),
    );
    return maxRowLength + 2; // Add padding
  });

  // Create header row
  let table = "";

  // Top border
  table += "┌" + columnWidths.map((w) => "─".repeat(w)).join("┬") + "┐\n";

  // Header row
  table += "│";
  headers.forEach((header, i) => {
    table += ` ${header}${" ".repeat(columnWidths[i] - header.length - 1)}│`;
  });
  table += "\n";

  // Separator
  table += "├" + columnWidths.map((w) => "─".repeat(w)).join("┼") + "┤\n";

  // Data rows
  rows.forEach((row) => {
    table += "│";
    row.forEach((cell, i) => {
      const cellStr = (cell || "").toString();
      table += ` ${cellStr}${" ".repeat(columnWidths[i] - cellStr.length - 1)}│`;
    });
    table += "\n";
  });

  // Bottom border
  table += "└" + columnWidths.map((w) => "─".repeat(w)).join("┴") + "┘";

  return table;
}

/**
 * Format progress bar
 */
export function progressBar(percent: number, width: number = 30): string {
  const filled = Math.round(width * (percent / 100));
  const empty = width - filled;

  const filledBar = colors.primary("█".repeat(filled));
  const emptyBar = colors.muted("░".repeat(empty));

  return `[${filledBar}${emptyBar}] ${percent.toFixed(1)}%`;
}

/**
 * Update a spinner with progress information
 */
export function updateSpinnerProgress(
  spinner: Ora,
  current: number,
  total: number,
  message: string,
): void {
  const percent = (current / total) * 100;
  spinner.text = `${message} ${progressBar(percent)} (${current}/${total})`;
}

/**
 * Paginate text output for display
 */
export function paginateOutput(text: string, pageSize: number = 15): string[] {
  const lines = text.split("\n");
  const pages = [];

  for (let i = 0; i < lines.length; i += pageSize) {
    pages.push(lines.slice(i, i + pageSize).join("\n"));
  }

  return pages;
}

/**
 * Get terminal width
 */
export function getTerminalWidth(): number {
  return process.stdout.columns || 80;
}

/**
 * Create a horizontal divider
 */
export function divider(
  char: string = "─",
  //@ts-ignore
  color: chalk.Chalk = colors.muted,
): string {
  const width = getTerminalWidth();
  return color(char.repeat(width));
}

/**
 * Display key-value information in a formatted way
 */
export function keyValue(key: string, value: string | number): string {
  const keyStr = colors.muted(`${key}:`);
  const valueStr =
    typeof value === "number"
      ? colors.highlight(formatNumber(value))
      : colors.highlight(value.toString());

  return `${keyStr} ${valueStr}`;
}

/**
 * Format warnings in a consistent way
 */
export function formatWarning(message: string): string {
  return `${colors.warning("⚠️ Warning:")} ${message}`;
}

/**
 * Format errors in a consistent way
 */
export function formatError(message: string): string {
  return `${colors.error("❌ Error:")} ${message}`;
}

/**
 * Format success messages in a consistent way
 */
export function formatSuccess(message: string): string {
  return `${colors.success("✓ Success:")} ${message}`;
}
