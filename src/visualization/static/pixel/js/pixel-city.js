// PixelCityBlockchain - A pixel art visualization of the blockchain
class PixelCityBlockchain {
  constructor() {
    // Initialize PixiJS
    this.app = new PIXI.Application({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0x0a0a1a,
      resolution: window.devicePixelRatio || 1,
    });
    document.getElementById("game-container").appendChild(this.app.view);

    // Game state
    this.state = {
      blocks: [],
      mempool: [],
      buildings: [],
      characters: [],
      focusedEntity: null,
      timeOfDay: 0, // 0-24 for day-night cycle
      gameTime: 0,
      camera: {
        x: 0,
        y: 0,
        scale: 1,
        targetScale: 1,
        dragging: false,
        lastPosition: null,
      },
    };

    // Container for all game objects
    this.worldContainer = new PIXI.Container();
    this.app.stage.addChild(this.worldContainer);

    // Separate containers for layers
    this.backgroundLayer = new PIXI.Container();
    this.buildingLayer = new PIXI.Container();
    this.characterLayer = new PIXI.Container();
    this.effectsLayer = new PIXI.Container();
    this.uiLayer = new PIXI.Container();

    this.worldContainer.addChild(this.backgroundLayer);
    this.worldContainer.addChild(this.buildingLayer);
    this.worldContainer.addChild(this.characterLayer);
    this.worldContainer.addChild(this.effectsLayer);
    this.app.stage.addChild(this.uiLayer);

    // Connect to WebSocket (socket.io)
    this.socket = io();

    // Set up event listeners
    this.setupEventListeners();

    // Start game loop
    this.app.ticker.add(this.gameLoop.bind(this));

    // Initialize game
    this.initialize();
  }

  // Initialize the game
  async initialize() {
    try {
      // Load assets
      await this.loadAssets();

      // Create the city grid
      this.createCityGrid();

      // Fetch initial blockchain data
      await this.fetchBlockchainData();

      // Hide loading screen
      document.getElementById("loading-screen").style.display = "none";

      // Add intro animation
      this.playIntroAnimation();
    } catch (error) {
      console.error("Error initializing game:", error);
      document.getElementById("loading-text").textContent =
        "Error loading game: " + error.message;
    }
  }

  // Load game assets
  async loadAssets() {
    return new Promise((resolve, reject) => {
      // For now, we'll resolve immediately without loading real assets
      // In a real implementation, you would load sprites and textures here

      // Simulate loading progress
      let progress = 0;
      const loadingInterval = setInterval(() => {
        progress += 10;
        document.getElementById("loading-bar").style.width = `${progress}%`;
        document.getElementById("loading-text").textContent =
          `Loading assets... ${progress}%`;

        if (progress >= 100) {
          clearInterval(loadingInterval);
          resolve();
        }
      }, 200);
    });
  }

  // Create the city background grid
  createCityGrid() {
    // Create sky background (blue rectangle)
    const sky = new PIXI.Graphics();
    sky.beginFill(0x4477aa);
    sky.drawRect(
      -window.innerWidth,
      -window.innerHeight,
      window.innerWidth * 3,
      window.innerHeight * 2,
    );
    sky.endFill();
    this.backgroundLayer.addChild(sky);

    // Add some clouds
    for (let i = 0; i < 10; i++) {
      const cloud = new PIXI.Graphics();
      cloud.beginFill(0xffffff, 0.8);

      // Cloud shape
      cloud.drawEllipse(0, 0, 30 + Math.random() * 50, 20 + Math.random() * 20);

      // Position
      cloud.x = Math.random() * window.innerWidth * 2 - window.innerWidth;
      cloud.y = Math.random() * 200;

      // Add properties for animation
      cloud.speed = 0.1 + Math.random() * 0.2;

      this.backgroundLayer.addChild(cloud);

      // Add to an array so we can animate them
      if (!this.clouds) this.clouds = [];
      this.clouds.push(cloud);
    }

    // Create ground
    const ground = new PIXI.Graphics();
    ground.beginFill(0x225522);
    ground.drawRect(
      -window.innerWidth,
      300,
      window.innerWidth * 3,
      window.innerHeight,
    );
    ground.endFill();

    // Add some texture to the ground
    for (let x = -window.innerWidth; x < window.innerWidth * 2; x += 20) {
      for (let y = 300; y < window.innerHeight + 300; y += 20) {
        if (Math.random() > 0.8) {
          const grassTuft = new PIXI.Graphics();
          grassTuft.beginFill(0x338833);
          grassTuft.drawRect(x, y, 6, 6);
          grassTuft.endFill();
          ground.addChild(grassTuft);
        }
      }
    }

    this.backgroundLayer.addChild(ground);
  }

