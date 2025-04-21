/**
 * BlockchainGameIntegration - Integrates blockchain data with the game
 */
class BlockchainGameIntegration {
  constructor(voxelEngine, characterSystem) {
    this.engine = voxelEngine;
    this.characterSystem = characterSystem;

    // Set up inventory
    this.inventory = {
      bitcoin: 0,
      tokens: {
        BlockToken: 10,
        ChainCoin: 5,
      },
      tools: {
        pickaxe: { level: 1, durability: 100 },
        shovel: { level: 1, durability: 100 },
      },
      materials: {
        stone: 0,
        goldOre: 0,
      },
    };

    // Set up quests
    this.quests = [
      {
        id: "mining_101",
        title: "Mining 101",
        description: "Mine your first block to earn a reward",
        reward: { bitcoin: 0.1 },
        progress: 0,
        goal: 1,
        complete: false,
      },
      {
        id: "transaction_tracker",
        title: "Transaction Tracker",
        description: "Interact with 5 transaction characters",
        reward: { tokens: { ChainCoin: 10 } },
        progress: 0,
        goal: 5,
        complete: false,
      },
      {
        id: "block_explorer",
        title: "Block Explorer",
        description: "Visit 10 different block buildings",
        reward: { materials: { goldOre: 5 } },
        progress: 0,
        goal: 10,
        complete: false,
      },
    ];

    // Create UI elements
    this.createUI();

    // Set up socket connection
    this.socket = io();
    this.setupSocketEvents();

    // Fetch initial blockchain data
    this.fetchBlockchainData();

    // Set block mined handler
    this.engine.onBlockMined = this.handleBlockMined.bind(this);

    // Set block info handler
    this.engine.onShowBlockInfo = this.showBlockInfo.bind(this);

    // Start update loop
    this.update = this.update.bind(this);
    requestAnimationFrame(this.update);
  }

  createUI() {
    // Create inventory UI
    this.inventoryUI = document.createElement("div");
    this.inventoryUI.className = "inventory-ui";
    this.inventoryUI.style.display = "none";
    document.body.appendChild(this.inventoryUI);

    // Create inventory button
    this.inventoryButton = document.createElement("button");
    this.inventoryButton.className = "inventory-button";
    this.inventoryButton.textContent = "Inventory [I]";
    this.inventoryButton.addEventListener("click", () => {
      this.toggleInventory();
    });
    document.body.appendChild(this.inventoryButton);

    // Create quest UI
    this.questUI = document.createElement("div");
    this.questUI.className = "quest-ui";
    this.questUI.style.display = "none";
    document.body.appendChild(this.questUI);

    // Create quest button
    this.questButton = document.createElement("button");
    this.questButton.className = "quest-button";
    this.questButton.textContent = "Quests [Q]";
    this.questButton.addEventListener("click", () => {
      this.toggleQuests();
    });
    document.body.appendChild(this.questButton);

    // Create mining UI
    this.miningUI = document.createElement("div");
    this.miningUI.className = "mining-ui";
    this.miningUI.style.display = "none";
    document.body.appendChild(this.miningUI);
  }

  setupSocketEvents() {
    // Handle socket events
    this.socket.on("connect", () => {
      console.log("Connected to blockchain server");
    });

    this.socket.on("blockchain_update", (data) => {
      this.handleBlockchainUpdate(data);
    });

    this.socket.on("new_block", (block) => {
      this.handleNewBlock(block);
    });

    this.socket.on("new_transaction", (tx) => {
      this.handleNewTransaction(tx);
    });

    this.socket.on("mining_started", (data) => {
      this.showMiningActivity(data);
    });

    this.socket.on("mining_complete", (data) => {
      this.completeMiningActivity(data);
    });
  }

  async fetchBlockchainData() {
    try {
      const response = await fetch("/api/blockchain");
      const data = await response.json();

      // Process the blockchain data
      this.processBlockchainData(data);
    } catch (error) {
      console.error("Error fetching blockchain data:", error);
    }
  }

  processBlockchainData(data) {
    // Update stats
    this.updateStats(data.stats);

    // Create buildings for blocks
    this.createBuildingsForBlocks(data.blocks);

    // Create characters for mempool transactions
    this.createTransactionsForMempool(data.mempool);
  }

