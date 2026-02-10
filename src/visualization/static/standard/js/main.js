// ============================================
// main.js - Caravan-X Blockchain Visualization
// ============================================

// Global variables
let socket;
let blockchainData = {
  blocks: [],
  mempool: { txids: [], txCount: 0 },
  transactions: {},
  chainInfo: {},
  stats: {},
};
let blockchainChart;
let mempoolChart;
let transactionNetwork;
let mempoolSizeHistory = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
let isFirstLoad = true;
let walletsCache = []; // Cache wallet data for tx creation modal

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  initSocket();
  setupEventListeners();
  fetchInitialData();
  loadThemePreference();
});

// ============================================
// Socket.io Connection
// ============================================
function initSocket() {
  // Gracefully handle missing socket.io
  if (typeof io === "undefined") {
    console.warn("Socket.io not available, falling back to polling");
    setInterval(fetchInitialData, 5000);
    return;
  }

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
    console.log("Received blockchain update");
    updateBlockchainData(data);
  });

  socket.on("new_block", (block) => {
    console.log("New block mined", block);
    addNewBlock(block);
    addMiningLog(
      `New block mined: ${block.hash.substring(0, 8)}... at height ${block.height}`,
      "success",
    );
    playSound("block-mined");
  });

  socket.on("new_transaction", (tx) => {
    console.log("New transaction", tx);
    addNewTransaction(tx);
    addMiningLog(
      `New transaction: ${tx.txid.substring(0, 8)}...${tx.amount ? ` (${tx.amount} BTC)` : ""}`,
      "info",
    );
    playSound("transaction");
  });

  socket.on("mining_started", (data) => {
    console.log("Mining started", data);
    showMiningActivity(true);
    addMiningLog(`⛏️ Mining ${data.blocks} block(s)...`, "info");
  });

  socket.on("mining_complete", (data) => {
    console.log("Mining complete", data);
    addMiningLog(
      `✅ Mining complete: ${data.blockHashes.length} block(s) mined`,
      "success",
    );
    // Refresh wallet data after mining (balances change)
    fetchWalletDetails();
  });

  socket.on("error", (data) => {
    console.error("Server error:", data);
    addMiningLog(`❌ Error: ${data.message}`, "error");
  });
}

// ============================================
// Sound Effects (graceful fallback)
// ============================================
function playSound(type) {
  try {
    const audio = new Audio();
    switch (type) {
      case "block-mined":
        audio.src = "sounds/block-mined.mp3";
        break;
      case "transaction":
        audio.src = "sounds/transaction.mp3";
        break;
      case "error":
        audio.src = "sounds/error.mp3";
        break;
      case "click":
        audio.src = "sounds/click.mp3";
        break;
      default:
        return;
    }
    audio.volume = 0.3;
    audio.play().catch(() => {
      /* sounds are optional */
    });
  } catch (e) {
    /* sounds are optional, silently ignore */
  }
}

// ============================================
// Event Listeners
// ============================================
function setupEventListeners() {
  // View switching buttons (pixel/minecraft views)
  const pixelViewBtn = document.getElementById("pixelViewBtn");
  if (pixelViewBtn) {
    pixelViewBtn.addEventListener("click", () => {
      window.location.href = "index-pixel.html";
    });
  }

  const minecraftViewBtn = document.getElementById("minecraftViewBtn");
  if (minecraftViewBtn) {
    minecraftViewBtn.addEventListener("click", () => {
      window.location.href = "index-minecraft.html";
    });
  }

  // Refresh button
  const refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      fetchInitialData();
      fetchWalletDetails();
    });
  }

  // Mining button
  const mineBlockBtn = document.getElementById("mineBlockBtn");
  if (mineBlockBtn) {
    mineBlockBtn.addEventListener("click", triggerMineBlock);
  }

  // Create transaction button
  const createTxBtn = document.getElementById("createTxBtn");
  if (createTxBtn) {
    createTxBtn.addEventListener("click", triggerCreateTransaction);
  }

  // Mining info button
  const miningInfoBtn = document.getElementById("miningInfoBtn");
  if (miningInfoBtn) {
    miningInfoBtn.addEventListener("click", () => {
      fetchSafe("/api/chain-info").then((info) => {
        if (info) showMiningInfo(info);
      });
    });
  }

  // Close details button
  const closeDetailsBtn = document.getElementById("closeDetailsBtn");
  if (closeDetailsBtn) {
    closeDetailsBtn.addEventListener("click", hideTransactionDetails);
  }

  // Close mining activity button
  const closeMiningBtn = document.getElementById("closeMiningBtn");
  if (closeMiningBtn) {
    closeMiningBtn.addEventListener("click", () => {
      const el = document.getElementById("miningActivity");
      if (el) el.style.display = "none";
    });
  }

  // Theme toggle
  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", toggleTheme);
  }

  // Network view type selector
  const networkViewType = document.getElementById("networkViewType");
  if (networkViewType) {
    networkViewType.addEventListener("change", (e) => {
      updateNetworkVisualization(e.target.value);
    });
  }

  // Network zoom/reset buttons
  const zoomInBtn = document.getElementById("zoomInBtn");
  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", () => {
      if (transactionNetwork) transactionNetwork.zoom(0.2);
    });
  }

  const zoomOutBtn = document.getElementById("zoomOutBtn");
  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", () => {
      if (transactionNetwork) transactionNetwork.zoom(-0.2);
    });
  }

  const resetViewBtn = document.getElementById("resetViewBtn");
  if (resetViewBtn) {
    resetViewBtn.addEventListener("click", () => {
      if (transactionNetwork) transactionNetwork.fit();
    });
  }

  // Mempool sorting
  const mempoolSortSelect = document.getElementById("mempoolSortSelect");
  if (mempoolSortSelect) {
    mempoolSortSelect.addEventListener("change", () => {
      displayMempool();
    });
  }

  // Handle window resize for charts
  window.addEventListener("resize", () => {
    if (blockchainChart) blockchainChart.resize();
    if (mempoolChart) mempoolChart.resize();
  });
}