  // Fetch blockchain data from API
  async fetchBlockchainData() {
    try {
      const response = await fetch("/api/blockchain");
      const data = await response.json();

      // Update stats display
      document.getElementById("block-count").textContent =
        data.stats.blockCount;
      document.getElementById("tx-count").textContent = data.stats.totalTxCount;
      document.getElementById("mempool-size").textContent =
        data.mempool.txCount;

      // Process blocks
      this.processBlocks(data.blocks);

      // Process mempool
      this.processMempool(data.mempool);

      return data;
    } catch (error) {
      console.error("Error fetching blockchain data:", error);
      throw error;
    }
  }

  // Process block data into buildings
  processBlocks(blocks) {
    // Clear existing buildings if needed
    if (this.state.buildings.length === 0) {
      // First time - add all blocks as buildings
      blocks.forEach((block, index) => {
        this.addBuilding(block, index);
      });
    } else {
      // Check for new blocks
      const knownHashes = this.state.blocks.map((b) => b.hash);

      blocks.forEach((block, index) => {
        if (!knownHashes.includes(block.hash)) {
          // New block found - add at the beginning
          this.addBuilding(block, 0, true);
        }
      });
    }

    // Update state
    this.state.blocks = [...blocks];
  }

  // Process mempool data into waiting characters
  processMempool(mempool) {
    // Clear existing characters
    this.characterLayer.removeChildren();
    this.state.characters = [];

    // Add characters for each mempool transaction
    const centerX = 0;
    const centerY = 300;
    const radius = 150;

    mempool.txids.slice(0, 30).forEach((txid, index) => {
      const angle = (index / 30) * Math.PI * 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      // Add a character for this transaction
      this.addCharacter(txid, x, y, "waiting");
    });
  }

  // Add a building to represent a block
  addBuilding(block, position, isNew = false) {
    // Calculate building size based on block properties
    const baseWidth = 80;
    const baseHeight = 120;
    const sizeMultiplier = 0.5 + (block.txCount / 10) * 0.5; // Size based on tx count
    const width = baseWidth * sizeMultiplier;
    const height = baseHeight * sizeMultiplier;

    // Create building (simple rectangle for now)
    const building = new PIXI.Graphics();

    // Choose color based on block height
    const colors = [0x8844aa, 0x4488cc, 0xcc8844];
    const color = colors[block.height % colors.length];

    // Draw building
    building.beginFill(color);
    building.drawRect(0, 0, width, height);
    building.endFill();

    // Draw windows
    building.beginFill(0xffff88, 0.8);
    for (let y = 20; y < height - 20; y += 30) {
      for (let x = 10; x < width - 10; x += 30) {
        if (Math.random() > 0.3) {
          // Some windows are dark
          building.drawRect(x, y, 10, 10);
        }
      }
    }
    building.endFill();

    // Position building
    const gridSpacing = baseWidth * 1.5;
    building.x = position * gridSpacing;
    building.y = 300 - height; // Place on ground

    // Store block data with the building
    building.blockData = block;

    // Add to building layer
    if (isNew) {
      this.buildingLayer.addChildAt(building, 0);
    } else {
      this.buildingLayer.addChild(building);
    }

    // Store in state
    if (isNew) {
      this.state.buildings.unshift(building);
    } else {
      this.state.buildings.push(building);
    }

    // Add animation for new buildings
    if (isNew) {
      building.alpha = 0;
      building.scale.set(0.1);

      // Animate the building appearing
      gsap.to(building, {
        alpha: 1,
        duration: 1,
      });

      gsap.to(building.scale, {
        x: 1,
        y: 1,
        duration: 1,
        ease: "elastic.out(1, 0.5)",
      });

      // Add coin animation
      for (let i = 0; i < 10; i++) {
        const coin = new PIXI.Graphics();
        coin.beginFill(0xffcc00);
        coin.drawCircle(0, 0, 5);
        coin.endFill();

        coin.x = building.x + building.width / 2;
        coin.y = building.y;

        this.effectsLayer.addChild(coin);

        // Animate coin
        gsap.to(coin, {
          x: coin.x + Math.random() * 100 - 50,
          y: coin.y - 100 - Math.random() * 100,
          alpha: 0,
          rotation: Math.random() * Math.PI * 4,
          duration: 2,
          onComplete: () => {
            this.effectsLayer.removeChild(coin);
          },
        });
      }
    }

    // Make building interactive
    building.interactive = true;
    building.buttonMode = true;

    // Click event to show block details
    building.on("pointerdown", () => {
      this.showBlockDetails(block);
    });

    // Hover events
    building.on("pointerover", (event) => {
      building.tint = 0xffcc00;
      this.showTooltip(
        `Block #${block.height}`,
        event.data.global.x,
        event.data.global.y,
      );
    });

    building.on("pointerout", () => {
      building.tint = 0xffffff;
      this.hideTooltip();
    });

    return building;
  }

