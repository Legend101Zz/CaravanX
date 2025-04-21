/**
 * BlockchainWorld - Extends the VoxelEngine with a more immersive blockchain world
 */
class BlockchainWorld {
  constructor(container) {
    console.log("it works");
    // Initialize the base voxel engine
    this.engine = new VoxelEngine(container);

    // Initialize enhanced systems
    this.mempoolSystem = new MempoolSystem(this.engine);
    this.blockchainTower = new BlockchainTower(this.engine);
    this.minerSystem = new MinerSystem(this.engine);
    this.npcSystem = new NPCSystem(this.engine);
    this.simulationSystem = new SimulationSystem(this.engine);

    // World settings
    this.worldSettings = {
      centerX: 0,
      centerZ: 0,
      mempoolRadius: 30,
      towerDistance: 50,
      minerHouseCount: 5,
      minerHouseRadius: 70,
    };

    // Player settings
    this.playerInventory = {
      bitcoin: 0,
      computingPower: 10,
      tools: {
        pickaxe: { level: 1, durability: 100 },
        verifier: { level: 1, durability: 100 },
        signKey: { level: 1, durability: 100 },
      },
    };

    // Initialize UI elements
    this.initializeUI();

    // Connect to blockchain data service
    this.connectToBlockchainService();

    // Generate the world
    this.generateWorld();
  }

  /**
   * Initialize specialized UI elements for the enhanced world
   */
  initializeUI() {
    // Create mempool status panel
    this.mempoolStatusUI = document.createElement("div");
    this.mempoolStatusUI.className = "mempool-status-ui";
    this.mempoolStatusUI.innerHTML = `
      <h3>Mempool Status</h3>
      <div class="mempool-stats">
        <div>Transactions: <span id="mempool-tx-count">0</span></div>
        <div>Avg Fee Rate: <span id="mempool-avg-fee-rate">0</span> sat/vB</div>
        <div>Size: <span id="mempool-size">0</span> KB</div>
      </div>
      <div class="fee-rate-tiers">
        <div class="tier high-priority">High: <span id="high-fee-rate">0</span> sat/vB</div>
        <div class="tier medium-priority">Medium: <span id="medium-fee-rate">0</span> sat/vB</div>
        <div class="tier low-priority">Low: <span id="low-fee-rate">0</span> sat/vB</div>
      </div>
    `;
    document.body.appendChild(this.mempoolStatusUI);

    // Create blockchain tower status
    this.blockchainStatusUI = document.createElement("div");
    this.blockchainStatusUI.className = "blockchain-status-ui";
    this.blockchainStatusUI.innerHTML = `
      <h3>Blockchain Tower</h3>
      <div class="blockchain-stats">
        <div>Height: <span id="blockchain-height">0</span> blocks</div>
        <div>Latest Hash: <span id="latest-hash">0000...</span></div>
        <div>Difficulty: <span id="blockchain-difficulty">0</span></div>
      </div>
    `;
    document.body.appendChild(this.blockchainStatusUI);

    // Create mining control UI
    this.miningControlUI = document.createElement("div");
    this.miningControlUI.className = "mining-control-ui";
    this.miningControlUI.innerHTML = `
      <h3>Mining Controls</h3>
      <div class="mining-controls">
        <button id="start-mining-btn">Start Mining</button>
        <button id="create-transaction-btn">Create Transaction</button>
        <div class="mining-power">
          <label>Mining Power: <span id="mining-power-value">10</span></label>
          <input type="range" id="mining-power-slider" min="1" max="100" value="10">
        </div>
      </div>
    `;
    document.body.appendChild(this.miningControlUI);

    // Add event listeners for UI controls
    this.setupUIEventListeners();
  }

  /**
   * Set up event listeners for UI controls
   */
  setupUIEventListeners() {
    // Mining button
    document
      .getElementById("start-mining-btn")
      .addEventListener("click", () => {
        this.simulationSystem.startMining(this.playerInventory.computingPower);
      });

    // Create transaction button
    document
      .getElementById("create-transaction-btn")
      .addEventListener("click", () => {
        this.openCreateTransactionDialog();
      });

    // Mining power slider
    document
      .getElementById("mining-power-slider")
      .addEventListener("input", (e) => {
        const power = parseInt(e.target.value);
        this.playerInventory.computingPower = power;
        document.getElementById("mining-power-value").textContent = power;
      });
  }

  /**
   * Connect to the blockchain data service
   */
  connectToBlockchainService() {
    // Setup socket connection
    this.socket = io();

    // Handle blockchain updates
    this.socket.on("blockchain_update", (data) => {
      this.updateWorldFromBlockchainData(data);
    });

    // Handle new blocks
    this.socket.on("new_block", (block) => {
      this.blockchainTower.addNewBlock(block);
      this.updateBlockchainStatus();

      // Show celebration effects
      this.showBlockMinedEffects(block);
    });

    // Handle new transactions
    this.socket.on("new_transaction", (tx) => {
      this.mempoolSystem.addTransaction(tx);
      this.updateMempoolStatus();
    });
  }

  /**
   * Generate the enhanced blockchain world
   */
  generateWorld() {
    // Clear existing world
    this.engine.clearWorld();

    // Setup basic environment (sky, ground, lighting)
    this.setupEnvironment();

    // Create central mempool
    this.createMempool();

    // Create blockchain tower
    this.createBlockchainTower();

    // Create miner houses
    this.createMinerHouses();

    // Add NPCs
    this.populateWorldWithNPCs();

    // Create player spawn point
    this.createPlayerSpawnPoint();

    // Fetch initial blockchain data
    this.fetchInitialBlockchainData();
  }

  /**
   * Setup the environment (sky, ground, lighting)
   */
  setupEnvironment() {
    // Create sky dome with day/night cycle
    this.engine.createSkyDome();

    // Create stylized terrain with hills and valleys
    this.createTerrain();

    // Add dynamic lighting
    this.engine.setupEnhancedLighting();

    // Add ambient sounds
    this.engine.setupAmbientSounds();

    // Add weather effects
    this.engine.setupWeatherEffects();
  }

  /**
   * Create stylized terrain for the world
   */
  createTerrain() {
    // Create a large flat area for the central hub
    this.engine.createFlatArea(
      this.worldSettings.centerX,
      this.worldSettings.centerZ,
      100,
    );

    // Create hills around the perimeter
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const distance = 120;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;

      this.engine.createHill(
        x,
        z,
        20 + Math.random() * 20,
        30 + Math.random() * 20,
      );
    }

