// Redirect to other views
document.getElementById("pixelViewBtn").addEventListener("click", function () {
  window.location.href = "index-pixel.html";
});

document
  .getElementById("minecraftViewBtn")
  .addEventListener("click", function () {
    window.location.href = "index-minecraft.html";
  });

// Global variables
let socket;
let blockchainData = {
  blocks: [],
  mempool: { txids: [] },
  transactions: {},
};
let blockchainChart;
let mempoolChart;
let transactionNetwork;

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  initSocket();
  setupEventListeners();
  fetchInitialData();
  loadThemePreference();
});

// Initialize Socket.io connection
function initSocket() {
  socket = io();

  socket.on("connect", () => {
    updateConnectionStatus(true);
    console.log("Connected to server");
  });

  socket.on("disconnect", () => {
    updateConnectionStatus(false);
    console.log("Disconnected from server");
  });

  socket.on("blockchain_update", (data) => {
    console.log("Received blockchain update", data);
    updateBlockchainData(data);
  });

  socket.on("new_block", (block) => {
    console.log("New block mined", block);
    addNewBlock(block);
    addMiningLog(
      `New block mined: ${block.hash.substring(0, 8)}... at height ${block.height}`,
    );
  });

  socket.on("new_transaction", (tx) => {
    console.log("New transaction", tx);
    addNewTransaction(tx);
    addMiningLog(`New transaction: ${tx.txid.substring(0, 8)}...`);
  });

  socket.on("mining_started", (data) => {
    console.log("Mining started", data);
    showMiningActivity(true);
    addMiningLog(
      `Mining started: ${data.blocks} blocks to ${data.address.substring(0, 8)}...`,
    );
  });

  socket.on("mining_complete", (data) => {
    console.log("Mining complete", data);
    addMiningLog(`Mining complete: ${data.blockHashes.length} blocks mined`);
  });
}

// Setup event listeners
function setupEventListeners() {
  // Refresh button
  document
    .getElementById("refreshBtn")
    .addEventListener("click", fetchInitialData);

  // Mine block button
  document
    .getElementById("mineBlockBtn")
    .addEventListener("click", triggerMineBlock);

  // Create transaction button
  document
    .getElementById("createTxBtn")
    .addEventListener("click", triggerCreateTransaction);

  // Close details button
  document
    .getElementById("closeDetailsBtn")
    .addEventListener("click", hideTransactionDetails);

  // Close mining activity button
  document.getElementById("closeMiningBtn").addEventListener("click", () => {
    document.getElementById("miningActivity").style.display = "none";
  });

  // Theme toggle
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);

  // Network view type selector
  document.getElementById("networkViewType").addEventListener("change", (e) => {
    updateNetworkVisualization(e.target.value);
  });

  // Network controls
  document.getElementById("zoomInBtn").addEventListener("click", () => {
    if (transactionNetwork) {
      transactionNetwork.zoom(0.2);
    }
  });

  document.getElementById("zoomOutBtn").addEventListener("click", () => {
    if (transactionNetwork) {
      transactionNetwork.zoom(-0.2);
    }
  });

  document.getElementById("resetViewBtn").addEventListener("click", () => {
    if (transactionNetwork) {
      transactionNetwork.fit();
    }
  });

  // Mining info button
  document.getElementById("miningInfoBtn").addEventListener("click", () => {
    fetch("/api/mining-info")
      .then((response) => response.json())
      .then((info) => {
        showMiningInfo(info);
      })
      .catch((error) => console.error("Error fetching mining info:", error));
  });
}

// Fetch initial blockchain data
function fetchInitialData() {
  fetch("/api/blockchain")
    .then((response) => response.json())
    .then((data) => {
      blockchainData = data;
      updateDashboard();
      initVisualizations();
    })
    .catch((error) => console.error("Error fetching blockchain data:", error));
}