// ============================================
// Safe Fetch Wrapper
// ============================================
async function fetchSafe(url, options = {}) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.error(`HTTP ${response.status} from ${url}: ${errorBody}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(`Fetch error for ${url}:`, error);
    return null;
  }
}

async function postSafe(url, body) {
  return fetchSafe(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ============================================
// Data Fetching
// ============================================
function fetchInitialData() {
  showLoadingStates();

  fetchSafe("/api/blockchain").then((data) => {
    if (data) {
      blockchainData = data;
      updateDashboard();
      initVisualizations();
      hideLoadingStates();

      if (isFirstLoad) {
        playIntroAnimation();
        isFirstLoad = false;
      }
    } else {
      showErrorMessage(
        "Failed to load blockchain data. Is Bitcoin Core running?",
      );
      hideLoadingStates();
    }
  });

  // Also fetch wallet details
  fetchWalletDetails();
}

async function fetchWalletDetails() {
  // Try detailed endpoint first (has multisig info)
  let data = await fetchSafe("/api/wallets/details");
  if (data && data.wallets) {
    walletsCache = data.wallets;
    displayWalletPanel(data.wallets);
    return;
  }

  // Fallback: simple wallet list
  data = await fetchSafe("/api/wallets");
  if (data && data.wallets) {
    walletsCache = data.wallets.map((name) => ({
      name,
      balance: 0,
      txCount: 0,
      isMultisig: false,
      isDescriptor: false,
    }));
    displayWalletPanel(walletsCache);
  }
}

function fetchBlockDetails(hash) {
  const detailsElement = document.getElementById("transactionDetails");
  if (!detailsElement) return;

  showDetailLoading(detailsElement, "block");

  fetchSafe(`/api/block/${hash}`).then((block) => {
    if (block) {
      displayBlockDetails(block);
    } else {
      showDetailError(detailsElement, "block");
    }
  });
}

function fetchTransactionDetails(txid) {
  const detailsElement = document.getElementById("transactionDetails");
  if (!detailsElement) return;

  showDetailLoading(detailsElement, "transaction");

  fetchSafe(`/api/tx/${txid}`).then((tx) => {
    if (tx) {
      displayTransactionDetails(tx);
    } else {
      showDetailError(detailsElement, "transaction");
    }
  });
}

// ============================================
// Loading / Error UI Helpers
// ============================================
function showLoadingStates() {
  const loadingHTML = `<div class="loading">
    <div class="spinner"></div>
    <span>Loading data...</span>
  </div>`;

  ["blocksContainer", "mempoolContainer", "transactionNetwork"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = loadingHTML;
    },
  );
}

function hideLoadingStates() {
  // Content is replaced by display functions
}

function showErrorMessage(message) {
  const errorHTML = `<div class="error-message">
    <i class="fas fa-exclamation-triangle"></i>
    <p>${message}</p>
  </div>`;

  ["blocksContainer", "mempoolContainer", "transactionNetwork"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = errorHTML;
    },
  );
}

function showDetailLoading(el, type) {
  el.innerHTML = `<div class="loading">
    <div class="spinner"></div>
    <span>Loading ${type} details...</span>
  </div>`;
  const closeBtn = document.getElementById("closeDetailsBtn");
  if (closeBtn) closeBtn.style.display = "block";
}

function showDetailError(el, type) {
  el.innerHTML = `<div class="error-message">
    <i class="fas fa-exclamation-triangle" style="color: var(--error-color); font-size: 2rem; margin-bottom: 1rem;"></i>
    <p>Error loading ${type} details. Please try again.</p>
  </div>`;
  playSound("error");
}

// ============================================
// Connection Status
// ============================================
function updateConnectionStatus(connected) {
  const statusElement = document.getElementById("connectionStatus");
  if (!statusElement) return;

  const indicator = statusElement.querySelector(".status-indicator");
  const text = statusElement.querySelector(".status-text");

  if (indicator) {
    indicator.classList.toggle("connected", connected);
    indicator.classList.toggle("disconnected", !connected);
  }
  if (text) {
    text.textContent = connected ? "Connected" : "Disconnected";
  }
}

// ============================================
// Intro Animation
// ============================================
function playIntroAnimation() {
  if (typeof gsap === "undefined") return; // gsap is optional

  const statCards = document.querySelectorAll(".stat-card");
  statCards.forEach((card, index) => {
    card.style.opacity = "0";
    setTimeout(() => {
      gsap.to(card, {
        opacity: 1,
        y: 0,
        duration: 0.5,
        ease: "power2.out",
        delay: index * 0.1,
      });
    }, 100);
  });

  const cards = document.querySelectorAll(".card");
  cards.forEach((card, index) => {
    if (card.closest(".stats-section")) return;
    card.style.opacity = "0";
    card.style.transform = "translateY(20px)";
    setTimeout(() => {
      gsap.to(card, {
        opacity: 1,
        y: 0,
        duration: 0.5,
        ease: "power2.out",
        delay: index * 0.1,
      });
    }, 500);
  });
}

// ============================================
// Data Update
// ============================================
function updateBlockchainData(data) {
  if (data.blocks) blockchainData.blocks = data.blocks;
  if (data.mempool) blockchainData.mempool = data.mempool;
  if (data.chainInfo) blockchainData.chainInfo = data.chainInfo;
  if (data.stats) blockchainData.stats = data.stats;
  if (data.networkInfo) blockchainData.networkInfo = data.networkInfo;
  if (data.mempoolInfo) blockchainData.mempoolInfo = data.mempoolInfo;

  updateDashboard();
  updateVisualizations();
}

// ============================================
// Visualizations Init & Update
// ============================================
function initVisualizations() {
  initBlockchainVisualization();
  initMempoolVisualization();
  initTransactionNetwork();
  displayBlocks();
  displayMempool();
}

function updateVisualizations() {
  updateBlockchainVisualization();
  updateMempoolVisualization();
  updateTransactionNetwork();
  displayBlocks();
  displayMempool();
}

// ============================================
// Blockchain Chart (Block Sizes)
// ============================================
function initBlockchainVisualization() {
  const container = document.getElementById("blockchainVisualization");
  if (!container || typeof Chart === "undefined") return;

  container.innerHTML = "";
  const canvas = document.createElement("canvas");
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const blocks = blockchainData.blocks || [];
  const blockHeights = blocks.map((b) => b.height);
  const blockSizes = blocks.map((b) => b.size / 1024);

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height || 300);
  gradient.addColorStop(0, "rgba(0, 116, 217, 0.8)");
  gradient.addColorStop(1, "rgba(0, 116, 217, 0.3)");

  const cssVar = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  blockchainChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: blockHeights,
      datasets: [
        {
          label: "Block Size (KB)",
          data: blockSizes,
          backgroundColor: gradient,
          borderColor: "rgba(0, 116, 217, 1)",
          borderWidth: 1,
          borderRadius: 4,
          barPercentage: 0.6,
          categoryPercentage: 0.8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 1000, easing: "easeOutQuart" },
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: {
            color: cssVar("--text-color"),
            font: { family: "'Inter', sans-serif", size: 12 },
          },
        },
        tooltip: {
          backgroundColor: cssVar("--card-bg"),
          titleColor: cssVar("--caravan-yellow"),
          bodyColor: cssVar("--text-color"),
          borderColor: cssVar("--border-color"),
          borderWidth: 1,
          cornerRadius: 6,
          padding: 10,
          callbacks: {
            title: (items) => `Block #${items[0].label}`,
            label: (ctx) => `Size: ${ctx.raw.toFixed(2)} KB`,
            afterLabel: (ctx) => {
              const block = blocks[ctx.dataIndex];
              if (!block) return [];
              return [
                `Time: ${new Date(block.time * 1000).toLocaleString()}`,
                `Transactions: ${block.txCount || 0}`,
                `Hash: ${block.hash.substring(0, 12)}...`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Block Height",
            color: cssVar("--text-color"),
          },
          reverse: true,
          ticks: { color: cssVar("--text-secondary") },
          grid: { display: false },
        },
        y: {
          title: {
            display: true,
            text: "Size (KB)",
            color: cssVar("--text-color"),
          },
          beginAtZero: true,
          ticks: { color: cssVar("--text-secondary") },
          grid: {
            color: cssVar("--border-color"),
            lineWidth: 0.5,
          },
        },
      },
    },
  });
}

function updateBlockchainVisualization() {
  if (!blockchainChart) return;

  const blocks = blockchainData.blocks || [];
  blockchainChart.data.labels = blocks.map((b) => b.height);
  blockchainChart.data.datasets[0].data = blocks.map((b) => b.size / 1024);

  const cssVar = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // Update theme-dependent colors
  blockchainChart.options.scales.x.ticks.color = cssVar("--text-secondary");
  blockchainChart.options.scales.y.ticks.color = cssVar("--text-secondary");
  blockchainChart.options.scales.x.title.color = cssVar("--text-color");
  blockchainChart.options.scales.y.title.color = cssVar("--text-color");
  blockchainChart.options.scales.y.grid.color = cssVar("--border-color");
  blockchainChart.options.plugins.legend.labels.color = cssVar("--text-color");
  blockchainChart.options.plugins.tooltip.backgroundColor = cssVar("--card-bg");
  blockchainChart.options.plugins.tooltip.titleColor =
    cssVar("--caravan-yellow");
  blockchainChart.options.plugins.tooltip.bodyColor = cssVar("--text-color");
  blockchainChart.options.plugins.tooltip.borderColor =
    cssVar("--border-color");

  blockchainChart.update();
}