    // Create paths connecting landmarks
    this.createPaths();
  }

  /**
   * Create paths connecting the main landmarks
   */
  createPaths() {
    // Path from spawn to mempool
    this.engine.createPath(
      this.worldSettings.centerX + 10,
      this.worldSettings.centerZ + 10,
      this.worldSettings.centerX,
      this.worldSettings.centerZ,
      3, // width
      "stone_path",
    );

    // Path from mempool to blockchain tower
    this.engine.createPath(
      this.worldSettings.centerX,
      this.worldSettings.centerZ,
      this.worldSettings.centerX + this.worldSettings.towerDistance,
      this.worldSettings.centerZ,
      5, // width
      "gold_path",
    );

    // Paths to each miner house
    for (let i = 0; i < this.worldSettings.minerHouseCount; i++) {
      const angle = (i / this.worldSettings.minerHouseCount) * Math.PI * 2;
      const x = Math.cos(angle) * this.worldSettings.minerHouseRadius;
      const z = Math.sin(angle) * this.worldSettings.minerHouseRadius;

      this.engine.createPath(
        this.worldSettings.centerX,
        this.worldSettings.centerZ,
        x,
        z,
        2, // width
        "stone_path",
      );
    }
  }

  /**
   * Create the central mempool area
   */
  createMempool() {
    // Create a circular pool structure
    this.mempoolSystem.createMempoolStructure(
      this.worldSettings.centerX,
      0, // y position at ground level
      this.worldSettings.centerZ,
      this.worldSettings.mempoolRadius,
    );

    // Create transaction sorting areas (fee rate tiers)
    this.mempoolSystem.createFeeTiers();

    // Add decorative elements
    this.mempoolSystem.addDecorativeElements();

    // Add the initial transactions (will be populated with real data later)
    this.mempoolSystem.createPlaceholderTransactions();
  }

  /**
   * Create the blockchain tower
   */
  createBlockchainTower() {
    // Position the tower a distance away from the mempool
    const towerX =
      this.worldSettings.centerX + this.worldSettings.towerDistance;
    const towerZ = this.worldSettings.centerZ;

    // Create the tower foundation
    this.blockchainTower.createTowerBase(towerX, 0, towerZ);

    // Create the initial tower structure (will grow with new blocks)
    this.blockchainTower.initializeTowerStructure();

    // Add decorative elements
    this.blockchainTower.addDecorativeElements();

    // Create placeholders for the initial blocks (will be populated with real data)
    this.blockchainTower.createPlaceholderBlocks();
  }

  /**
   * Create miner houses around the mempool
   */
  createMinerHouses() {
    // Create houses in a circle around the mempool
    for (let i = 0; i < this.worldSettings.minerHouseCount; i++) {
      const angle = (i / this.worldSettings.minerHouseCount) * Math.PI * 2;
      const x =
        this.worldSettings.centerX +
        Math.cos(angle) * this.worldSettings.minerHouseRadius;
      const z =
        this.worldSettings.centerZ +
        Math.sin(angle) * this.worldSettings.minerHouseRadius;

      // Each miner has different characteristics
      const minerType = this.getMinerTypeForIndex(i);
      const minerName = this.getMinerNameForIndex(i);
      const minerPower = 10 + i * 5; // Different mining powers

      // Create the miner house
      this.minerSystem.createMinerHouse(
        x,
        0,
        z,
        minerType,
        minerName,
        minerPower,
      );
    }
  }

  /**
   * Get miner type based on index
   */
  getMinerTypeForIndex(index) {
    const types = ["small", "medium", "large", "pool", "industrial"];
    return types[index % types.length];
  }

  /**
   * Get miner name based on index
   */
  getMinerNameForIndex(index) {
    const names = [
      "BitDigger",
      "BlockForge",
      "HashPower",
      "ChainMaster",
      "CryptoMine",
    ];
    return names[index % names.length];
  }

  /**
   * Populate the world with NPCs
   */
  populateWorldWithNPCs() {
    // Add miners NPCs
    this.addMinerNPCs();

    // Add trader NPCs
    this.addTraderNPCs();

    // Add node operator NPCs
    this.addNodeOperatorNPCs();

    // Add user NPCs
    this.addUserNPCs();
  }

  /**
   * Add miner NPCs to the world
   */
  addMinerNPCs() {
    // Place NPCs at each miner house
    for (let i = 0; i < this.worldSettings.minerHouseCount; i++) {
      const house = this.minerSystem.minerHouses[i];
      if (!house) continue;

      // Create miner NPC
      const npc = this.npcSystem.createMinerNPC(
        house.position.x + 3, // Offset from house
        1, // y position (standing on ground)
        house.position.z + 2, // Offset from house
        house.minerName,
        house.minerPower,
      );

      // Set NPC behavior to walk between house and mempool
      this.npcSystem.setWalkBetweenPointsBehavior(
        npc,
        [
          new THREE.Vector3(house.position.x + 3, 1, house.position.z + 2), // Near house
          new THREE.Vector3(
            this.worldSettings.centerX + 5,
            1,
            this.worldSettings.centerZ + 5,
          ), // Near mempool
        ],
        5000, // Delay between walks
      );
    }
  }

  /**
   * Add trader NPCs to the world
   */
  addTraderNPCs() {
    // Create traders at the mempool edges
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const x =
        this.worldSettings.centerX +
        Math.cos(angle) * (this.worldSettings.mempoolRadius + 5);
      const z =
        this.worldSettings.centerZ +
        Math.sin(angle) * (this.worldSettings.mempoolRadius + 5);

      // Create trader NPC
      const npc = this.npcSystem.createTraderNPC(
        x,
        1,
        z,
        `Fee Trader ${i + 1}`,
        ["low", "medium", "high"][i % 3], // Different fee strategies
      );

      // Set trading behavior
      this.npcSystem.setTradingBehavior(npc);
    }
  }

  /**
   * Add node operator NPCs
   */
  addNodeOperatorNPCs() {
    // Create node operators near the blockchain tower
    const towerX =
      this.worldSettings.centerX + this.worldSettings.towerDistance;
    const towerZ = this.worldSettings.centerZ;

    for (let i = 0; i < 2; i++) {
      const x = towerX + (i === 0 ? -10 : 10);
      const z = towerZ + 5;

      // Create node operator NPC
      const npc = this.npcSystem.createNodeOperatorNPC(
        x,
        1,
        z,
        `Node Operator ${i + 1}`,
        i === 0 ? "full_node" : "pruned_node",
      );

      // Set verification behavior
      this.npcSystem.setVerificationBehavior(npc);
    }
  }

  /**
   * Add user NPCs that create transactions
   */
  addUserNPCs() {
    // Create users at different locations
    const locations = [
      {
        x: this.worldSettings.centerX + 20,
        z: this.worldSettings.centerZ - 20,
      },
      {
        x: this.worldSettings.centerX - 15,
        z: this.worldSettings.centerZ + 25,
      },
      {
        x: this.worldSettings.centerX - 25,
        z: this.worldSettings.centerZ - 15,
      },
    ];

    for (let i = 0; i < locations.length; i++) {
      // Create user NPC
      const npc = this.npcSystem.createUserNPC(
        locations[i].x,
        1,
        locations[i].z,
        `User ${i + 1}`,
        Math.random() * 0.5 + 0.2, // Random transaction frequency
      );

      // Set transaction creation behavior
      this.npcSystem.setTransactionCreationBehavior(npc);
    }
  }

  /**
   * Create the player spawn point
   */
  createPlayerSpawnPoint() {
    // Create a small platform for the player to spawn on
    const spawnX = this.worldSettings.centerX + 20;
    const spawnZ = this.worldSettings.centerZ + 20;

    // Create a recognizable spawn platform
    this.engine.createSpawnPlatform(spawnX, 0, spawnZ);

    // Set player position
    this.engine.camera.position.set(spawnX, 5, spawnZ);
    this.engine.controls.getObject().position.set(spawnX, 5, spawnZ);
  }

  /**
   * Fetch initial blockchain data
   */
  async fetchInitialBlockchainData() {
    try {
      const response = await fetch("/api/blockchain");
      const data = await response.json();

      // Update the world with the blockchain data
      this.updateWorldFromBlockchainData(data);
    } catch (error) {
      console.error("Error fetching blockchain data:", error);
    }
  }

  /**
   * Update the world based on blockchain data
   */
  updateWorldFromBlockchainData(data) {
    // Update mempool
    if (data.mempool) {
      this.mempoolSystem.updateFromBlockchainData(data.mempool);
      this.updateMempoolStatus();
    }

    // Update blockchain tower
    if (data.blocks) {
      this.blockchainTower.updateFromBlockchainData(data.blocks);
      this.updateBlockchainStatus();
    }

    // Update mining difficulty for miners
    if (data.chainInfo && data.chainInfo.difficulty) {
      this.minerSystem.updateDifficulty(data.chainInfo.difficulty);
    }
  }

  /**
   * Update the mempool status UI
   */
  updateMempoolStatus() {
    const mempoolStats = this.mempoolSystem.getStats();

    document.getElementById("mempool-tx-count").textContent =
      mempoolStats.txCount;
    document.getElementById("mempool-avg-fee-rate").textContent =
      mempoolStats.avgFeeRate.toFixed(2);
    document.getElementById("mempool-size").textContent =
      mempoolStats.size.toFixed(2);

    document.getElementById("high-fee-rate").textContent =
      mempoolStats.highFeeRate.toFixed(2);
    document.getElementById("medium-fee-rate").textContent =
      mempoolStats.mediumFeeRate.toFixed(2);
    document.getElementById("low-fee-rate").textContent =
      mempoolStats.lowFeeRate.toFixed(2);
  }

  /**
   * Update the blockchain status UI
   */
  updateBlockchainStatus() {
    const blockchainStats = this.blockchainTower.getStats();

    document.getElementById("blockchain-height").textContent =
      blockchainStats.height;
    document.getElementById("latest-hash").textContent =
      blockchainStats.latestHash.substring(0, 8) + "...";
    document.getElementById("blockchain-difficulty").textContent =
      blockchainStats.difficulty.toFixed(2);
  }

  /**
   * Show visual effects when a block is mined
   */
  showBlockMinedEffects(block) {
    // Create fireworks effect at the tower
    const towerPosition = this.blockchainTower.getTowerPosition();
    this.engine.createFireworksEffect(
      towerPosition.x,
      towerPosition.y + block.height * 3,
      towerPosition.z,
    );

    // Create celebration text
    this.engine.createFloatingText(
      towerPosition.x,
      towerPosition.y + block.height * 3 + 10,
      towerPosition.z,
      `Block #${block.height} Mined!`,
      0xffaa00,
    );

    // Play celebration sound
    this.engine.playSound("block_mined");
  }

  /**
   * Open dialog to create a new transaction
   */
  openCreateTransactionDialog() {
    // Create and show the transaction dialog
    const dialog = document.createElement("div");
    dialog.className = "transaction-dialog";
    dialog.innerHTML = `
      <div class="dialog-header">
        <h3>Create Transaction</h3>
        <button class="dialog-close-btn">×</button>
      </div>
      <div class="dialog-content">
        <div class="input-group">
          <label for="tx-recipient">Recipient Address:</label>
          <input type="text" id="tx-recipient" value="mxDuAYQUaT3ytdR5E7QKnKLPXXhhqPKTdZ">
        </div>
        <div class="input-group">
          <label for="tx-amount">Amount (BTC):</label>
          <input type="number" id="tx-amount" value="0.001" min="0.00001" step="0.00001">
        </div>
        <div class="input-group">
          <label for="tx-fee-rate">Fee Rate (sat/vB):</label>
          <input type="number" id="tx-fee-rate" value="5" min="1" step="1">
        </div>
        <div class="input-group">
          <label for="tx-type">Transaction Type:</label>
          <select id="tx-type">
            <option value="regular">Regular</option>
            <option value="rbf">Replace-By-Fee (RBF)</option>
            <option value="cpfp">Child-Pays-For-Parent (CPFP)</option>
          </select>
        </div>
      </div>
      <div class="dialog-footer">
        <button id="send-tx-btn" class="primary-btn">Send Transaction</button>
        <button id="cancel-tx-btn" class="secondary-btn">Cancel</button>
      </div>
    `;

    document.body.appendChild(dialog);

    // Add event listeners
    dialog.querySelector(".dialog-close-btn").addEventListener("click", () => {
      document.body.removeChild(dialog);
    });

    dialog.querySelector("#cancel-tx-btn").addEventListener("click", () => {
      document.body.removeChild(dialog);
    });

    dialog.querySelector("#send-tx-btn").addEventListener("click", () => {
      // Get transaction details
      const recipient = document.getElementById("tx-recipient").value;
      const amount = parseFloat(document.getElementById("tx-amount").value);
      const feeRate = parseInt(document.getElementById("tx-fee-rate").value);
      const txType = document.getElementById("tx-type").value;

      // Create transaction
      this.createTransaction(recipient, amount, feeRate, txType);

      // Close dialog
      document.body.removeChild(dialog);
    });
  }

  /**
   * Create a new transaction
   */
  createTransaction(recipient, amount, feeRate, txType) {
    // Create transaction with the specified parameters
    this.socket.emit("create_transaction", {
      fromWallet: "player_wallet",
      toAddress: recipient,
      amount: amount,
      feeRate: feeRate,
      type: txType,
    });

    // Deduct BTC from player's inventory
    this.playerInventory.bitcoin -= amount;

    // Create visual effect of transaction moving to mempool
    const playerPosition = this.engine.controls.getObject().position;

    // Create transaction entity
    const txEntity = this.engine.createTransactionEntity(
      playerPosition.x,
      playerPosition.y - 1,
      playerPosition.z,
      feeRate,
      txType,
    );

    // Animate transaction to mempool
    this.engine.animateEntityToPosition(
      txEntity,
      this.worldSettings.centerX,
      1,
      this.worldSettings.centerZ,
      2000, // Duration in milliseconds
      () => {
        // Add to mempool once animation completes
        this.mempoolSystem.addLocalTransaction({
          txid: this.generateRandomTxid(),
          amount: amount,
          feeRate: feeRate,
          type: txType,
        });
      },
    );
  }

  /**
   * Generate a random transaction ID for local transactions
   */
  generateRandomTxid() {
    return [...Array(64)]
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join("");
  }

  /**
   * Start the simulation
   */
  start() {
    // Start the game loop
    this.engine.startGameLoop();

    // Start NPC behaviors
    this.npcSystem.startBehaviors();

    // Start simulation
    this.simulationSystem.startSimulation();
  }
}