  updateStats(stats) {
    // Update the stats panel
    document.getElementById("block-count").textContent = stats.blockCount || 0;
    document.getElementById("tx-count").textContent = stats.totalTxCount || 0;
    document.getElementById("mempool-size").textContent =
      stats.mempoolSize || 0;
    document.getElementById("bitcoin-balance").textContent =
      this.inventory.bitcoin.toFixed(8);
  }

  createBuildingsForBlocks(blocks) {
    if (!blocks || blocks.length === 0) return;

    // Create buildings in a circular pattern
    const centerX = 0;
    const centerZ = 0;
    const radius = 40;

    blocks.forEach((block, index) => {
      // Calculate position
      const angle = (index / blocks.length) * Math.PI * 2;
      const x = centerX + Math.cos(angle) * radius;
      const z = centerZ + Math.sin(angle) * radius;

      // Create building
      this.engine.createBlockchainBuilding(block, Math.floor(x), Math.floor(z));
    });
  }

  createTransactionsForMempool(mempool) {
    if (!mempool || !mempool.txids || mempool.txids.length === 0) return;

    // Create transaction characters for the first several transactions
    const maxTransactions = Math.min(mempool.txids.length, 20);

    for (let i = 0; i < maxTransactions; i++) {
      this.fetchTransactionDetails(mempool.txids[i]).then((tx) => {
        if (tx) {
          this.characterSystem.createTransactionCharacter(tx);
        }
      });
    }
  }

  async fetchTransactionDetails(txid) {
    try {
      const response = await fetch(`/api/tx/${txid}`);
      return await response.json();
    } catch (error) {
      console.error(`Error fetching transaction ${txid}:`, error);
      return null;
    }
  }

  handleBlockchainUpdate(data) {
    // Update stats
    if (data.stats) {
      this.updateStats(data.stats);
    }
  }

  handleNewBlock(block) {
    // Add the new block to the world
    console.log("New block received:", block);

    // Find a position for the new building
    const centerX = 0;
    const centerZ = 0;
    const radius = 40;
    const angle = Math.random() * Math.PI * 2;
    const x = Math.floor(centerX + Math.cos(angle) * radius);
    const z = Math.floor(centerZ + Math.sin(angle) * radius);

    // Create building
    const building = this.engine.createBlockchainBuilding(block, x, z);

    // Update block count
    const blockCount = document.getElementById("block-count");
    blockCount.textContent = (parseInt(blockCount.textContent) + 1).toString();

    // Move some transactions to the new building
    this.moveTransactionsToBuilding(building);
  }

  moveTransactionsToBuilding(building) {
    // Find transaction characters to move
    const transactions = this.characterSystem.characters.filter(
      (c) => c.characterType === "transaction" && c.state === "waiting",
    );

    // Choose up to 5 random transactions
    const transactionsToMove = transactions.slice(0, 5);

    // Move each transaction to the building
    transactionsToMove.forEach((tx) => {
      // Calculate target position
      const targetPosition = new THREE.Vector3(
        building.position.x + Math.random() * 2 - 1,
        1,
        building.position.z + Math.random() * 2 - 1,
      );

      // Move character
      this.characterSystem.moveCharacterTo(tx, targetPosition, () => {
        // Fade out after reaching building
        setTimeout(() => {
          this.characterSystem.fadeOutCharacter(tx);
        }, 1000);
      });
    });

    // Update mempool size
    const mempoolSize = document.getElementById("mempool-size");
    const newSize = Math.max(
      0,
      parseInt(mempoolSize.textContent) - transactionsToMove.length,
    );
    mempoolSize.textContent = newSize.toString();
  }

  handleNewTransaction(tx) {
    console.log("New transaction received:", tx);

    // Create a transaction character
    this.fetchTransactionDetails(tx.txid).then((txDetails) => {
      if (txDetails) {
        this.characterSystem.createTransactionCharacter(txDetails);

        // Update mempool size
        const mempoolSize = document.getElementById("mempool-size");
        mempoolSize.textContent = (
          parseInt(mempoolSize.textContent) + 1
        ).toString();
      }
    });
  }

