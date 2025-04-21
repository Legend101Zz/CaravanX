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
let mempoolSizeHistory = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
let isFirstLoad = true;

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

    // Play sound effect
    playSound("block-mined");
  });

  socket.on("new_transaction", (tx) => {
    console.log("New transaction", tx);
    addNewTransaction(tx);
    addMiningLog(`New transaction: ${tx.txid.substring(0, 8)}...`);

    // Play sound effect
    playSound("transaction");
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

// Sound effects
function playSound(type) {
  // Create an audio element for the sound effect
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
      return; // No sound to play
  }

  // Load and play the sound
  audio.load();
  audio.volume = 0.5;
  audio
    .play()
    .catch((e) => console.log("Sound play prevented by browser policy", e));
}

// Setup event listeners
function setupEventListeners() {
  // View switching buttons
  document.getElementById("pixelViewBtn").addEventListener("click", () => {
    playSound("click");
    window.location.href = "index-pixel.html";
  });

  document.getElementById("minecraftViewBtn").addEventListener("click", () => {
    playSound("click");
    window.location.href = "index-minecraft.html";
  });

  // Refresh button
  document.getElementById("refreshBtn").addEventListener("click", () => {
    playSound("click");
    fetchInitialData();
  });

  // Mining buttons
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
      playSound("click");
      fetch("/api/chain-info")
        .then((response) => response.json())
        .then((info) => {
          showMiningInfo(info);
        })
        .catch((error) => console.error("Error fetching mining info:", error));
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
      document.getElementById("miningActivity").style.display = "none";
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

  // Network control buttons
  const zoomInBtn = document.getElementById("zoomInBtn");
  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", () => {
      if (transactionNetwork) {
        transactionNetwork.zoom(0.2);
      }
    });
  }

  const zoomOutBtn = document.getElementById("zoomOutBtn");
  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", () => {
      if (transactionNetwork) {
        transactionNetwork.zoom(-0.2);
      }
    });
  }

  const resetViewBtn = document.getElementById("resetViewBtn");
  if (resetViewBtn) {
    resetViewBtn.addEventListener("click", () => {
      if (transactionNetwork) {
        transactionNetwork.fit();
      }
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
    if (blockchainChart) {
      blockchainChart.resize();
    }
    if (mempoolChart) {
      mempoolChart.resize();
    }
  });
}

// Fetch initial blockchain data
function fetchInitialData() {
  showLoadingStates();

  fetch("/api/blockchain")
    .then((response) => response.json())
    .then((data) => {
      blockchainData = data;
      updateDashboard();
      initVisualizations();
      hideLoadingStates();

      if (isFirstLoad) {
        playIntroAnimation();
        isFirstLoad = false;
      }
    })
    .catch((error) => {
      console.error("Error fetching blockchain data:", error);
      showErrorMessage("Failed to load blockchain data. Please try again.");
      hideLoadingStates();
    });
}

// Show loading states for all containers
function showLoadingStates() {
  const loadingHTML = `<div class="loading">
        <div class="spinner"></div>
        <span>Loading data...</span>
    </div>`;

  // For blocks container
  const blocksContainer = document.getElementById("blocksContainer");
  if (blocksContainer) {
    blocksContainer.innerHTML = loadingHTML;
  }

  // For mempool container
  const mempoolContainer = document.getElementById("mempoolContainer");
  if (mempoolContainer) {
    mempoolContainer.innerHTML = loadingHTML;
  }

  // For network container
  const networkContainer = document.getElementById("transactionNetwork");
  if (networkContainer) {
    networkContainer.innerHTML = loadingHTML;
  }
}

// Hide loading states
function hideLoadingStates() {
  // The content will be replaced by actual data in respective display functions
}

// Show error message
function showErrorMessage(message) {
  const errorHTML = `<div class="error-message">
        <i class="fas fa-exclamation-triangle"></i>
        <p>${message}</p>
    </div>`;

  // Add to different containers as needed
  const containers = [
    document.getElementById("blocksContainer"),
    document.getElementById("mempoolContainer"),
    document.getElementById("transactionNetwork"),
  ];

  containers.forEach((container) => {
    if (container) {
      container.innerHTML = errorHTML;
    }
  });
}

// Update connection status indicator
function updateConnectionStatus(connected) {
  const statusElement = document.getElementById("connectionStatus");
  if (!statusElement) return;

  const statusIndicator = statusElement.querySelector(".status-indicator");
  const statusText = statusElement.querySelector(".status-text");

  if (connected) {
    statusIndicator.classList.remove("disconnected");
    statusIndicator.classList.add("connected");
    statusText.textContent = "Connected";
  } else {
    statusIndicator.classList.remove("connected");
    statusIndicator.classList.add("disconnected");
    statusText.textContent = "Disconnected";
  }
}