  // Add a character to represent a transaction
  addCharacter(txid, x, y, state = "waiting") {
    // Create a simple character (circle for now)
    const character = new PIXI.Graphics();

    // Choose color based on txid
    const colors = [0x44aa88, 0xaa4488, 0xaaaa44];
    const color = colors[parseInt(txid.substring(0, 2), 16) % colors.length];

    character.beginFill(color);
    character.drawCircle(0, 0, 10);
    character.endFill();

    // Draw a simple face
    character.beginFill(0xffffff);
    character.drawCircle(-3, -2, 2); // Left eye
    character.drawCircle(3, -2, 2); // Right eye
    character.endFill();

    character.beginFill(0x000000);
    character.drawCircle(-3, -2, 1); // Left pupil
    character.drawCircle(3, -2, 1); // Right pupil
    character.endFill();

    character.lineStyle(1, 0x000000);
    character.arc(0, 2, 3, 0, Math.PI); // Smile

    // Position character
    character.x = x;
    character.y = y;

    // Store transaction data with the character
    character.txid = txid;
    character.state = state;

    // Add to character layer
    this.characterLayer.addChild(character);

    // Add to state
    this.state.characters.push(character);

    // Add animations based on state
    if (state === "waiting") {
      // Idle animation
      gsap.to(character, {
        y: character.y - 5,
        duration: 0.5 + Math.random() * 0.5,
        repeat: -1,
        yoyo: true,
      });
    }

    // Make character interactive
    character.interactive = true;
    character.buttonMode = true;

    // Click event to show transaction details
    character.on("pointerdown", () => {
      this.showTransactionDetails(txid);
    });

    // Hover events
    character.on("pointerover", (event) => {
      character.tint = 0xffcc00;
      this.showTooltip(
        `TX: ${txid.substring(0, 8)}...`,
        event.data.global.x,
        event.data.global.y,
      );
    });

    character.on("pointerout", () => {
      character.tint = 0xffffff;
      this.hideTooltip();
    });

    return character;
  }

  // Move a character to a building (for transaction confirmation)
  moveCharacterToBuilding(character, building) {
    // Set state to moving
    character.state = "moving";

    // Stop any existing animations
    gsap.killTweensOf(character);

    // Calculate target position
    const targetX = building.x + building.width / 2;
    const targetY = building.y + building.height - 20;

    // Animate movement
    gsap.to(character, {
      x: targetX,
      y: targetY,
      duration: 2,
      ease: "power1.inOut",
      onComplete: () => {
        // Character reached the building
        character.state = "confirmed";

        // Fade out and remove
        gsap.to(character, {
          alpha: 0,
          duration: 0.5,
          onComplete: () => {
            this.characterLayer.removeChild(character);
            this.state.characters = this.state.characters.filter(
              (c) => c !== character,
            );
          },
        });
      },
    });

    return character;
  }

  // Show tooltip
  showTooltip(text, x, y) {
    const tooltip = document.getElementById("tooltip");
    tooltip.textContent = text;
    tooltip.style.left = `${x + 10}px`;
    tooltip.style.top = `${y - 30}px`;
    tooltip.style.opacity = "1";
  }

  // Hide tooltip
  hideTooltip() {
    const tooltip = document.getElementById("tooltip");
    tooltip.style.opacity = "0";
  }

  // Show block details
  showBlockDetails(block) {
    const detailsPanel = document.getElementById("details-panel");
    const detailsContent = document.getElementById("details-content");

    detailsContent.innerHTML = `
        <h3 style="color: #f7931a; margin-top: 0;">BLOCK #${block.height}</h3>
        <div>Hash: ${block.hash.substring(0, 20)}...</div>
        <div>Time: ${new Date(block.time * 1000).toLocaleString()}</div>
        <div>Transactions: ${block.txCount}</div>
        <div>Size: ${block.size} bytes</div>
        <div>Weight: ${block.weight}</div>
        <div>Difficulty: ${block.difficulty.toFixed(2)}</div>
    `;

    detailsPanel.style.display = "block";
  }