  showMiningActivity(data) {
    // Show mining UI
    this.miningUI.style.display = "block";
    this.miningUI.innerHTML = `
      <div class="mining-header">Mining in progress</div>
      <div class="mining-progress">
        <div class="progress-bar" style="width: 0%"></div>
      </div>
      <div class="mining-info">
        Mining ${data.blocks} blocks to ${data.address.substring(0, 8)}...
      </div>
    `;

    // Animate progress bar
    this.miningProgress = 0;
    this.miningInterval = setInterval(() => {
      this.miningProgress += 2;

      if (this.miningProgress >= 100) {
        clearInterval(this.miningInterval);
      }

      const progressBar = this.miningUI.querySelector(".progress-bar");
      progressBar.style.width = `${this.miningProgress}%`;
    }, 200);
  }

  completeMiningActivity(data) {
    // Complete the mining progress
    clearInterval(this.miningInterval);

    // Update mining UI
    this.miningUI.innerHTML = `
      <div class="mining-header">Mining complete!</div>
      <div class="mining-info">
        Successfully mined ${data.blockHashes.length} blocks
      </div>
    `;

    // Hide after a delay
    setTimeout(() => {
      this.miningUI.style.display = "none";
    }, 3000);

    // Add reward to inventory
    this.inventory.bitcoin += 6.25; // Block reward
    document.getElementById("bitcoin-balance").textContent =
      this.inventory.bitcoin.toFixed(8);

    // Update quest progress
    this.updateQuestProgress("mining_101", data.blockHashes.length);
  }

  handleBlockMined(block) {
    // Add mined material to inventory
    this.inventory.materials.stone += Math.floor(Math.random() * 3) + 1;

    // Update inventory if open
    if (this.inventoryUI.style.display !== "none") {
      this.updateInventoryUI();
    }

    // Update quest progress
    this.updateQuestProgress("mining_101", 1);
  }

