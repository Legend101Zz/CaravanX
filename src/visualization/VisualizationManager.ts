import * as path from "path";
import * as fs from "fs-extra";
import * as open from "open";
import { BitcoinRpcClient } from "../core/rpc";
import { BlockchainDataService } from "./data/blockchain-data";
import { VisualizationServer } from "./server/http-server";
import { ConfigManager } from "../core/config";
import chalk from "chalk";

/**
 * Manager for blockchain visualization
 */
export class VisualizationManager {
  private blockchainData: BlockchainDataService;
  private server: VisualizationServer;
  private port: number;
  private appDir: string;
  private staticDir: string;
  private isRunning: boolean = false;

  constructor(
    rpc: BitcoinRpcClient,
    configManager: ConfigManager,
    port: number = 3000,
  ) {
    this.port = port;
    this.appDir = configManager.getConfig().appDir;
    this.staticDir = path.join(this.appDir, "visualization");

    // Initialize services
    this.blockchainData = new BlockchainDataService(rpc);

    // Initialize server
    this.server = new VisualizationServer(
      this.blockchainData,
      this.staticDir,
      port,
    );

    // Ensure visualization directory exists
    this.ensureVisualizationFiles();
  }

  /**
   * Ensure that visualization files are available
   */
  private async ensureVisualizationFiles(): Promise<void> {
    try {
      // Check if static directory exists
      if (!(await fs.pathExists(this.staticDir))) {
        await fs.ensureDir(this.staticDir);

        // Copy default visualization files from bundled resources
        const resourceDir = path.join(
          __dirname,
          "../../resources/visualization",
        );

        if (await fs.pathExists(resourceDir)) {
          await fs.copy(resourceDir, this.staticDir);
        } else {
          // Create minimal index.html if resources not available
          await this.createDefaultVisualizationFiles();
        }
      }
    } catch (error) {
      console.error("Error ensuring visualization files:", error);
    }
  }