// Update connection status indicator
function updateConnectionStatus(connected) {
  const statusElement = document.getElementById("connectionStatus");
  const statusIndicator = statusElement.querySelector("span:first-child");
  const statusText = statusElement.querySelector("span:last-child");

  if (connected) {
    statusIndicator.style.backgroundColor = "#10b981"; // Green
    statusText.textContent = "Connected";
  } else {
    statusIndicator.style.backgroundColor = "#ef4444"; // Red
    statusText.textContent = "Disconnected";
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
  const ctx = document.createElement("canvas");
  document.getElementById("blockchainVisualization").innerHTML = "";
  document.getElementById("blockchainVisualization").appendChild(ctx);

  const blockTimes = blockchainData.blocks.map(
    (block) => new Date(block.time * 1000),
  );
  const blockSizes = blockchainData.blocks.map((block) => block.size / 1024); // KB

  blockchainChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: blockchainData.blocks.map((block) => block.height),
      datasets: [
        {
          label: "Block Size (KB)",
          data: blockSizes,
          backgroundColor: "rgba(249, 115, 22, 0.5)",
          borderColor: "rgba(249, 115, 22, 1)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-color",
            ),
          },
        },
        tooltip: {
          callbacks: {
            title: function (tooltipItems) {
              return `Block #${tooltipItems[0].label}`;
            },
            label: function (context) {
              return `Size: ${context.raw.toFixed(2)} KB`;
            },
            afterLabel: function (context) {
              const blockIndex = context.dataIndex;
              const block = blockchainData.blocks[blockIndex];
              const time = new Date(block.time * 1000).toLocaleString();
              return `Time: ${time}\nTx Count: ${block.txCount || 0}`;
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Block Height",
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-color",
            ),
          },
          reverse: true,
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-secondary",
            ),
          },
          grid: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--border-color",
            ),
          },
        },
        y: {
          title: {
            display: true,
            text: "Size (KB)",
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-color",
            ),
          },
          beginAtZero: true,
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-secondary",
            ),
          },
          grid: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--border-color",
            ),
          },
        },
      },
    },
  });
}

// Update blockchain visualization
function updateBlockchainVisualization() {
  if (!blockchainChart) return;

  blockchainChart.data.labels = blockchainData.blocks.map(
    (block) => block.height,
  );
  blockchainChart.data.datasets[0].data = blockchainData.blocks.map(
    (block) => block.size / 1024,
  );

  // Update chart colors based on theme
  blockchainChart.options.scales.x.ticks.color = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--text-secondary");
  blockchainChart.options.scales.y.ticks.color = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--text-secondary");
  blockchainChart.options.scales.x.grid.color = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--border-color");
  blockchainChart.options.scales.y.grid.color = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--border-color");
  blockchainChart.options.scales.x.title.color = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--text-color");
  blockchainChart.options.scales.y.title.color = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--text-color");
  blockchainChart.options.plugins.legend.labels.color = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--text-color");

  blockchainChart.update();
}

// Initialize mempool visualization
function initMempoolVisualization() {
  const ctx = document.createElement("canvas");
  document.getElementById("mempoolVisualization").innerHTML = "";
  document.getElementById("mempoolVisualization").appendChild(ctx);

  // Create dummy data for demonstration
  const mempoolSizeHistory = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const currentSize = blockchainData.mempool?.txCount || 0;
  mempoolSizeHistory.push(currentSize);

  mempoolChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [...Array(mempoolSizeHistory.length).keys()]
        .map((i) => `${i} min ago`)
        .reverse(),
      datasets: [
        {
          label: "Mempool Size (Transactions)",
          data: mempoolSizeHistory,
          backgroundColor: "rgba(56, 189, 248, 0.2)",
          borderColor: "rgba(56, 189, 248, 1)",
          borderWidth: 2,
          tension: 0.4,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-color",
            ),
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Time",
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-color",
            ),
          },
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-secondary",
            ),
          },
          grid: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--border-color",
            ),
          },
        },
        y: {
          title: {
            display: true,
            text: "Transaction Count",
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-color",
            ),
          },
          beginAtZero: true,
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-secondary",
            ),
          },
          grid: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--border-color",
            ),
          },
        },
      },
    },
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

  // Update chart colors based on theme
  mempoolChart.options.scales.x.ticks.color = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--text-secondary");
  mempoolChart.options.scales.y.ticks.color = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--text-secondary");
  mempoolChart.options.scales.x.grid.color = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--border-color");
  mempoolChart.options.scales.y.grid.color = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--border-color");
  mempoolChart.options.scales.x.title.color = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--text-color");
  mempoolChart.options.scales.y.title.color = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--text-color");
  mempoolChart.options.plugins.legend.labels.color = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--text-color");

  mempoolChart.update();
}