// Play intro animation
function playIntroAnimation() {
  // Animate stats cards to fade in one by one
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

  // Animate cards to fade in after stats
  const cards = document.querySelectorAll(".card");
  cards.forEach((card, index) => {
    if (card.closest(".stats-section")) return; // Skip stats cards

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
  const container = document.getElementById("blockchainVisualization");
  if (!container) return;

  // Clear previous chart
  container.innerHTML = "";

  const canvas = document.createElement("canvas");
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");

  // Get block data
  const blockHeights = blockchainData.blocks.map((block) => block.height);
  const blockSizes = blockchainData.blocks.map((block) => block.size / 1024); // KB
  const blockColors = blockchainData.blocks.map(() => {
    return `rgba(0, 116, 217, 0.7)`; // Caravan blue with transparency
  });

  // Create gradient for bars
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "rgba(0, 116, 217, 0.8)");
  gradient.addColorStop(1, "rgba(0, 116, 217, 0.3)");

  // Configure Chart.js
  Chart.defaults.color = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--text-secondary");
  Chart.defaults.borderColor = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--border-color");

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
      animation: {
        duration: 1000,
        easing: "easeOutQuart",
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-color",
            ),
            font: {
              family: "'Inter', sans-serif",
              size: 12,
            },
          },
        },
        tooltip: {
          backgroundColor: getComputedStyle(
            document.documentElement,
          ).getPropertyValue("--card-bg"),
          titleColor: getComputedStyle(
            document.documentElement,
          ).getPropertyValue("--caravan-yellow"),
          bodyColor: getComputedStyle(
            document.documentElement,
          ).getPropertyValue("--text-color"),
          borderColor: getComputedStyle(
            document.documentElement,
          ).getPropertyValue("--border-color"),
          borderWidth: 1,
          cornerRadius: 6,
          padding: 10,
          titleFont: {
            family: "'Roboto Mono', monospace",
            size: 13,
            weight: "bold",
          },
          bodyFont: {
            family: "'Inter', sans-serif",
            size: 12,
          },
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
              return [
                `Time: ${time}`,
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
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-color",
            ),
            font: {
              family: "'Inter', sans-serif",
              size: 12,
            },
          },
          reverse: true,
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-secondary",
            ),
            font: {
              family: "'Roboto Mono', monospace",
              size: 11,
            },
          },
          grid: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--border-color",
            ),
            display: false,
          },
        },
        y: {
          title: {
            display: true,
            text: "Size (KB)",
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-color",
            ),
            font: {
              family: "'Inter', sans-serif",
              size: 12,
            },
          },
          beginAtZero: true,
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-secondary",
            ),
            font: {
              family: "'Roboto Mono', monospace",
              size: 11,
            },
          },
          grid: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--border-color",
            ),
            lineWidth: 0.5,
          },
        },
      },
    },
  });
}

// Update blockchain visualization
function updateBlockchainVisualization() {
  if (!blockchainChart) return;

  // Update data
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

  // Updating tooltip styles
  blockchainChart.options.plugins.tooltip.backgroundColor = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--card-bg");
  blockchainChart.options.plugins.tooltip.titleColor = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--caravan-yellow");
  blockchainChart.options.plugins.tooltip.bodyColor = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--text-color");
  blockchainChart.options.plugins.tooltip.borderColor = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--border-color");

  blockchainChart.update();
}

// Initialize mempool visualization
function initMempoolVisualization() {
  const container = document.getElementById("mempoolVisualization");
  if (!container) return;

  // Clear previous chart
  container.innerHTML = "";

  const canvas = document.createElement("canvas");
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");

  // Update mempool size history
  const currentSize = blockchainData.mempool?.txCount || 0;
  mempoolSizeHistory.push(currentSize);
  mempoolSizeHistory.shift();

  // Create gradient for area fill
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "rgba(255, 215, 0, 0.7)"); // Caravan yellow with transparency
  gradient.addColorStop(1, "rgba(255, 215, 0, 0.1)");

  // Configure Chart.js
  Chart.defaults.color = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--text-secondary");
  Chart.defaults.borderColor = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--border-color");

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
          borderColor: "rgba(255, 215, 0, 1)", // Caravan yellow
          borderWidth: 2,
          pointBackgroundColor: "rgba(255, 215, 0, 1)",
          pointBorderColor: getComputedStyle(
            document.documentElement,
          ).getPropertyValue("--card-bg"),
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
      animation: {
        duration: 1000,
        easing: "easeOutQuart",
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-color",
            ),
            font: {
              family: "'Inter', sans-serif",
              size: 12,
            },
          },
        },
        tooltip: {
          backgroundColor: getComputedStyle(
            document.documentElement,
          ).getPropertyValue("--card-bg"),
          titleColor: getComputedStyle(
            document.documentElement,
          ).getPropertyValue("--caravan-yellow"),
          bodyColor: getComputedStyle(
            document.documentElement,
          ).getPropertyValue("--text-color"),
          borderColor: getComputedStyle(
            document.documentElement,
          ).getPropertyValue("--border-color"),
          borderWidth: 1,
          cornerRadius: 6,
          padding: 10,
          titleFont: {
            family: "'Inter', sans-serif",
            size: 13,
            weight: "bold",
          },
          bodyFont: {
            family: "'Inter', sans-serif",
            size: 12,
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
            font: {
              family: "'Inter', sans-serif",
              size: 12,
            },
          },
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-secondary",
            ),
            font: {
              family: "'Inter', sans-serif",
              size: 11,
            },
          },
          grid: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--border-color",
            ),
            display: false,
          },
        },
        y: {
          title: {
            display: true,
            text: "Transaction Count",
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-color",
            ),
            font: {
              family: "'Inter', sans-serif",
              size: 12,
            },
          },
          beginAtZero: true,
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-secondary",
            ),
            font: {
              family: "'Roboto Mono', monospace",
              size: 11,
            },
          },
          grid: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--border-color",
            ),
            lineWidth: 0.5,
          },
        },
      },
    },
  });
}