  /**
   * Create default visualization files if resources not available
   */
  private async createDefaultVisualizationFiles(): Promise<void> {
    try {
      // Create directories
      await fs.ensureDir(path.join(this.staticDir, "css"));
      await fs.ensureDir(path.join(this.staticDir, "js"));

      // Create index.html
      const indexHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Caravan Regtest Blockchain Explorer</title>
    <link rel="stylesheet" href="css/styles.css">
</head>
<body>
    <header>
        <h1>Caravan Regtest Blockchain Explorer</h1>
    </header>

    <main>
        <section id="blockchain-info">
            <h2>Blockchain Information</h2>
            <div id="chain-stats"></div>
        </section>

        <section id="recent-blocks">
            <h2>Recent Blocks</h2>
            <div id="blocks-container"></div>
        </section>

        <section id="mempool">
            <h2>Mempool</h2>
            <div id="mempool-container"></div>
        </section>

        <section id="transaction-details">
            <h2>Transaction Details</h2>
            <div id="transaction-container"></div>
        </section>
    </main>

    <footer>
        <p>Caravan Regtest Manager &copy; ${new Date().getFullYear()}</p>
    </footer>

    <script src="js/main.js"></script>
</body>
</html>
      `;

      // Create CSS
      const css = `
body {
    font-family: Arial, sans-serif;
    line-height: 1.6;
    margin: 0;
    padding: 0;
    color: #333;
    background-color: #f4f4f4;
}

header, footer {
    background-color: #333;
    color: #fff;
    text-align: center;
    padding: 1rem;
}

main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
}

section {
    background-color: #fff;
    margin-bottom: 2rem;
    padding: 1rem;
    border-radius: 5px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

h1, h2, h3 {
    color: #333;
}

table {
    width: 100%;
    border-collapse: collapse;
}

table, th, td {
    border: 1px solid #ddd;
}

th, td {
    padding: 8px;
    text-align: left;
}

th {
    background-color: #f2f2f2;
}

.block {
    border: 1px solid #ddd;
    padding: 10px;
    margin-bottom: 10px;
    border-radius: 4px;
}

.transaction {
    border: 1px solid #eee;
    padding: 8px;
    margin: 5px 0;
    border-radius: 4px;
}

.loading {
    text-align: center;
    padding: 20px;
    font-style: italic;
    color: #666;
}
      `;

      // Create JavaScript
      const js = `
// API endpoints
const API = {
    blockchain: '/api/blockchain',
    recentBlocks: '/api/recent-blocks',
    block: (hash) => \`/api/block/\${hash}\`,
    tx: (txid) => \`/api/tx/\${txid}\`,
    mempool: '/api/mempool',
    chainInfo: '/api/chain-info'
};

// Fetch data from API
async function fetchData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(\`HTTP error! Status: \${response.status}\`);
        }
        return await response.json();
    } catch (error) {
        console.error('Fetch error:', error);
        return null;
    }
}

// Format timestamp
function formatTimestamp(timestamp) {
    return new Date(timestamp * 1000).toLocaleString();
}

// Format hash (truncate)
function formatHash(hash) {
    return hash ? \`\${hash.substring(0, 8)}...\${hash.substring(hash.length - 8)}\` : '';
}

// Initialize the application
async function init() {
    // Fetch chain information
    const chainInfo = await fetchData(API.chainInfo);
    if (chainInfo) {
        displayChainInfo(chainInfo);
    }

    // Fetch recent blocks
    const blocks = await fetchData(API.recentBlocks);
    if (blocks) {
        displayBlocks(blocks);
    }

    // Fetch mempool info
    const mempool = await fetchData(API.mempool);
    if (mempool) {
        displayMempool(mempool);
    }

    // Setup refresh button
    setupRefreshButton();
}

// Display chain information
function displayChainInfo(chainInfo) {
    const chainStatsDiv = document.getElementById('chain-stats');
    chainStatsDiv.innerHTML = \`
        <table>
            <tr>
                <th>Chain</th>
                <td>\${chainInfo.chain}</td>
            </tr>
            <tr>
                <th>Blocks</th>
                <td>\${chainInfo.blocks}</td>
            </tr>
            <tr>
                <th>Headers</th>
                <td>\${chainInfo.headers}</td>
            </tr>
            <tr>
                <th>Best Block Hash</th>
                <td>\${formatHash(chainInfo.bestBlockHash)}</td>
            </tr>
            <tr>
                <th>Difficulty</th>
                <td>\${chainInfo.difficulty}</td>
            </tr>
            <tr>
                <th>Size on Disk</th>
                <td>\${(chainInfo.sizeOnDisk / (1024 * 1024)).toFixed(2)} MB</td>
            </tr>
        </table>
    \`;
}

// Display blocks
function displayBlocks(blocks) {
    const blocksContainer = document.getElementById('blocks-container');

    if (!blocks.length) {
        blocksContainer.innerHTML = '<p>No blocks found</p>';
        return;
    }

    let html = '';

    blocks.forEach(block => {
        html += \`
            <div class="block" data-hash="\${block.hash}">
                <h3>Block #\${block.height} - \${formatHash(block.hash)}</h3>
                <table>
                    <tr>
                        <th>Time</th>
                        <td>\${formatTimestamp(block.time)}</td>
                    </tr>
                    <tr>
                        <th>Transactions</th>
                        <td>\${block.tx.length}</td>
                    </tr>
                    <tr>
                        <th>Size</th>
                        <td>\${block.size} bytes</td>
                    </tr>
                    <tr>
                        <th>Difficulty</th>
                        <td>\${block.difficulty}</td>
                    </tr>
                </table>
                <button class="show-txs-btn" data-hash="\${block.hash}">Show Transactions</button>
                <div class="transactions-container" id="txs-\${block.hash}"></div>
            </div>
        \`;
    });

    blocksContainer.innerHTML = html;

    // Add event listeners to show transactions buttons
    document.querySelectorAll('.show-txs-btn').forEach(button => {
        button.addEventListener('click', async function() {
            const hash = this.getAttribute('data-hash');
            const txContainer = document.getElementById(\`txs-\${hash}\`);

            if (txContainer.innerHTML === '') {
                txContainer.innerHTML = '<p class="loading">Loading transactions...</p>';
                const blockData = await fetchData(API.block(hash));

                if (blockData && blockData.tx) {
                    displayTransactions(blockData.tx, txContainer);
                } else {
                    txContainer.innerHTML = '<p>Failed to load transactions</p>';
                }
            } else {
                txContainer.innerHTML = '';
            }
        });
    });
}

// Display transactions
function displayTransactions(transactions, container) {
    if (!transactions.length) {
        container.innerHTML = '<p>No transactions in this block</p>';
        return;
    }

    let html = '<div class="transactions-list">';

    transactions.forEach((tx, index) => {
        const txid = typeof tx === 'string' ? tx : tx.txid;

        html += \`
            <div class="transaction">
                <p><strong>TXID:</strong> \${formatHash(txid)}</p>
                <button class="show-tx-details-btn" data-txid="\${txid}">Show Details</button>
                <div class="tx-details" id="tx-details-\${txid}"></div>
            </div>
        \`;
    });

    html += '</div>';
    container.innerHTML = html;

    // Add event listeners to show transaction details buttons
    container.querySelectorAll('.show-tx-details-btn').forEach(button => {
        button.addEventListener('click', async function() {
            const txid = this.getAttribute('data-txid');
            const detailsContainer = document.getElementById(\`tx-details-\${txid}\`);

            if (detailsContainer.innerHTML === '') {
                detailsContainer.innerHTML = '<p class="loading">Loading details...</p>';
                const txData = await fetchData(API.tx(txid));

                if (txData) {
                    displayTransactionDetails(txData, detailsContainer);
                } else {
                    detailsContainer.innerHTML = '<p>Failed to load transaction details</p>';
                }
            } else {
                detailsContainer.innerHTML = '';
            }
        });
    });
}

// Display transaction details
function displayTransactionDetails(tx, container) {
    let html = '<div class="tx-details-content">';

    html += \`
        <table>
            <tr>
                <th>Size</th>
                <td>\${tx.size} bytes</td>
            </tr>
            <tr>
                <th>Weight</th>
                <td>\${tx.weight}</td>
            </tr>
            <tr>
                <th>Inputs</th>
                <td>\${tx.vin.length}</td>
            </tr>
            <tr>
                <th>Outputs</th>
                <td>\${tx.vout.length}</td>
            </tr>
        </table>

        <h4>Inputs</h4>
        <table>
            <tr>
                <th>Previous Output</th>
                <th>Value</th>
            </tr>
    \`;

    tx.vin.forEach(input => {
        html += \`
            <tr>
                <td>\${input.txid ? formatHash(input.txid) + ':' + input.vout : 'Coinbase'}</td>
                <td>\${input.value || 'N/A'}</td>
            </tr>
        \`;
    });

    html += \`
        </table>

        <h4>Outputs</h4>
        <table>
            <tr>
                <th>Address</th>
                <th>Value</th>
            </tr>
    \`;

    tx.vout.forEach(output => {
        const address = output.scriptPubKey.address || 'N/A';
        html += \`
            <tr>
                <td>\${address}</td>
                <td>\${output.value} BTC</td>
            </tr>
        \`;
    });

    html += \`
        </table>
    \`;

    html += '</div>';
    container.innerHTML = html;
}

// Display mempool information
function displayMempool(mempool) {
    const mempoolContainer = document.getElementById('mempool-container');

    let html = \`
        <table>
            <tr>
                <th>Pending Transactions</th>
                <td>\${mempool.txids ? mempool.txids.length : 0}</td>
            </tr>
            <tr>
                <th>Size</th>
                <td>\${mempool.info ? (mempool.info.bytes / 1024).toFixed(2) + ' KB' : 'N/A'}</td>
            </tr>
        </table>
    \`;

    if (mempool.txids && mempool.txids.length > 0) {
        html += '<h3>Pending Transactions</h3>';
        html += '<div class="mempool-txs">';

        mempool.txids.slice(0, 10).forEach(txid => {
            html += \`
                <div class="transaction">
                    <p><strong>TXID:</strong> \${formatHash(txid)}</p>
                    <button class="show-tx-details-btn" data-txid="\${txid}">Show Details</button>
                    <div class="tx-details" id="tx-details-\${txid}"></div>
                </div>
            \`;
        });

        if (mempool.txids.length > 10) {
            html += \`<p>And \${mempool.txids.length - 10} more transactions...</p>\`;
        }

        html += '</div>';
    } else {
        html += '<p>No transactions in mempool</p>';
    }

    mempoolContainer.innerHTML = html;

    // Add event listeners to show transaction details buttons
    document.querySelectorAll('.mempool-txs .show-tx-details-btn').forEach(button => {
        button.addEventListener('click', async function() {
            const txid = this.getAttribute('data-txid');
            const detailsContainer = document.getElementById(\`tx-details-\${txid}\`);

            if (detailsContainer.innerHTML === '') {
                detailsContainer.innerHTML = '<p class="loading">Loading details...</p>';
                const txData = await fetchData(API.tx(txid));

                if (txData) {
                    displayTransactionDetails(txData, detailsContainer);
                } else {
                    detailsContainer.innerHTML = '<p>Failed to load transaction details</p>';
                }
            } else {
                detailsContainer.innerHTML = '';
            }
        });
    });
}

// Setup refresh button
function setupRefreshButton() {
    const header = document.querySelector('header');
    const refreshButton = document.createElement('button');
    refreshButton.textContent = 'Refresh Data';
    refreshButton.id = 'refresh-btn';
    refreshButton.style.margin = '10px';
    refreshButton.style.padding = '8px 16px';

    refreshButton.addEventListener('click', () => {
        init();
    });

    header.appendChild(refreshButton);

    // Auto-refresh every 30 seconds
    setInterval(() => {
        init();
    }, 30000);
}

// Start the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', init);
      `;

      // Write files
      await fs.writeFile(path.join(this.staticDir, "index.html"), indexHtml);
      await fs.writeFile(path.join(this.staticDir, "css/styles.css"), css);
      await fs.writeFile(path.join(this.staticDir, "js/main.js"), js);
    } catch (error) {
      console.error("Error creating default visualization files:", error);
    }
  }

  /**
   * Start visualization
   */
  async start(openBrowser: boolean = true): Promise<void> {
    if (this.isRunning) {
      console.log(chalk.yellow("Visualization server is already running."));
      return;
    }

    try {
      await this.server.start();
      this.isRunning = true;

      console.log(
        chalk.green(
          `Blockchain visualization server running at http://localhost:${this.port}/`,
        ),
      );

      if (openBrowser) {
        console.log(chalk.cyan("Opening visualization in browser..."));
        await open(`http://localhost:${this.port}/`);
      }
    } catch (error) {
      console.error(chalk.red("Error starting visualization server:"), error);
    }
  }

  /**
   * Stop visualization
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log(chalk.yellow("Visualization server is not running."));
      return;
    }

    try {
      await this.server.stop();
      this.isRunning = false;
      console.log(chalk.green("Visualization server stopped."));
    } catch (error) {
      console.error(chalk.red("Error stopping visualization server:"), error);
    }
  }

  /**
   * Check if the visualization server is running
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get server URL
   */
  getServerUrl(): string {
    return `http://localhost:${this.port}/`;
  }
}