// Initialize transaction network visualization
function initTransactionNetwork() {
  const container = document.getElementById("transactionNetwork");
  container.innerHTML = "";

  // Create nodes and edges from transactions
  const nodes = [];
  const edges = [];

  // Add blocks as nodes
  blockchainData.blocks.slice(0, 5).forEach((block) => {
    nodes.push({
      id: block.hash,
      label: `Block ${block.height}`,
      shape: "box",
      color: {
        background: "#f97316",
        border: "#c2410c",
      },
      font: {
        color: getComputedStyle(document.documentElement).getPropertyValue(
          "--text-color",
        ),
      },
    });

    // Add transactions to the block and connect them
    if (block.txCount > 0) {
      // For demonstration, create some transaction nodes
      for (let i = 0; i < Math.min(block.txCount, 3); i++) {
        const txid = `tx_${block.height}_${i}`;
        nodes.push({
          id: txid,
          label: `Tx: ${i}`,
          shape: "dot",
          color: {
            background: "#38bdf8",
            border: "#0284c7",
          },
        });

        edges.push({
          from: block.hash,
          to: txid,
          arrows: "from",
        });
      }
    }
  });

  // Add mempool transactions if available
  if (
    blockchainData.mempool &&
    blockchainData.mempool.txids &&
    blockchainData.mempool.txids.length > 0
  ) {
    // Add a mempool node
    nodes.push({
      id: "mempool",
      label: "Mempool",
      shape: "hexagon",
      color: {
        background: "#a855f7",
        border: "#7e22ce",
      },
      font: {
        color: getComputedStyle(document.documentElement).getPropertyValue(
          "--text-color",
        ),
      },
    });

    // Add some mempool transactions
    blockchainData.mempool.txids.slice(0, 5).forEach((txid, i) => {
      const shortTxid = `mempool_tx_${i}`;
      nodes.push({
        id: shortTxid,
        label: `Tx: ${txid.substring(0, 6)}...`,
        shape: "dot",
        color: {
          background: "#a855f7",
          border: "#7e22ce",
          highlight: {
            background: "#c084fc",
            border: "#a855f7",
          },
        },
      });

      edges.push({
        from: "mempool",
        to: shortTxid,
        dashes: true,
      });
    });
  }

  // Create the network visualization
  const data = {
    nodes: new vis.DataSet(nodes),
    edges: new vis.DataSet(edges),
  };

  const options = {
    physics: {
      enabled: true,
      barnesHut: {
        gravitationalConstant: -2000,
        centralGravity: 0.3,
        springLength: 95,
        springConstant: 0.04,
        damping: 0.09,
      },
    },
    layout: {
      hierarchical: {
        enabled: false,
      },
    },
    edges: {
      color: {
        color: getComputedStyle(document.documentElement).getPropertyValue(
          "--border-color",
        ),
        highlight: "#f97316",
      },
      width: 2,
    },
    nodes: {
      shape: "dot",
      size: 16,
      font: {
        size: 12,
        color: getComputedStyle(document.documentElement).getPropertyValue(
          "--text-color",
        ),
      },
      borderWidth: 2,
    },
    interaction: {
      hover: true,
      tooltipDelay: 300,
    },
  };

  transactionNetwork = new vis.Network(container, data, options);

  // Add click event
  transactionNetwork.on("click", function (params) {
    if (params.nodes.length > 0) {
      const nodeId = params.nodes[0];
      if (nodeId.startsWith("tx_") || nodeId.startsWith("mempool_tx_")) {
        // This would fetch transaction details in a real implementation
        console.log(`Clicked on transaction node: ${nodeId}`);
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
  console.log(`Changing network view to: ${viewType}`);
  // Re-initialize with the new view type
  initTransactionNetwork();
}

// Display blocks
function displayBlocks() {
  const blocksContainer = document.getElementById("blocksContainer");

  if (!blockchainData.blocks || blockchainData.blocks.length === 0) {
    blocksContainer.innerHTML =
      '<p style="text-align: center; color: var(--text-secondary); padding: 2rem 0;">No blocks found</p>';
    return;
  }

  let html = "";

  blockchainData.blocks.slice(0, 5).forEach((block) => {
    const time = new Date(block.time * 1000).toLocaleString();
    html += `
                    <div class="block" data-hash="${block.hash}">
                        <div class="block-header">
                            <div class="block-height">Block #${block.height}</div>
                            <div style="color: var(--text-secondary);">${time}</div>
                        </div>
                        <div class="block-details">
                            <div>Hash: ${block.hash.substring(0, 8)}...</div>
                            <div>Size: ${(block.size / 1024).toFixed(2)} KB</div>
                            <div>Txs: ${block.txCount || 0}</div>
                        </div>
                    </div>
                `;
  });

  blocksContainer.innerHTML = html;

  // Add click listeners to blocks
  document.querySelectorAll(".block").forEach((block) => {
    block.addEventListener("click", () => {
      const hash = block.dataset.hash;
      fetchBlockDetails(hash);
    });
  });
}

// Display mempool transactions
function displayMempool() {
  const mempoolContainer = document.getElementById("mempoolContainer");

  if (
    !blockchainData.mempool?.txids ||
    blockchainData.mempool.txids.length === 0
  ) {
    mempoolContainer.innerHTML =
      '<p style="text-align: center; color: var(--text-secondary); padding: 2rem 0;">No transactions in mempool</p>';
    return;
  }

  let html = "";

  blockchainData.mempool.txids.slice(0, 10).forEach((txid) => {
    html += `
                    <div class="transaction" data-txid="${txid}">
                        <div class="txid">${txid.substring(0, 16)}...</div>
                        <button class="view-tx-btn" style="background-color: #38bdf8;">
                            <i class="fas fa-info-circle"></i> Details
                        </button>
                    </div>
                `;
  });

  if (blockchainData.mempool.txids.length > 10) {
    html += `<p style="text-align: center; color: var(--text-secondary); margin-top: 0.75rem;">And ${blockchainData.mempool.txids.length - 10} more transactions...</p>`;
  }

  mempoolContainer.innerHTML = html;

  // Add click listeners to transactions
  document.querySelectorAll(".transaction").forEach((tx) => {
    tx.addEventListener("click", () => {
      const txid = tx.dataset.txid;
      fetchTransactionDetails(txid);
    });
  });
}

// Fetch block details
function fetchBlockDetails(hash) {
  const detailsElement = document.getElementById("transactionDetails");
  detailsElement.innerHTML = `
                <div class="loading">
                    <div class="spinner"></div>
                    <span>Loading block details...</span>
                </div>
            `;

  fetch(`/api/block/${hash}`)
    .then((response) => response.json())
    .then((block) => {
      displayBlockDetails(block);
    })
    .catch((error) => {
      console.error("Error fetching block details:", error);
      detailsElement.innerHTML = `
                        <p style="text-align: center; color: var(--text-secondary); padding: 2rem 0;">
                            <i class="fas fa-exclamation-triangle" style="color: #ef4444; font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                            Error loading block details
                        </p>
                    `;
    });
}

// Fetch transaction details
function fetchTransactionDetails(txid) {
  const detailsElement = document.getElementById("transactionDetails");
  detailsElement.innerHTML = `
                <div class="loading">
                    <div class="spinner"></div>
                    <span>Loading transaction details...</span>
                </div>
            `;

  fetch(`/api/tx/${txid}`)
    .then((response) => response.json())
    .then((tx) => {
      displayTransactionDetails(tx);
    })
    .catch((error) => {
      console.error("Error fetching transaction details:", error);
      detailsElement.innerHTML = `
                        <p style="text-align: center; color: var(--text-secondary); padding: 2rem 0;">
                            <i class="fas fa-exclamation-triangle" style="color: #ef4444; font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                            Error loading transaction details
                        </p>
                    `;
    });
}

// Display block details
function displayBlockDetails(block) {
  const detailsElement = document.getElementById("transactionDetails");
  const closeButton = document.getElementById("closeDetailsBtn");

  const time = new Date(block.time * 1000).toLocaleString();

  let html = `
                <div class="details-header">
                    <h3 style="font-size: 1.5rem; color: var(--accent-color); margin-bottom: 0.5rem;">Block #${block.height}</h3>
                </div>
                <div class="details-content">
                    <div class="details-section">
                        <h4>Block Information</h4>
                        <div class="detail-item">
                            <span class="detail-label">Hash:</span>
                            <span class="detail-value code">${block.hash}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Previous Block:</span>
                            <span class="detail-value code">${block.previousBlockHash || "Genesis"}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Time:</span>
                            <span class="detail-value">${time}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Size:</span>
                            <span class="detail-value">${(block.size / 1024).toFixed(2)} KB</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Weight:</span>
                            <span class="detail-value">${block.weight}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Transactions:</span>
                            <span class="detail-value">${block.tx?.length || 0}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Difficulty:</span>
                            <span class="detail-value">${block.difficulty}</span>
                        </div>
                    </div>
            `;

  if (block.tx && block.tx.length > 0) {
    html += `
                    <div class="details-section">
                        <h4>Transactions</h4>
                        <div style="max-height: 300px; overflow-y: auto;">
                `;

    block.tx.forEach((tx, index) => {
      const txid = typeof tx === "string" ? tx : tx.txid;
      html += `
                        <div class="detail-item" style="padding: 0.5rem 0;">
                            <span class="detail-label">${index + 1}.</span>
                            <span class="detail-value">
                                <span class="code" style="font-size: 0.8rem;">${txid}</span>
                                <button class="view-tx-btn" data-txid="${txid}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; margin-left: 0.5rem;">
                                    <i class="fas fa-external-link-alt"></i> View
                                </button>
                            </span>
                        </div>
                    `;
    });

    html += `
                        </div>
                    </div>
                `;
  } else {
    html +=
      '<p style="color: var(--text-secondary);">No transactions in this block</p>';
  }

  html += "</div>";

  detailsElement.innerHTML = html;
  closeButton.style.display = "block";

  // Add event listeners to transaction view buttons
  document.querySelectorAll(".view-tx-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const txid = btn.dataset.txid;
      fetchTransactionDetails(txid);
    });
  });
}

// Display transaction details
function displayTransactionDetails(tx) {
  const detailsElement = document.getElementById("transactionDetails");
  const closeButton = document.getElementById("closeDetailsBtn");

  // Calculate total input and output values
  let totalInput = 0;
  let totalOutput = 0;

  tx.vin.forEach((input) => {
    if (input.value) totalInput += input.value;
  });

  tx.vout.forEach((output) => {
    totalOutput += output.value;
  });

  const fee = totalInput - totalOutput;

  let html = `
                <div class="details-header">
                    <h3 style="font-size: 1.5rem; color: var(--accent-color); margin-bottom: 0.5rem;">Transaction Details</h3>
                </div>
                <div class="details-content">
                    <div class="details-section">
                        <h4>Transaction Information</h4>
                        <div class="detail-item">
                            <span class="detail-label">TxID:</span>
                            <span class="detail-value code">${tx.txid}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Size:</span>
                            <span class="detail-value">${tx.size} bytes</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Virtual Size:</span>
                            <span class="detail-value">${tx.vsize} vbytes</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Weight:</span>
                            <span class="detail-value">${tx.weight}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Status:</span>
                            <span class="detail-value">
                                ${
                                  tx.confirmations
                                    ? `<span style="color: #10b981;"><i class="fas fa-check-circle"></i> Confirmed (${tx.confirmations} confirmations)</span>`
                                    : '<span style="color: #f59e0b;"><i class="fas fa-clock"></i> Unconfirmed</span>'
                                }
                            </span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Fee:</span>
                            <span class="detail-value">${fee > 0 ? fee.toFixed(8) + " BTC" : "N/A"}</span>
                        </div>
                    </div>

                    <div class="details-section">
                        <h4>Inputs (${tx.vin.length})</h4>
                        <div style="max-height: 200px; overflow-y: auto;">
            `;

  tx.vin.forEach((input, index) => {
    if (input.coinbase) {
      html += `
                        <div class="detail-item" style="padding: 0.5rem 0;">
                            <span class="detail-label">Coinbase:</span>
                            <span class="detail-value" style="color: #10b981;">
                                <i class="fas fa-coins"></i> New Coins (Block Reward)
                            </span>
                        </div>
                    `;
    } else {
      html += `
                        <div class="detail-item" style="padding: 0.5rem 0;">
                            <span class="detail-label">${index + 1}.</span>
                            <span class="detail-value">
                                <div style="display: flex; justify-content: space-between; width: 100%;">
                                    <span class="code" style="font-size: 0.8rem;">${input.txid}:${input.vout}</span>
                                    ${input.value ? `<span style="margin-left: 0.5rem;">${input.value} BTC</span>` : ""}
                                </div>
                            </span>
                        </div>
                    `;
    }
  });

  html += `
                        </div>
                    </div>

                    <div class="details-section">
                        <h4>Outputs (${tx.vout.length})</h4>
                        <div style="max-height: 200px; overflow-y: auto;">
            `;

  tx.vout.forEach((output, index) => {
    const address =
      output.scriptPubKey.address ||
      (output.scriptPubKey.addresses
        ? output.scriptPubKey.addresses[0]
        : "No address");
    html += `
                    <div class="detail-item" style="padding: 0.5rem 0;">
                        <span class="detail-label">${index + 1}.</span>
                        <span class="detail-value">
                            <div style="display: flex; justify-content: space-between; width: 100%;">
                                <span>${output.scriptPubKey.type || "Unknown"}</span>
                                <span style="font-weight: 600;">${output.value} BTC</span>
                            </div>
                            <div style="font-size: 0.8rem; margin-top: 0.25rem;" class="code">
                                ${address}
                            </div>
                        </span>
                    </div>
                `;
  });

  html += `
                        </div>
                    </div>
                </div>
            `;

  detailsElement.innerHTML = html;
  closeButton.style.display = "block";
}

// Hide transaction details
function hideTransactionDetails() {
  const detailsElement = document.getElementById("transactionDetails");
  const closeButton = document.getElementById("closeDetailsBtn");

  detailsElement.innerHTML = `
                <p style="text-align: center; color: var(--text-secondary); padding: 2rem 0;">
                    <i class="fas fa-hand-pointer" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                    Select a transaction or block to view details
                </p>
            `;
  closeButton.style.display = "none";
}

// Show mining information
function showMiningInfo(info) {
  const detailsElement = document.getElementById("transactionDetails");
  const closeButton = document.getElementById("closeDetailsBtn");

  let html = `
                <div class="details-header">
                    <h3 style="font-size: 1.5rem; color: var(--accent-color); margin-bottom: 0.5rem;">
                        <i class="fas fa-hammer"></i> Mining Information
                    </h3>
                </div>
                <div class="details-content">
                    <div class="details-section">
                        <h4>Network Status</h4>
                        <div class="detail-item">
                            <span class="detail-label">Chain:</span>
                            <span class="detail-value">Regtest</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Difficulty:</span>
                            <span class="detail-value">${blockchainData.chainInfo?.difficulty}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Current Block Height:</span>
                            <span class="detail-value">${blockchainData.chainInfo?.blocks}</span>
                        </div>
                    </div>

                    <div class="details-section">
                        <h4>Mining Controls</h4>
                        <p style="margin-bottom: 1rem;">In regtest mode, you can generate blocks instantly:</p>
                        <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                            <button id="mine1BlockBtn">
                                <i class="fas fa-plus-circle"></i> Mine 1 Block
                            </button>
                            <button id="mine6BlocksBtn">
                                <i class="fas fa-cubes"></i> Mine 6 Blocks
                            </button>
                            <button id="clearMempoolBtn">
                                <i class="fas fa-broom"></i> Clear Mempool
                            </button>
                        </div>
                    </div>

                    <div class="details-section">
                        <h4>Mining Tips</h4>
                        <ul style="list-style-type: disc; padding-left: 1.5rem;">
                            <li>Mine a block to confirm transactions in the mempool</li>
                            <li>Generate 6 blocks to make transactions fully confirmed</li>
                            <li>In regtest, mining is instantaneous with no real proof-of-work</li>
                            <li>The block reward goes to the address you specify</li>
                        </ul>
                    </div>
                </div>
            `;

  detailsElement.innerHTML = html;
  closeButton.style.display = "block";

  // Add event listeners to mining control buttons
  document.getElementById("mine1BlockBtn").addEventListener("click", () => {
    triggerMineBlock();
  });

  document.getElementById("mine6BlocksBtn").addEventListener("click", () => {
    // Mine 6 blocks in sequence
    const mineButton = document.getElementById("mine6BlocksBtn");
    mineButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mining...';

    fetch("/api/mine-block", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: 6 }),
    })
      .then((response) => response.json())
      .then((data) => {
        console.log("Mining 6 blocks result:", data);
        addMiningLog(
          `Mined 6 new blocks starting at height ${blockchainData.chainInfo?.blocks + 1}`,
        );
        mineButton.innerHTML = '<i class="fas fa-cubes"></i> Mine 6 Blocks';
      })
      .catch((error) => {
        console.error("Error mining blocks:", error);
        mineButton.innerHTML = '<i class="fas fa-cubes"></i> Mine 6 Blocks';
      });
  });

  document.getElementById("clearMempoolBtn").addEventListener("click", () => {
    const clearButton = document.getElementById("clearMempoolBtn");
    clearButton.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Clearing...';

    // This would require a backend endpoint to clear the mempool
    fetch("/api/clear-mempool", {
      method: "POST",
    })
      .then((response) => response.json())
      .then((data) => {
        console.log("Clear mempool result:", data);
        addMiningLog("Mempool cleared");
        clearButton.innerHTML = '<i class="fas fa-broom"></i> Clear Mempool';

        // Refresh data
        fetchInitialData();
      })
      .catch((error) => {
        console.error("Error clearing mempool:", error);
        clearButton.innerHTML = '<i class="fas fa-broom"></i> Clear Mempool';
      });
  });
}