/**
 * MempoolSystem - Manages the mempool visualization
 */
class MempoolSystem {
  constructor(engine) {
    this.engine = engine;
    this.transactions = [];
    this.mempoolEntities = [];
    this.feeTiers = {
      high: { min: 20, color: 0xff5555, height: 2 },
      medium: { min: 5, color: 0xffaa00, height: 1 },
      low: { min: 0, color: 0x55ff55, height: 0 },
    };

    // Mempool stats
    this.stats = {
      txCount: 0,
      avgFeeRate: 0,
      size: 0,
      highFeeRate: 30,
      mediumFeeRate: 10,
      lowFeeRate: 3,
    };
  }

  /**
   * Create the mempool structure
   */
  createMempoolStructure(x, y, z, radius) {
    // Create water pool
    const pool = this.engine.createPool(x, y - 3, z, radius, 0x0088ff);

    // Create outer rim
    const rim = this.engine.createRing(
      x,
      y,
      z,
      radius,
      radius + 2,
      "stone_brick",
    );

    // Create fee tier sections in the pool
    this.createFeeTiers(x, y, z, radius);

    // Create a bridge to cross the mempool
    this.createBridge(x, y, z, radius);

    // Create a sorting mechanism visualized as hoppers above the pool
    this.createTransactionSorter(x, y, z);

    // Add fee rate indicator signs
    this.createFeeRateIndicators(x, y, z, radius);

    // Create vortex effect in the center
    this.engine.createVortexEffect(x, y - 2, z, 5, 0x0088ff);
  }

  /**
   * Create fee tier sections in the pool
   */
  createFeeTiers(x, y, z, radius) {
    // High fee section (inner circle)
    this.engine.createDiskSection(
      x,
      y - 2.5,
      z,
      radius * 0.3,
      this.feeTiers.high.color,
      "high_fee_section",
    );

    // Medium fee section (middle ring)
    this.engine.createRingSection(
      x,
      y - 2.5,
      z,
      radius * 0.3,
      radius * 0.6,
      this.feeTiers.medium.color,
      "medium_fee_section",
    );

    // Low fee section (outer ring)
    this.engine.createRingSection(
      x,
      y - 2.5,
      z,
      radius * 0.6,
      radius * 0.9,
      this.feeTiers.low.color,
      "low_fee_section",
    );
  }

  /**
   * Create a bridge across the mempool
   */
  createBridge(x, y, z, radius) {
    // Create bridge from one side to the other
    this.engine.createBridge(
      x - radius,
      y,
      z,
      x + radius,
      y,
      z,
      3, // width
      "oak_planks",
    );

    // Create bridge support pillars
    this.engine.createPillar(x - radius * 0.5, y - 5, z, y, "oak_log");
    this.engine.createPillar(x, y - 5, z, y, "oak_log");
    this.engine.createPillar(x + radius * 0.5, y - 5, z, y, "oak_log");

    // Create bridge railings
    this.engine.createRailing(
      x - radius,
      y,
      z - 1.5,
      x + radius,
      y,
      z - 1.5,
      1, // height
      "oak_fence",
    );

    this.engine.createRailing(
      x - radius,
      y,
      z + 1.5,
      x + radius,
      y,
      z + 1.5,
      1, // height
      "oak_fence",
    );
  }

  /**
   * Create transaction sorter mechanism
   */
  createTransactionSorter(x, y, z) {
    // Create a hopper-like structure above the pool
    const hopperY = y + 10;

    // Main funnel
    this.engine.createFunnel(x, hopperY, z, 5, 10, "iron_block");

    // Input conveyor belt
    this.engine.createConveyorBelt(
      x - 15,
      hopperY,
      z,
      x - 5,
      hopperY,
      z,
      2, // width
      "conveyor_belt",
    );

    // Sorting arms for different fee tiers
    this.createSortingArm(x, hopperY - 2, z, 0, this.feeTiers.high.color);
    this.createSortingArm(x, hopperY - 4, z, 120, this.feeTiers.medium.color);
    this.createSortingArm(x, hopperY - 6, z, 240, this.feeTiers.low.color);

    // Add animated elements
    this.engine.createAnimatedMechanism(x, hopperY, z);
  }

  /**
   * Create a sorting arm for a fee tier
   */
  createSortingArm(x, y, z, rotation, color) {
    this.engine.createSortingArm(x, y, z, rotation, color);
  }

  /**
   * Create fee rate indicator signs
   */
  createFeeRateIndicators(x, y, z, radius) {
    // High fee sign
    this.engine.createSign(
      x + radius * 0.15,
      y + 1,
      z + radius * 0.15,
      "High Fee Rate",
      "20+ sat/vB",
      this.feeTiers.high.color,
    );

    // Medium fee sign
    this.engine.createSign(
      x - radius * 0.45,
      y + 1,
      z + radius * 0.45,
      "Medium Fee Rate",
      "5-20 sat/vB",
      this.feeTiers.medium.color,
    );

    // Low fee sign
    this.engine.createSign(
      x - radius * 0.75,
      y + 1,
      z - radius * 0.45,
      "Low Fee Rate",
      "1-5 sat/vB",
      this.feeTiers.low.color,
    );
  }

  /**
   * Add decorative elements to the mempool
   */
  addDecorativeElements() {
    const x = this.engine.worldSettings.centerX;
    const y = 0;
    const z = this.engine.worldSettings.centerZ;
    const radius = this.engine.worldSettings.mempoolRadius;

    // Add lanterns around the edge
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const lx = x + Math.cos(angle) * (radius + 1);
      const lz = z + Math.sin(angle) * (radius + 1);

      this.engine.createLantern(lx, y + 3, lz);
    }

    // Add floating bubbles in the pool
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * radius * 0.9;
      const bx = x + Math.cos(angle) * distance;
      const bz = z + Math.sin(angle) * distance;