// ============================================
// Mempool Chart (Size over Time)
// ============================================
function initMempoolVisualization() {
  const container = document.getElementById("mempoolVisualization");
  if (!container || typeof Chart === "undefined") return;

  container.innerHTML = "";
  const canvas = document.createElement("canvas");
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const currentSize = blockchainData.mempool?.txCount || 0;
  mempoolSizeHistory.push(currentSize);
  mempoolSizeHistory.shift();

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height || 300);
  gradient.addColorStop(0, "rgba(255, 215, 0, 0.7)");
  gradient.addColorStop(1, "rgba(255, 215, 0, 0.1)");

  const cssVar = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();

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
          backgroundColor: gradient,
          borderColor: "rgba(255, 215, 0, 1)",
          borderWidth: 2,
          pointBackgroundColor: "rgba(255, 215, 0, 1)",
          pointBorderColor: cssVar("--card-bg"),
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.4,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 1000, easing: "easeOutQuart" },
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: {
            color: cssVar("--text-color"),
            font: { family: "'Inter', sans-serif", size: 12 },
          },
        },
        tooltip: {
          backgroundColor: cssVar("--card-bg"),
          titleColor: cssVar("--caravan-yellow"),
          bodyColor: cssVar("--text-color"),
          borderColor: cssVar("--border-color"),
          borderWidth: 1,
          cornerRadius: 6,
          padding: 10,
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Time",
            color: cssVar("--text-color"),
          },
          ticks: { color: cssVar("--text-secondary") },
          grid: { display: false },
        },
        y: {
          title: {
            display: true,
            text: "Transaction Count",
            color: cssVar("--text-color"),
          },
          beginAtZero: true,
          ticks: { color: cssVar("--text-secondary") },
          grid: { color: cssVar("--border-color"), lineWidth: 0.5 },
        },
      },
    },
  });
}

function updateMempoolVisualization() {
  if (!mempoolChart) return;

  const currentSize = blockchainData.mempool?.txCount || 0;
  mempoolSizeHistory.push(currentSize);
  mempoolSizeHistory.shift();

  mempoolChart.data.datasets[0].data = mempoolSizeHistory;

  const cssVar = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  mempoolChart.options.scales.x.ticks.color = cssVar("--text-secondary");
  mempoolChart.options.scales.y.ticks.color = cssVar("--text-secondary");
  mempoolChart.options.scales.x.title.color = cssVar("--text-color");
  mempoolChart.options.scales.y.title.color = cssVar("--text-color");
  mempoolChart.options.scales.y.grid.color = cssVar("--border-color");
  mempoolChart.options.plugins.legend.labels.color = cssVar("--text-color");
  mempoolChart.options.plugins.tooltip.backgroundColor = cssVar("--card-bg");
  mempoolChart.options.plugins.tooltip.titleColor = cssVar("--caravan-yellow");
  mempoolChart.options.plugins.tooltip.bodyColor = cssVar("--text-color");
  mempoolChart.options.plugins.tooltip.borderColor = cssVar("--border-color");

  mempoolChart.update();
}