// Update dashboard with latest blockchain data
function updateDashboard() {
  document.getElementById("blockCount").textContent =
    blockchainData.chainInfo?.blocks || 0;
  document.getElementById("txCount").textContent =
    blockchainData.stats?.totalTxCount || 0;
  document.getElementById("difficulty").textContent =
    blockchainData.chainInfo?.difficulty.toFixed(2) || 0;
  document.getElementById("mempoolSize").textContent =
    blockchainData.mempool?.txCount || 0;
}

// Add a new block to the UI
function addNewBlock(block) {
  // Add to blockchain data
  blockchainData.blocks.unshift(block);

  // Update visualizations
  updateVisualizations();

  // Create a temporary element for animation
  const blocksContainer = document.getElementById("blocksContainer");
  const tempBlock = document.createElement("div");
  tempBlock.className = "block new-block";
  tempBlock.dataset.hash = block.hash;

  const time = new Date(block.time * 1000).toLocaleString();
  tempBlock.innerHTML = `
                <div class="block-header">
                    <div class="block-height">Block #${block.height}</div>
                    <div style="color: var(--text-secondary);">${time}</div>
                </div>
                <div class="block-details">
                    <div>Hash: ${block.hash.substring(0, 8)}...</div>
                    <div>Size: ${(block.size / 1024).toFixed(2)} KB</div>
                    <div>Txs: ${block.txCount || 0}</div>
                </div>
            `;

  // Insert at the top
  if (blocksContainer.firstChild) {
    blocksContainer.insertBefore(tempBlock, blocksContainer.firstChild);
  } else {
    blocksContainer.appendChild(tempBlock);
  }

  // Remove excess blocks
  const blocks = blocksContainer.querySelectorAll(".block");
  if (blocks.length > 5) {
    blocks[blocks.length - 1].remove();
  }

  // Add click listener
  tempBlock.addEventListener("click", () => {
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
  const mempoolContainer = document.getElementById("mempoolContainer");

  // Check if the container shows "No transactions"
  if (mempoolContainer.textContent.includes("No transactions")) {
    mempoolContainer.innerHTML = "";
  }

  const tempTx = document.createElement("div");
  tempTx.className = "transaction new-transaction";
  tempTx.dataset.txid = tx.txid;
  tempTx.innerHTML = `
                <div class="txid">${tx.txid.substring(0, 16)}...</div>
                <button class="view-tx-btn" style="background-color: #38bdf8;">
                    <i class="fas fa-info-circle"></i> Details
                </button>
            `;

  // Insert at the top
  if (mempoolContainer.firstChild) {
    mempoolContainer.insertBefore(tempTx, mempoolContainer.firstChild);
  } else {
    mempoolContainer.appendChild(tempTx);
  }

  // Remove excess transactions
  const txs = mempoolContainer.querySelectorAll(".transaction");
  if (txs.length > 10) {
    txs[txs.length - 1].remove();
  }

  // Update count of additional transactions
  const txCount = blockchainData.mempool.txids.length;
  if (txCount > 10) {
    let moreText = mempoolContainer.querySelector("p");
    if (!moreText) {
      moreText = document.createElement("p");
      moreText.style =
        "text-align: center; color: var(--text-secondary); margin-top: 0.75rem;";
      mempoolContainer.appendChild(moreText);
    }
    moreText.textContent = `And ${txCount - 10} more transactions...`;
  }

  // Add click listener
  tempTx.addEventListener("click", () => {
    const txid = tempTx.dataset.txid;
    fetchTransactionDetails(txid);
  });
}

// Trigger mining a new block
function triggerMineBlock() {
  // Show mining button as active
  const mineButton = document.getElementById("mineBlockBtn");
  mineButton.classList.add("mining-active");
  mineButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mining...';

  // Call the API to mine a new block
  fetch("/api/mine-block", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ blocks: 1 }),
  })
    .then((response) => response.json())
    .then((data) => {
      console.log("Mining block result:", data);
      addMiningLog(`Mining block request sent. Waiting for block...`);

      // Reset button after a delay
      setTimeout(() => {
        mineButton.classList.remove("mining-active");
        mineButton.innerHTML = '<i class="fas fa-hammer"></i> Mine Block';
      }, 2000);
    })
    .catch((error) => {
      console.error("Error mining block:", error);

      // Reset button and show error
      mineButton.classList.remove("mining-active");
      mineButton.innerHTML = '<i class="fas fa-hammer"></i> Mine Block';

      addMiningLog(`Error mining block: ${error.message}`);
    });
}