      this.engine.createBubble(bx, y - 2 + Math.random(), bz);
    }

    // Add mempool explanation sign
    this.engine.createInfoSign(x - radius - 5, y + 1, z, "The Memory Pool", [
      "Unconfirmed transactions wait here",
      "Sorted by fee rate (sat/vB)",
      "Higher fee = faster confirmation",
      "Watch miners select from the pool",
    ]);
  }

  /**
   * Create placeholder transactions in the mempool
   */
  createPlaceholderTransactions() {
    const x = this.engine.worldSettings.centerX;
    const y = 0;
    const z = this.engine.worldSettings.centerZ;

    // Create 20 random placeholder transactions
    for (let i = 0; i < 20; i++) {
      // Determine fee tier
      const tierName = i < 5 ? "high" : i < 12 ? "medium" : "low";
      const tier = this.feeTiers[tierName];

      // Determine position based on tier
      const angle = Math.random() * Math.PI * 2;
      const radius = this.engine.worldSettings.mempoolRadius;
      let distance;

      if (tierName === "high") {
        distance = radius * Math.random() * 0.3;
      } else if (tierName === "medium") {
        distance = radius * (0.3 + Math.random() * 0.3);
      } else {
        distance = radius * (0.6 + Math.random() * 0.3);
      }

      const tx = {
        id: `placeholder_tx_${i}`,
        feeRate: tier.min + Math.random() * 10,
        type:
          Math.random() < 0.2
            ? Math.random() < 0.5
              ? "RBF"
              : "CPFP"
            : "regular",
      };

      // Create transaction entity
      const txEntity = this.createTransactionEntity(
        x + Math.cos(angle) * distance,
        y - 2 + tier.height,
        z + Math.sin(angle) * distance,
        tx,
      );

      // Store reference
      this.mempoolEntities.push(txEntity);
    }
  }

  /**
   * Create a transaction entity in the mempool
   */
  createTransactionEntity(x, y, z, tx) {
    // Determine color based on fee rate
    let color;
    if (tx.feeRate >= this.feeTiers.high.min) {
      color = this.feeTiers.high.color;
    } else if (tx.feeRate >= this.feeTiers.medium.min) {
      color = this.feeTiers.medium.color;
    } else {
      color = this.feeTiers.low.color;
    }

    // Create different shapes for special transaction types
    let shape;
    if (tx.type === "RBF") {
      shape = "diamond";
    } else if (tx.type === "CPFP") {
      shape = "star";
    } else {
      shape = "cube";
    }

    // Create the entity
    const entity = this.engine.createCustomEntity(x, y, z, shape, color);

    // Add floating animation
    this.engine.addFloatingAnimation(entity, 0.1, 2000);

    // Add transaction data to entity
    entity.userData = { ...tx };

    // Add interaction
    entity.onClick = () => {
      this.showTransactionDetails(tx);
    };

    return entity;
  }

  /**
   * Show transaction details when clicked
   */
  showTransactionDetails(tx) {
    // Create a dialog showing transaction details
    const dialog = document.createElement("div");
    dialog.className = "transaction-details-dialog";
    dialog.innerHTML = `
      <div class="dialog-header">
        <h3>Transaction Details</h3>
        <button class="dialog-close-btn">×</button>
      </div>
      <div class="dialog-content">
        <div class="tx-detail">
          <span class="label">ID:</span>
          <span class="value">${tx.id}</span>
        </div>
        <div class="tx-detail">
          <span class="label">Fee Rate:</span>
          <span class="value">${tx.feeRate.toFixed(2)} sat/vB</span>
        </div>
        <div class="tx-detail">
          <span class="label">Type:</span>
          <span class="value">${tx.type}</span>
        </div>
        ${
          tx.type === "RBF"
            ? `
          <div class="tx-detail">
            <span class="label">Replaces:</span>
            <span class="value">${tx.replaces || "Unknown"}</span>
          </div>
        `
            : ""
        }
        ${
          tx.type === "CPFP"
            ? `
          <div class="tx-detail">
            <span class="label">Parent:</span>
            <span class="value">${tx.parent || "Unknown"}</span>
          </div>
        `
            : ""
        }
      </div>
    `;

    document.body.appendChild(dialog);

    // Add close button event
    dialog.querySelector(".dialog-close-btn").addEventListener("click", () => {
      document.body.removeChild(dialog);
    });
  }

  /**
   * Update mempool from blockchain data
   */
  updateFromBlockchainData(mempoolData) {
    // Store transaction data
    this.transactions = mempoolData.txids.map((txid) => {
      return {
        id: txid,
        feeRate: Math.random() * 30, // Would come from actual tx data
        type:
          Math.random() < 0.2
            ? Math.random() < 0.5
              ? "RBF"
              : "CPFP"
            : "regular",
      };
    });

    // Update mempool statistics
    this.updateStats(mempoolData);

    // Update visual representation
    this.updateVisualization();
  }

  /**
   * Update mempool statistics
   */
  updateStats(mempoolData) {
    // Calculate statistics based on mempool data
    this.stats.txCount = mempoolData.txCount || mempoolData.txids.length;
    this.stats.size = mempoolData.size / 1024; // KB

    // Calculate fee rates from transactions
    if (this.transactions.length > 0) {
      // Calculate average fee rate
      const totalFeeRate = this.transactions.reduce(
        (sum, tx) => sum + tx.feeRate,
        0,
      );
      this.stats.avgFeeRate = totalFeeRate / this.transactions.length;

      // Calculate tier fee rates
      const sortedRates = [...this.transactions]
        .sort((a, b) => b.feeRate - a.feeRate)
        .map((tx) => tx.feeRate);

      const highIndex = Math.floor(sortedRates.length * 0.2);
      const mediumIndex = Math.floor(sortedRates.length * 0.5);

      this.stats.highFeeRate = sortedRates[highIndex] || 20;
      this.stats.mediumFeeRate = sortedRates[mediumIndex] || 10;
      this.stats.lowFeeRate = sortedRates[sortedRates.length - 1] || 1;
    }
  }

  /**
   * Update the visual representation of the mempool
   */
  updateVisualization() {
    // Clear existing entities
    this.mempoolEntities.forEach((entity) => {
      this.engine.removeEntity(entity);
    });
    this.mempoolEntities = [];

    // Create new entities for transactions
    const x = this.engine.worldSettings.centerX;
    const y = 0;
    const z = this.engine.worldSettings.centerZ;
    const radius = this.engine.worldSettings.mempoolRadius;

    // Only visualize up to 50 transactions
    const visualTxCount = Math.min(this.transactions.length, 50);

    for (let i = 0; i < visualTxCount; i++) {
      const tx = this.transactions[i];

      // Determine tier
      let tier;
      if (tx.feeRate >= this.stats.highFeeRate) {
        tier = "high";
      } else if (tx.feeRate >= this.stats.mediumFeeRate) {
        tier = "medium";
      } else {
        tier = "low";
      }

      // Determine position based on tier
      const angle = (i / visualTxCount) * Math.PI * 2;
      let distance;

      if (tier === "high") {
        distance = radius * Math.random() * 0.3;
      } else if (tier === "medium") {
        distance = radius * (0.3 + Math.random() * 0.3);
      } else {
        distance = radius * (0.6 + Math.random() * 0.3);
      }

      // Create transaction entity
      const txEntity = this.createTransactionEntity(
        x + Math.cos(angle) * distance,
        y - 2 + this.feeTiers[tier].height,
        z + Math.sin(angle) * distance,
        tx,
      );

      // Store reference
      this.mempoolEntities.push(txEntity);
    }
  }

  /**
   * Add a new transaction to the mempool
   */
  addTransaction(tx) {
    // Create transaction data
    const transactionData = {
      id: tx.txid,
      feeRate: tx.feeRate || Math.random() * 30,
      type: tx.type || "regular",
    };

    // Add to transactions list
    this.transactions.push(transactionData);

    // Update stats
    this.stats.txCount++;

    // Determine tier based on fee rate
    let tier;
    if (transactionData.feeRate >= this.feeTiers.high.min) {
      tier = "high";
    } else if (transactionData.feeRate >= this.feeTiers.medium.min) {
      tier = "medium";
    } else {
      tier = "low";
    }

    // Determine position for the new transaction
    const x = this.engine.worldSettings.centerX;
    const y = 0;
    const z = this.engine.worldSettings.centerZ;
    const radius = this.engine.worldSettings.mempoolRadius;

    // Random position within tier
    const angle = Math.random() * Math.PI * 2;
    let distance;

    if (tier === "high") {
      distance = radius * Math.random() * 0.3;
    } else if (tier === "medium") {
      distance = radius * (0.3 + Math.random() * 0.3);
    } else {
      distance = radius * (0.6 + Math.random() * 0.3);
    }

    // Create transaction entity with animation
    const txEntity = this.createTransactionEntity(
      x + Math.cos(angle) * distance,
      y + 10, // Start high above the pool
      z + Math.sin(angle) * distance,
      transactionData,
    );

    // Animate falling into the pool
    this.engine.animateEntityToPosition(
      txEntity,
      x + Math.cos(angle) * distance,
      y - 2 + this.feeTiers[tier].height, // Final height in the pool
      z + Math.sin(angle) * distance,
      1500, // Duration
      () => {
        // Create splash effect when transaction lands
        this.engine.createSplashEffect(
          txEntity.position.x,
          y - 2,
          txEntity.position.z,
          0x0088ff,
        );
      },
    );

    // Store reference
    this.mempoolEntities.push(txEntity);

    // Play transaction sound
    this.engine.playSound("transaction_added");
  }

  /**
   * Add a locally created transaction
   */
  addLocalTransaction(tx) {
    this.addTransaction(tx);
  }

  /**
   * Remove a transaction from the mempool (e.g., when mined into a block)
   */
  removeTransaction(txId) {
    // Find the transaction
    const txIndex = this.transactions.findIndex((tx) => tx.id === txId);
    if (txIndex === -1) return;

    // Remove from transactions list
    this.transactions.splice(txIndex, 1);

    // Find corresponding entity
    const entityIndex = this.mempoolEntities.findIndex(
      (entity) => entity.userData.id === txId,
    );
    if (entityIndex === -1) return;

    const entity = this.mempoolEntities[entityIndex];

    // Animate entity rising from the pool
    this.engine.animateEntityToPosition(
      entity,
      entity.position.x,
      entity.position.y + 15,
      entity.position.z,
      1000, // Duration
      () => {
        // Remove entity when animation completes
        this.engine.removeEntity(entity);
        this.mempoolEntities.splice(entityIndex, 1);
      },
    );

    // Update stats
    this.stats.txCount--;
  }

  /**
   * Get current mempool statistics
   */
  getStats() {
    return { ...this.stats };
  }
}

/**
 * BlockchainTower - Manages the blockchain tower visualization
 */
class BlockchainTower {
  constructor(engine) {
    this.engine = engine;
    this.blocks = [];
    this.blockEntities = [];
    this.basePosition = { x: 0, y: 0, z: 0 };
    this.towerHeight = 0;

    // Block stats
    this.stats = {
      height: 0,
      latestHash:
        "0000000000000000000000000000000000000000000000000000000000000000",
      difficulty: 0,
    };
  }

  /**
   * Create the tower base
   */
  createTowerBase(x, y, z) {
    // Store the base position
    this.basePosition = { x, y, z };

    // Create a large platform
    this.engine.createPlatform(x, y, z, 20, 20, "stone_brick");

    // Create foundation pillars
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const px = x + Math.cos(angle) * 8;
      const pz = z + Math.sin(angle) * 8;

      this.engine.createPillar(px, y, pz, y + 10, "quartz_pillar");
    }

    // Create decorative elements
    this.createDecorativeBase(x, y, z);