// ============================================
// Transaction Network (vis.js)
// ============================================
function initTransactionNetwork() {
  const container = document.getElementById("transactionNetwork");
  if (!container) return;

  // Gracefully handle missing vis-network library
  if (typeof vis === "undefined" || !vis.Network) {
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);flex-direction:column;gap:1rem;">
        <i class="fas fa-project-diagram" style="font-size:3rem;opacity:0.3;"></i>
        <p>Network visualization unavailable</p>
        <p style="font-size:0.8rem;opacity:0.6;">vis-network library not loaded</p>
      </div>`;
    return;
  }

  const cssVar = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const nodes = [];
  const edges = [];
  const blocks = blockchainData.blocks || [];

  // Add block nodes
  blocks.slice(0, 5).forEach((block) => {
    nodes.push({
      id: block.hash,
      label: `Block ${block.height}`,
      shape: "box",
      color: {
        background: "#0074D9",
        border: "#0056b3",
        highlight: { background: "#0074D9", border: "#FFD700" },
      },
      font: { color: cssVar("--text-color"), face: "monospace", size: 12 },
      size: 30,
    });

    // Add tx nodes per block
    const txCount = Math.min(block.txCount || 0, 5);
    for (let i = 0; i < txCount; i++) {
      const txId = `tx_${block.height}_${i}`;
      nodes.push({
        id: txId,
        label: `Tx-${i}`,
        shape: "dot",
        color: {
          background: "#38bdf8",
          border: "#0284c7",
          highlight: { background: "#38bdf8", border: "#FFD700" },
        },
        font: { color: cssVar("--text-color"), face: "monospace", size: 11 },
        size: 15,
      });
      edges.push({
        from: block.hash,
        to: txId,
        arrows: "from",
        color: { color: "#38bdf8", highlight: "#FFD700" },
        width: 2,
      });
    }
  });

  // Add mempool node + its txs
  const mempoolTxids = blockchainData.mempool?.txids || [];
  if (mempoolTxids.length > 0) {
    nodes.push({
      id: "mempool",
      label: `Mempool (${mempoolTxids.length})`,
      shape: "hexagon",
      color: {
        background: "#FFD700",
        border: "#e6c100",
        highlight: { background: "#FFD700", border: "#0074D9" },
      },
      font: {
        color: cssVar("--text-color"),
        face: "monospace",
        size: 12,
        bold: true,
      },
      size: 35,
    });

    mempoolTxids.slice(0, 10).forEach((txid, i) => {
      const shortId = `mempool_tx_${i}`;
      nodes.push({
        id: shortId,
        label: `Tx-${txid.substring(0, 6)}`,
        shape: "dot",
        color: {
          background: "#FFD700",
          border: "#e6c100",
          highlight: { background: "#FFD700", border: "#0074D9" },
        },
        font: { color: cssVar("--text-color"), face: "monospace", size: 10 },
        size: 12,
      });
      edges.push({
        from: "mempool",
        to: shortId,
        dashes: true,
        color: { color: "#FFD700", highlight: "#0074D9" },
        width: 1,
      });
    });
  }

  // Add multisig wallet nodes if we have wallet data
  const multisigWallets = walletsCache.filter((w) => w.isMultisig);
  multisigWallets.forEach((wallet) => {
    nodes.push({
      id: `wallet_${wallet.name}`,
      label: `🔐 ${wallet.name}`,
      shape: "diamond",
      color: {
        background: "#7b61ff",
        border: "#5a3fd6",
        highlight: { background: "#9b87ff", border: "#FFD700" },
      },
      font: { color: cssVar("--text-color"), face: "monospace", size: 11 },
      size: 25,
    });
  });

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
    layout: { improvedLayout: true, hierarchical: { enabled: false } },
    edges: {
      color: { color: cssVar("--border-color"), highlight: "#FFD700" },
      smooth: { enabled: true, type: "continuous" },
      width: 2,
    },
    nodes: {
      shape: "dot",
      size: 16,
      font: { face: "monospace", size: 12, color: cssVar("--text-color") },
      borderWidth: 2,
      shadow: { enabled: true, color: "rgba(0,0,0,0.2)", size: 5 },
    },
    interaction: {
      hover: true,
      tooltipDelay: 300,
      navigationButtons: false,
      keyboard: { enabled: true, bindToWindow: false },
    },
  };

  transactionNetwork = new vis.Network(container, data, options);

  // Click handler for nodes
  transactionNetwork.on("click", function (params) {
    if (params.nodes.length === 0) return;
    const nodeId = params.nodes[0];

    if (nodeId.startsWith("mempool_tx_")) {
      // Get actual txid from mempool
      const idx = parseInt(nodeId.split("_")[2]);
      const actualTxid = mempoolTxids[idx];
      if (actualTxid) {
        fetchTransactionDetails(actualTxid);
      }
    } else if (nodeId.startsWith("tx_")) {
      // Block transaction - we'd need the actual txid
      // For now show info about it
      showSimulatedTxDetail(nodeId);
    } else if (nodeId === "mempool") {
      showMempoolDetail();
    } else if (nodeId.startsWith("wallet_")) {
      const walletName = nodeId.replace("wallet_", "");
      showWalletDetail(walletName);
    } else {
      // Block node
      const block = blocks.find((b) => b.hash === nodeId);
      if (block) fetchBlockDetails(block.hash);
    }
  });
}

function updateTransactionNetwork() {
  if (!transactionNetwork) return;
  initTransactionNetwork();
}

function updateNetworkVisualization(viewType) {
  if (!transactionNetwork) return;

  const options = {};

  switch (viewType) {
    case "hierarchical":
      options.layout = {
        hierarchical: {
          enabled: true,
          direction: "UD",
          sortMethod: "directed",
          nodeSpacing: 150,
          levelSeparation: 150,
        },
      };
      break;
    case "force":
      options.layout = { hierarchical: { enabled: false } };
      options.physics = {
        enabled: true,
        barnesHut: {
          gravitationalConstant: -3000,
          centralGravity: 0.5,
          springLength: 120,
        },
      };
      break;
    default:
      options.layout = { hierarchical: { enabled: false } };
      options.physics = {
        enabled: true,
        barnesHut: {
          gravitationalConstant: -2000,
          centralGravity: 0.3,
          springLength: 95,
          springConstant: 0.04,
          damping: 0.09,
        },
      };
      break;
  }

  transactionNetwork.setOptions(options);
}

// ============================================
// Wallet Panel Display
// ============================================
function displayWalletPanel(wallets) {
  const container = document.getElementById("walletPanel");
  if (!container) return;

  if (!wallets || wallets.length === 0) {
    container.innerHTML =
      '<p class="empty-message"><i class="fas fa-wallet"></i> No wallets loaded</p>';
    return;
  }

  const multisigWallets = wallets.filter((w) => w.isMultisig);
  const regularWallets = wallets.filter((w) => !w.isMultisig);

  let html = "";

  // Multisig wallets section
  if (multisigWallets.length > 0) {
    html += `<div class="wallet-section-header">
      <i class="fas fa-lock" style="color: var(--caravan-yellow);"></i>
      <span>Multisig Wallets (${multisigWallets.length})</span>
    </div>`;

    multisigWallets.forEach((wallet) => {
      html += createWalletCardHTML(wallet, true);
    });
  }

  // Regular wallets section
  if (regularWallets.length > 0) {
    html += `<div class="wallet-section-header">
      <i class="fas fa-wallet" style="color: var(--caravan-blue);"></i>
      <span>Wallets (${regularWallets.length})</span>
    </div>`;

    regularWallets.forEach((wallet) => {
      html += createWalletCardHTML(wallet, false);
    });
  }

  container.innerHTML = html;

  // Add click listeners
  container.querySelectorAll(".wallet-card").forEach((card) => {
    card.addEventListener("click", () => {
      const walletName = card.dataset.wallet;
      showWalletDetail(walletName);
    });
  });
}

function createWalletCardHTML(wallet, isMultisig) {
  const balanceStr =
    wallet.balance !== undefined ? wallet.balance.toFixed(8) : "0.00000000";
  const unconfirmedStr =
    wallet.unconfirmedBalance && wallet.unconfirmedBalance > 0
      ? `<div class="wallet-unconfirmed">+${wallet.unconfirmedBalance.toFixed(8)} unconfirmed</div>`
      : "";

  const badges = [];
  if (wallet.isDescriptor)
    badges.push('<span class="badge badge-descriptor">descriptor</span>');
  if (isMultisig)
    badges.push('<span class="badge badge-multisig">multisig</span>');

  return `
    <div class="wallet-card ${isMultisig ? "wallet-multisig" : ""}" data-wallet="${wallet.name}">
      <div class="wallet-card-header">
        <span class="wallet-icon">${isMultisig ? "🔐" : "💰"}</span>
        <span class="wallet-name">${wallet.name}</span>
        ${wallet.error ? '<span class="wallet-error" title="Error loading wallet">⚠️</span>' : ""}
      </div>
      <div class="wallet-balance">${balanceStr} BTC</div>
      ${unconfirmedStr}
      <div class="wallet-meta">
        <span>${wallet.txCount || 0} txs</span>
        ${badges.join("")}
      </div>
    </div>
  `;
}

function showWalletDetail(walletName) {
  const detailsElement = document.getElementById("transactionDetails");
  if (!detailsElement) return;

  const wallet = walletsCache.find((w) => w.name === walletName);
  if (!wallet) return;

  const closeBtn = document.getElementById("closeDetailsBtn");
  if (closeBtn) closeBtn.style.display = "block";

  let descriptorHTML = "";
  if (wallet.descriptorInfo && wallet.descriptorInfo.length > 0) {
    descriptorHTML = `
      <div class="details-section">
        <h4>Multisig Descriptors</h4>
        ${wallet.descriptorInfo
          .map(
            (d) => `
          <div class="detail-item">
            <span class="detail-label">${d.internal ? "Change" : "Receive"}${d.active ? " (active)" : ""}:</span>
            <span class="detail-value code" style="font-size:0.75rem;word-break:break-all;">${d.desc}</span>
          </div>`,
          )
          .join("")}
      </div>`;
  }

  detailsElement.innerHTML = `
    <div class="details-header">
      <h3 style="color: ${wallet.isMultisig ? "var(--caravan-yellow)" : "var(--caravan-blue)"};">
        ${wallet.isMultisig ? "🔐" : "💰"} ${wallet.name}
      </h3>
    </div>
    <div class="details-content">
      <div class="details-section">
        <h4>Wallet Information</h4>
        <div class="detail-item">
          <span class="detail-label">Balance:</span>
          <span class="detail-value" style="color:var(--success-color);font-weight:600;">
            ${wallet.balance !== undefined ? wallet.balance.toFixed(8) : "0.00000000"} BTC
          </span>
        </div>
        ${
          wallet.unconfirmedBalance
            ? `<div class="detail-item">
                <span class="detail-label">Unconfirmed:</span>
                <span class="detail-value" style="color:var(--warning-color);">${wallet.unconfirmedBalance.toFixed(8)} BTC</span>
              </div>`
            : ""
        }
        ${
          wallet.immatureBalance
            ? `<div class="detail-item">
                <span class="detail-label">Immature:</span>
                <span class="detail-value">${wallet.immatureBalance.toFixed(8)} BTC</span>
              </div>`
            : ""
        }
        <div class="detail-item">
          <span class="detail-label">Transactions:</span>
          <span class="detail-value">${wallet.txCount || 0}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Type:</span>
          <span class="detail-value">
            ${wallet.isDescriptor ? "Descriptor" : "Legacy"}
            ${wallet.isMultisig ? " / Multisig" : ""}
          </span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Keypool:</span>
          <span class="detail-value">${wallet.keypoolSize || 0}</span>
        </div>
      </div>
      ${descriptorHTML}
    </div>
  `;
}

// ============================================
// Display Blocks
// ============================================
function displayBlocks() {
  const container = document.getElementById("blocksContainer");
  if (!container) return;

  const blocks = blockchainData.blocks || [];

  if (blocks.length === 0) {
    container.innerHTML =
      '<p class="empty-message"><i class="fas fa-cube"></i> No blocks found. Mine some!</p>';
    return;
  }

  let html = "";
  blocks.slice(0, 10).forEach((block) => {
    const time = new Date(block.time * 1000).toLocaleString();
    html += `
      <div class="block" data-hash="${block.hash}">
        <div class="block-header">
          <div class="block-height">#${block.height}</div>
          <div>${time}</div>
        </div>
        <div class="block-details">
          <div><i class="fas fa-fingerprint"></i> ${block.hash.substring(0, 10)}...</div>
          <div><i class="fas fa-file-alt"></i> ${(block.size / 1024).toFixed(2)} KB</div>
          <div><i class="fas fa-exchange-alt"></i> ${block.txCount || 0} txs</div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll(".block").forEach((el) => {
    el.addEventListener("click", () => {
      playSound("click");
      fetchBlockDetails(el.dataset.hash);
    });
  });
}