  // Show transaction details
  async showTransactionDetails(txid) {
    const detailsPanel = document.getElementById("details-panel");
    const detailsContent = document.getElementById("details-content");

    // Show loading
    detailsContent.innerHTML = `
        <h3 style="color: #f7931a; margin-top: 0;">TRANSACTION</h3>
        <div>Loading transaction details...</div>
    `;

    detailsPanel.style.display = "block";

    try {
      // Fetch transaction details
      const response = await fetch(`/api/tx/${txid}`);
      const tx = await response.json();

      // Update panel with details
      detailsContent.innerHTML = `
            <h3 style="color: #f7931a; margin-top: 0;">TRANSACTION</h3>
            <div>TxID: ${tx.txid.substring(0, 20)}...</div>
            <div>Size: ${tx.size} bytes</div>
            <div>Inputs: ${tx.vin.length}</div>
            <div>Outputs: ${tx.vout.length}</div>
            <div>Status: ${tx.confirmations ? `Confirmed (${tx.confirmations})` : "Unconfirmed"}</div>
        `;
    } catch (error) {
      detailsContent.innerHTML = `
            <h3 style="color: #f7931a; margin-top: 0;">TRANSACTION</h3>
            <div>Error loading transaction: ${error.message}</div>
        `;
    }
  }

  // Play intro animation
  playIntroAnimation() {
    // Camera animation
    gsap.to(this.state.camera, {
      x: 200,
      y: 100,
      duration: 3,
      ease: "power2.inOut",
    });

    gsap.to(this.state.camera, {
      targetScale: 0.8,
      duration: 3,
      ease: "power2.inOut",
    });
  }

  // Setup event listeners
  setupEventListeners() {
    // Socket events
    this.socket.on("connect", () => {
      console.log("Connected to server");
    });

    this.socket.on("blockchain_update", (data) => {
      // Update stats display
      document.getElementById("block-count").textContent =
        data.stats.blockCount;
      document.getElementById("tx-count").textContent = data.stats.totalTxCount;
      document.getElementById("mempool-size").textContent =
        data.mempool.txCount;

      // Process blocks
      this.processBlocks(data.blocks);

      // Process mempool
      this.processMempool(data.mempool);
    });

    this.socket.on("new_block", (block) => {
      // Add new block at the beginning
      this.addBuilding(block, 0, true);

      // Add to state blocks
      this.state.blocks.unshift(block);

      // Move some characters to the new building
      const building = this.state.buildings[0];

      // Find characters in waiting state
      const waitingCharacters = this.state.characters
        .filter((char) => char.state === "waiting")
        .slice(0, 5); // Limit to 5 characters

      // Move characters to the building
      waitingCharacters.forEach((character) => {
        this.moveCharacterToBuilding(character, building);
      });

      // Update stats display
      document.getElementById("block-count").textContent = (
        parseInt(document.getElementById("block-count").textContent) + 1
      ).toString();

      // Update compass direction
      this.updateCompassDirection();
    });

    this.socket.on("new_transaction", (tx) => {
      // Add new character for the transaction
      const centerX = 0;
      const centerY = 300;
      const radius = 150;
      const angle = Math.random() * Math.PI * 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      this.addCharacter(tx.txid, x, y, "waiting");

      // Update stats display
      document.getElementById("mempool-size").textContent = (
        parseInt(document.getElementById("mempool-size").textContent) + 1
      ).toString();

      // Update compass direction
      this.updateCompassDirection();
    });

    // UI button events
    document.getElementById("mine-btn").addEventListener("click", () => {
      // Send mine block request
      this.socket.emit("mine_block", { blocks: 1 });
    });

    document.getElementById("tx-btn").addEventListener("click", async () => {
      // Create a random transaction
      try {
        const wallets = await this.getWallets();

        if (wallets.length < 2) {
          alert("Need at least 2 wallets to create a transaction");
          return;
        }

        // Find a wallet with funds
        const sourceWallet = wallets[0];
        const destWallet = wallets[1];

        // Get destination address
        const response = await fetch(`/api/new-address?wallet=${destWallet}`);
        const data = await response.json();
        const address = data.address;

        // Create transaction
        this.socket.emit("create_transaction", {
          fromWallet: sourceWallet,
          toAddress: address,
          amount: 0.001 + Math.random() * 0.01,
        });
      } catch (error) {
        console.error("Error creating transaction:", error);
        alert("Error creating transaction: " + error.message);
      }
    });

    document.getElementById("zoom-in-btn").addEventListener("click", () => {
      this.state.camera.targetScale = Math.min(
        2,
        this.state.camera.targetScale + 0.2,
      );
    });

    document.getElementById("zoom-out-btn").addEventListener("click", () => {
      this.state.camera.targetScale = Math.max(
        0.5,
        this.state.camera.targetScale - 0.2,
      );
    });

    // Close details panel
    document.getElementById("details-close").addEventListener("click", () => {
      document.getElementById("details-panel").style.display = "none";
    });

    // View toggle button
    document.getElementById("view-toggle").addEventListener("click", () => {
      window.location.href = "index.html";
    });

    // Dragging functionality
    this.app.view.addEventListener("mousedown", (e) => {
      this.state.camera.dragging = true;
      this.state.camera.lastPosition = { x: e.clientX, y: e.clientY };
    });

    this.app.view.addEventListener("touchstart", (e) => {
      this.state.camera.dragging = true;
      this.state.camera.lastPosition = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    });

    window.addEventListener("mouseup", () => {
      this.state.camera.dragging = false;
    });

    window.addEventListener("touchend", () => {
      this.state.camera.dragging = false;
    });

    this.app.view.addEventListener("mousemove", (e) => {
      if (this.state.camera.dragging && this.state.camera.lastPosition) {
        const dx = e.clientX - this.state.camera.lastPosition.x;
        const dy = e.clientY - this.state.camera.lastPosition.y;

        this.state.camera.x += dx;
        this.state.camera.y += dy;

        this.state.camera.lastPosition = { x: e.clientX, y: e.clientY };
      }
    });

    this.app.view.addEventListener("touchmove", (e) => {
      if (this.state.camera.dragging && this.state.camera.lastPosition) {
        const dx = e.touches[0].clientX - this.state.camera.lastPosition.x;
        const dy = e.touches[0].clientY - this.state.camera.lastPosition.y;

        this.state.camera.x += dx;
        this.state.camera.y += dy;

        this.state.camera.lastPosition = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
      }
    });

    // Window resize
    window.addEventListener("resize", () => {
      this.app.renderer.resize(window.innerWidth, window.innerHeight);
    });
  }

