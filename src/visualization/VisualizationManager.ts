import * as path from "path";
import * as fs from "fs-extra";
import * as open from "open";
import { BitcoinRpcClient } from "../core/rpc";
import { BlockchainDataService } from "./data/blockchain-data";
import { VisualizationServer } from "./server/http-server";
import { ConfigManager } from "../core/config";
import { Canvas } from "canvas";
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
   * Creates the Minecraft-style visualization files
   */
  private async createMinecraftVisualization(): Promise<void> {
    try {
      // Create directories
      await fs.ensureDir(path.join(this.staticDir, "js"));
      await fs.ensureDir(path.join(this.staticDir, "assets/blocks"));
      await fs.ensureDir(path.join(this.staticDir, "assets/characters"));
      await fs.ensureDir(path.join(this.staticDir, "assets/items"));
      await fs.ensureDir(path.join(this.staticDir, "assets/environment"));
      await fs.ensureDir(path.join(this.staticDir, "assets/fonts"));
      await fs.ensureDir(path.join(this.staticDir, "styles"));

      // Copy main HTML file
      const htmlContent = fs.readFileSync(
        path.join(__dirname, "minecraft/index.html"),
        "utf8",
      );
      await fs.writeFile(
        path.join(this.staticDir, "index-minecraft.html"),
        htmlContent,
      );

      // Copy CSS file
      const cssContent = fs.readFileSync(
        path.join(__dirname, "minecraft/styles/minecraft-style.css"),
        "utf8",
      );
      await fs.writeFile(
        path.join(this.staticDir, "styles/minecraft-style.css"),
        cssContent,
      );

      // Copy JavaScript files
      const voxelEngineContent = fs.readFileSync(
        path.join(__dirname, "minecraft/js/voxel-engine.js"),
        "utf8",
      );
      await fs.writeFile(
        path.join(this.staticDir, "js/voxel-engine.js"),
        voxelEngineContent,
      );

      const characterSystemContent = fs.readFileSync(
        path.join(__dirname, "minecraft/js/character-system.js"),
        "utf8",
      );
      await fs.writeFile(
        path.join(this.staticDir, "js/character-system.js"),
        characterSystemContent,
      );

      const blockchainIntegrationContent = fs.readFileSync(
        path.join(__dirname, "minecraft/js/blockchain-game-integration.js"),
        "utf8",
      );
      await fs.writeFile(
        path.join(this.staticDir, "js/blockchain-game-integration.js"),
        blockchainIntegrationContent,
      );

      // Create assets
      await this.createMinecraftAssets();

      console.log(
        chalk.green("Minecraft-style visualization created successfully"),
      );
    } catch (error) {
      console.error("Error creating Minecraft visualization:", error);
    }
  }

  /**
   * Creates placeholder assets for the Minecraft visualization
   */
  private async createMinecraftAssets(): Promise<void> {
    // Helper function to create a simple colored rectangle as a placeholder
    const createPlaceholderImage = async (
      filename: string,
      color: string,
      width: number,
      height: number,
    ) => {
      try {
        const canvas = new Canvas(width, height);
        const ctx = canvas.getContext("2d");

        // Fill background
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, width, height);

        // Add some pixel-art detail
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        for (let x = 0; x < width; x += 4) {
          for (let y = 0; y < height; y += 4) {
            if (Math.random() > 0.8) {
              ctx.fillRect(x, y, 2, 2);
            }
          }
        }

        const buffer = canvas.toBuffer("image/png");
        await fs.writeFile(path.join(this.staticDir, filename), buffer);
      } catch (error) {
        console.error(`Error creating placeholder image ${filename}:`, error);

        // Fallback for environments without Canvas support
        const buffer = Buffer.from([
          0x89,
          0x50,
          0x4e,
          0x47,
          0x0d,
          0x0a,
          0x1a,
          0x0a, // PNG signature
          0x00,
          0x00,
          0x00,
          0x0d, // IHDR chunk length
          0x49,
          0x48,
          0x44,
          0x52, // "IHDR"
          0x00,
          0x00,
          0x00,
          0x10, // width: 16
          0x00,
          0x00,
          0x00,
          0x10, // height: 16
          0x08,
          0x02,
          0x00,
          0x00,
          0x00, // bit depth, color type, compression, filter, interlace
          0x90,
          0x1b,
          0xd9,
          0x28, // CRC
          0x00,
          0x00,
          0x00,
          0x01, // IDAT chunk length
          0x49,
          0x44,
          0x41,
          0x54, // "IDAT"
          0x08, // 8 bit data
          0xd7,
          0x64,
          0xc3,
          0xd7, // CRC
          0x00,
          0x00,
          0x00,
          0x00, // IEND chunk length
          0x49,
          0x45,
          0x4e,
          0x44, // "IEND"
          0xae,
          0x42,
          0x60,
          0x82, // CRC
        ]);

        await fs.writeFile(path.join(this.staticDir, filename), buffer);
      }
    };

    // Create block textures
    await createPlaceholderImage("assets/blocks/grass.png", "#55AA55", 16, 16);
    await createPlaceholderImage("assets/blocks/stone.png", "#888888", 16, 16);
    await createPlaceholderImage("assets/blocks/gold.png", "#FFCC00", 16, 16);
    await createPlaceholderImage(
      "assets/blocks/building.png",
      "#AA8866",
      16,
      16,
    );

    // Create character textures
    await createPlaceholderImage(
      "assets/characters/miner.png",
      "#FFAA00",
      16,
      32,
    );
    await createPlaceholderImage(
      "assets/characters/transaction.png",
      "#00AAFF",
      16,
      32,
    );
    await createPlaceholderImage(
      "assets/characters/trader.png",
      "#AA00FF",
      16,
      32,
    );
    await createPlaceholderImage(
      "assets/characters/validator.png",
      "#00FFAA",
      16,
      32,
    );

    // Create item textures
    await createPlaceholderImage("assets/items/pickaxe.png", "#8B4513", 16, 16);
    await createPlaceholderImage("assets/items/shovel.png", "#A9A9A9", 16, 16);
    await createPlaceholderImage("assets/items/axe.png", "#CD853F", 16, 16);
    await createPlaceholderImage("assets/items/sword.png", "#C0C0C0", 16, 16);
    await createPlaceholderImage("assets/items/compass.png", "#FF4500", 16, 16);
    await createPlaceholderImage("assets/items/coin.png", "#FFD700", 16, 16);

    // Create environment textures
    await createPlaceholderImage(
      "assets/environment/sky.png",
      "#87CEEB",
      64,
      64,
    );
    await createPlaceholderImage(
      "assets/environment/ground.png",
      "#556B2F",
      16,
      16,
    );
    await createPlaceholderImage(
      "assets/environment/cloud.png",
      "#FFFFFF",
      32,
      16,
    );

    // Create a placeholder font file
    const emptyFont = Buffer.from([0]);
    await fs.writeFile(
      path.join(this.staticDir, "assets/fonts/minecraft.woff2"),
      emptyFont,
    );
  }

  /**
   * Update the existing ensureVisualizationFiles method to include Minecraft visualization
   */
  private async ensureVisualizationFiles(): Promise<void> {
    try {
      // Check if static directory exists
      if (!(await fs.pathExists(this.staticDir))) {
        await fs.ensureDir(this.staticDir);

        // Copy standard visualization files
        await this.createAdvancedVisualizationFiles();

        // Create pixel art visualization files
        await this.createPixelArtVisualization();

        // Create Minecraft-style visualization files
        await this.createMinecraftVisualization();
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
            await this.createPixelArtVisualization();
            await this.createMinecraftVisualization();
          }
        }

        // Check if Minecraft visualization exists
        const minecraftHtmlPath = path.join(
          this.staticDir,
          "index-minecraft.html",
        );
        if (!(await fs.pathExists(minecraftHtmlPath))) {
          console.log(chalk.yellow("Adding Minecraft-style visualization..."));
          await this.createMinecraftVisualization();
        }
      }
    } catch (error) {
      console.error("Error ensuring visualization files:", error);
    }
  }

  /**
   * Creates the pixel art visualization files
   */
  private async createPixelArtVisualization(): Promise<void> {
    try {
      // Create necessary directories
      await fs.ensureDir(path.join(this.staticDir, "assets/buildings"));
      await fs.ensureDir(path.join(this.staticDir, "assets/characters"));
      await fs.ensureDir(path.join(this.staticDir, "assets/environment"));
      await fs.ensureDir(path.join(this.staticDir, "assets/items"));
      await fs.ensureDir(path.join(this.staticDir, "sounds"));
      await fs.ensureDir(path.join(this.staticDir, "js"));

      // Create index-pixel.html for the pixel art visualization
      const pixelHtml = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Blockchain Pixel City</title>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.5.4/socket.io.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/pixi.js/6.5.2/browser/pixi.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.11.4/gsap.min.js"></script>
      <style>
          body, html {
              margin: 0;
              padding: 0;
              overflow: hidden;
              background-color: #0a0a1a;
              font-family: 'Courier New', monospace;
          }

          #game-container {
              position: absolute;
              top: 0;
              left: 0;
              width: 100vw;
              height: 100vh;
              z-index: 1;
          }

          #ui-overlay {
              position: absolute;
              top: 0;
              left: 0;
              width: 100vw;
              height: 100vh;
              pointer-events: none;
              z-index: 2;
          }

          #stats-panel {
              position: absolute;
              top: 10px;
              left: 10px;
              background-color: rgba(0, 0, 0, 0.7);
              border: 2px solid #f7931a;
              border-radius: 5px;
              padding: 10px;
              color: #fff;
              font-size: 12px;
              pointer-events: auto;
          }

          #controls {
              position: absolute;
              bottom: 10px;
              right: 10px;
              display: flex;
              gap: 5px;
              pointer-events: auto;
          }

          .pixel-button {
              background-color: #f7931a;
              border: none;
              color: white;
              padding: 8px 16px;
              font-family: 'Courier New', monospace;
              font-size: 10px;
              cursor: pointer;
              position: relative;
              image-rendering: pixelated;
          }

          .loading-screen {
              position: fixed;
              top: 0;
              left: 0;
              width: 100vw;
              height: 100vh;
              background-color: #0a0a1a;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              z-index: 100;
          }

          .loading-bar-container {
              width: 200px;
              height: 20px;
              background-color: #333;
              border: 2px solid #f7931a;
              margin-top: 20px;
          }

          .loading-bar {
              height: 100%;
              width: 0%;
              background-color: #f7931a;
              transition: width 0.2s;
          }

          .pixel-title {
              color: #f7931a;
              font-size: 24px;
              margin-bottom: 20px;
              text-shadow: 4px 4px 0px rgba(0,0,0,0.8);
          }

          .tooltip {
              position: absolute;
              background-color: #111;
              border: 2px solid #f7931a;
              padding: 8px;
              color: white;
              font-size: 10px;
              pointer-events: none;
              z-index: 10;
              opacity: 0;
              transition: opacity 0.2s;
          }

          #details-panel {
              position: absolute;
              right: 10px;
              top: 10px;
              width: 300px;
              background-color: rgba(0, 0, 0, 0.8);
              border: 2px solid #f7931a;
              border-radius: 5px;
              padding: 10px;
              color: #fff;
              font-size: 10px;
              display: none;
              pointer-events: auto;
          }

          #details-close {
              position: absolute;
              top: 5px;
              right: 5px;
              cursor: pointer;
              font-size: 12px;
          }

          #time-cycle {
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background-color: rgba(0, 0, 100, 0.2);
              z-index: 1;
              pointer-events: none;
              opacity: 0;
              transition: opacity 10s;
          }

          #compass {
              position: absolute;
              bottom: 20px;
              left: 20px;
              width: 100px;
              height: 100px;
              background-color: rgba(0, 0, 0, 0.5);
              border: 2px solid #f7931a;
              border-radius: 50%;
              pointer-events: auto;
          }

          #compass-arrow {
              position: absolute;
              top: 10px;
              left: 48px;
              width: 4px;
              height: 40px;
              background-color: #f7931a;
              transform-origin: bottom center;
          }

          #compass-label {
              position: absolute;
              bottom: 10px;
              width: 100%;
              text-align: center;
              color: white;
              font-size: 10px;
          }

          #view-toggle {
              position: absolute;
              top: 10px;
              right: 10px;
              background-color: #f7931a;
              color: white;
              border: none;
              padding: 8px 16px;
              font-size: 12px;
              cursor: pointer;
              pointer-events: auto;
          }
      </style>
  </head>
  <body>
      <div class="loading-screen" id="loading-screen">
          <div class="pixel-title">BLOCKCHAIN PIXEL CITY</div>
          <div class="loading-bar-container">
              <div class="loading-bar" id="loading-bar"></div>
          </div>
          <div id="loading-text" style="color: white; margin-top: 10px; font-size: 12px;">Loading resources...</div>
      </div>

      <div id="game-container"></div>

      <div id="ui-overlay">
          <button id="view-toggle">Switch to Standard View</button>

          <div id="stats-panel">
              <div>BLOCKS: <span id="block-count">0</span></div>
              <div>TXs: <span id="tx-count">0</span></div>
              <div>MEMPOOL: <span id="mempool-size">0</span></div>
              <div>TIME: <span id="game-time">00:00</span></div>
          </div>

          <div id="compass">
              <div id="compass-arrow"></div>
              <div id="compass-label">NORTH</div>
          </div>

          <div id="controls">
              <button class="pixel-button" id="mine-btn">MINE BLOCK</button>
              <button class="pixel-button" id="tx-btn">NEW TX</button>
              <button class="pixel-button" id="zoom-in-btn">ZOOM+</button>
              <button class="pixel-button" id="zoom-out-btn">ZOOM-</button>
          </div>

          <div id="details-panel">
              <div id="details-close">X</div>
              <div id="details-content"></div>
          </div>

          <div id="time-cycle"></div>
      </div>

      <div class="tooltip" id="tooltip"></div>

      <script src="js/pixel-city.js"></script>
  </body>
  </html>
      `;

      await fs.writeFile(
        path.join(this.staticDir, "index-pixel.html"),
        pixelHtml,
      );

      // Create pixel-city.js for the pixel art visualization
      const pixelCityJs = `// PixelCityBlockchain - A pixel art visualization of the blockchain
  class PixelCityBlockchain {
      constructor() {
          // Initialize PixiJS
          this.app = new PIXI.Application({
              width: window.innerWidth,
              height: window.innerHeight,
              backgroundColor: 0x0a0a1a,
              resolution: window.devicePixelRatio || 1,
          });
          document.getElementById('game-container').appendChild(this.app.view);

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
                  lastPosition: null
              }
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
              document.getElementById('loading-screen').style.display = 'none';

              // Add intro animation
              this.playIntroAnimation();
          } catch (error) {
              console.error('Error initializing game:', error);
              document.getElementById('loading-text').textContent = 'Error loading game: ' + error.message;
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
                  document.getElementById('loading-bar').style.width = \`\${progress}%\`;
                  document.getElementById('loading-text').textContent = \`Loading assets... \${progress}%\`;

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
          sky.drawRect(-window.innerWidth, -window.innerHeight, window.innerWidth * 3, window.innerHeight * 2);
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
          ground.drawRect(-window.innerWidth, 300, window.innerWidth * 3, window.innerHeight);
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
              const response = await fetch('/api/blockchain');
              const data = await response.json();

              // Update stats display
              document.getElementById('block-count').textContent = data.stats.blockCount;
              document.getElementById('tx-count').textContent = data.stats.totalTxCount;
              document.getElementById('mempool-size').textContent = data.mempool.txCount;

              // Process blocks
              this.processBlocks(data.blocks);

              // Process mempool
              this.processMempool(data.mempool);

              return data;
          } catch (error) {
              console.error('Error fetching blockchain data:', error);
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
              const knownHashes = this.state.blocks.map(b => b.hash);

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
              this.addCharacter(txid, x, y, 'waiting');
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
                  if (Math.random() > 0.3) {  // Some windows are dark
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
                  duration: 1
              });

              gsap.to(building.scale, {
                  x: 1,
                  y: 1,
                  duration: 1,
                  ease: "elastic.out(1, 0.5)"
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
                      }
                  });
              }
          }

          // Make building interactive
          building.interactive = true;
          building.buttonMode = true;

          // Click event to show block details
          building.on('pointerdown', () => {
              this.showBlockDetails(block);
          });

          // Hover events
          building.on('pointerover', (event) => {
              building.tint = 0xffcc00;
              this.showTooltip(\`Block #\${block.height}\`, event.data.global.x, event.data.global.y);
          });

          building.on('pointerout', () => {
              building.tint = 0xffffff;
              this.hideTooltip();
          });

          return building;
      }

      // Add a character to represent a transaction
      addCharacter(txid, x, y, state = 'waiting') {
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
          character.drawCircle(3, -2, 2);  // Right eye
          character.endFill();

          character.beginFill(0x000000);
          character.drawCircle(-3, -2, 1); // Left pupil
          character.drawCircle(3, -2, 1);  // Right pupil
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
          if (state === 'waiting') {
              // Idle animation
              gsap.to(character, {
                  y: character.y - 5,
                  duration: 0.5 + Math.random() * 0.5,
                  repeat: -1,
                  yoyo: true
              });
          }

          // Make character interactive
          character.interactive = true;
          character.buttonMode = true;

          // Click event to show transaction details
          character.on('pointerdown', () => {
              this.showTransactionDetails(txid);
          });

          // Hover events
          character.on('pointerover', (event) => {
              character.tint = 0xffcc00;
              this.showTooltip(\`TX: \${txid.substring(0, 8)}...\`, event.data.global.x, event.data.global.y);
          });

          character.on('pointerout', () => {
              character.tint = 0xffffff;
              this.hideTooltip();
          });

          return character;
      }

      // Move a character to a building (for transaction confirmation)
      moveCharacterToBuilding(character, building) {
          // Set state to moving
          character.state = 'moving';

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
                  character.state = 'confirmed';

                  // Fade out and remove
                  gsap.to(character, {
                      alpha: 0,
                      duration: 0.5,
                      onComplete: () => {
                          this.characterLayer.removeChild(character);
                          this.state.characters = this.state.characters.filter(c => c !== character);
                      }
                  });
              }
          });

          return character;
      }

      // Show tooltip
      showTooltip(text, x, y) {
          const tooltip = document.getElementById('tooltip');
          tooltip.textContent = text;
          tooltip.style.left = \`\${x + 10}px\`;
          tooltip.style.top = \`\${y - 30}px\`;
          tooltip.style.opacity = '1';
      }

      // Hide tooltip
      hideTooltip() {
          const tooltip = document.getElementById('tooltip');
          tooltip.style.opacity = '0';
      }

      // Show block details
      showBlockDetails(block) {
          const detailsPanel = document.getElementById('details-panel');
          const detailsContent = document.getElementById('details-content');

          detailsContent.innerHTML = \`
              <h3 style="color: #f7931a; margin-top: 0;">BLOCK #\${block.height}</h3>
              <div>Hash: \${block.hash.substring(0, 20)}...</div>
              <div>Time: \${new Date(block.time * 1000).toLocaleString()}</div>
              <div>Transactions: \${block.txCount}</div>
              <div>Size: \${block.size} bytes</div>
              <div>Weight: \${block.weight}</div>
              <div>Difficulty: \${block.difficulty.toFixed(2)}</div>
          \`;

          detailsPanel.style.display = 'block';
      }

      // Show transaction details
      async showTransactionDetails(txid) {
          const detailsPanel = document.getElementById('details-panel');
          const detailsContent = document.getElementById('details-content');

          // Show loading
          detailsContent.innerHTML = \`
              <h3 style="color: #f7931a; margin-top: 0;">TRANSACTION</h3>
              <div>Loading transaction details...</div>
          \`;

          detailsPanel.style.display = 'block';

          try {
              // Fetch transaction details
              const response = await fetch(\`/api/tx/\${txid}\`);
              const tx = await response.json();

              // Update panel with details
              detailsContent.innerHTML = \`
                  <h3 style="color: #f7931a; margin-top: 0;">TRANSACTION</h3>
                  <div>TxID: \${tx.txid.substring(0, 20)}...</div>
                  <div>Size: \${tx.size} bytes</div>
                  <div>Inputs: \${tx.vin.length}</div>
                  <div>Outputs: \${tx.vout.length}</div>
                  <div>Status: \${tx.confirmations ? \`Confirmed (\${tx.confirmations})\` : 'Unconfirmed'}</div>
              \`;
          } catch (error) {
              detailsContent.innerHTML = \`
                  <h3 style="color: #f7931a; margin-top: 0;">TRANSACTION</h3>
                  <div>Error loading transaction: \${error.message}</div>
              \`;
          }
      }

      // Play intro animation
      playIntroAnimation() {
          // Camera animation
          gsap.to(this.state.camera, {
              x: 200,
              y: 100,
              duration: 3,
              ease: "power2.inOut"
          });

          gsap.to(this.state.camera, {
              targetScale: 0.8,
              duration: 3,
              ease: "power2.inOut"
          });
      }

      // Setup event listeners
      setupEventListeners() {
          // Socket events
          this.socket.on('connect', () => {
              console.log('Connected to server');
          });

          this.socket.on('blockchain_update', (data) => {
              // Update stats display
              document.getElementById('block-count').textContent = data.stats.blockCount;
              document.getElementById('tx-count').textContent = data.stats.totalTxCount;
              document.getElementById('mempool-size').textContent = data.mempool.txCount;

              // Process blocks
              this.processBlocks(data.blocks);

              // Process mempool
              this.processMempool(data.mempool);
          });

          this.socket.on('new_block', (block) => {
              // Add new block at the beginning
              this.addBuilding(block, 0, true);

              // Add to state blocks
              this.state.blocks.unshift(block);

              // Move some characters to the new building
              const building = this.state.buildings[0];

              // Find characters in waiting state
              const waitingCharacters = this.state.characters
                  .filter(char => char.state === 'waiting')
                  .slice(0, 5); // Limit to 5 characters

              // Move characters to the building
              waitingCharacters.forEach(character => {
                  this.moveCharacterToBuilding(character, building);
              });

              // Update stats display
              document.getElementById('block-count').textContent =
                  (parseInt(document.getElementById('block-count').textContent) + 1).toString();

              // Update compass direction
              this.updateCompassDirection();
          });

          this.socket.on('new_transaction', (tx) => {
              // Add new character for the transaction
              const centerX = 0;
              const centerY = 300;
              const radius = 150;
              const angle = Math.random() * Math.PI * 2;
              const x = centerX + Math.cos(angle) * radius;
              const y = centerY + Math.sin(angle) * radius;

              this.addCharacter(tx.txid, x, y, 'waiting');

              // Update stats display
              document.getElementById('mempool-size').textContent =
                  (parseInt(document.getElementById('mempool-size').textContent) + 1).toString();

              // Update compass direction
              this.updateCompassDirection();
          });

          // UI button events
          document.getElementById('mine-btn').addEventListener('click', () => {
              // Send mine block request
              this.socket.emit('mine_block', { blocks: 1 });
          });

          document.getElementById('tx-btn').addEventListener('click', async () => {
              // Create a random transaction
              try {
                  const wallets = await this.getWallets();

                  if (wallets.length < 2) {
                      alert('Need at least 2 wallets to create a transaction');
                      return;
                  }

                  // Find a wallet with funds
                  const sourceWallet = wallets[0];
                  const destWallet = wallets[1];

                  // Get destination address
                  const response = await fetch(\`/api/new-address?wallet=\${destWallet}\`);
                  const data = await response.json();
                  const address = data.address;

                  // Create transaction
                  this.socket.emit('create_transaction', {
                      fromWallet: sourceWallet,
                      toAddress: address,
                      amount: 0.001 + Math.random() * 0.01
                  });
              } catch (error) {
                  console.error('Error creating transaction:', error);
                  alert('Error creating transaction: ' + error.message);
              }
          });

          document.getElementById('zoom-in-btn').addEventListener('click', () => {
              this.state.camera.targetScale = Math.min(2, this.state.camera.targetScale + 0.2);
          });

          document.getElementById('zoom-out-btn').addEventListener('click', () => {
              this.state.camera.targetScale = Math.max(0.5, this.state.camera.targetScale - 0.2);
          });

          // Close details panel
          document.getElementById('details-close').addEventListener('click', () => {
              document.getElementById('details-panel').style.display = 'none';
          });

          // View toggle button
          document.getElementById('view-toggle').addEventListener('click', () => {
              window.location.href = 'index.html';
          });

          // Dragging functionality
          this.app.view.addEventListener('mousedown', (e) => {
              this.state.camera.dragging = true;
              this.state.camera.lastPosition = { x: e.clientX, y: e.clientY };
          });

          this.app.view.addEventListener('touchstart', (e) => {
              this.state.camera.dragging = true;
              this.state.camera.lastPosition = {
                  x: e.touches[0].clientX,
                  y: e.touches[0].clientY
              };
          });

          window.addEventListener('mouseup', () => {
              this.state.camera.dragging = false;
          });

          window.addEventListener('touchend', () => {
              this.state.camera.dragging = false;
          });

          this.app.view.addEventListener('mousemove', (e) => {
              if (this.state.camera.dragging && this.state.camera.lastPosition) {
                  const dx = e.clientX - this.state.camera.lastPosition.x;
                  const dy = e.clientY - this.state.camera.lastPosition.y;

                  this.state.camera.x += dx;
                  this.state.camera.y += dy;

                  this.state.camera.lastPosition = { x: e.clientX, y: e.clientY };
              }
          });

          this.app.view.addEventListener('touchmove', (e) => {
              if (this.state.camera.dragging && this.state.camera.lastPosition) {
                  const dx = e.touches[0].clientX - this.state.camera.lastPosition.x;
                  const dy = e.touches[0].clientY - this.state.camera.lastPosition.y;

                  this.state.camera.x += dx;
                  this.state.camera.y += dy;

                  this.state.camera.lastPosition = {
                      x: e.touches[0].clientX,
                      y: e.touches[0].clientY
                  };
              }
          });

          // Window resize
          window.addEventListener('resize', () => {
              this.app.renderer.resize(window.innerWidth, window.innerHeight);
          });
      }

      // Update compass direction based on recent transaction flow
      updateCompassDirection() {
          // Get the compass elements
          const compassArrow = document.getElementById('compass-arrow');
          const compassLabel = document.getElementById('compass-label');

          // Determine direction based on recent activity
          // This is just a placeholder - in a real implementation, you would
          // analyze the actual transaction flow
          const direction = Math.random() * 360;

          // Rotate the compass arrow
          compassArrow.style.transform = \`rotate(\${direction}deg)\`;

          // Update the label
          const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
          const dirIndex = Math.floor(((direction + 22.5) % 360) / 45);
          compassLabel.textContent = directions[dirIndex];
      }

      // Get wallet list
      async getWallets() {
          try {
              const response = await fetch('/api/wallets');
              const data = await response.json();
              return data.wallets;
          } catch (error) {
              console.error('Error fetching wallets:', error);
              return [];
          }
      }

      // Main game loop
      gameLoop(delta) {
          // Update camera
          this.state.camera.scale += (this.state.camera.targetScale - this.state.camera.scale) * 0.1;

          this.worldContainer.position.set(
              window.innerWidth / 2 + this.state.camera.x,
              window.innerHeight / 2 + this.state.camera.y
          );

          this.worldContainer.scale.set(this.state.camera.scale);

          // Update clouds
          if (this.clouds) {
              this.clouds.forEach(cloud => {
                  cloud.x += cloud.speed;

                  // Wrap around screen
                  if (cloud.x > window.innerWidth) {
                      cloud.x = -cloud.width;
                  }
              });
          }

          // Update time of day
          this.state.gameTime += delta * 0.01;
          this.state.timeOfDay = (this.state.gameTime % 24);

          // Update time display
          const hours = Math.floor(this.state.timeOfDay);
          const minutes = Math.floor((this.state.timeOfDay - hours) * 60);
          document.getElementById('game-time').textContent =
              \`\${hours.toString().padStart(2, '0')}:\${minutes.toString().padStart(2, '0')}\`;

          // Day-night cycle
          const nightOpacity =
              this.state.timeOfDay > 18 || this.state.timeOfDay < 6
                  ? Math.min(0.5, Math.abs((this.state.timeOfDay > 18 ? 24 - this.state.timeOfDay : this.state.timeOfDay) - 6) * 0.1)
                  : 0;

          document.getElementById('time-cycle').style.opacity = nightOpacity.toString();
      }
  }

  // When document is loaded, create the game
  document.addEventListener('DOMContentLoaded', () => {
      // Setup loading bar first
      let loadingProgress = 0;
      const loadingInterval = setInterval(() => {
          loadingProgress += 5;
          if (loadingProgress > 100) {
              clearInterval(loadingInterval);
              return;
          }
          document.getElementById('loading-bar').style.width = \`\${loadingProgress}%\`;
      }, 100);

      // Create the game
      window.game = new PixelCityBlockchain();
  });`;

      await fs.writeFile(
        path.join(this.staticDir, "js/pixel-city.js"),
        pixelCityJs,
      );

      // Create placeholder assets
      await this.createPixelArtAssets();

      console.log(
        chalk.green("Pixel art visualization files created successfully."),
      );
    } catch (error) {
      console.error("Error creating pixel art visualization files:", error);
    }
  }

  /**
   * Creates placeholder assets for the pixel art visualization
   */
  private async createPixelArtAssets(): Promise<void> {
    try {
      // Create empty placeholder files for assets
      // In a real implementation, you would create actual pixel art assets

      // Create empty sound files
      const emptyBuffer = Buffer.from([]);
      await fs.writeFile(
        path.join(this.staticDir, "sounds/block_mined.mp3"),
        emptyBuffer,
      );
      await fs.writeFile(
        path.join(this.staticDir, "sounds/transaction.mp3"),
        emptyBuffer,
      );
      await fs.writeFile(
        path.join(this.staticDir, "sounds/click.mp3"),
        emptyBuffer,
      );
      await fs.writeFile(
        path.join(this.staticDir, "sounds/blockchain_city_theme.mp3"),
        emptyBuffer,
      );

      console.log(chalk.green("Pixel art assets created successfully."));
    } catch (error) {
      console.error("Error creating pixel art assets:", error);
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
                <button id="minecraft-view-btn" class="absolute top-4 right-4 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded flex items-center">
                  <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"></path>
                  </svg>
                  Switch to Minecraft View
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
    <script>
      document.getElementById('minecraft-view-btn').addEventListener('click', function() {
        window.location.href = 'index-minecraft.html';
      });
    </script>

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