// ============================================
// Display Mempool
// ============================================
function displayMempool() {
  const container = document.getElementById("mempoolContainer");
  if (!container) return;

  const txids = blockchainData.mempool?.txids || [];

  if (txids.length === 0) {
    container.innerHTML =
      '<p class="empty-message"><i class="fas fa-exchange-alt"></i> No transactions in mempool</p>';
    return;
  }

  // Sort
  const sortSelect = document.getElementById("mempoolSortSelect");
  const sortBy = sortSelect ? sortSelect.value : "time";

  let sorted = [...txids];
  if (sortBy === "feeRate") {
    sorted.sort((a, b) => {
      const feeA = parseInt(a.substring(0, 8), 16) % 100;
      const feeB = parseInt(b.substring(0, 8), 16) % 100;
      return feeB - feeA;
    });
  } else if (sortBy === "size") {
    sorted.sort((a, b) => {
      const sizeA = parseInt(a.substring(0, 8), 16) % 1000;
      const sizeB = parseInt(b.substring(0, 8), 16) % 1000;
      return sizeB - sizeA;
    });
  }

  let html = "";
  sorted.slice(0, 10).forEach((txid) => {
    const feeRate = (parseInt(txid.substring(0, 8), 16) % 100) / 10;

    html += `
      <div class="transaction" data-txid="${txid}">
        <div class="txid">${txid.substring(0, 16)}...</div>
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <span style="color:var(--text-secondary);font-size:0.8rem;">${feeRate.toFixed(1)} sat/vB</span>
          <button class="action-button secondary" style="padding:0.25rem 0.5rem;font-size:0.75rem;">
            <i class="fas fa-info-circle"></i>
          </button>
        </div>
      </div>
    `;
  });

  if (txids.length > 10) {
    html += `<p class="more-info">And ${txids.length - 10} more transactions...</p>`;
  }

  container.innerHTML = html;

  container.querySelectorAll(".transaction").forEach((el) => {
    el.addEventListener("click", () => {
      playSound("click");
      fetchTransactionDetails(el.dataset.txid);
    });
  });
}

// ============================================
// Display Block Details
// ============================================
function displayBlockDetails(block) {
  const detailsElement = document.getElementById("transactionDetails");
  if (!detailsElement) return;

  const closeBtn = document.getElementById("closeDetailsBtn");
  if (closeBtn) closeBtn.style.display = "block";

  const time = new Date(block.time * 1000).toLocaleString();

  let html = `
    <div class="details-header">
      <h3 style="color:var(--caravan-blue);">Block #${block.height}</h3>
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
          <span class="detail-value">${block.weight} WU</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Transactions:</span>
          <span class="detail-value">${block.tx?.length || 0}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Difficulty:</span>
          <span class="detail-value">${block.difficulty}</span>
        </div>
      </div>`;

  if (block.tx && block.tx.length > 0) {
    html += `
      <div class="details-section">
        <h4>Transactions</h4>
        <div style="max-height:300px;overflow-y:auto;">`;

    block.tx.forEach((tx, index) => {
      const txid = typeof tx === "string" ? tx : tx.txid;
      const isCoinbase =
        typeof tx !== "string" &&
        tx.vin &&
        tx.vin.length > 0 &&
        tx.vin[0].coinbase;

      html += `
        <div class="detail-item" style="padding:0.5rem 0;">
          <span class="detail-label">${index + 1}. ${isCoinbase ? '<i class="fas fa-coins" style="color:var(--caravan-yellow);"></i>' : ""}</span>
          <span class="detail-value">
            <span class="code" style="font-size:0.8rem;">${txid.substring(0, 40)}...</span>
            <button class="view-tx-btn action-button secondary" data-txid="${txid}" style="padding:0.25rem 0.5rem;font-size:0.75rem;margin-left:0.5rem;">
              <i class="fas fa-external-link-alt"></i> View
            </button>
          </span>
        </div>`;
    });

    html += `</div></div>`;
  }

  html += "</div>";
  detailsElement.innerHTML = html;

  // Attach tx view button listeners
  detailsElement.querySelectorAll(".view-tx-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      playSound("click");
      fetchTransactionDetails(btn.dataset.txid);
    });
  });
}