    // Create blockchain info sign
    this.engine.createInfoSign(x - 15, y + 1, z, "The Blockchain Tower", [
      "Each block contains transactions",
      "Blocks are stacked chronologically",
      "The chain grows upward over time",
      "Miners compete to add new blocks",
    ]);
  }

  /**
   * Create decorative elements for the base
   */
  createDecorativeBase(x, y, z) {
    // Create steps leading up to the platform
    this.engine.createSteps(
      x - 10,
      y,
      z,
      x - 5,
      y,
      z,
      5,
      5,
      "stone_brick_stairs",
    );

    // Create torches around the base
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const tx = x + Math.cos(angle) * 10;
      const tz = z + Math.sin(angle) * 10;

      this.engine.createTorch(tx, y + 1, tz);
    }

    // Create a beacon in the center
    this.engine.createBeacon(x, y + 1, z);
  }

  /**
   * Initialize the tower structure
   */
  initializeTowerStructure() {
    const { x, y, z } = this.basePosition;

    // Create the central tower structure
    this.engine.createColumn(x, y, z, 0, 2, "glass");

    // Create corner supports
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const sx = x + Math.cos(angle) * 5;
      const sz = z + Math.sin(angle) * 5;

      this.engine.createColumn(sx, y, sz, 0, 1, "quartz_pillar");
    }
  }

  /**
   * Add decorative elements to the tower
   */
  addDecorativeElements() {
    const { x, y, z } = this.basePosition;

    // Create a golden Bitcoin symbol at the base
    this.engine.createBitcoinSymbol(x, y + 5, z, 3, 0xffaa00);

    // Create floating particles rising up the tower
    this.engine.createRisingParticles(x, y, z, 0xffaa00, 50);
  }

  /**
   * Create placeholder blocks
   */
  createPlaceholderBlocks() {
    // Create 10 placeholder blocks
    for (let i = 0; i < 10; i++) {
      const block = {
        height: i,
        hash: `placeholder_block_${i}`,
        time: Date.now() / 1000 - (10 - i) * 600,
        txCount: Math.floor(Math.random() * 10) + 1,
        size: Math.random() * 900000 + 100000,
        difficulty: 1 + i * 0.1,
      };

      this.addBlockToTower(block);
    }
  }

  /**
   * Add a block to the tower
   */
  addBlockToTower(block) {
    // Add to blocks list
    this.blocks.push(block);

    // Update stats
    this.stats.height = Math.max(this.stats.height, block.height);
    this.stats.latestHash = block.hash;
    this.stats.difficulty = block.difficulty;

    // Determine block position
    const { x, y, z } = this.basePosition;
    const blockY = y + 10 + block.height * 3;

    // Determine block properties based on its data
    const size = 0.5 + block.txCount / 20; // Scale with transaction count
    const color = this.getBlockColor(block);

    // Create block entity
    const blockEntity = this.engine.createBlockEntity(
      x,
      blockY,
      z,
      size,
      color,
      block,
    );

    // Add block height number above the block
    this.engine.createFloatingText(
      x,
      blockY + size + 0.5,
      z,
      `#${block.height}`,
      0xffffff,
    );

    // Connect to previous block with a beam
    if (this.blockEntities.length > 0) {
      const prevBlock = this.blockEntities[this.blockEntities.length - 1];
      this.engine.createBeam(
        prevBlock.position.x,
        prevBlock.position.y,
        prevBlock.position.z,
        x,
        blockY,
        z,
        0xffaa00,
      );
    }

    // Update tower height
    this.towerHeight = Math.max(this.towerHeight, blockY + size);

    // Store entity reference
    this.blockEntities.push(blockEntity);

    // Add click handler
    blockEntity.onClick = () => {
      this.showBlockDetails(block);
    };

    return blockEntity;
  }

  /**
   * Get color for a block based on its properties
   */
  getBlockColor(block) {
    // Newer blocks are brighter
    const age = Date.now() / 1000 - block.time;
    const ageColor = Math.max(0, 1 - age / 86400); // Fade over a day

    // More transactions = more golden
    const txColor = Math.min(1, block.txCount / 20);

    // Create a color gradient from blue to gold based on age and tx count
    const r = 0.3 + 0.7 * txColor;
    const g = 0.2 + 0.6 * txColor;
    const b = 0.8 - 0.6 * txColor;

    // Apply brightness based on age
    const brightness = 0.5 + 0.5 * ageColor;

    // Convert to hex color
    return (
      Math.floor(r * brightness * 255) * 65536 +
      Math.floor(g * brightness * 255) * 256 +
      Math.floor(b * brightness * 255)
    );
  }

  /**
   * Show block details
   */
  showBlockDetails(block) {
    // Create a dialog showing block details
    const dialog = document.createElement("div");
    dialog.className = "block-details-dialog";
    dialog.innerHTML = `
      <div class="dialog-header">
        <h3>Block #${block.height}</h3>
        <button class="dialog-close-btn">×</button>
      </div>
      <div class="dialog-content">
        <div class="block-detail">
          <span class="label">Hash:</span>
          <span class="value">${block.hash.substring(0, 20)}...</span>
        </div>
        <div class="block-detail">
          <span class="label">Time:</span>
          <span class="value">${new Date(block.time * 1000).toLocaleString()}</span>
        </div>
        <div class="block-detail">
          <span class="label">Transactions:</span>
          <span class="value">${block.txCount}</span>
        </div>
        <div class="block-detail">
          <span class="label">Size:</span>
          <span class="value">${(block.size / 1024).toFixed(2)} KB</span>
        </div>
        <div class="block-detail">
          <span class="label">Difficulty:</span>
          <span class="value">${block.difficulty.toFixed(8)}</span>
        </div>
      </div>
      <div class="dialog-footer">
        <button id="explore-block-btn" class="primary-btn">Explore Transactions</button>
      </div>
    `;

    document.body.appendChild(dialog);

    // Add close button event
    dialog.querySelector(".dialog-close-btn").addEventListener("click", () => {
      document.body.removeChild(dialog);
    });

    // Add explore button event
    dialog.querySelector("#explore-block-btn").addEventListener("click", () => {
      this.showBlockTransactions(block);
      document.body.removeChild(dialog);
    });
  }

  /**
   * Show block transactions
   */
  showBlockTransactions(block) {
    // Create a dialog showing block transactions
    const dialog = document.createElement("div");
    dialog.className = "block-transactions-dialog";
    dialog.innerHTML = `
      <div class="dialog-header">
        <h3>Block #${block.height} Transactions</h3>
        <button class="dialog-close-btn">×</button>
      </div>
      <div class="dialog-content">
        <div class="transactions-list">
          ${Array(block.txCount)
            .fill(0)
            .map(
              (_, i) => `
            <div class="transaction-item">
              <div class="tx-icon ${i === 0 ? "coinbase" : ""}"></div>
              <div class="tx-info">
                <div class="tx-id">TX #${i}: ${this.generateRandomTxid().substring(0, 12)}...</div>
                <div class="tx-details">
                  ${i === 0 ? "Coinbase (Block Reward)" : `${Math.floor(Math.random() * 3) + 1} inputs, ${Math.floor(Math.random() * 5) + 1} outputs`}
                </div>
              </div>
              <div class="tx-amount">${i === 0 ? "6.25 BTC" : `${(Math.random() * 2).toFixed(8)} BTC`}</div>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Add close button event
    dialog.querySelector(".dialog-close-btn").addEventListener("click", () => {
      document.body.removeChild(dialog);
    });
  }

  /**
   * Generate a random transaction ID
   */
  generateRandomTxid() {
    return [...Array(64)]
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join("");
  }

  /**
   * Add a new block to the tower
   */
  addNewBlock(block) {
    // Play mining sound
    this.engine.playSound("block_mined");

    // Create celebration effects
    this.createBlockMinedEffect();

    // Add block to tower
    const blockEntity = this.addBlockToTower(block);

    // Animate the block dropping into place
    const finalPosition = blockEntity.position.clone();
    blockEntity.position.y += 30; // Start higher

    this.engine.animateEntityToPosition(
      blockEntity,
      finalPosition.x,
      finalPosition.y,
      finalPosition.z,
      2000, // Duration
      () => {
        // Create impact effect when block lands
        this.engine.createImpactEffect(
          finalPosition.x,
          finalPosition.y,
          finalPosition.z,
          0xffaa00,
        );
      },
    );
  }

  /**
   * Create special effects when a block is mined
   */
  createBlockMinedEffect() {
    const { x, y, z } = this.basePosition;
    const blockY = y + 10 + this.blocks.length * 3;

    // Create fireworks effect
    this.engine.createFireworksEffect(x, blockY, z);

    // Create celebration text
    this.engine.createFloatingText(
      x,
      blockY + 10,
      z,
      "New Block Mined!",
      0xffaa00,
    );

    // Create shockwave effect
    this.engine.createShockwaveEffect(x, blockY, z, 0xffaa00, 20);
  }

  /**
   * Update from blockchain data
   */
  updateFromBlockchainData(blocks) {
    // Find blocks that are not yet in the tower
    const existingHashes = this.blocks.map((block) => block.hash);

    const newBlocks = blocks.filter(
      (block) => !existingHashes.includes(block.hash),
    );

    // Add new blocks to the tower
    for (const block of newBlocks) {
      this.addBlockToTower(block);
    }

    // Update tower appearance if needed
    this.updateTowerAppearance();
  }

  /**
   * Update the tower's appearance based on current state
   */
  updateTowerAppearance() {
    // Update the height of the central column
    this.engine.updateColumn(
      this.basePosition.x,
      this.basePosition.y,
      this.basePosition.z,
      this.towerHeight,
    );

    // Update the rising particles
    this.engine.updateRisingParticles(
      this.basePosition.x,
      this.basePosition.y,
      this.basePosition.z,
      this.towerHeight,
    );
  }

  /**
   * Get the tower position
   */
  getTowerPosition() {
    return { ...this.basePosition };
  }

  /**
   * Get blockchain statistics
   */
  getStats() {
    return { ...this.stats };
  }
}

/**
 * MinerSystem - Manages miner houses and mining simulation
 */
class MinerSystem {
  constructor(engine) {
    this.engine = engine;
    this.minerHouses = [];
    this.difficulty = 1;
    this.activeMinerCount = 0;
  }