// Trigger creating a new transaction
function triggerCreateTransaction() {
  // Show creation button as active
  const createButton = document.getElementById("createTxBtn");
  createButton.classList.add("mining-active");
  createButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

  // This would open a modal to create a transaction
  // For this demo, we'll just create a random transaction
  fetch("/api/create-transaction", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fromWallet: "wallet1",
      toAddress: "mxDuAYQUaT3ytdR5E7QKnKLPXXhhqPKTdZ",
      amount: 0.001,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      console.log("Create transaction result:", data);
      addMiningLog(
        `Transaction created with ID: ${data.txid.substring(0, 8)}...`,
      );

      // Reset button after a delay
      setTimeout(() => {
        createButton.classList.remove("mining-active");
        createButton.innerHTML =
          '<i class="fas fa-plus-circle"></i> Create Transaction';
      }, 2000);
    })
    .catch((error) => {
      console.error("Error creating transaction:", error);

      // Reset button and show error
      createButton.classList.remove("mining-active");
      createButton.innerHTML =
        '<i class="fas fa-plus-circle"></i> Create Transaction';

      addMiningLog(`Error creating transaction: ${error.message}`);
    });
}

// Show/hide mining activity panel
function showMiningActivity(show = true) {
  const miningActivity = document.getElementById("miningActivity");
  miningActivity.style.display = show ? "block" : "none";

  if (show) {
    document.getElementById("miningLogs").innerHTML = "";
  }
}