// ============================================
// Display Transaction Details
// ============================================
function displayTransactionDetails(tx) {
  const detailsElement = document.getElementById("transactionDetails");
  if (!detailsElement) return;

  const closeBtn = document.getElementById("closeDetailsBtn");
  if (closeBtn) closeBtn.style.display = "block";

  // Calculate values
  let totalOutput = 0;
  if (tx.vout) {
    tx.vout.forEach((out) => {
      if (out.value) totalOutput += out.value;
    });
  }

  const isCoinbase = tx.vin && tx.vin.length > 0 && tx.vin[0].coinbase;

  let html = `
    <div class="details-header">
      <h3 style="color:var(--caravan-yellow);">Transaction Details</h3>
    </div>
    <div class="details-content">
      <div class="details-section">
        <h4>Transaction Information</h4>
        <div class="detail-item">
          <span class="detail-label">TxID:</span>
          <span class="detail-value code" style="word-break:break-all;">${tx.txid}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Size:</span>
          <span class="detail-value">${tx.size || "?"} bytes (${tx.vsize || "?"} vbytes)</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Weight:</span>
          <span class="detail-value">${tx.weight || "?"} WU</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Status:</span>
          <span class="detail-value">
            ${
              tx.confirmations
                ? `<span style="color:var(--success-color);"><i class="fas fa-check-circle"></i> Confirmed (${tx.confirmations})</span>`
                : '<span style="color:var(--warning-color);"><i class="fas fa-clock"></i> Unconfirmed</span>'
            }
          </span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Total Output:</span>
          <span class="detail-value">${totalOutput.toFixed(8)} BTC</span>
        </div>
        ${
          isCoinbase
            ? `<div class="detail-item">
                <span class="detail-label">Type:</span>
                <span class="detail-value" style="color:var(--caravan-yellow);"><i class="fas fa-coins"></i> Coinbase (Mining Reward)</span>
              </div>`
            : ""
        }
      </div>`;

  // Inputs
  if (tx.vin && tx.vin.length > 0) {
    html += `<div class="details-section"><h4>Inputs (${tx.vin.length})</h4><div style="max-height:200px;overflow-y:auto;">`;
    tx.vin.forEach((input, i) => {
      if (input.coinbase) {
        html += `<div class="detail-item" style="padding:0.5rem 0;">
          <span class="detail-label">Coinbase:</span>
          <span class="detail-value" style="color:var(--success-color);"><i class="fas fa-coins"></i> New Coins (Block Reward)</span>
        </div>`;
      } else {
        html += `<div class="detail-item" style="padding:0.5rem 0;">
          <span class="detail-label">${i + 1}.</span>
          <span class="detail-value">
            <span class="code" style="font-size:0.8rem;">${(input.txid || "?").substring(0, 24)}...:${input.vout ?? "?"}</span>
          </span>
        </div>`;
      }
    });
    html += `</div></div>`;
  }

  // Outputs
  if (tx.vout && tx.vout.length > 0) {
    html += `<div class="details-section"><h4>Outputs (${tx.vout.length})</h4><div style="max-height:200px;overflow-y:auto;">`;
    tx.vout.forEach((output, i) => {
      const address =
        output.scriptPubKey?.address ||
        (output.scriptPubKey?.addresses
          ? output.scriptPubKey.addresses[0]
          : null) ||
        "Unknown";
      const scriptType = output.scriptPubKey?.type || "unknown";

      html += `<div class="detail-item" style="padding:0.5rem 0;">
        <span class="detail-label">${i + 1}.</span>
        <span class="detail-value">
          <div style="display:flex;justify-content:space-between;width:100%;">
            <span style="font-size:0.8rem;color:var(--text-secondary);">${scriptType}</span>
            <span style="font-weight:600;">${(output.value || 0).toFixed(8)} BTC</span>
          </div>
          <div class="code" style="font-size:0.75rem;margin-top:0.25rem;word-break:break-all;">${address}</div>
        </span>
      </div>`;
    });
    html += `</div></div>`;
  }

  html += "</div>";
  detailsElement.innerHTML = html;
}

// Simulated tx detail (for network view nodes without real txids)
function showSimulatedTxDetail(nodeId) {
  const detailsElement = document.getElementById("transactionDetails");
  if (!detailsElement) return;

  const closeBtn = document.getElementById("closeDetailsBtn");
  if (closeBtn) closeBtn.style.display = "block";

  // Try to get the actual txid from block data
  const parts = nodeId.split("_"); // tx_HEIGHT_INDEX
  const blockHeight = parseInt(parts[1]);
  const txIndex = parseInt(parts[2]);

  const block = (blockchainData.blocks || []).find(
    (b) => b.height === blockHeight,
  );

  // If block has full tx data, try to fetch the real tx
  if (block && block.tx && block.tx[txIndex]) {
    const realTx = block.tx[txIndex];
    const txid = typeof realTx === "string" ? realTx : realTx.txid;
    if (txid && !txid.startsWith("tx_")) {
      fetchTransactionDetails(txid);
      return;
    }
  }

  // Fallback: show what we know
  detailsElement.innerHTML = `
    <div class="details-header">
      <h3 style="color:var(--caravan-blue);">Transaction</h3>
    </div>
    <div class="details-content">
      <div class="details-section">
        <h4>Transaction Info</h4>
        <div class="detail-item">
          <span class="detail-label">Node ID:</span>
          <span class="detail-value code">${nodeId}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Block:</span>
          <span class="detail-value">#${blockHeight}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Index:</span>
          <span class="detail-value">${txIndex}${txIndex === 0 ? " (coinbase)" : ""}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Status:</span>
          <span class="detail-value" style="color:var(--success-color);"><i class="fas fa-check-circle"></i> Confirmed</span>
        </div>
      </div>
    </div>`;
}

function showMempoolDetail() {
  const detailsElement = document.getElementById("transactionDetails");
  if (!detailsElement) return;

  const closeBtn = document.getElementById("closeDetailsBtn");
  if (closeBtn) closeBtn.style.display = "block";

  const mempool = blockchainData.mempool || {};
  const mempoolInfo = blockchainData.mempoolInfo || {};

  detailsElement.innerHTML = `
    <div class="details-header">
      <h3 style="color:var(--caravan-yellow);">Mempool Information</h3>
    </div>
    <div class="details-content">
      <div class="details-section">
        <h4>Overview</h4>
        <div class="detail-item">
          <span class="detail-label">Transactions:</span>
          <span class="detail-value">${mempool.txCount || 0}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Size:</span>
          <span class="detail-value">${((mempool.size || 0) / 1024).toFixed(2)} KB</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Memory Usage:</span>
          <span class="detail-value">${((mempoolInfo.usage || 0) / 1024).toFixed(2)} KB</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Min Fee Rate:</span>
          <span class="detail-value">${mempoolInfo.mempoolMinFee || 0} BTC/kB</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Min Relay Fee:</span>
          <span class="detail-value">${mempoolInfo.minRelaytxFee || 0} BTC/kB</span>
        </div>
      </div>
    </div>`;
}

// ============================================
// Hide Transaction Details
// ============================================
function hideTransactionDetails() {
  const detailsElement = document.getElementById("transactionDetails");
  if (detailsElement) {
    detailsElement.innerHTML = `
      <p class="empty-details">
        <i class="fas fa-hand-pointer"></i>
        Select a transaction, block, or wallet to view details
      </p>`;
  }
  const closeBtn = document.getElementById("closeDetailsBtn");
  if (closeBtn) closeBtn.style.display = "none";
}

// ============================================
// Mining Info Panel
// ============================================
function showMiningInfo(info) {
  const detailsElement = document.getElementById("transactionDetails");
  if (!detailsElement) return;

  const closeBtn = document.getElementById("closeDetailsBtn");
  if (closeBtn) closeBtn.style.display = "block";

  detailsElement.innerHTML = `
    <div class="details-header">
      <h3 style="color:var(--caravan-blue);"><i class="fas fa-hammer"></i> Mining Information</h3>
    </div>
    <div class="details-content">
      <div class="details-section">
        <h4>Network Status</h4>
        <div class="detail-item">
          <span class="detail-label">Chain:</span>
          <span class="detail-value">${info.chain || "regtest"}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Difficulty:</span>
          <span class="detail-value">${info.difficulty || blockchainData.chainInfo?.difficulty || "N/A"}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Block Height:</span>
          <span class="detail-value">${info.blocks || blockchainData.chainInfo?.blocks || "N/A"}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Size on Disk:</span>
          <span class="detail-value">${info.sizeOnDisk ? (info.sizeOnDisk / 1024 / 1024).toFixed(2) + " MB" : "N/A"}</span>
        </div>
      </div>

      <div class="details-section">
        <h4>Mining Controls</h4>
        <p style="margin-bottom:1rem;color:var(--text-secondary);">In regtest mode, blocks are mined instantly:</p>
        <div style="display:flex;gap:1rem;flex-wrap:wrap;">
          <button id="mine1BlockBtn" class="action-button"><i class="fas fa-plus-circle"></i> Mine 1 Block</button>
          <button id="mine6BlocksBtn" class="action-button"><i class="fas fa-cubes"></i> Mine 6 Blocks</button>
          <button id="mine100BlocksBtn" class="action-button secondary"><i class="fas fa-layer-group"></i> Mine 100 Blocks</button>
        </div>
      </div>

      <div class="details-section">
        <h4>Tips</h4>
        <ul style="list-style-type:disc;padding-left:1.5rem;color:var(--text-secondary);line-height:1.8;">
          <li>Mine a block to confirm mempool transactions</li>
          <li>Mine 6 blocks for full confirmation</li>
          <li>Mine 100+ blocks to mature coinbase rewards (spendable)</li>
        </ul>
      </div>
    </div>`;

  // Attach mining button listeners
  document.getElementById("mine1BlockBtn").addEventListener("click", () => {
    mineBlocksWithButton("mine1BlockBtn", 1);
  });
  document.getElementById("mine6BlocksBtn").addEventListener("click", () => {
    mineBlocksWithButton("mine6BlocksBtn", 6);
  });
  document.getElementById("mine100BlocksBtn").addEventListener("click", () => {
    mineBlocksWithButton("mine100BlocksBtn", 100);
  });
}

