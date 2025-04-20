import * as path from "path";
import * as fs from "fs-extra";
import * as open from "open";
import { BitcoinRpcClient } from "../core/rpc";
import { BlockchainDataService } from "./data/blockchain-data";
import { VisualizationServer } from "./server/http-server";
import { ConfigManager } from "../core/config";
import chalk from "chalk";

/**
 * Enhanced manager for blockchain visualization
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

        // Copy advanced visualization files
        await this.createAdvancedVisualizationFiles();
      } else {
        // Check if we need to update existing files to the new version
        const indexHtmlPath = path.join(this.staticDir, "index.html");
        if (await fs.pathExists(indexHtmlPath)) {
          const currentContent = await fs.readFile(indexHtmlPath, "utf8");

          // Check if this is the old basic visualization
          if (
            !currentContent.includes("socket.io") &&
            !currentContent.includes("chart.js")
          ) {
            console.log(
              chalk.yellow(
                "Updating visualization files to enhanced version...",
              ),
            );
            await this.createAdvancedVisualizationFiles();
          }
        }
      }
    } catch (error) {
      console.error("Error ensuring visualization files:", error);
    }
  }

  /**
   * Create advanced visualization files
   */
  private async createAdvancedVisualizationFiles(): Promise<void> {
    try {
      // Create directories
      await fs.ensureDir(path.join(this.staticDir, "css"));
      await fs.ensureDir(path.join(this.staticDir, "js"));
      await fs.ensureDir(path.join(this.staticDir, "assets"));

      // Create index.html with the enhanced version
      const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Caravan Regtest Blockchain Explorer</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.5.4/socket.io.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/vis-network/9.1.6/standalone/umd/vis-network.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.js"></script>
    <style>
        body {
            font-family: 'Inter', sans-serif;
            background-color: #0f172a;
            color: #e2e8f0;
            margin: 0;
            padding: 0;
            line-height: 1.6;
        }

        .dashboard {
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: auto auto;
            gap: 1rem;
            padding: 1rem;
            max-width: 1600px;
            margin: 0 auto;
        }

        .dashboard-header {
            grid-column: 1 / 3;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem;
            background-color: #1e293b;
            border-radius: 0.5rem;
            margin-bottom: 1rem;
        }

        .card {
            background-color: #1e293b;
            border-radius: 0.5rem;
            padding: 1.5rem;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            transition: all 0.3s ease;
            overflow: hidden;
        }

        .card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 15px rgba(0, 0, 0, 0.2);
        }

        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
            border-bottom: 1px solid #2d3748;
            padding-bottom: 0.5rem;
        }

        .card-title {
            font-size: 1.25rem;
            font-weight: 600;
            color: #f97316;
        }

        .mempool-container {
            display: flex;
            flex-direction: column;
            height: 100%;
        }

        .transaction {
            display: flex;
            justify-content: space-between;
            padding: 0.75rem;
            border-radius: 0.25rem;
            background-color: #334155;
            margin-bottom: 0.5rem;
            cursor: pointer;
            transition: background-color 0.2s;
        }

        .transaction:hover {
            background-color: #475569;
        }

        .block {
            display: flex;
            flex-direction: column;
            background-color: #334155;
            border-radius: 0.25rem;
            padding: 1rem;
            margin-bottom: 0.5rem;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .block:hover {
            background-color: #475569;
            transform: scale(1.02);
        }

        .block-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 0.5rem;
        }

        .stats-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 1rem;
        }

        .stat-card {
            background-color: #334155;
            border-radius: 0.25rem;
            padding: 1rem;
            text-align: center;
        }

        .stat-value {
            font-size: 1.5rem;
            font-weight: 700;
            color: #f97316;
        }

        .stat-label {
            font-size: 0.875rem;
            color: #94a3b8;
        }

        .visualization-container {
            height: 300px;
            margin-top: 1rem;
        }

        .network-container {
            height: 400px;
            margin-top: 1rem;
        }

        .active-miners {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin-top: 1rem;
        }

        .miner {
            background-color: #334155;
            border-radius: 0.25rem;
            padding: 0.5rem;
            font-size: 0.875rem;
        }

        .tooltip {
            position: absolute;
            padding: 0.5rem;
            background-color: #1e293b;
            border-radius: 0.25rem;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
            z-index: 1000;
            max-width: 300px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        /* Animation for new transactions */
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .new-transaction {
            animation: fadeIn 0.5s ease-out;
        }

        /* Animation for new blocks */
        @keyframes blockFadeIn {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
        }

        .new-block {
            animation: blockFadeIn 0.8s ease-out;
        }

        /* Mining animation */
        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(249, 115, 22, 0); }
            100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0); }
        }

        .mining-active {
            animation: pulse 1.5s infinite;
        }

        .mining-activity {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: #1e293b;
            border-radius: 0.5rem;
            padding: 1rem;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            z-index: 1000;
            max-width: 300px;
        }

        .mining-activity-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
        }

        .mining-activity-content {
            max-height: 200px;
            overflow-y: auto;
        }

        .mining-log {
            font-size: 0.875rem;
            margin-bottom: 0.25rem;
            padding: 0.25rem;
            border-radius: 0.25rem;
            background-color: #334155;
        }

        /* Dark mode toggle */
        .theme-toggle {
            position: fixed;
            top: 20px;
            right: 20px;
            background-color: #334155;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            display: flex;
            justify-content: center;
            align-items: center;
            cursor: pointer;
            z-index: 1000;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
    </style>
</head>
<body>
    <div class="theme-toggle" id="themeToggle">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
    </div>

    <header class="bg-gray-800 text-white p-4 shadow-md">
        <div class="container mx-auto flex justify-between items-center">
            <div>
                <h1 class="text-2xl font-bold text-orange-500">Caravan Regtest Explorer</h1>
                <p class="text-sm text-gray-400">Real-time blockchain visualization</p>
            </div>
            <div class="flex items-center space-x-4">
                <div id="connectionStatus" class="flex items-center">
                    <span class="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                    <span>Connected</span>
                </div>
                <button id="refreshBtn" class="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded">
                    Refresh Data
                </button>
            </div>
        </div>
    </header>

    <div class="dashboard">
        <div class="dashboard-header">
            <div id="chainInfo">
                <h2 class="text-xl font-bold mb-2">Blockchain Overview</h2>
                <div class="stats-container">
                    <div class="stat-card">
                        <div class="stat-value" id="blockCount">0</div>
                        <div class="stat-label">Blocks</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="txCount">0</div>
                        <div class="stat-label">Transactions</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="difficulty">0</div>
                        <div class="stat-label">Difficulty</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="mempoolSize">0</div>
                        <div class="stat-label">Mempool</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="card" id="blocksCard">
            <div class="card-header">
                <div class="card-title">Recent Blocks</div>
                <div class="card-actions">
                    <button id="mineBlockBtn" class="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded text-sm">
                        Mine Block
                    </button>
                </div>
            </div>
            <div class="visualization-container" id="blockchainVisualization"></div>
            <div id="blocksContainer"></div>
        </div>

        <div class="card" id="mempoolCard">
            <div class="card-header">
                <div class="card-title">Mempool</div>
                <div class="card-actions">
                    <button id="createTxBtn" class="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded text-sm">
                        Create Transaction
                    </button>
                </div>
            </div>
            <div class="visualization-container" id="mempoolVisualization"></div>
            <div class="mempool-container" id="mempoolContainer"></div>
        </div>

        <div class="card" id="networkCard">
            <div class="card-header">
                <div class="card-title">Transaction Network</div>
                <div class="card-actions">
                    <select id="networkViewType" class="bg-gray-700 text-white px-3 py-1 rounded text-sm">
                        <option value="transactions">Transactions</option>
                        <option value="addresses">Addresses</option>
                        <option value="wallets">Wallets</option>
                    </select>
                </div>
            </div>
            <div class="network-container" id="transactionNetwork"></div>
        </div>

        <div class="card" id="detailsCard">
            <div class="card-header">
                <div class="card-title">Transaction Details</div>
                <div class="card-actions">
                    <button id="closeDetailsBtn" class="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm hidden">
                        Close
                    </button>
                </div>
            </div>
            <div id="transactionDetails">
                <p class="text-gray-400">Select a transaction to view details</p>
            </div>
        </div>
    </div>

    <div class="mining-activity" id="miningActivity">
        <div class="mining-activity-header">
            <div class="font-bold">Mining Activity</div>
            <button id="closeMiningBtn" class="text-gray-400 hover:text-white">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
        <div class="mining-activity-content" id="miningLogs"></div>
    </div>

    <div class="tooltip" id="tooltip"></div>

    <script src="js/main.js"></script>
</body>
</html>`;

      // Create main.js with enhanced visualization logic
      const mainJs = `// Global variables
let socket;
let blockchainData = {
    blocks: [],
    mempool: { txids: [] },
    transactions: {}
};
let blockchainChart;
let mempoolChart;
let transactionNetwork;

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    setupEventListeners();
    fetchInitialData();
});