  showBlockInfo(block) {
    // Show info about this block
    console.log("Block info:", block.blockData);

    // Create a notification
    const notification = document.createElement("div");
    notification.className = "quest-notification";
    notification.innerHTML = `
      <h3>Block Info</h3>
      <p>Type: ${block.blockData.type}</p>
      <p>Position: ${block.blockData.x}, ${block.blockData.y}, ${block.blockData.z}</p>
    `;

    // Add to document
    document.body.appendChild(notification);

    // Remove after a delay
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 3000);
  }

  toggleInventory() {
    if (this.inventoryUI.style.display === "none") {
      // Update and show inventory
      this.updateInventoryUI();
      this.inventoryUI.style.display = "block";

      // Pause game
      if (this.engine.controls.isLocked) {
        this.engine.controls.unlock();
      }
    } else {
      // Hide inventory
      this.inventoryUI.style.display = "none";

      // Resume game
      if (
        !this.engine.controls.isLocked &&
        !this.questUI.style.display !== "none"
      ) {
        this.engine.controls.lock();
      }
    }
  }

  updateInventoryUI() {
    // Create inventory content
    this.inventoryUI.innerHTML = `
      <div class="inventory-header">
        <h3>Inventory</h3>
        <button class="close-btn">×</button>
      </div>
      <div class="inventory-content">
        <div class="inventory-section">
          <h4>Currencies</h4>
          <div class="inventory-item">
            <img src="assets/items/coin.png" alt="Bitcoin">
            <span>${this.inventory.bitcoin.toFixed(8)} BTC</span>
          </div>
          ${Object.entries(this.inventory.tokens)
            .map(
              ([name, amount]) => `
            <div class="inventory-item">
              <img src="assets/items/coin.png" alt="${name}">
              <span>${amount} ${name}</span>
            </div>
          `,
            )
            .join("")}
        </div>

        <div class="inventory-section">
          <h4>Tools</h4>
          ${Object.entries(this.inventory.tools)
            .map(
              ([name, tool]) => `
            <div class="inventory-item">
              <img src="assets/items/${name}.png" alt="${name}">
              <span>${name.charAt(0).toUpperCase() + name.slice(1)} (Level ${tool.level})</span>
              <div class="durability-bar">
                <div class="durability-fill" style="width: ${tool.durability}%;"></div>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>

        <div class="inventory-section">
          <h4>Materials</h4>
          ${Object.entries(this.inventory.materials)
            .map(
              ([name, amount]) => `
            <div class="inventory-item">
              <img src="assets/items/${name}.png" alt="${name}">
              <span>${amount} ${name.charAt(0).toUpperCase() + name.slice(1)}</span>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `;

    // Add close button event
    this.inventoryUI
      .querySelector(".close-btn")
      .addEventListener("click", () => {
        this.toggleInventory();
      });
  }

  toggleQuests() {
    if (this.questUI.style.display === "none") {
      // Update and show quests
      this.updateQuestUI();
      this.questUI.style.display = "block";

      // Pause game
      if (this.engine.controls.isLocked) {
        this.engine.controls.unlock();
      }
    } else {
      // Hide quests
      this.questUI.style.display = "none";

      // Resume game
      if (
        !this.engine.controls.isLocked &&
        this.inventoryUI.style.display === "none"
      ) {
        this.engine.controls.lock();
      }
    }
  }

  updateQuestUI() {
    // Create quest content
    this.questUI.innerHTML = `
      <div class="quest-header">
        <h3>Quests</h3>
        <button class="close-btn">×</button>
      </div>
      <div class="quest-content">
        ${this.quests
          .map(
            (quest) => `
          <div class="quest-item ${quest.complete ? "complete" : ""}">
            <h4>${quest.title}</h4>
            <p>${quest.description}</p>
            <div class="quest-progress">
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${(quest.progress / quest.goal) * 100}%;"></div>
              </div>
              <span>${quest.progress}/${quest.goal}</span>
            </div>
            <div class="quest-reward">
              <h5>Reward:</h5>
              <p>${this.formatQuestReward(quest.reward)}</p>
            </div>
            ${quest.complete ? '<span class="quest-complete-badge">Complete</span>' : ""}
          </div>
        `,
          )
          .join("")}
      </div>
    `;

    // Add close button event
    this.questUI.querySelector(".close-btn").addEventListener("click", () => {
      this.toggleQuests();
    });
  }

  formatQuestReward(reward) {
    const parts = [];

    if (reward.bitcoin) {
      parts.push(`${reward.bitcoin} BTC`);
    }

    if (reward.tokens) {
      Object.entries(reward.tokens).forEach(([token, amount]) => {
        parts.push(`${amount} ${token}`);
      });
    }

    if (reward.materials) {
      Object.entries(reward.materials).forEach(([material, amount]) => {
        parts.push(
          `${amount} ${material.charAt(0).toUpperCase() + material.slice(1)}`,
        );
      });
    }

    return parts.join(", ");
  }

  updateQuestProgress(questId, progress) {
    // Find the quest
    const quest = this.quests.find((q) => q.id === questId);

    if (!quest || quest.complete) return;

    // Update progress
    quest.progress += progress;

    // Check if quest is complete
    if (quest.progress >= quest.goal) {
      quest.complete = true;

      // Award reward
      this.awardQuestReward(quest.reward);

      // Show completion notification
      this.showQuestCompleteNotification(quest);
    }

    // Update quest UI if open
    if (this.questUI.style.display !== "none") {
      this.updateQuestUI();
    }
  }

  awardQuestReward(reward) {
    if (reward.bitcoin) {
      this.inventory.bitcoin += reward.bitcoin;
      document.getElementById("bitcoin-balance").textContent =
        this.inventory.bitcoin.toFixed(8);
    }

    if (reward.tokens) {
      Object.entries(reward.tokens).forEach(([token, amount]) => {
        if (this.inventory.tokens[token]) {
          this.inventory.tokens[token] += amount;
        } else {
          this.inventory.tokens[token] = amount;
        }
      });
    }

    if (reward.materials) {
      Object.entries(reward.materials).forEach(([material, amount]) => {
        if (this.inventory.materials[material]) {
          this.inventory.materials[material] += amount;
        } else {
          this.inventory.materials[material] = amount;
        }
      });
    }
  }

  showQuestCompleteNotification(quest) {
    // Create notification
    const notification = document.createElement("div");
    notification.className = "quest-notification";
    notification.style.animation = "quest-notification 4s forwards";

    notification.innerHTML = `
      <h3>Quest Complete!</h3>
      <h4>${quest.title}</h4>
      <p>Reward: ${this.formatQuestReward(quest.reward)}</p>
    `;

    // Add to document
    document.body.appendChild(notification);

    // Remove after animation
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 4000);
  }

  update() {
    // Update character system
    const delta = 0.016; // Approximately 60fps
    this.characterSystem.update(delta);

    // Continue animation loop
    requestAnimationFrame(this.update);
  }
}