  /**
   * Create a miner house
   */
  createMinerHouse(x, y, z, minerType, minerName, minerPower) {
    // Determine house size based on miner type
    let width, depth, height;
    switch (minerType) {
      case "small":
        width = 5;
        depth = 5;
        height = 4;
        break;
      case "medium":
        width = 7;
        depth = 7;
        height = 5;
        break;
      case "large":
        width = 9;
        depth = 9;
        height = 6;
        break;
      case "pool":
        width = 12;
        depth = 8;
        height = 7;
        break;
      case "industrial":
        width = 15;
        depth = 10;
        height = 8;
        break;
      default:
        width = 7;
        depth = 7;
        height = 5;
    }

    // Create the house structure
    const house = this.engine.createHouse(
      x,
      y,
      z,
      width,
      depth,
      height,
      minerType,
    );

    // Add mining equipment inside
    this.addMiningEquipment(x, y, z, width, depth, minerType);

    // Add sign with miner name
    this.engine.createNameSign(
      x,
      y + 1,
      z - depth / 2 - 1,
      minerName,
      `Mining Power: ${minerPower}`,
    );

    // Add miner data
    house.minerName = minerName;
    house.minerType = minerType;
    house.minerPower = minerPower;
    house.position = { x, y, z };
    house.isMining = Math.random() < 0.7; // 70% chance of mining initially

    // Add mining effects if active
    if (house.isMining) {
      this.addMiningEffects(house);
      this.activeMinerCount++;
    }

    // Store reference
    this.minerHouses.push(house);

    return house;
  }

  /**
   * Add mining equipment to a house
   */
  addMiningEquipment(x, y, z, width, depth, minerType) {
    // Determine equipment based on miner type
    switch (minerType) {
      case "small":
        // Add a few mining rigs
        this.engine.createMiningRig(x - 1, y + 1, z - 1, "small");
        this.engine.createMiningRig(x + 1, y + 1, z + 1, "small");
        break;
      case "medium":
        // Add multiple mining rigs
        for (let i = 0; i < 3; i++) {
          this.engine.createMiningRig(x - 2 + i * 2, y + 1, z - 1, "medium");
        }
        break;
      case "large":
        // Add mining rig rows
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 3; j++) {
            this.engine.createMiningRig(
              x - 3 + j * 3,
              y + 1,
              z - 2 + i * 4,
              "medium",
            );
          }
        }
        break;
      case "pool":
        // Add server racks
        for (let i = 0; i < 3; i++) {
          this.engine.createServerRack(x - 4 + i * 3, y + 1, z, "large");
        }
        break;
      case "industrial":
        // Add industrial mining farm
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 4; j++) {
            this.engine.createServerRack(
              x - 6 + j * 3,
              y + 1,
              z - 3 + i * 6,
              "large",
            );
          }
        }
        // Add cooling systems
        this.engine.createCoolingSystem(x + 5, y + 1, z + 3);
        this.engine.createCoolingSystem(x - 5, y + 1, z + 3);
        break;
    }

    // Add power supply
    this.engine.createPowerSupply(x, y + 1, z + depth / 2 - 1);

    // Add computer monitor
    this.engine.createMonitor(x + width / 3, y + 1, z - depth / 3);
  }

  /**
   * Add mining effects to a house
   */
  addMiningEffects(house) {
    const { x, y, z } = house.position;

    // Add smoke from chimney
    house.smokeEffect = this.engine.createSmokeEffect(
      x,
      y + house.height,
      z,
      house.minerType === "industrial" ? 0x555555 : 0xaaaaaa,
    );

    // Add power consumption visualization
    house.powerEffect = this.engine.createPowerEffect(
      x,
      y + 1,
      z,
      Math.min(1, house.minerPower / 50), // Normalize power
    );

    // Add humming sound
    house.soundEffect = this.engine.createSoundEffect(
      x,
      y,
      z,
      "mining_hum",
      house.minerType,
    );
  }

  /**
   * Remove mining effects from a house
   */
  removeMiningEffects(house) {
    // Remove smoke effect
    if (house.smokeEffect) {
      this.engine.removeEffect(house.smokeEffect);
      house.smokeEffect = null;
    }

    // Remove power effect
    if (house.powerEffect) {
      this.engine.removeEffect(house.powerEffect);
      house.powerEffect = null;
    }

    // Remove sound effect
    if (house.soundEffect) {
      this.engine.removeEffect(house.soundEffect);
      house.soundEffect = null;
    }
  }

  /**
   * Update difficulty for all miners
   */
  updateDifficulty(difficulty) {
    this.difficulty = difficulty;

    // Update miner houses based on new difficulty
    this.minerHouses.forEach((house) => {
      // Determine if miner should be active based on difficulty and power
      const shouldMine = house.minerPower / (difficulty * 10) > Math.random();

      if (shouldMine && !house.isMining) {
        // Start mining
        house.isMining = true;
        this.addMiningEffects(house);
        this.activeMinerCount++;
      } else if (!shouldMine && house.isMining) {
        // Stop mining
        house.isMining = false;
        this.removeMiningEffects(house);
        this.activeMinerCount--;
      }
    });
  }

  /**
   * Update miners (called each frame)
   */
  update(delta) {
    // Update mining effects
    this.minerHouses.forEach((house) => {
      if (house.isMining) {
        // Update smoke effect
        if (house.smokeEffect) {
          // Vary the smoke intensity based on mining power
          const intensity =
            0.5 + Math.sin(Date.now() / 1000) * 0.2 + house.minerPower / 100;
          this.engine.updateSmokeEffect(house.smokeEffect, intensity);
        }

        // Update power effect
        if (house.powerEffect) {
          // Vary the power consumption visualization
          const power =
            Math.min(1, house.minerPower / 50) *
            (0.8 + Math.sin(Date.now() / 500) * 0.2);
          this.engine.updatePowerEffect(house.powerEffect, power);
        }

        // Random chance to mine a block based on power and difficulty
        const miningPower = house.minerPower / 100;
        const difficultyFactor = 1 / (this.difficulty / 10);
        const miningChance = miningPower * difficultyFactor * delta;

        if (Math.random() < miningChance) {
          this.minerFoundBlock(house);
        }
      }
    });
  }

  /**
   * Miner found a block
   */
  minerFoundBlock(house) {
    // Create celebration effects
    const { x, y, z } = house.position;

    // Create fireworks over the house
    this.engine.createFireworksEffect(x, y + house.height + 5, z);

    // Create floating text
    this.engine.createFloatingText(
      x,
      y + house.height + 2,
      z,
      `${house.minerName} found a block!`,
      0xffaa00,
    );

    // Create particles moving from house to blockchain tower
    const towerPosition = this.engine.blockchainTower.getTowerPosition();
    this.engine.createMovingParticles(
      x,
      y + house.height / 2,
      z,
      towerPosition.x,
      towerPosition.y + this.engine.blockchainTower.towerHeight,
      towerPosition.z,
      0xffaa00,
      30,
      3000,
    );

    // Create a transaction from miner to mempool
    this.createMinerTransaction(house);

    // Emit block found event
    if (this.onBlockFound) {
      this.onBlockFound(house);
    }
  }

  /**
   * Create a transaction from miner to mempool
   */
  createMinerTransaction(house) {
    const { x, y, z } = house.position;
    const mempoolPosition = {
      x: this.engine.worldSettings.centerX,
      y: 1,
      z: this.engine.worldSettings.centerZ,
    };

    // Create transaction entity representing the mining reward
    const txEntity = this.engine.createTransactionEntity(
      x,
      y + house.height / 2,
      z,
      40, // High fee rate for coinbase
      "coinbase",
    );

    // Animate to mempool
    this.engine.animateEntityToPosition(
      txEntity,
      mempoolPosition.x,
      mempoolPosition.y,
      mempoolPosition.z,
      2000, // Duration
      () => {
        // Remove entity when animation completes
        this.engine.removeEntity(txEntity);
      },
    );
  }

  /**
   * Get the number of active miners
   */
  getActiveMinerCount() {
    return this.activeMinerCount;
  }
}

/**
 * NPCSystem - Manages NPCs and their behaviors
 */
class NPCSystem {
  constructor(engine) {
    this.engine = engine;
    this.npcs = [];
    this.behaviors = {};
    this.behaviorIntervals = {};
  }

  /**
   * Create a miner NPC
   */
  createMinerNPC(x, y, z, name, minerPower) {
    // Create NPC entity
    const npc = this.engine.createNPCEntity(x, y, z, "miner", name);

    // Add miner-specific properties
    npc.minerPower = minerPower;
    npc.isMining = true;

    // Create mining tool in hand
    this.engine.createNPCTool(npc, "pickaxe");

    // Store reference
    this.npcs.push(npc);

    return npc;
  }

  /**
   * Create a trader NPC
   */
  createTraderNPC(x, y, z, name, feeStrategy) {
    // Create NPC entity
    const npc = this.engine.createNPCEntity(x, y, z, "trader", name);

    // Add trader-specific properties
    npc.feeStrategy = feeStrategy;

    // Create trading item in hand
    this.engine.createNPCTool(npc, "trade_tablet");

    // Store reference
    this.npcs.push(npc);

    return npc;
  }

  /**
   * Create a node operator NPC
   */
  createNodeOperatorNPC(x, y, z, name, nodeType) {
    // Create NPC entity
    const npc = this.engine.createNPCEntity(x, y, z, "node_operator", name);

    // Add node operator-specific properties
    npc.nodeType = nodeType;

    // Create node tool in hand
    this.engine.createNPCTool(npc, "node_tablet");

    // Store reference
    this.npcs.push(npc);

    return npc;
  }

  /**
   * Create a user NPC
   */
  createUserNPC(x, y, z, name, txFrequency) {
    // Create NPC entity
    const npc = this.engine.createNPCEntity(x, y, z, "user", name);

    // Add user-specific properties
    npc.txFrequency = txFrequency;
    npc.balance = 1 + Math.random() * 5; // Random BTC balance

    // Create wallet tool in hand
    this.engine.createNPCTool(npc, "wallet");

    // Store reference
    this.npcs.push(npc);

    return npc;
  }