  // Update compass direction based on recent transaction flow
  updateCompassDirection() {
    // Get the compass elements
    const compassArrow = document.getElementById("compass-arrow");
    const compassLabel = document.getElementById("compass-label");

    // Determine direction based on recent activity
    // This is just a placeholder - in a real implementation, you would
    // analyze the actual transaction flow
    const direction = Math.random() * 360;

    // Rotate the compass arrow
    compassArrow.style.transform = `rotate(${direction}deg)`;

    // Update the label
    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const dirIndex = Math.floor(((direction + 22.5) % 360) / 45);
    compassLabel.textContent = directions[dirIndex];
  }

  // Get wallet list
  async getWallets() {
    try {
      const response = await fetch("/api/wallets");
      const data = await response.json();
      return data.wallets;
    } catch (error) {
      console.error("Error fetching wallets:", error);
      return [];
    }
  }

  // Main game loop
  gameLoop(delta) {
    // Update camera
    this.state.camera.scale +=
      (this.state.camera.targetScale - this.state.camera.scale) * 0.1;

    this.worldContainer.position.set(
      window.innerWidth / 2 + this.state.camera.x,
      window.innerHeight / 2 + this.state.camera.y,
    );

    this.worldContainer.scale.set(this.state.camera.scale);

    // Update clouds
    if (this.clouds) {
      this.clouds.forEach((cloud) => {
        cloud.x += cloud.speed;

        // Wrap around screen
        if (cloud.x > window.innerWidth) {
          cloud.x = -cloud.width;
        }
      });
    }

    // Update time of day
    this.state.gameTime += delta * 0.01;
    this.state.timeOfDay = this.state.gameTime % 24;

    // Update time display
    const hours = Math.floor(this.state.timeOfDay);
    const minutes = Math.floor((this.state.timeOfDay - hours) * 60);
    document.getElementById("game-time").textContent =
      `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;

    // Day-night cycle
    const nightOpacity =
      this.state.timeOfDay > 18 || this.state.timeOfDay < 6
        ? Math.min(
            0.5,
            Math.abs(
              (this.state.timeOfDay > 18
                ? 24 - this.state.timeOfDay
                : this.state.timeOfDay) - 6,
            ) * 0.1,
          )
        : 0;

    document.getElementById("time-cycle").style.opacity =
      nightOpacity.toString();
  }
}

// When document is loaded, create the game
document.addEventListener("DOMContentLoaded", () => {
  // Setup loading bar first
  let loadingProgress = 0;
  const loadingInterval = setInterval(() => {
    loadingProgress += 5;
    if (loadingProgress > 100) {
      clearInterval(loadingInterval);
      return;
    }
    document.getElementById("loading-bar").style.width = `${loadingProgress}%`;
  }, 100);

  // Create the game
  window.game = new PixelCityBlockchain();
});