// Add a log to the mining activity panel
function addMiningLog(message) {
  const logsContainer = document.getElementById("miningLogs");
  const log = document.createElement("div");
  log.className = "mining-log";

  // Add timestamp to the log
  const timestamp = new Date().toLocaleTimeString();
  log.innerHTML = `<span style="opacity: 0.7; margin-right: 5px;">[${timestamp}]</span> ${message}`;

  logsContainer.appendChild(log);
  logsContainer.scrollTop = logsContainer.scrollHeight;

  // Make sure the mining activity panel is visible
  showMiningActivity(true);
}

// Toggle dark/light theme
function toggleTheme() {
  const body = document.body;
  const themeIcon = document.getElementById("themeToggle").querySelector("i");

  if (body.classList.contains("light-theme")) {
    body.classList.remove("light-theme");
    localStorage.setItem("theme", "dark");
    themeIcon.className = "fas fa-moon";
  } else {
    body.classList.add("light-theme");
    localStorage.setItem("theme", "light");
    themeIcon.className = "fas fa-sun";
  }

  // Update chart colors
  if (blockchainChart) updateBlockchainVisualization();
  if (mempoolChart) updateMempoolVisualization();
  if (transactionNetwork) updateNetworkVisualization();
}

// Load theme preference from localStorage
function loadThemePreference() {
  const theme = localStorage.getItem("theme") || "dark";
  const themeIcon = document.getElementById("themeToggle").querySelector("i");

  if (theme === "light") {
    document.body.classList.add("light-theme");
    themeIcon.className = "fas fa-sun";
  }
}
