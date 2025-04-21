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
      await fs.ensureDir(path.join(this.staticDir, "js/world"));
      await fs.ensureDir(path.join(this.staticDir, "assets/blocks"));
      await fs.ensureDir(path.join(this.staticDir, "assets/characters"));
      await fs.ensureDir(path.join(this.staticDir, "assets/items"));
      await fs.ensureDir(path.join(this.staticDir, "assets/environment"));
      await fs.ensureDir(path.join(this.staticDir, "assets/fonts"));
      await fs.ensureDir(path.join(this.staticDir, "styles"));

      // Copy main HTML file
      const htmlContent = fs.readFileSync(
        path.join(__dirname, "static/minecraft/index.html"),
        "utf8",
      );
      await fs.writeFile(
        path.join(this.staticDir, "index-minecraft.html"),
        htmlContent,
      );

      // Copy CSS file
      const cssContent = fs.readFileSync(
        path.join(__dirname, "static/minecraft/styles/minecraft-style.css"),
        "utf8",
      );
      await fs.writeFile(
        path.join(this.staticDir, "styles/minecraft-style.css"),
        cssContent,
      );

      const cssContent2 = fs.readFileSync(
        path.join(__dirname, "static/minecraft/styles/blockchain.css"),
        "utf8",
      );
      await fs.writeFile(
        path.join(this.staticDir, "styles/blockchain.css"),
        cssContent2,
      );

      // Copy JavaScript files
      const voxelEngineContent = fs.readFileSync(
        path.join(__dirname, "static/minecraft/js/voxel-engine.js"),
        "utf8",
      );
      await fs.writeFile(
        path.join(this.staticDir, "js/voxel-engine.js"),
        voxelEngineContent,
      );

      const characterSystemContent = fs.readFileSync(
        path.join(__dirname, "static/minecraft/js/character-system.js"),
        "utf8",
      );
      await fs.writeFile(
        path.join(this.staticDir, "js/character-system.js"),
        characterSystemContent,
      );

      const blockchainIntegrationContent = fs.readFileSync(
        path.join(
          __dirname,
          "static/minecraft/js/blockchain-game-integration.js",
        ),
        "utf8",
      );
      await fs.writeFile(
        path.join(this.staticDir, "js/blockchain-game-integration.js"),
        blockchainIntegrationContent,
      );

      const BlockchainWorldContent = fs.readFileSync(
        path.join(__dirname, "static/minecraft/js/world/BlockchainWorld.js"),
        "utf8",
      );
      await fs.writeFile(
        path.join(this.staticDir, "js/world/BlockchainWorld.js"),
        BlockchainWorldContent,
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

      // Define source directory for pixel visualization
      const sourceDir = path.join(__dirname, "static", "pixel");

      // Copy HTML file
      await fs.copy(
        path.join(sourceDir, "index.html"),
        path.join(this.staticDir, "index-pixel.html"),
      );

      // Copy JavaScript file
      await fs.copy(
        path.join(sourceDir, "js", "pixel-city.js"),
        path.join(this.staticDir, "js", "pixel-city.js"),
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

      // Define source directory for standard visualization
      const sourceDir = path.join(__dirname, "static", "standard");

      // Copy HTML file
      await fs.copy(
        path.join(sourceDir, "index.html"),
        path.join(this.staticDir, "index.html"),
      );

      // Copy JavaScript file
      await fs.copy(
        path.join(sourceDir, "js", "main.js"),
        path.join(this.staticDir, "js", "main.js"),
      );

      // Copy CSS file
      await fs.copy(
        path.join(sourceDir, "css", "styles.css"),
        path.join(this.staticDir, "css", "styles.css"),
      );

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