// Update mempool visualization
function updateMempoolVisualization() {
  if (!mempoolChart) return;

  // Update mempool size history
  const currentSize = blockchainData.mempool?.txCount || 0;
  mempoolSizeHistory.push(currentSize);
  mempoolSizeHistory.shift();

  // Update chart data
  mempoolChart.data.datasets[0].data = mempoolSizeHistory;

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

  // Updating tooltip styles
  mempoolChart.options.plugins.tooltip.backgroundColor = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--card-bg");
  mempoolChart.options.plugins.tooltip.titleColor = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--caravan-yellow");
  mempoolChart.options.plugins.tooltip.bodyColor = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--text-color");
  mempoolChart.options.plugins.tooltip.borderColor = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--border-color");

  mempoolChart.update();
}

// Initialize transaction network visualization
function initTransactionNetwork() {
  const container = document.getElementById("transactionNetwork");
  if (!container) return;

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
        background: "#0074D9",
        border: "#0056b3",
        highlight: {
          background: "#0074D9",
          border: "#FFD700",
        },
      },
      font: {
        color: getComputedStyle(document.documentElement).getPropertyValue(
          "--text-color",
        ),
        face: "'Roboto Mono', monospace",
        size: 12,
      },
      size: 30,
    });

    // Add transactions to the block and connect them
    if (block.txCount > 0) {
      // For demonstration, create some transaction nodes
      for (let i = 0; i < Math.min(block.txCount, 5); i++) {
        const txid = `tx_${block.height}_${i}`;
        nodes.push({
          id: txid,
          label: `Tx-${i}`,
          shape: "dot",
          color: {
            background: "#38bdf8",
            border: "#0284c7",
            highlight: {
              background: "#38bdf8",
              border: "#FFD700",
            },
          },
          font: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-color",
            ),
            face: "'Roboto Mono', monospace",
            size: 11,
          },
          size: 15,
        });

        edges.push({
          from: block.hash,
          to: txid,
          arrows: "from",
          color: {
            color: "#38bdf8",
            highlight: "#FFD700",
          },
          width: 2,
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
        background: "#FFD700",
        border: "#e6c100",
        highlight: {
          background: "#FFD700",
          border: "#0074D9",
        },
      },
      font: {
        color: getComputedStyle(document.documentElement).getPropertyValue(
          "--text-color",
        ),
        face: "'Roboto Mono', monospace",
        size: 12,
        bold: true,
      },
      size: 35,
    });

    // Add some mempool transactions
    blockchainData.mempool.txids.slice(0, 10).forEach((txid, i) => {
      const shortTxid = `mempool_tx_${i}`;
      nodes.push({
        id: shortTxid,
        label: `Tx-${txid.substring(0, 6)}`,
        shape: "dot",
        color: {
          background: "#FFD700",
          border: "#e6c100",
          highlight: {
            background: "#FFD700",
            border: "#0074D9",
          },
        },
        font: {
          color: getComputedStyle(document.documentElement).getPropertyValue(
            "--text-color",
          ),
          face: "'Roboto Mono', monospace",
          size: 10,
        },
        size: 12,
      });

      edges.push({
        from: "mempool",
        to: shortTxid,
        dashes: true,
        color: {
          color: "#FFD700",
          highlight: "#0074D9",
        },
        width: 1,
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
      improvedLayout: true,
      hierarchical: {
        enabled: false,
      },
    },
    edges: {
      color: {
        color: getComputedStyle(document.documentElement).getPropertyValue(
          "--border-color",
        ),
        highlight: "#FFD700",
      },
      smooth: {
        enabled: true,
        type: "continuous",
      },
      width: 2,
    },
    nodes: {
      shape: "dot",
      size: 16,
      font: {
        face: "'Roboto Mono', monospace",
        size: 12,
        color: getComputedStyle(document.documentElement).getPropertyValue(
          "--text-color",
        ),
      },
      borderWidth: 2,
      shadow: {
        enabled: true,
        color: "rgba(0,0,0,0.2)",
        size: 5,
      },
    },
    interaction: {
      hover: true,
      tooltipDelay: 300,
      multiselect: true,
      navigationButtons: false,
      keyboard: {
        enabled: true,
        speed: {
          x: 10,
          y: 10,
          zoom: 0.1,
        },
        bindToWindow: false,
      },
    },
  };

  // Create the network with the data and options
  transactionNetwork = new vis.Network(container, data, options);

  // Add click event
  transactionNetwork.on("click", function (params) {
    if (params.nodes.length > 0) {
      const nodeId = params.nodes[0];

      if (nodeId.startsWith("tx_") || nodeId.startsWith("mempool_tx_")) {
        // This would fetch transaction details in a full implementation
        const txParts = nodeId.split("_");
        const txIndex = parseInt(txParts[txParts.length - 1]);

        // Show some transaction details
        const detailsElement = document.getElementById("transactionDetails");
        if (detailsElement) {
          detailsElement.innerHTML = `
                        <div class="details-header">
                            <h3 style="font-size: 1.25rem; color: var(--caravan-blue); margin-bottom: 0.5rem;">Transaction Details</h3>
                        </div>
                        <div class="details-content">
                            <div class="details-section">
                                <h4>Transaction Information</h4>
                                <div class="detail-item">
                                    <span class="detail-label">TxID:</span>
                                    <span class="detail-value code">${nodeId}</span>
                                </div>
                                <div class="detail-item">
                                    <span class="detail-label">Status:</span>
                                    <span class="detail-value">
                                        ${
                                          nodeId.startsWith("tx_")
                                            ? `<span style="color: var(--success-color);"><i class="fas fa-check-circle"></i> Confirmed</span>`
                                            : `<span style="color: var(--warning-color);"><i class="fas fa-clock"></i> Pending</span>`
                                        }
                                    </span>
                                </div>
                                <div class="detail-item">
                                    <span class="detail-label">Simulation Data:</span>
                                    <span class="detail-value">
                                        This is a simulated transaction in the network view.
                                    </span>
                                </div>
                            </div>
                        </div>
                    `;

          document.getElementById("closeDetailsBtn").style.display = "block";
        }
      } else if (nodeId === "mempool") {
        // Show mempool details
        const detailsElement = document.getElementById("transactionDetails");
        if (detailsElement) {
          detailsElement.innerHTML = `
                        <div class="details-header">
                            <h3 style="font-size: 1.25rem; color: var(--caravan-yellow); margin-bottom: 0.5rem;">Mempool Information</h3>
                        </div>
                        <div class="details-content">
                            <div class="details-section">
                                <h4>Overview</h4>
                                <div class="detail-item">
                                    <span class="detail-label">Transactions:</span>
                                    <span class="detail-value">${blockchainData.mempool?.txCount || 0}</span>
                                </div>
                                <div class="detail-item">
                                    <span class="detail-label">Size:</span>
                                    <span class="detail-value">${(blockchainData.mempool?.size / 1024).toFixed(2) || 0} KB</span>
                                </div>
                                <div class="detail-item">
                                    <span class="detail-label">Fees:</span>
                                    <span class="detail-value">${blockchainData.mempool?.fees?.toFixed(8) || 0} BTC</span>
                                </div>
                            </div>
                        </div>
                    `;

          document.getElementById("closeDetailsBtn").style.display = "block";
        }
      } else {
        // Must be a block node - find the block and show details
        const block = blockchainData.blocks.find((b) => b.hash === nodeId);
        if (block) {
          fetchBlockDetails(block.hash);
        }
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
  if (!transactionNetwork) return;

  const options = transactionNetwork.getOptions();

  switch (viewType) {
    case "hierarchical":
      options.layout.hierarchical.enabled = true;
      options.layout.hierarchical.direction = "UD";
      options.layout.hierarchical.sortMethod = "directed";
      options.layout.hierarchical.nodeSpacing = 150;
      options.layout.hierarchical.levelSeparation = 150;
      break;
    case "force":
      options.layout.hierarchical.enabled = false;
      options.physics.enabled = true;
      options.physics.barnesHut.gravitationalConstant = -3000;
      options.physics.barnesHut.centralGravity = 0.5;
      options.physics.barnesHut.springLength = 120;
      break;
    default:
      options.layout.hierarchical.enabled = false;
      options.physics.enabled = true;
      options.physics.barnesHut = {
        gravitationalConstant: -2000,
        centralGravity: 0.3,
        springLength: 95,
        springConstant: 0.04,
        damping: 0.09,
      };
      break;
  }

  transactionNetwork.setOptions(options);
}

// Display blocks
function displayBlocks() {
  const blocksContainer = document.getElementById("blocksContainer");
  if (!blocksContainer) return;

  if (!blockchainData.blocks || blockchainData.blocks.length === 0) {
    blocksContainer.innerHTML =
      '<p class="empty-message"><i class="fas fa-cube"></i> No blocks found</p>';
    return;
  }

  let html = "";

  blockchainData.blocks.slice(0, 10).forEach((block) => {
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
                    <div><i class="fas fa-exchange-alt"></i> ${block.txCount || 0}</div>
                </div>
            </div>
        `;
  });

  blocksContainer.innerHTML = html;

  // Add click listeners to blocks
  document.querySelectorAll(".block").forEach((block) => {
    block.addEventListener("click", () => {
      playSound("click");
      const hash = block.dataset.hash;
      fetchBlockDetails(hash);
    });
  });
}

// Display mempool transactions
function displayMempool() {
  const mempoolContainer = document.getElementById("mempoolContainer");
  if (!mempoolContainer) return;

  if (
    !blockchainData.mempool?.txids ||
    blockchainData.mempool.txids.length === 0
  ) {
    mempoolContainer.innerHTML =
      '<p class="empty-message"><i class="fas fa-exchange-alt"></i> No transactions in mempool</p>';
    return;
  }

  // Get sort preference
  const sortSelect = document.getElementById("mempoolSortSelect");
  const sortBy = sortSelect ? sortSelect.value : "time";

  // Clone and sort the array
  let txids = [...blockchainData.mempool.txids];

  // In a real app, we would have more transaction data to sort by fee rate, size, etc.
  // For this demo, we'll just use the txid as a proxy
  if (sortBy === "feeRate") {
    txids.sort((a, b) => {
      // Mock fee rate based on txid
      const feeA = parseInt(a.substring(0, 8), 16) % 100;
      const feeB = parseInt(b.substring(0, 8), 16) % 100;
      return feeB - feeA; // Higher fee first
    });
  } else if (sortBy === "size") {
    txids.sort((a, b) => {
      // Mock size based on txid
      const sizeA = parseInt(a.substring(0, 8), 16) % 1000;
      const sizeB = parseInt(b.substring(0, 8), 16) % 1000;
      return sizeB - sizeA; // Larger size first
    });
  }
  // Default is already by time (order in the array)

  let html = "";

  txids.slice(0, 10).forEach((txid) => {
    // Mock fee rate based on txid
    const feeRate = (parseInt(txid.substring(0, 8), 16) % 100) / 10;

    html += `
            <div class="transaction" data-txid="${txid}">
                <div class="txid">${txid.substring(0, 16)}...</div>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="color: var(--text-secondary); font-size: 0.8rem;">${feeRate.toFixed(1)} sat/vB</span>
                    <button class="action-button secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">
                        <i class="fas fa-info-circle"></i>
                    </button>
                </div>
            </div>
        `;
  });

  if (blockchainData.mempool.txids.length > 10) {
    html += `<p class="more-info">And ${blockchainData.mempool.txids.length - 10} more transactions...</p>`;
  }

  mempoolContainer.innerHTML = html;

  // Add click listeners to transactions
  document.querySelectorAll(".transaction").forEach((tx) => {
    tx.addEventListener("click", () => {
      playSound("click");
      const txid = tx.dataset.txid;
      fetchTransactionDetails(txid);
    });
  });
}

// Fetch block details
function fetchBlockDetails(hash) {
  const detailsElement = document.getElementById("transactionDetails");
  if (!detailsElement) return;

  detailsElement.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <span>Loading block details...</span>
        </div>
    `;

  document.getElementById("closeDetailsBtn").style.display = "block";

  fetch(`/api/block/${hash}`)
    .then((response) => response.json())
    .then((block) => {
      displayBlockDetails(block);
    })
    .catch((error) => {
      console.error("Error fetching block details:", error);
      detailsElement.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle" style="color: var(--error-color); font-size: 2rem; margin-bottom: 1rem;"></i>
                    <p>Error loading block details. Please try again.</p>
                </div>
            `;
      playSound("error");
    });
}

// Fetch transaction details
function fetchTransactionDetails(txid) {
  const detailsElement = document.getElementById("transactionDetails");
  if (!detailsElement) return;

  detailsElement.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <span>Loading transaction details...</span>
        </div>
    `;

  document.getElementById("closeDetailsBtn").style.display = "block";

  fetch(`/api/tx/${txid}`)
    .then((response) => response.json())
    .then((tx) => {
      displayTransactionDetails(tx);
    })
    .catch((error) => {
      console.error("Error fetching transaction details:", error);
      detailsElement.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle" style="color: var(--error-color); font-size: 2rem; margin-bottom: 1rem;"></i>
                    <p>Error loading transaction details. Please try again.</p>
                </div>
            `;
      playSound("error");
    });
}

// Display block details
function displayBlockDetails(block) {
  const detailsElement = document.getElementById("transactionDetails");
  if (!detailsElement) return;

  const time = new Date(block.time * 1000).toLocaleString();

  let html = `
        <div class="details-header">
            <h3 style="color: var(--caravan-blue);">Block #${block.height}</h3>
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
                        <button class="view-tx-btn action-button secondary" data-txid="${txid}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; margin-left: 0.5rem;">
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

  // Add event listeners to transaction view buttons
  document.querySelectorAll(".view-tx-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      playSound("click");
      const txid = btn.dataset.txid;
      fetchTransactionDetails(txid);
    });
  });
}

// Display transaction details
function displayTransactionDetails(tx) {
  const detailsElement = document.getElementById("transactionDetails");
  if (!detailsElement) return;

  // Calculate total input and output values
  let totalInput = 0;
  let totalOutput = 0;

  if (tx.vin) {
    tx.vin.forEach((input) => {
      if (input.value) totalInput += input.value;
    });
  }

  if (tx.vout) {
    tx.vout.forEach((output) => {
      if (output.value) totalOutput += output.value;
    });
  }

  const fee = totalInput - totalOutput;

  let html = `
        <div class="details-header">
            <h3 style="color: var(--caravan-yellow);">Transaction Details</h3>
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
                            ? `<span style="color: var(--success-color);"><i class="fas fa-check-circle"></i> Confirmed (${tx.confirmations} confirmations)</span>`
                            : '<span style="color: var(--warning-color);"><i class="fas fa-clock"></i> Unconfirmed</span>'
                        }
                    </span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Fee:</span>
                    <span class="detail-value">${fee > 0 ? fee.toFixed(8) + " BTC" : "N/A"}</span>
                </div>
            </div>
    `;

  if (tx.vin && tx.vin.length > 0) {
    html += `
            <div class="details-section">
                <h4>Inputs (${tx.vin.length})</h4>
                <div style="max-height: 200px; overflow-y: auto;">
        `;

    tx.vin.forEach((input, index) => {
      if (input.coinbase) {
        html += `
                    <div class="detail-item" style="padding: 0.5rem 0;">
                        <span class="detail-label">Coinbase:</span>
                        <span class="detail-value" style="color: var(--success-color);">
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
        `;
  }

  if (tx.vout && tx.vout.length > 0) {
    html += `
            <div class="details-section">
                <h4>Outputs (${tx.vout.length})</h4>
                <div style="max-height: 200px; overflow-y: auto;">
        `;

    tx.vout.forEach((output, index) => {
      const address =
        output.scriptPubKey &&
        (output.scriptPubKey.address ||
          (output.scriptPubKey.addresses
            ? output.scriptPubKey.addresses[0]
            : "No address"));

      html += `
                <div class="detail-item" style="padding: 0.5rem 0;">
                    <span class="detail-label">${index + 1}.</span>
                    <span class="detail-value">
                        <div style="display: flex; justify-content: space-between; width: 100%;">
                            <span>${output.scriptPubKey?.type || "Unknown"}</span>
                            <span style="font-weight: 600;">${output.value} BTC</span>
                        </div>
                        <div style="font-size: 0.8rem; margin-top: 0.25rem;" class="code">
                            ${address || "Unknown Address"}
                        </div>
                    </span>
                </div>
            `;
    });

    html += `
                </div>
            </div>
        `;
  }

  html += "</div>";

  detailsElement.innerHTML = html;
}

// Hide transaction details
function hideTransactionDetails() {
  const detailsElement = document.getElementById("transactionDetails");
  if (!detailsElement) return;

  const closeButton = document.getElementById("closeDetailsBtn");
  if (closeButton) {
    closeButton.style.display = "none";
  }

  detailsElement.innerHTML = `
        <p class="empty-details">
            <i class="fas fa-hand-pointer"></i>
            Select a transaction or block to view details
        </p>
    `;
}

// Show mining information
function showMiningInfo(info) {
  const detailsElement = document.getElementById("transactionDetails");
  if (!detailsElement) return;

  const closeButton = document.getElementById("closeDetailsBtn");
  if (closeButton) {
    closeButton.style.display = "block";
  }

  let html = `
        <div class="details-header">
            <h3 style="color: var(--caravan-blue);">
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
                    <span class="detail-value">${blockchainData.chainInfo?.difficulty || "N/A"}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Current Block Height:</span>
                    <span class="detail-value">${blockchainData.chainInfo?.blocks || "N/A"}</span>
                </div>
            </div>

            <div class="details-section">
                <h4>Mining Controls</h4>
                <p style="margin-bottom: 1rem; color: var(--text-secondary);">In regtest mode, you can generate blocks instantly:</p>
                <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                    <button id="mine1BlockBtn" class="action-button">
                        <i class="fas fa-plus-circle"></i> Mine 1 Block
                    </button>
                    <button id="mine6BlocksBtn" class="action-button">
                        <i class="fas fa-cubes"></i> Mine 6 Blocks
                    </button>
                    <button id="clearMempoolBtn" class="action-button">
                        <i class="fas fa-broom"></i> Clear Mempool
                    </button>
                </div>
            </div>

            <div class="details-section">
                <h4>Mining Tips</h4>
                <ul style="list-style-type: disc; padding-left: 1.5rem; color: var(--text-secondary);">
                    <li>Mine a block to confirm transactions in the mempool</li>
                    <li>Generate 6 blocks to make transactions fully confirmed</li>
                    <li>In regtest, mining is instantaneous with no real proof-of-work</li>
                    <li>The block reward goes to the address you specify</li>
                </ul>
            </div>
        </div>
    `;

  detailsElement.innerHTML = html;

  // Add event listeners to mining control buttons
  document.getElementById("mine1BlockBtn").addEventListener("click", () => {
    playSound("click");
    triggerMineBlock();
  });

  document.getElementById("mine6BlocksBtn").addEventListener("click", () => {
    playSound("click");

    // Mine 6 blocks in sequence
    const mineButton = document.getElementById("mine6BlocksBtn");
    mineButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mining...';
    mineButton.disabled = true;

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
        mineButton.disabled = false;
        playSound("block-mined");
      })
      .catch((error) => {
        console.error("Error mining blocks:", error);
        mineButton.innerHTML = '<i class="fas fa-cubes"></i> Mine 6 Blocks';
        mineButton.disabled = false;
        addMiningLog(`Error mining blocks: ${error.message}`);
        playSound("error");
      });
  });

  document.getElementById("clearMempoolBtn").addEventListener("click", () => {
    playSound("click");

    const clearButton = document.getElementById("clearMempoolBtn");
    clearButton.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Clearing...';
    clearButton.disabled = true;

    // This would require a backend endpoint to clear the mempool
    // For the demo, we'll just simulate it with a fetch call
    setTimeout(() => {
      addMiningLog("Mempool cleared");
      clearButton.innerHTML = '<i class="fas fa-broom"></i> Clear Mempool';
      clearButton.disabled = false;

      // Clear mempool data
      if (blockchainData.mempool) {
        blockchainData.mempool.txids = [];
        blockchainData.mempool.txCount = 0;
      }

      // Update UI
      displayMempool();
      updateDashboard();
    }, 1000);
  });
}

// Update dashboard with latest blockchain data
function updateDashboard() {
  const blockCount = document.getElementById("blockCount");
  if (blockCount) {
    blockCount.textContent = blockchainData.chainInfo?.blocks || 0;
  }

  const txCount = document.getElementById("txCount");
  if (txCount) {
    txCount.textContent = blockchainData.stats?.totalTxCount || 0;
  }

  const difficulty = document.getElementById("difficulty");
  if (difficulty) {
    difficulty.textContent =
      blockchainData.chainInfo?.difficulty?.toFixed(2) || 0;
  }

  const mempoolSize = document.getElementById("mempoolSize");
  if (mempoolSize) {
    mempoolSize.textContent = blockchainData.mempool?.txCount || 0;
  }
}

// Add a new block to the UI
function addNewBlock(block) {
  // Add to blockchain data
  blockchainData.blocks.unshift(block);
  blockchainData.chainInfo.blocks = (blockchainData.chainInfo?.blocks || 0) + 1;

  // Increment total transaction count
  if (blockchainData.stats) {
    blockchainData.stats.totalTxCount =
      (blockchainData.stats.totalTxCount || 0) + (block.txCount || 0);
  }

  // Update visualizations
  updateVisualizations();
  updateDashboard();

  // Create a temporary element for animation
  const blocksContainer = document.getElementById("blocksContainer");
  if (!blocksContainer) return;

  const tempBlock = document.createElement("div");
  tempBlock.className = "block new-block";
  tempBlock.dataset.hash = block.hash;

  const time = new Date(block.time * 1000).toLocaleString();
  tempBlock.innerHTML = `
        <div class="block-header">
            <div class="block-height">#${block.height}</div>
            <div>${time}</div>
        </div>
        <div class="block-details">
            <div><i class="fas fa-fingerprint"></i> ${block.hash.substring(0, 10)}...</div>
            <div><i class="fas fa-file-alt"></i> ${(block.size / 1024).toFixed(2)} KB</div>
            <div><i class="fas fa-exchange-alt"></i> ${block.txCount || 0}</div>
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
  if (blocks.length > 10) {
    blocks[blocks.length - 1].remove();
  }

  // Add click listener
  tempBlock.addEventListener("click", () => {
    playSound("click");
    const hash = tempBlock.dataset.hash;
    fetchBlockDetails(hash);
  });

  // Update mempool (clear confirmed transactions)
  if (
    blockchainData.mempool &&
    blockchainData.mempool.txids &&
    blockchainData.mempool.txids.length > 0
  ) {
    // In a real app, we would check which transactions are included in the block
    // For this demo, we'll just clear a random subset of mempool transactions
    const toRemove = Math.min(
      block.txCount || 0,
      blockchainData.mempool.txids.length,
    );
    if (toRemove > 0) {
      blockchainData.mempool.txids =
        blockchainData.mempool.txids.slice(toRemove);
      blockchainData.mempool.txCount = blockchainData.mempool.txids.length;
      displayMempool();
    }
  }
}

// Add a new transaction to the UI
function addNewTransaction(tx) {
  // Add to mempool data
  if (!blockchainData.mempool) blockchainData.mempool = { txids: [] };
  if (!blockchainData.mempool.txids) blockchainData.mempool.txids = [];

  // Add to the beginning of the array
  blockchainData.mempool.txids.unshift(tx.txid);
  blockchainData.mempool.txCount = blockchainData.mempool.txids.length;

  // Update mempool visualization
  updateMempoolVisualization();
  updateDashboard();

  // Create a temporary element for animation
  const mempoolContainer = document.getElementById("mempoolContainer");
  if (!mempoolContainer) return;

  // Check if the container shows "No transactions"
  if (mempoolContainer.querySelector(".empty-message")) {
    mempoolContainer.innerHTML = "";
  }

  // Mock fee rate based on txid
  const feeRate = (parseInt(tx.txid.substring(0, 8), 16) % 100) / 10;

  const tempTx = document.createElement("div");
  tempTx.className = "transaction new-transaction";
  tempTx.dataset.txid = tx.txid;
  tempTx.innerHTML = `
        <div class="txid">${tx.txid.substring(0, 16)}...</div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="color: var(--text-secondary); font-size: 0.8rem;">${feeRate.toFixed(1)} sat/vB</span>
            <button class="action-button secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">
                <i class="fas fa-info-circle"></i>
            </button>
        </div>
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
    let moreText = mempoolContainer.querySelector(".more-info");
    if (!moreText) {
      moreText = document.createElement("p");
      moreText.className = "more-info";
      mempoolContainer.appendChild(moreText);
    }
    moreText.textContent = `And ${txCount - 10} more transactions...`;
  }

  // Add click listener
  tempTx.addEventListener("click", () => {
    playSound("click");
    const txid = tempTx.dataset.txid;
    fetchTransactionDetails(txid);
  });
}

// Trigger mining a new block
function triggerMineBlock() {
  playSound("click");

  // Show mining button as active
  const mineButton = document.getElementById("mineBlockBtn");
  if (mineButton) {
    mineButton.classList.add("mining-active");
    mineButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mining...';
    mineButton.disabled = true;
  }

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
      addMiningLog(`Mining block request sent. Waiting for confirmation...`);

      // Reset button after a delay
      setTimeout(() => {
        if (mineButton) {
          mineButton.classList.remove("mining-active");
          mineButton.innerHTML = '<i class="fas fa-hammer"></i> Mine Block';
          mineButton.disabled = false;
        }
      }, 2000);
    })
    .catch((error) => {
      console.error("Error mining block:", error);

      // Reset button and show error
      if (mineButton) {
        mineButton.classList.remove("mining-active");
        mineButton.innerHTML = '<i class="fas fa-hammer"></i> Mine Block';
        mineButton.disabled = false;
      }

      addMiningLog(`Error mining block: ${error.message}`);
      playSound("error");
    });
}

// Trigger creating a new transaction
function triggerCreateTransaction() {
  playSound("click");

  // Show creation button as active
  const createButton = document.getElementById("createTxBtn");
  if (createButton) {
    createButton.classList.add("mining-active");
    createButton.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Creating...';
    createButton.disabled = true;
  }

  // Show a modal dialog for transaction creation
  const txModal = document.createElement("div");
  txModal.className = "modal";
  txModal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Create Transaction</h3>
                <button class="close-btn">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="fromWallet">From Wallet:</label>
                    <select id="fromWallet">
                        <option value="wallet1">wallet1</option>
                        <option value="wallet2">wallet2</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="toAddress">To Address:</label>
                    <input type="text" id="toAddress" value="mxDuAYQUaT3ytdR5E7QKnKLPXXhhqPKTdZ">
                </div>
                <div class="form-group">
                    <label for="amount">Amount (BTC):</label>
                    <input type="number" id="amount" value="0.001" min="0.00001" step="0.00001">
                </div>
            </div>
            <div class="modal-footer">
                <button id="createTxSubmitBtn" class="action-button">Create Transaction</button>
                <button id="cancelTxBtn" class="action-button secondary">Cancel</button>
            </div>
        </div>
    `;
  document.body.appendChild(txModal);

  // Add event listeners
  txModal.querySelector(".close-btn").addEventListener("click", () => {
    document.body.removeChild(txModal);
    if (createButton) {
      createButton.classList.remove("mining-active");
      createButton.innerHTML =
        '<i class="fas fa-plus-circle"></i> Create Transaction';
      createButton.disabled = false;
    }
  });

  txModal.querySelector("#cancelTxBtn").addEventListener("click", () => {
    document.body.removeChild(txModal);
    if (createButton) {
      createButton.classList.remove("mining-active");
      createButton.innerHTML =
        '<i class="fas fa-plus-circle"></i> Create Transaction';
      createButton.disabled = false;
    }
  });

  txModal.querySelector("#createTxSubmitBtn").addEventListener("click", () => {
    const fromWallet = document.getElementById("fromWallet").value;
    const toAddress = document.getElementById("toAddress").value;
    const amount = parseFloat(document.getElementById("amount").value);

    // Submit the transaction
    fetch("/api/create-transaction", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fromWallet,
        toAddress,
        amount,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        console.log("Create transaction result:", data);
        addMiningLog(
          `Transaction created with ID: ${data.txid ? data.txid.substring(0, 8) + "..." : "unknown"}`,
        );

        // Close modal
        document.body.removeChild(txModal);

        // Reset button
        if (createButton) {
          createButton.classList.remove("mining-active");
          createButton.innerHTML =
            '<i class="fas fa-plus-circle"></i> Create Transaction';
          createButton.disabled = false;
        }
      })
      .catch((error) => {
        console.error("Error creating transaction:", error);

        // Show error in modal
        const modalBody = txModal.querySelector(".modal-body");
        const errorMsg = document.createElement("div");
        errorMsg.className = "error-message";
        errorMsg.innerHTML = `<p style="color: var(--error-color);">Error: ${error.message}</p>`;
        modalBody.appendChild(errorMsg);

        // Reset button
        if (createButton) {
          createButton.classList.remove("mining-active");
          createButton.innerHTML =
            '<i class="fas fa-plus-circle"></i> Create Transaction';
          createButton.disabled = false;
        }

        playSound("error");
      });
  });

  // Style the modal
  const style = document.createElement("style");
  style.textContent = `
        .modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }

        .modal-content {
            background-color: var(--card-bg);
            border-radius: 0.75rem;
            width: 450px;
            max-width: 90%;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
            border: 1px solid var(--border-color);
        }

        .modal-header {
            padding: 1rem 1.5rem;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .modal-header h3 {
            margin: 0;
            color: var(--caravan-blue);
        }

        .modal-body {
            padding: 1.5rem;
        }

        .modal-footer {
            padding: 1rem 1.5rem;
            border-top: 1px solid var(--border-color);
            display: flex;
            justify-content: flex-end;
            gap: 0.75rem;
        }

        .form-group {
            margin-bottom: 1rem;
        }

        .form-group label {
            display: block;
            margin-bottom: 0.5rem;
            color: var(--text-color);
        }

        .form-group input, .form-group select {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid var(--border-color);
            border-radius: 0.375rem;
            background-color: var(--highlight-bg);
            color: var(--text-color);
            font-family: 'Roboto Mono', monospace;
            font-size: 0.875rem;
        }

        .error-message {
            margin-top: 1rem;
            padding: 0.75rem;
            background-color: rgba(239, 68, 68, 0.1);
            border-radius: 0.375rem;
            border-left: 3px solid var(--error-color);
        }
    `;
  document.head.appendChild(style);
}

// Show/hide mining activity panel
function showMiningActivity(show = true) {
  const miningActivity = document.getElementById("miningActivity");
  if (!miningActivity) return;

  miningActivity.style.display = show ? "block" : "none";

  if (show) {
    const miningLogs = document.getElementById("miningLogs");
    if (miningLogs) {
      miningLogs.innerHTML = "";
    }
  }
}

// Add a log to the mining activity panel
function addMiningLog(message) {
  const logsContainer = document.getElementById("miningLogs");
  if (!logsContainer) return;

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

  body.classList.toggle("light-theme");

  const isLightTheme = body.classList.contains("light-theme");
  localStorage.setItem("theme", isLightTheme ? "light" : "dark");

  themeIcon.className = isLightTheme ? "fas fa-sun" : "fas fa-moon";

  // Update chart colors
  if (blockchainChart) updateBlockchainVisualization();
  if (mempoolChart) updateMempoolVisualization();
  if (transactionNetwork) updateNetworkVisualization();

  playSound("click");
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