async function mineBlocksWithButton(btnId, count) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mining...';
  btn.disabled = true;

  const result = await postSafe("/api/mine-block", { blocks: count });
  if (result) {
    addMiningLog(`✅ Mined ${count} block(s)`, "success");
    playSound("block-mined");
  } else {
    addMiningLog(`❌ Failed to mine ${count} block(s)`, "error");
    playSound("error");
  }

  btn.innerHTML = originalHTML;
  btn.disabled = false;
}

// ============================================
// Update Dashboard Stats
// ============================================
function updateDashboard() {
  setText(
    "blockCount",
    blockchainData.chainInfo?.blocks || blockchainData.stats?.blockCount || 0,
  );
  setText("txCount", blockchainData.stats?.totalTxCount || 0);
  setText(
    "difficulty",
    blockchainData.chainInfo?.difficulty !== undefined
      ? Number(blockchainData.chainInfo.difficulty).toFixed(2)
      : "0",
  );
  setText(
    "mempoolSize",
    blockchainData.mempool?.txCount || blockchainData.stats?.mempoolSize || 0,
  );
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// ============================================
// Add/Update Blocks & Transactions
// ============================================
function addNewBlock(block) {
  if (!blockchainData.blocks) blockchainData.blocks = [];
  blockchainData.blocks.unshift(block);

  if (blockchainData.chainInfo) {
    blockchainData.chainInfo.blocks =
      (blockchainData.chainInfo.blocks || 0) + 1;
  }

  if (blockchainData.stats) {
    blockchainData.stats.totalTxCount =
      (blockchainData.stats.totalTxCount || 0) + (block.txCount || 0);
  }

  // Remove confirmed txs from mempool display
  if (blockchainData.mempool?.txids?.length > 0) {
    const toRemove = Math.min(
      block.txCount || 0,
      blockchainData.mempool.txids.length,
    );
    if (toRemove > 0) {
      blockchainData.mempool.txids =
        blockchainData.mempool.txids.slice(toRemove);
      blockchainData.mempool.txCount = blockchainData.mempool.txids.length;
    }
  }

  updateVisualizations();
  updateDashboard();
}

function addNewTransaction(tx) {
  if (!blockchainData.mempool)
    blockchainData.mempool = { txids: [], txCount: 0 };
  if (!blockchainData.mempool.txids) blockchainData.mempool.txids = [];

  blockchainData.mempool.txids.unshift(tx.txid);
  blockchainData.mempool.txCount = blockchainData.mempool.txids.length;

  updateMempoolVisualization();
  updateDashboard();
  displayMempool();
}

// ============================================
// Mine Block Action
// ============================================
async function triggerMineBlock() {
  playSound("click");

  const btn = document.getElementById("mineBlockBtn");
  if (btn) {
    btn.classList.add("mining-active");
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mining...';
    btn.disabled = true;
  }

  const result = await postSafe("/api/mine-block", { blocks: 1 });

  if (result) {
    addMiningLog("⛏️ Mine block request sent", "info");
  } else {
    addMiningLog("❌ Error mining block", "error");
    playSound("error");
  }

  setTimeout(() => {
    if (btn) {
      btn.classList.remove("mining-active");
      btn.innerHTML = '<i class="fas fa-hammer"></i> Mine Block';
      btn.disabled = false;
    }
  }, 2000);
}

// ============================================
// Create Transaction Action
// ============================================
async function triggerCreateTransaction() {
  playSound("click");

  const createButton = document.getElementById("createTxBtn");

  // Fetch real wallet list for the dropdown
  let walletOptions = "";
  if (walletsCache.length > 0) {
    walletOptions = walletsCache
      .map(
        (w) =>
          `<option value="${w.name}">${w.name} (${(w.balance || 0).toFixed(4)} BTC)</option>`,
      )
      .join("");
  } else {
    // Try fetching
    const data = await fetchSafe("/api/wallets");
    if (data && data.wallets) {
      walletOptions = data.wallets
        .map((name) => `<option value="${name}">${name}</option>`)
        .join("");
    } else {
      walletOptions = '<option value="">No wallets found</option>';
    }
  }

  // Build modal
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3><i class="fas fa-exchange-alt"></i> Create Transaction</h3>
        <button class="close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="txFromWallet">From Wallet:</label>
          <select id="txFromWallet">${walletOptions}</select>
        </div>
        <div class="form-group">
          <label for="txToAddress">To Address:</label>
          <input type="text" id="txToAddress" placeholder="Enter destination address or leave empty for new address">
          <button id="generateAddrBtn" class="action-button secondary" style="margin-top:0.5rem;font-size:0.8rem;">
            <i class="fas fa-magic"></i> Generate new address from another wallet
          </button>
        </div>
        <div class="form-group">
          <label for="txAmount">Amount (BTC):</label>
          <input type="number" id="txAmount" value="0.001" min="0.00001" step="0.00001">
        </div>
        <div id="txModalError"></div>
      </div>
      <div class="modal-footer">
        <button id="txSubmitBtn" class="action-button"><i class="fas fa-paper-plane"></i> Send</button>
        <button id="txCancelBtn" class="action-button secondary">Cancel</button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  // Ensure modal styles exist
  ensureModalStyles();

  const closeModal = () => {
    if (document.body.contains(modal)) document.body.removeChild(modal);
    if (createButton) {
      createButton.classList.remove("mining-active");
      createButton.innerHTML =
        '<i class="fas fa-plus-circle"></i> Create Transaction';
      createButton.disabled = false;
    }
  };

  modal.querySelector(".close-btn").addEventListener("click", closeModal);
  modal.querySelector("#txCancelBtn").addEventListener("click", closeModal);

  // Generate address button
  modal
    .querySelector("#generateAddrBtn")
    .addEventListener("click", async () => {
      const fromWallet = modal.querySelector("#txFromWallet").value;
      // Pick a different wallet for the destination
      const otherWallets = walletsCache.filter((w) => w.name !== fromWallet);
      const targetWallet =
        otherWallets.length > 0 ? otherWallets[0].name : fromWallet;

      const result = await fetchSafe(
        `/api/new-address?wallet=${encodeURIComponent(targetWallet)}`,
      );
      if (result && result.address) {
        modal.querySelector("#txToAddress").value = result.address;
        addMiningLog(
          `Generated address from ${targetWallet}: ${result.address.substring(0, 16)}...`,
          "info",
        );
      } else {
        const errorDiv = modal.querySelector("#txModalError");
        errorDiv.innerHTML =
          '<p style="color:var(--error-color);margin-top:0.5rem;">Failed to generate address</p>';
      }
    });

  // Submit button
  modal.querySelector("#txSubmitBtn").addEventListener("click", async () => {
    const fromWallet = modal.querySelector("#txFromWallet").value;
    let toAddress = modal.querySelector("#txToAddress").value.trim();
    const amount = parseFloat(modal.querySelector("#txAmount").value);

    if (!fromWallet) {
      modal.querySelector("#txModalError").innerHTML =
        '<p style="color:var(--error-color);">Please select a wallet</p>';
      return;
    }

    if (!amount || amount <= 0) {
      modal.querySelector("#txModalError").innerHTML =
        '<p style="color:var(--error-color);">Invalid amount</p>';
      return;
    }

    // If no address, generate one
    if (!toAddress) {
      const otherWallets = walletsCache.filter((w) => w.name !== fromWallet);
      const targetWallet =
        otherWallets.length > 0 ? otherWallets[0].name : fromWallet;
      const addrResult = await fetchSafe(
        `/api/new-address?wallet=${encodeURIComponent(targetWallet)}`,
      );
      if (addrResult && addrResult.address) {
        toAddress = addrResult.address;
      } else {
        modal.querySelector("#txModalError").innerHTML =
          '<p style="color:var(--error-color);">Could not generate destination address</p>';
        return;
      }
    }

    const submitBtn = modal.querySelector("#txSubmitBtn");
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    submitBtn.disabled = true;

    const result = await postSafe("/api/create-transaction", {
      fromWallet,
      toAddress,
      amount,
    });

    if (result && result.txid) {
      addMiningLog(
        `💸 Transaction sent: ${result.txid.substring(0, 16)}...`,
        "success",
      );
      closeModal();
      fetchWalletDetails(); // Refresh balances
    } else {
      modal.querySelector("#txModalError").innerHTML =
        '<p style="color:var(--error-color);">Transaction failed. Check wallet balance and address.</p>';
      submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send';
      submitBtn.disabled = false;
      playSound("error");
    }
  });
}

function ensureModalStyles() {
  if (document.getElementById("modal-styles")) return;

  const style = document.createElement("style");
  style.id = "modal-styles";
  style.textContent = `
    .modal {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.6); display: flex;
      align-items: center; justify-content: center; z-index: 1000;
    }
    .modal-content {
      background: var(--card-bg); border-radius: 0.75rem;
      width: 480px; max-width: 90%;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      border: 1px solid var(--border-color);
    }
    .modal-header {
      padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color);
      display: flex; justify-content: space-between; align-items: center;
    }
    .modal-header h3 { margin: 0; color: var(--caravan-blue); }
    .modal-body { padding: 1.5rem; }
    .modal-footer {
      padding: 1rem 1.5rem; border-top: 1px solid var(--border-color);
      display: flex; justify-content: flex-end; gap: 0.75rem;
    }
    .form-group { margin-bottom: 1rem; }
    .form-group label {
      display: block; margin-bottom: 0.5rem; color: var(--text-color);
      font-weight: 500; font-size: 0.9rem;
    }
    .form-group input, .form-group select {
      width: 100%; padding: 0.75rem;
      border: 1px solid var(--border-color); border-radius: 0.375rem;
      background: var(--highlight-bg); color: var(--text-color);
      font-family: 'Roboto Mono', monospace; font-size: 0.875rem;
    }
    .form-group input:focus, .form-group select:focus {
      outline: none; border-color: var(--caravan-blue);
      box-shadow: 0 0 0 2px rgba(0,116,217,0.2);
    }
    .close-btn {
      background: none; border: none; color: var(--text-secondary);
      font-size: 1.5rem; cursor: pointer; padding: 0; line-height: 1;
    }
    .close-btn:hover { color: var(--text-color); }

    /* Wallet panel styles */
    .wallet-section-header {
      display: flex; align-items: center; gap: 0.5rem;
      font-size: 0.8rem; font-weight: 600; color: var(--text-secondary);
      padding: 0.75rem 0 0.25rem 0; text-transform: uppercase; letter-spacing: 0.05em;
    }
    .wallet-card {
      background: var(--highlight-bg); border: 1px solid var(--border-color);
      border-radius: 0.5rem; padding: 0.75rem; margin-bottom: 0.5rem;
      cursor: pointer; transition: all 0.2s;
    }
    .wallet-card:hover { border-color: var(--caravan-blue); background: var(--card-bg); }
    .wallet-multisig { border-left: 3px solid var(--caravan-yellow); }
    .wallet-card-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; }
    .wallet-icon { font-size: 1rem; }
    .wallet-name { font-weight: 600; font-size: 0.85rem; }
    .wallet-error { color: var(--error-color); }
    .wallet-balance {
      font-family: 'Roboto Mono', monospace; font-size: 0.8rem;
      color: var(--success-color); margin-bottom: 0.25rem;
    }
    .wallet-unconfirmed {
      font-size: 0.75rem; color: var(--warning-color);
    }
    .wallet-meta {
      display: flex; gap: 0.5rem; align-items: center; margin-top: 0.25rem;
      font-size: 0.7rem; color: var(--text-secondary);
    }
    .badge {
      padding: 1px 5px; border-radius: 3px; font-size: 0.65rem; font-weight: 600;
    }
    .badge-descriptor { background: rgba(0,116,217,0.15); color: var(--caravan-blue); }
    .badge-multisig { background: rgba(255,215,0,0.15); color: var(--caravan-yellow); }
  `;
  document.head.appendChild(style);
}

// ============================================
// Mining Activity Log
// ============================================
function showMiningActivity(show = true) {
  const el = document.getElementById("miningActivity");
  if (!el) return;
  el.style.display = show ? "block" : "none";
}

function addMiningLog(message, type = "info") {
  const container = document.getElementById("miningLogs");
  if (!container) return;

  const entry = document.createElement("div");
  entry.className = `mining-log mining-log-${type}`;
  const timestamp = new Date().toLocaleTimeString();
  entry.innerHTML = `<span style="opacity:0.5;margin-right:5px;">[${timestamp}]</span> ${message}`;

  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;

  showMiningActivity(true);

  // Keep max 100 logs
  while (container.children.length > 100) {
    container.removeChild(container.firstChild);
  }
}

// ============================================
// Theme Toggle
// ============================================
function toggleTheme() {
  const body = document.body;
  const themeIcon = document.querySelector("#themeToggle i");

  body.classList.toggle("light-theme");
  const isLight = body.classList.contains("light-theme");
  localStorage.setItem("theme", isLight ? "light" : "dark");

  if (themeIcon) themeIcon.className = isLight ? "fas fa-sun" : "fas fa-moon";

  // Refresh charts with new theme colors
  if (blockchainChart) updateBlockchainVisualization();
  if (mempoolChart) updateMempoolVisualization();
  // FIX: Don't call updateNetworkVisualization() without argument
  if (transactionNetwork) initTransactionNetwork();

  playSound("click");
}

function loadThemePreference() {
  const theme = localStorage.getItem("theme") || "dark";
  const themeIcon = document.querySelector("#themeToggle i");

  if (theme === "light") {
    document.body.classList.add("light-theme");
    if (themeIcon) themeIcon.className = "fas fa-sun";
  }
}

// ============================================
// Periodic wallet refresh
// ============================================
setInterval(fetchWalletDetails, 15000);