  /**
   * Set walk between points behavior
   */
  setWalkBetweenPointsBehavior(npc, points, delay) {
    if (!npc || !points || points.length < 2) return;

    // Set behavior data
    this.behaviors[npc.id] = {
      type: "walk_between_points",
      points: points,
      currentPoint: 0,
      delay: delay || 5000,
    };

    // Start behavior
    this.startBehavior(npc);
  }

  /**
   * Set trading behavior
   */
  setTradingBehavior(npc) {
    if (!npc) return;

    // Set behavior data
    this.behaviors[npc.id] = {
      type: "trading",
      lastTradeTime: 0,
      tradeInterval: 10000 + Math.random() * 20000, // Random interval between trades
    };

    // Start behavior
    this.startBehavior(npc);
  }

  /**
   * Set verification behavior
   */
  setVerificationBehavior(npc) {
    if (!npc) return;

    // Set behavior data
    this.behaviors[npc.id] = {
      type: "verification",
      lastVerificationTime: 0,
      verificationInterval: 5000 + Math.random() * 10000, // Random interval between verifications
    };

    // Start behavior
    this.startBehavior(npc);
  }

  /**
   * Set transaction creation behavior
   */
  setTransactionCreationBehavior(npc) {
    if (!npc) return;

    // Set behavior data
    this.behaviors[npc.id] = {
      type: "transaction_creation",
      lastTxTime: 0,
      txInterval: Math.max(15000, 30000 / npc.txFrequency), // Convert frequency to interval
    };

    // Start behavior
    this.startBehavior(npc);
  }

  /**
   * Start a behavior for an NPC
   */
  startBehavior(npc) {
    if (!npc || !this.behaviors[npc.id]) return;

    const behavior = this.behaviors[npc.id];

    // Clear any existing interval
    if (this.behaviorIntervals[npc.id]) {
      clearInterval(this.behaviorIntervals[npc.id]);
    }

    // Start behavior based on type
    switch (behavior.type) {
      case "walk_between_points":
        this.startWalkBehavior(npc);
        break;
      case "trading":
        this.startTradingBehavior(npc);
        break;
      case "verification":
        this.startVerificationBehavior(npc);
        break;
      case "transaction_creation":
        this.startTransactionBehavior(npc);
        break;
    }
  }

  /**
   * Start walk behavior
   */
  startWalkBehavior(npc) {
    const behavior = this.behaviors[npc.id];
    if (!behavior || behavior.type !== "walk_between_points") return;

    // Function to move to next point
    const moveToNextPoint = () => {
      const targetPoint = behavior.points[behavior.currentPoint];

      // Animate NPC to target point
      this.engine.animateNPC(
        npc,
        targetPoint.x,
        targetPoint.y,
        targetPoint.z,
        5000, // Duration
        () => {
          // Wait at the destination
          setTimeout(() => {
            // Move to next point
            behavior.currentPoint =
              (behavior.currentPoint + 1) % behavior.points.length;
            moveToNextPoint();
          }, behavior.delay);
        },
      );
    };

    // Start walking
    moveToNextPoint();
  }

  /**
   * Start trading behavior
   */
  startTradingBehavior(npc) {
    const behavior = this.behaviors[npc.id];
    if (!behavior || behavior.type !== "trading") return;

    // Set interval for trading
    this.behaviorIntervals[npc.id] = setInterval(() => {
      // Perform trading action
      this.performTrading(npc);
    }, behavior.tradeInterval);
  }

  /**
   * Perform trading action
   */
  performTrading(npc) {
    // Create transaction from trader to mempool
    const mempoolPosition = {
      x: this.engine.worldSettings.centerX,
      y: 1,
      z: this.engine.worldSettings.centerZ,
    };

    // Determine fee rate based on strategy
    let feeRate;
    switch (npc.feeStrategy) {
      case "high":
        feeRate = 30 + Math.random() * 20;
        break;
      case "medium":
        feeRate = 10 + Math.random() * 10;
        break;
      case "low":
        feeRate = 1 + Math.random() * 4;
        break;
      default:
        feeRate = 5 + Math.random() * 15;
    }

    // Create transaction entity
    const txEntity = this.engine.createTransactionEntity(
      npc.position.x,
      npc.position.y + 1,
      npc.position.z,
      feeRate,
      Math.random() < 0.2 ? "RBF" : "regular",
    );

    // Animate to mempool
    this.engine.animateEntityToPosition(
      txEntity,
      mempoolPosition.x,
      mempoolPosition.y,
      mempoolPosition.z,
      2000, // Duration
      () => {
        // Add to mempool
        this.engine.mempoolSystem.addTransaction({
          txid: this.generateRandomTxid(),
          feeRate: feeRate,
          type: Math.random() < 0.2 ? "RBF" : "regular",
        });

        // Remove entity
        this.engine.removeEntity(txEntity);
      },
    );

    // Create trader animation
    this.engine.createNPCAnimation(npc, "trade");
  }

  /**
   * Start verification behavior
   */
  startVerificationBehavior(npc) {
    const behavior = this.behaviors[npc.id];
    if (!behavior || behavior.type !== "verification") return;

    // Set interval for verification
    this.behaviorIntervals[npc.id] = setInterval(() => {
      // Perform verification action
      this.performVerification(npc);
    }, behavior.verificationInterval);
  }

  /**
   * Perform verification action
   */
  performVerification(npc) {
    // Get blockchain tower position
    const towerPosition = this.engine.blockchainTower.getTowerPosition();

    // Create beam between NPC and tower
    const beam = this.engine.createBeam(
      npc.position.x,
      npc.position.y + 1,
      npc.position.z,
      towerPosition.x,
      towerPosition.y + this.engine.blockchainTower.towerHeight / 2,
      towerPosition.z,
      0x00ffff,
    );

    // Create verification animation
    this.engine.createNPCAnimation(npc, "verify");

    // Remove beam after a delay
    setTimeout(() => {
      this.engine.removeEntity(beam);
    }, 2000);
  }

  /**
   * Start transaction behavior
   */
  startTransactionBehavior(npc) {
    const behavior = this.behaviors[npc.id];
    if (!behavior || behavior.type !== "transaction_creation") return;

    // Set interval for transaction creation
    this.behaviorIntervals[npc.id] = setInterval(() => {
      // Perform transaction action
      this.performTransaction(npc);
    }, behavior.txInterval);
  }

  /**
   * Perform transaction action
   */
  performTransaction(npc) {
    // Check if NPC has balance
    if (npc.balance <= 0.001) return;

    // Determine transaction amount
    const amount = Math.min(npc.balance * 0.5, 0.001 + Math.random() * 0.1);

    // Deduct from balance
    npc.balance -= amount;

    // Determine fee rate - higher amount = higher fee rate
    const feeRate = 1 + amount * 100 + Math.random() * 10;

    // Create transaction to mempool
    const mempoolPosition = {
      x: this.engine.worldSettings.centerX,
      y: 1,
      z: this.engine.worldSettings.centerZ,
    };

    // Create transaction entity
    const txEntity = this.engine.createTransactionEntity(
      npc.position.x,
      npc.position.y + 1,
      npc.position.z,
      feeRate,
      "regular",
    );

    // Animate to mempool
    this.engine.animateEntityToPosition(
      txEntity,
      mempoolPosition.x,
      mempoolPosition.y,
      mempoolPosition.z,
      2000, // Duration
      () => {
        // Add to mempool
        this.engine.mempoolSystem.addTransaction({
          txid: this.generateRandomTxid(),
          feeRate: feeRate,
          type: "regular",
        });

        // Remove entity
        this.engine.removeEntity(txEntity);
      },
    );

    // Create user animation
    this.engine.createNPCAnimation(npc, "send");
  }

  /**
   * Generate a random transaction ID
   */
  generateRandomTxid() {
    return [...Array(64)]
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join("");
  }

  /**
   * Start all NPC behaviors
   */
  startBehaviors() {
    this.npcs.forEach((npc) => {
      if (this.behaviors[npc.id]) {
        this.startBehavior(npc);
      }
    });
  }

  /**
   * Stop all NPC behaviors
   */
  stopBehaviors() {
    Object.keys(this.behaviorIntervals).forEach((id) => {
      clearInterval(this.behaviorIntervals[id]);
    });
    this.behaviorIntervals = {};
  }

  /**
   * Update NPCs (called each frame)
   */
  update(delta) {
    // Update NPC animations
    this.npcs.forEach((npc) => {
      this.engine.updateNPC(npc, delta);
    });
  }
}

/**
 * SimulationSystem - Handles blockchain simulation aspects
 */
class SimulationSystem {
  constructor(engine) {
    this.engine = engine;
    this.isSimulating = false;
    this.simulationInterval = null;
    this.miningInterval = null;
    this.isMining = false;
    this.miningPower = 10;
    this.difficulty = 1;

    // Simulation settings
    this.simulationSettings = {
      txFrequency: 5000, // ms between transactions
      blockInterval: 60000, // ms between blocks (target)
      difficultyAdjustmentBlocks: 10, // blocks between difficulty adjustments
      targetBlockTime: 60000, // target time between blocks (ms)
    };
  }

  /**
   * Start the overall simulation
   */
  startSimulation() {
    if (this.isSimulating) return;

    this.isSimulating = true;

    // Start transaction simulation
    this.simulationInterval = setInterval(() => {
      this.createRandomTransaction();
    }, this.simulationSettings.txFrequency);

    // Start difficulty adjustment
    this.adjustDifficulty();
  }

  /**
   * Stop the simulation
   */
  stopSimulation() {
    this.isSimulating = false;

    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }

    this.stopMining();
  }

  /**
   * Create a random transaction in the simulation
   */
  createRandomTransaction() {
    // Skip if no clients connected
    if (!this.engine.socket || this.engine.connectedClients === 0) return;

    // Generate random transaction data
    const tx = {
      txid: this.generateRandomTxid(),
      feeRate:
        Math.random() < 0.2 ? 20 + Math.random() * 20 : 1 + Math.random() * 10,
      type:
        Math.random() < 0.2
          ? Math.random() < 0.5
            ? "RBF"
            : "CPFP"
          : "regular",
    };

    // Determine random start position
    const angle = Math.random() * Math.PI * 2;
    const distance = 50 + Math.random() * 50;
    const startX =
      this.engine.worldSettings.centerX + Math.cos(angle) * distance;
    const startZ =
      this.engine.worldSettings.centerZ + Math.sin(angle) * distance;

    // Create transaction entity
    const txEntity = this.engine.createTransactionEntity(
      startX,
      5,
      startZ,
      tx.feeRate,
      tx.type,
    );

    // Target mempool position
    const mempoolPosition = {
      x: this.engine.worldSettings.centerX,
      y: 1,
      z: this.engine.worldSettings.centerZ,
    };

    // Animate to mempool
    this.engine.animateEntityToPosition(
      txEntity,
      mempoolPosition.x,
      mempoolPosition.y,
      mempoolPosition.z,
      2000, // Duration
      () => {
        // Add to mempool
        this.engine.mempoolSystem.addTransaction(tx);

        // Remove entity
        this.engine.removeEntity(txEntity);
      },
    );

    // Emit socket event for new transaction
    this.engine.socket.emit("new_transaction", {
      txid: tx.txid,
      feeRate: tx.feeRate,
      type: tx.type,
    });
  }

  /**
   * Generate a random transaction ID
   */
  generateRandomTxid() {
    return [...Array(64)]
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join("");
  }

  /**
   * Start mining process
   */
  startMining(miningPower) {
    if (this.isMining) return;

    this.isMining = true;
    this.miningPower = miningPower || 10;

    // Create mining UI feedback
    this.createMiningUI();

    // Calculate mining interval based on difficulty and power
    const baseInterval = this.simulationSettings.blockInterval;
    const powerFactor = 10 / this.miningPower;
    const difficultyFactor = this.difficulty;

    const miningInterval = baseInterval * powerFactor * difficultyFactor;

    // Start mining interval
    this.miningInterval = setInterval(() => {
      // Random chance to find a block based on power and difficulty
      const findBlockChance = this.miningPower / (this.difficulty * 100);

      if (Math.random() < findBlockChance) {
        this.mineBlock();
      } else {
        // Update mining progress
        this.updateMiningProgress(findBlockChance);
      }
    }, 1000); // Check every second
  }

  /**
   * Create mining UI
   */
  createMiningUI() {
    // Create mining progress UI
    const miningUI = document.createElement("div");
    miningUI.id = "player-mining-ui";
    miningUI.className = "player-mining-ui";
    miningUI.innerHTML = `
          <div class="mining-header">
            <h3>Mining in Progress</h3>
          </div>
          <div class="mining-stats">
            <div class="mining-stat">
              <span class="stat-label">Mining Power:</span>
              <span class="stat-value" id="mining-power-value">${this.miningPower}</span>
            </div>
            <div class="mining-stat">
              <span class="stat-label">Difficulty:</span>
              <span class="stat-value" id="mining-difficulty-value">${this.difficulty.toFixed(4)}</span>
            </div>
            <div class="mining-stat">
              <span class="stat-label">Chance:</span>
              <span class="stat-value" id="mining-chance-value">${((this.miningPower / (this.difficulty * 100)) * 100).toFixed(4)}%</span>
            </div>
          </div>
          <div class="mining-progress-container">
            <div class="mining-progress" id="mining-progress-bar" style="width: 0%"></div>
          </div>
          <button id="stop-mining-btn" class="mining-stop-btn">Stop Mining</button>
        `;

    document.body.appendChild(miningUI);

    // Add stop button event
    document.getElementById("stop-mining-btn").addEventListener("click", () => {
      this.stopMining();
    });
  }

  /**
   * Update mining progress UI
   */
  updateMiningProgress(chance) {
    // Update progress bar with random progress representing hashing
    const progressBar = document.getElementById("mining-progress-bar");
    if (progressBar) {
      // Random progress between 0-100%
      const progress = Math.random() * 100;
      progressBar.style.width = `${progress}%`;

      // Show hash calculation animation
      this.showHashingEffect();
    }

    // Update stats
    document.getElementById("mining-power-value").textContent =
      this.miningPower;
    document.getElementById("mining-difficulty-value").textContent =
      this.difficulty.toFixed(4);
    document.getElementById("mining-chance-value").textContent =
      (chance * 100).toFixed(4) + "%";
  }

  /**
   * Show hashing effect near player
   */
  showHashingEffect() {
    // Get player position
    const playerPosition = this.engine.controls.getObject().position;

    // Create hash calculation particle effect
    this.engine.createHashingEffect(
      playerPosition.x,
      playerPosition.y,
      playerPosition.z,
    );
  }

  /**
   * Mine a block
   */
  mineBlock() {
    // Generate block data
    const blockHeight = this.engine.blockchainTower.stats.height + 1;
    const block = {
      height: blockHeight,
      hash: this.generateRandomBlockHash(),
      time: Date.now() / 1000,
      txCount: 5 + Math.floor(Math.random() * 10),
      size: Math.random() * 900000 + 100000,
      difficulty: this.difficulty,
    };

    // Emit socket event for new block
    this.engine.socket.emit("mine_block", {
      blocks: 1,
      player: true,
    });

    // Show success UI
    this.showBlockMinedSuccess(block);

    // Remove transactions from mempool
    this.removeTransactionsForBlock(block.txCount);

    // Add block reward to player
    this.addBlockReward();
  }

  /**
   * Generate a random block hash
   */
  generateRandomBlockHash() {
    return [...Array(64)]
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join("");
  }

  /**
   * Show block mined success UI
   */
  showBlockMinedSuccess(block) {
    // Create success UI overlay
    const successUI = document.createElement("div");
    successUI.className = "block-mined-success";
    successUI.innerHTML = `
          <div class="success-header">
            <h2>Block Mined!</h2>
          </div>
          <div class="success-details">
            <div class="success-detail">
              <span class="detail-label">Block Height:</span>
              <span class="detail-value">#${block.height}</span>
            </div>
            <div class="success-detail">
              <span class="detail-label">Hash:</span>
              <span class="detail-value">${block.hash.substring(0, 8)}...</span>
            </div>
            <div class="success-detail">
              <span class="detail-label">Transactions:</span>
              <span class="detail-value">${block.txCount}</span>
            </div>
            <div class="success-detail">
              <span class="detail-label">Reward:</span>
              <span class="detail-value">6.25 BTC</span>
            </div>
          </div>
          <button class="success-close-btn">Continue</button>
        `;

    document.body.appendChild(successUI);

    // Add close button event
    successUI
      .querySelector(".success-close-btn")
      .addEventListener("click", () => {
        document.body.removeChild(successUI);
      });

    // Create celebration effects in the world
    const playerPosition = this.engine.controls.getObject().position;

    // Create fireworks around player
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const distance = 5;
      const fx = playerPosition.x + Math.cos(angle) * distance;
      const fz = playerPosition.z + Math.sin(angle) * distance;

      this.engine.createFireworksEffect(fx, playerPosition.y + 10, fz);
    }

    // Play celebration sound
    this.engine.playSound("block_mined");
  }

  /**
   * Remove transactions from mempool for a new block
   */
  removeTransactionsForBlock(count) {
    // Get highest fee transactions from mempool
    const transactions = this.engine.mempoolSystem.transactions.sort(
      (a, b) => b.feeRate - a.feeRate,
    );

    // Take the top transactions
    const includedTxs = transactions.slice(0, count);

    // Remove from mempool
    includedTxs.forEach((tx) => {
      this.engine.mempoolSystem.removeTransaction(tx.id);
    });
  }

  /**
   * Add block reward to player
   */
  addBlockReward() {
    // Add Bitcoin to player inventory
    this.engine.playerInventory.bitcoin += 6.25;

    // Update UI
    document.getElementById("bitcoin-balance").textContent =
      this.engine.playerInventory.bitcoin.toFixed(8);
  }

  /**
   * Stop mining
   */
  stopMining() {
    this.isMining = false;

    if (this.miningInterval) {
      clearInterval(this.miningInterval);
      this.miningInterval = null;
    }

    // Remove mining UI
    const miningUI = document.getElementById("player-mining-ui");
    if (miningUI) {
      document.body.removeChild(miningUI);
    }
  }

  /**
   * Adjust mining difficulty
   */
  adjustDifficulty() {
    // Initial difficulty
    this.difficulty = 1;

    // Set up difficulty adjustment interval
    setInterval(() => {
      // Get time since last block
      const lastBlockTime =
        this.engine.blockchainTower.blocks.length > 0
          ? this.engine.blockchainTower.blocks[
              this.engine.blockchainTower.blocks.length - 1
            ].time
          : Date.now() / 1000 - 600;

      const secondsSinceLastBlock = Date.now() / 1000 - lastBlockTime;

      // Target: 60 seconds per block (1 minute)
      const targetTime = 60;

      // Adjust difficulty based on how far off we are from target time
      if (secondsSinceLastBlock < targetTime / 2) {
        // Blocks are being mined too quickly, increase difficulty
        this.difficulty *= 1.1;
      } else if (secondsSinceLastBlock > targetTime * 2) {
        // Blocks are being mined too slowly, decrease difficulty
        this.difficulty *= 0.9;
      }

      // Limit difficulty range
      this.difficulty = Math.max(0.1, Math.min(100, this.difficulty));

      // Update miners with new difficulty
      this.engine.minerSystem.updateDifficulty(this.difficulty);

      // Update mining UI if active
      if (this.isMining) {
        document.getElementById("mining-difficulty-value").textContent =
          this.difficulty.toFixed(4);
        document.getElementById("mining-chance-value").textContent =
          ((this.miningPower / (this.difficulty * 100)) * 100).toFixed(4) + "%";
      }
    }, 30000); // Adjust every 30 seconds
  }
}