// Initialize Socket.io connection
function initSocket() {
    socket = io();

    socket.on('connect', () => {
        updateConnectionStatus(true);
        console.log('Connected to server');
    });

    socket.on('disconnect', () => {
        updateConnectionStatus(false);
        console.log('Disconnected from server');
    });

    socket.on('blockchain_update', (data) => {
        console.log('Received blockchain update', data);
        updateBlockchainData(data);
    });

    socket.on('new_block', (block) => {
        console.log('New block mined', block);
        addNewBlock(block);
        addMiningLog(\`New block mined: \${block.hash.substring(0, 8)}... at height \${block.height}\`);
    });

    socket.on('new_transaction', (tx) => {
        console.log('New transaction', tx);
        addNewTransaction(tx);
        addMiningLog(\`New transaction: \${tx.txid.substring(0, 8)}...\`);
    });

    socket.on('mining_started', (data) => {
        console.log('Mining started', data);
        showMiningActivity(true);
        addMiningLog(\`Mining started: \${data.blocks} blocks to \${data.address.substring(0, 8)}...\`);
    });

    socket.on('mining_complete', (data) => {
        console.log('Mining complete', data);
        addMiningLog(\`Mining complete: \${data.blockHashes.length} blocks mined\`);
    });
}

// Setup event listeners
function setupEventListeners() {
    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', fetchInitialData);

    // Mine block button
    document.getElementById('mineBlockBtn').addEventListener('click', triggerMineBlock);

    // Create transaction button
    document.getElementById('createTxBtn').addEventListener('click', triggerCreateTransaction);

    // Close details button
    document.getElementById('closeDetailsBtn').addEventListener('click', hideTransactionDetails);

    // Close mining activity button
    document.getElementById('closeMiningBtn').addEventListener('click', () => {
        document.getElementById('miningActivity').style.display = 'none';
    });

    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    // Network view type selector
    document.getElementById('networkViewType').addEventListener('change', (e) => {
        updateNetworkVisualization(e.target.value);
    });
}

// Fetch initial blockchain data
function fetchInitialData() {
    fetch('/api/blockchain')
        .then(response => response.json())
        .then(data => {
            blockchainData = data;
            updateDashboard();
            initVisualizations();
        })
        .catch(error => console.error('Error fetching blockchain data:', error));
}

// Update connection status indicator
function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('connectionStatus');
    const statusIndicator = statusElement.querySelector('span:first-child');
    const statusText = statusElement.querySelector('span:last-child');

    if (connected) {
        statusIndicator.className = 'w-3 h-3 bg-green-500 rounded-full mr-2';
        statusText.textContent = 'Connected';
    } else {
        statusIndicator.className = 'w-3 h-3 bg-red-500 rounded-full mr-2';
        statusText.textContent = 'Disconnected';
    }
}

// Update blockchain data with new information
function updateBlockchainData(data) {
    // Merge new data with existing data
    if (data.blocks) blockchainData.blocks = data.blocks;
    if (data.mempool) blockchainData.mempool = data.mempool;
    if (data.chainInfo) blockchainData.chainInfo = data.chainInfo;
    if (data.stats) blockchainData.stats = data.stats;

    // Update the UI
    updateDashboard();
    updateVisualizations();
}

// Initialize visualizations
function initVisualizations() {
    initBlockchainVisualization();
    initMempoolVisualization();
    initTransactionNetwork();
    displayBlocks();
    displayMempool();
}

// Update all visualizations
function updateVisualizations() {
    updateBlockchainVisualization();
    updateMempoolVisualization();
    updateTransactionNetwork();
    displayBlocks();
    displayMempool();
}

// Initialize blockchain visualization
function initBlockchainVisualization() {
    const ctx = document.createElement('canvas');
    document.getElementById('blockchainVisualization').innerHTML = '';
    document.getElementById('blockchainVisualization').appendChild(ctx);

    const blockTimes = blockchainData.blocks.map(block => new Date(block.time * 1000));
    const blockSizes = blockchainData.blocks.map(block => block.size / 1024); // KB

    blockchainChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: blockchainData.blocks.map(block => block.height),
            datasets: [{
                label: 'Block Size (KB)',
                data: blockSizes,
                backgroundColor: 'rgba(249, 115, 22, 0.5)',
                borderColor: 'rgba(249, 115, 22, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        title: function(tooltipItems) {
                            return \`Block #\${tooltipItems[0].label}\`;
                        },
                        label: function(context) {
                            return \`Size: \${context.raw.toFixed(2)} KB\`;
                        },
                        afterLabel: function(context) {
                            const blockIndex = context.dataIndex;
                            const block = blockchainData.blocks[blockIndex];
                            const time = new Date(block.time * 1000).toLocaleString();
                            return \`Time: \${time}\\nTx Count: \${block.txCount || 0}\`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Block Height'
                    },
                    reverse: true
                },
                y: {
                    title: {
                        display: true,
                        text: 'Size (KB)'
                    },
                    beginAtZero: true
                }
            }
        }
    });
}

// Update blockchain visualization
function updateBlockchainVisualization() {
    if (!blockchainChart) return;

    blockchainChart.data.labels = blockchainData.blocks.map(block => block.height);
    blockchainChart.data.datasets[0].data = blockchainData.blocks.map(block => block.size / 1024);
    blockchainChart.update();
}

// Initialize mempool visualization
function initMempoolVisualization() {
    const ctx = document.createElement('canvas');
    document.getElementById('mempoolVisualization').innerHTML = '';
    document.getElementById('mempoolVisualization').appendChild(ctx);

    // Create dummy data for demonstration
    const mempoolSizeHistory = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const currentSize = blockchainData.mempool?.txCount || 0;
    mempoolSizeHistory.push(currentSize);

    mempoolChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [...Array(mempoolSizeHistory.length).keys()].map(i => \`\${i} min ago\`).reverse(),
            datasets: [{
                label: 'Mempool Size (Transactions)',
                data: mempoolSizeHistory,
                backgroundColor: 'rgba(56, 189, 248, 0.2)',
                borderColor: 'rgba(56, 189, 248, 1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom'
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Time'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Transaction Count'
                    },
                    beginAtZero: true
                }
            }
        }
    });
}

// Update mempool visualization
function updateMempoolVisualization() {
    if (!mempoolChart) return;

    // Shift the data and add new value
    const data = [...mempoolChart.data.datasets[0].data];
    data.shift();
    data.push(blockchainData.mempool?.txCount || 0);

    mempoolChart.data.datasets[0].data = data;
    mempoolChart.update();
}

// Initialize transaction network visualization
function initTransactionNetwork() {
    const container = document.getElementById('transactionNetwork');
    container.innerHTML = '';

    // Create nodes and edges from transactions
    const nodes = [];
    const edges = [];

    // Add blocks as nodes
    blockchainData.blocks.slice(0, 5).forEach(block => {
        nodes.push({
            id: block.hash,
            label: \`Block \${block.height}\`,
            shape: 'box',
            color: {
                background: '#f97316',
                border: '#c2410c'
            },
            font: {
                color: '#ffffff'
            }
        });

        // Add transactions to the block and connect them
        if (block.txCount > 0) {
            // For demonstration, create some transaction nodes
            for (let i = 0; i < Math.min(block.txCount, 3); i++) {
                const txid = \`tx_\${block.height}_\${i}\`;
                nodes.push({
                    id: txid,
                    label: \`Tx: \${i}\`,
                    shape: 'dot',
                    color: {
                        background: '#38bdf8',
                        border: '#0284c7'
                    }
                });

                edges.push({
                    from: block.hash,
                    to: txid,
                    arrows: 'from'
                });
            }
        }
    });

    // Add mempool transactions if available
    if (blockchainData.mempool && blockchainData.mempool.txids && blockchainData.mempool.txids.length > 0) {
        // Add a mempool node
        nodes.push({
            id: 'mempool',
            label: 'Mempool',
            shape: 'hexagon',
            color: {
                background: '#a855f7',
                border: '#7e22ce'
            },
            font: {
                color: '#ffffff'
            }
        });

        // Add some mempool transactions
        blockchainData.mempool.txids.slice(0, 5).forEach((txid, i) => {
            const shortTxid = \`mempool_tx_\${i}\`;
            nodes.push({
                id: shortTxid,
                label: \`Tx: \${txid.substring(0, 6)}...\`,
                shape: 'dot',
                color: {
                    background: '#a855f7',
                    border: '#7e22ce',
                    highlight: {
                        background: '#c084fc',
                        border: '#a855f7'
                    }
                }
            });

            edges.push({
                from: 'mempool',
                to: shortTxid,
                dashes: true
            });
        });
    }

    // Create the network visualization
    const data = {
        nodes: new vis.DataSet(nodes),
        edges: new vis.DataSet(edges)
    };

    const options = {
        physics: {
            enabled: true,
            barnesHut: {
                gravitationalConstant: -2000,
                centralGravity: 0.3,
                springLength: 95,
                springConstant: 0.04,
                damping: 0.09
            }
        },
        layout: {
            hierarchical: {
                enabled: false
            }
        },
        edges: {
            color: {
                color: '#64748b',
                highlight: '#f97316'
            },
            width: 2
        },
        nodes: {
            shape: 'dot',
            size: 16,
            font: {
                size: 12,
                color: '#e2e8f0'
            },
            borderWidth: 2
        },
        interaction: {
            hover: true,
            tooltipDelay: 300
        }
    };

    transactionNetwork = new vis.Network(container, data, options);

    // Add click event
    transactionNetwork.on('click', function(params) {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            if (nodeId.startsWith('tx_') || nodeId.startsWith('mempool_tx_')) {
                // This would fetch transaction details in a real implementation
                console.log(\`Clicked on transaction node: \${nodeId}\`);
            }
        }
    });
}

// Update transaction network
function updateTransactionNetwork() {
    if (!transactionNetwork) return;
    // Re-initialize with new data
    initTransactionNetwork();
}

// Update network visualization based on selected view type
function updateNetworkVisualization(viewType) {
    // In a real implementation, this would change the network display
    console.log(\`Changing network view to: \${viewType}\`);
    // Re-initialize with the new view type
    initTransactionNetwork();
}

// Display blocks
function displayBlocks() {
    const blocksContainer = document.getElementById('blocksContainer');

    if (!blockchainData.blocks || blockchainData.blocks.length === 0) {
        blocksContainer.innerHTML = '<p class="text-gray-400 p-4">No blocks found</p>';
        return;
    }

    let html = '';

    blockchainData.blocks.slice(0, 5).forEach(block => {
        const time = new Date(block.time * 1000).toLocaleString();
        html += \`
            <div class="block" data-hash="\${block.hash}">
                <div class="block-header">
                    <div class="font-bold text-orange-500">Block #\${block.height}</div>
                    <div class="text-sm text-gray-400">\${time}</div>
                </div>
                <div class="flex justify-between text-sm">
                    <div>Hash: \${block.hash.substring(0, 8)}...</div>
                    <div>Size: \${(block.size / 1024).toFixed(2)} KB</div>
                    <div>Txs: \${block.txCount || 0}</div>
                </div>
            </div>
        \`;
    });

    blocksContainer.innerHTML = html;

    // Add click listeners to blocks
    document.querySelectorAll('.block').forEach(block => {
        block.addEventListener('click', () => {
            const hash = block.dataset.hash;
            fetchBlockDetails(hash);
        });
    });
}

// Display mempool transactions
function displayMempool() {
    const mempoolContainer = document.getElementById('mempoolContainer');

    if (!blockchainData.mempool?.txids || blockchainData.mempool.txids.length === 0) {
        mempoolContainer.innerHTML = '<p class="text-gray-400 p-4">No transactions in mempool</p>';
        return;
    }

    let html = '';

    blockchainData.mempool.txids.slice(0, 10).forEach(txid => {
        html += \`
            <div class="transaction" data-txid="\${txid}">
                <div>TxID: \${txid.substring(0, 8)}...</div>
                <button class="text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded">Details</button>
            </div>
        \`;
    });

    if (blockchainData.mempool.txids.length > 10) {
        html += \`<p class="text-gray-400 text-sm mt-2">And \${blockchainData.mempool.txids.length - 10} more transactions...</p>\`;
    }

    mempoolContainer.innerHTML = html;

    // Add click listeners to transactions
    document.querySelectorAll('.transaction').forEach(tx => {
        tx.addEventListener('click', () => {
            const txid = tx.dataset.txid;
            fetchTransactionDetails(txid);
        });
    });
}

// Fetch block details
function fetchBlockDetails(hash) {
    fetch(\`/api/block/\${hash}\`)
        .then(response => response.json())
        .then(block => {
            displayBlockDetails(block);
        })
        .catch(error => console.error('Error fetching block details:', error));
}

// Fetch transaction details
function fetchTransactionDetails(txid) {
    fetch(\`/api/tx/\${txid}\`)
        .then(response => response.json())
        .then(tx => {
            displayTransactionDetails(tx);
        })
        .catch(error => console.error('Error fetching transaction details:', error));
}

// Display block details
function displayBlockDetails(block) {
    // This would show block details in the details panel
    const detailsElement = document.getElementById('transactionDetails');
    const closeButton = document.getElementById('closeDetailsBtn');

    const time = new Date(block.time * 1000).toLocaleString();

    let html = \`
        <div class="mb-4">
            <h3 class="text-xl font-bold text-orange-500 mb-2">Block #\${block.height}</h3>
            <div class="bg-gray-700 p-3 rounded mb-3">
                <div class="grid grid-cols-2 gap-2">
                    <div class="text-gray-400">Hash:</div>
                    <div class="text-white break-all">\${block.hash}</div>

                    <div class="text-gray-400">Previous Block:</div>
                    <div class="text-white break-all">\${block.previousBlockHash || 'Genesis'}</div>

                    <div class="text-gray-400">Time:</div>
                    <div class="text-white">\${time}</div>

                    <div class="text-gray-400">Size:</div>
                    <div class="text-white">\${(block.size / 1024).toFixed(2)} KB</div>

                    <div class="text-gray-400">Weight:</div>
                    <div class="text-white">\${block.weight}</div>

                    <div class="text-gray-400">Transactions:</div>
                    <div class="text-white">\${block.tx?.length || 0}</div>

                    <div class="text-gray-400">Difficulty:</div>
                    <div class="text-white">\${block.difficulty}</div>
                </div>
            </div>
        </div>

        <h4 class="font-bold mb-2">Transactions</h4>
    \`;

    if (block.tx && block.tx.length > 0) {
        html += '<div class="space-y-2 max-h-60 overflow-y-auto">';
        block.tx.forEach((tx, index) => {
            const txid = typeof tx === 'string' ? tx : tx.txid;
            html += \`
                <div class="bg-gray-700 p-2 rounded flex justify-between items-center">
                    <div class="truncate">\${index + 1}. \${txid}</div>
                    <button class="view-tx-btn text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded" data-txid="\${txid}">View</button>
                </div>
            \`;
        });
        html += '</div>';
    } else {
        html += '<p class="text-gray-400">No transactions in this block</p>';
    }

    detailsElement.innerHTML = html;
    closeButton.classList.remove('hidden');

    // Add event listeners to transaction view buttons
    document.querySelectorAll('.view-tx-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const txid = btn.dataset.txid;
            fetchTransactionDetails(txid);
        });
    });
}

// Display transaction details
function displayTransactionDetails(tx) {
    const detailsElement = document.getElementById('transactionDetails');
    const closeButton = document.getElementById('closeDetailsBtn');

    // Calculate total input and output values
    let totalInput = 0;
    let totalOutput = 0;

    tx.vin.forEach(input => {
        if (input.value) totalInput += input.value;
    });

    tx.vout.forEach(output => {
        totalOutput += output.value;
    });

    const fee = totalInput - totalOutput;

    let html = \`
        <div class="mb-4">
            <h3 class="text-xl font-bold text-blue-500 mb-2">Transaction Details</h3>
            <div class="bg-gray-700 p-3 rounded mb-3">
                <div class="grid grid-cols-2 gap-2">
                    <div class="text-gray-400">TxID:</div>
                    <div class="text-white break-all">\${tx.txid}</div>

                    <div class="text-gray-400">Size:</div>
                    <div class="text-white">\${tx.size} bytes</div>

                    <div class="text-gray-400">Virtual Size:</div>
                    <div class="text-white">\${tx.vsize} vbytes</div>

                    <div class="text-gray-400">Weight:</div>
                    <div class="text-white">\${tx.weight}</div>

                    <div class="text-gray-400">Status:</div>
                    <div class="text-white">\${tx.confirmations ? \`Confirmed (\${tx.confirmations} confirmations)\` : 'Unconfirmed'}</div>

                    <div class="text-gray-400">Fee:</div>
                    <div class="text-white">\${fee > 0 ? fee.toFixed(8) + ' BTC' : 'N/A'}</div>
                </div>
            </div>
        </div>

        <div class="mb-4">
            <h4 class="font-bold mb-2">Inputs (\${tx.vin.length})</h4>
            <div class="space-y-2 max-h-40 overflow-y-auto">
    \`;

    tx.vin.forEach((input, index) => {
        if (input.coinbase) {
            html += \`
                <div class="bg-gray-700 p-2 rounded">
                    <div class="text-green-500 font-bold">Coinbase (New Coins)</div>
                    <div class="text-gray-400 text-xs">\${input.coinbase}</div>
                </div>
            \`;
        } else {
            html += \`
                <div class="bg-gray-700 p-2 rounded">
                    <div class="flex justify-between">
                        <div>\${index + 1}. Previous Output:</div>
                        <div>\${input.value ? input.value + ' BTC' : ''}</div>
                    </div>
                    <div class="text-gray-400 text-xs">\${input.txid}:\${input.vout}</div>
                </div>
            \`;
        }
    });

    html += \`
            </div>
        </div>

        <div>
            <h4 class="font-bold mb-2">Outputs (\${tx.vout.length})</h4>
            <div class="space-y-2 max-h-40 overflow-y-auto">
    \`;

    tx.vout.forEach((output, index) => {
        const address = output.scriptPubKey.address || output.scriptPubKey.addresses?.[0] || 'No address';
        html += \`
            <div class="bg-gray-700 p-2 rounded">
                <div class="flex justify-between">
                    <div>\${index + 1}. \${output.scriptPubKey.type || 'Unknown'}</div>
                    <div>\${output.value} BTC</div>
                </div>
                <div class="text-gray-400 text-xs">\${address}</div>
            </div>
        \`;
    });

    html += \`
            </div>
        </div>
    \`;

    detailsElement.innerHTML = html;
    closeButton.classList.remove('hidden');
}

// Hide transaction details
function hideTransactionDetails() {
    const detailsElement = document.getElementById('transactionDetails');
    const closeButton = document.getElementById('closeDetailsBtn');

    detailsElement.innerHTML = '<p class="text-gray-400">Select a transaction to view details</p>';
    closeButton.classList.add('hidden');
}

// Update dashboard with latest blockchain data
function updateDashboard() {
    document.getElementById('blockCount').textContent = blockchainData.chainInfo?.blocks || 0;
    document.getElementById('txCount').textContent = blockchainData.stats?.totalTxCount || 0;
    document.getElementById('difficulty').textContent = blockchainData.chainInfo?.difficulty.toFixed(2) || 0;
    document.getElementById('mempoolSize').textContent = blockchainData.mempool?.txCount || 0;
}

// Add a new block to the UI
function addNewBlock(block) {
    // Add to blockchain data
    blockchainData.blocks.unshift(block);

    // Update visualizations
    updateVisualizations();

    // Create a temporary element for animation
    const blocksContainer = document.getElementById('blocksContainer');
    const tempBlock = document.createElement('div');
    tempBlock.className = 'block new-block';
    tempBlock.dataset.hash = block.hash;

    const time = new Date(block.time * 1000).toLocaleString();
    tempBlock.innerHTML = \`
        <div class="block-header">
            <div class="font-bold text-orange-500">Block #\${block.height}</div>
            <div class="text-sm text-gray-400">\${time}</div>
        </div>
        <div class="flex justify-between text-sm">
            <div>Hash: \${block.hash.substring(0, 8)}...</div>
            <div>Size: \${(block.size / 1024).toFixed(2)} KB</div>
            <div>Txs: \${block.txCount || 0}</div>
        </div>
    \`;

    // Insert at the top
    if (blocksContainer.firstChild) {
        blocksContainer.insertBefore(tempBlock, blocksContainer.firstChild);
    } else {
        blocksContainer.appendChild(tempBlock);
    }

    // Remove excess blocks
    const blocks = blocksContainer.querySelectorAll('.block');
    if (blocks.length > 5) {
        blocks[blocks.length - 1].remove();
    }

    // Add click listener
    tempBlock.addEventListener('click', () => {
        const hash = tempBlock.dataset.hash;
        fetchBlockDetails(hash);
    });
}

// Add a new transaction to the UI
function addNewTransaction(tx) {
    // Add to mempool data
    if (!blockchainData.mempool) blockchainData.mempool = { txids: [] };
    if (!blockchainData.mempool.txids) blockchainData.mempool.txids = [];

    // Add to the beginning of the array
    blockchainData.mempool.txids.unshift(tx.txid);

    // Update mempool visualization
    updateMempoolVisualization();

    // Create a temporary element for animation
    const mempoolContainer = document.getElementById('mempoolContainer');

    // Check if the container shows "No transactions"
    if (mempoolContainer.textContent.includes('No transactions')) {
        mempoolContainer.innerHTML = '';
    }

    const tempTx = document.createElement('div');
    tempTx.className = 'transaction new-transaction';
    tempTx.dataset.txid = tx.txid;
    tempTx.innerHTML = \`
        <div>TxID: \${tx.txid.substring(0, 8)}...</div>
        <button class="text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded">Details</button>
    \`;

    // Insert at the top
    if (mempoolContainer.firstChild) {
        mempoolContainer.insertBefore(tempTx, mempoolContainer.firstChild);
    } else {
        mempoolContainer.appendChild(tempTx);
    }

    // Remove excess transactions
    const txs = mempoolContainer.querySelectorAll('.transaction');
    if (txs.length > 10) {
        txs[txs.length - 1].remove();
    }

    // Update count of additional transactions
    const txCount = blockchainData.mempool.txids.length;
    if (txCount > 10) {
        let moreText = mempoolContainer.querySelector('p');
        if (!moreText) {
            moreText = document.createElement('p');
            moreText.className = 'text-gray-400 text-sm mt-2';
            mempoolContainer.appendChild(moreText);
        }
        moreText.textContent = \`And \${txCount - 10} more transactions...\`;
    }

    // Add click listener
    tempTx.addEventListener('click', () => {
        const txid = tempTx.dataset.txid;
        fetchTransactionDetails(txid);
    });
}

// Trigger mining a new block
function triggerMineBlock() {
    // This would call the API to mine a new block
    fetch('/api/mine-block', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ blocks: 1 })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Mining block result:', data);
        addMiningLog(\`Mining block request sent. Waiting for block...\`);
    })
    .catch(error => console.error('Error mining block:', error));
}

// Trigger creating a new transaction
function triggerCreateTransaction() {
    // This would open a modal to create a transaction
    // For this demo, we'll just create a random transaction
    fetch('/api/create-transaction', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            fromWallet: 'wallet1',
            toAddress: 'mxDuAYQUaT3ytdR5E7QKnKLPXXhhqPKTdZ',
            amount: 0.001
        })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Create transaction result:', data);
        addMiningLog(\`Transaction created with ID: \${data.txid}\`);
    })
    .catch(error => console.error('Error creating transaction:', error));
}

// Show/hide mining activity panel
function showMiningActivity(show = true) {
    const miningActivity = document.getElementById('miningActivity');
    miningActivity.style.display = show ? 'block' : 'none';

    if (show) {
        document.getElementById('miningLogs').innerHTML = '';
    }
}

// Add a log to the mining activity panel
function addMiningLog(message) {
    const logsContainer = document.getElementById('miningLogs');
    const log = document.createElement('div');
    log.className = 'mining-log';
    log.textContent = message;

    logsContainer.appendChild(log);
    logsContainer.scrollTop = logsContainer.scrollHeight;

    // Make sure the mining activity panel is visible
    showMiningActivity(true);
}

// Toggle dark/light theme
function toggleTheme() {
    const body = document.body;
    if (body.classList.contains('light-theme')) {
        body.classList.remove('light-theme');
        localStorage.setItem('theme', 'dark');
    } else {
        body.classList.add('light-theme');
        localStorage.setItem('theme', 'light');
    }
}

// Load theme preference from localStorage
function loadThemePreference() {
    const theme = localStorage.getItem('theme') || 'dark';
    if (theme === 'light') {
        document.body.classList.add('light-theme');
    }
}

// Initialize theme
loadThemePreference();`;

      // Create CSS file for additional styling
      const css = `/* Additional styles for the visualization */
/* Light theme styles */
body.light-theme {
    background-color: #f8fafc;
    color: #1e293b;
}

body.light-theme .card {
    background-color: #ffffff;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
}

body.light-theme .card-title {
    color: #f97316;
}

body.light-theme .block,
body.light-theme .transaction,
body.light-theme .stat-card,
body.light-theme .mining-log {
    background-color: #f1f5f9;
}

body.light-theme .block:hover,
body.light-theme .transaction:hover {
    background-color: #e2e8f0;
}

body.light-theme .stat-value {
    color: #f97316;
}

body.light-theme .stat-label {
    color: #64748b;
}

body.light-theme .bg-gray-700 {
    background-color: #e2e8f0;
}

body.light-theme .text-white {
    color: #1e293b;
}

body.light-theme .text-gray-400 {
    color: #64748b;
}

/* Pulse animation in light theme */
@keyframes light-pulse {
    0% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.4); }
    70% { box-shadow: 0 0 0 10px rgba(249, 115, 22, 0); }
    100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0); }
}

body.light-theme .mining-active {
    animation: light-pulse 1.5s infinite;
}

/* Additional responsive adjustments */
@media (max-width: 768px) {
    .dashboard {
        grid-template-columns: 1fr;
    }

    .dashboard-header {
        grid-column: 1;
    }

    .stats-container {
        grid-template-columns: repeat(2, 1fr);
    }
}

/* Animation adjustments for light theme */
body.light-theme @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); background-color: #f97316; }
    to { opacity: 1; transform: translateY(0); background-color: #f1f5f9; }
}

body.light-theme @keyframes blockFadeIn {
    from { opacity: 0; transform: scale(0.9); background-color: #f97316; }
    to { opacity: 1; transform: scale(1); background-color: #f1f5f9; }
}`;

      // Write files to the visualization directory
      await fs.writeFile(path.join(this.staticDir, "index.html"), indexHtml);
      await fs.ensureDir(path.join(this.staticDir, "js"));
      await fs.writeFile(path.join(this.staticDir, "js/main.js"), mainJs);
      await fs.ensureDir(path.join(this.staticDir, "css"));
      await fs.writeFile(path.join(this.staticDir, "css/styles.css"), css);

      console.log(
        chalk.green("Advanced visualization files created successfully."),
      );
    } catch (error) {
      console.error("Error creating advanced visualization files:", error);
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
          `Enhanced blockchain visualization server running at http://localhost:${this.port}/`,
        ),
      );

      if (openBrowser) {
        console.log(chalk.cyan("Opening visualization in browser..."));
        //@ts-expect-error
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
