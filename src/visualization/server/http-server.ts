import * as http from "http";
import * as url from "url";
import * as path from "path";
import * as fs from "fs-extra";
import express from "express";
import { Server as SocketIOServer } from "socket.io";
import { BlockchainDataService } from "../data/blockchain-data";

// Content types for different file extensions
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/**
 * HTTP Server for blockchain visualization using WebSockets
 */
export class VisualizationServer {
  private server: http.Server;
  private app: express.Application;
  private io: SocketIOServer;
  private port: number;
  private staticDir: string;
  private blockchainData: BlockchainDataService;
  private updateInterval: NodeJS.Timeout | null = null;
  private connectedClients: number = 0;

  constructor(
    blockchainData: BlockchainDataService,
    staticDir: string,
    port: number = 3000,
  ) {
    this.blockchainData = blockchainData;
    this.staticDir = staticDir;
    this.port = port;

    // Initialize Express app
    this.app = express();

    // Configure middleware
    this.configureMiddleware();

    // Create HTTP server
    this.server = http.createServer(this.app);

    // Initialize Socket.io
    this.io = new SocketIOServer(this.server);

    // Configure Socket.io events
    this.configureSocketEvents();

    // Configure API routes
    this.configureRoutes();
  }

  /**
   * Configure Socket.io events
   */
  private configureSocketEvents(): void {
    this.io.on("connection", (socket) => {
      this.connectedClients++;
      console.log(`Client connected. Total clients: ${this.connectedClients}`);

      // Send initial data
      this.sendInitialData(socket);

      // Handle disconnection
      socket.on("disconnect", () => {
        this.connectedClients--;
        console.log(
          `Client disconnected. Total clients: ${this.connectedClients}`,
        );
      });

      // Handle client events
      this.configureClientEvents(socket);
    });
  }

  /**
   * Configure Express middleware
   */
  private configureMiddleware(): void {
    // Serve static files
    this.app.use(express.static(this.staticDir));

    // Parse JSON body
    this.app.use(express.json());
  }

  /**
   * Configure client-specific events
   */
  private configureClientEvents(socket: any): void {
    // Handle mining request
    socket.on(
      "mine_block",
      async (data: { blocks: number; address?: string }) => {
        try {
          console.log("Mining request received:", data);

          // Notify all clients that mining has started
          this.io.emit("mining_started", {
            blocks: data.blocks,
            address: data.address || "default_address",
          });

          // Call the mining method (this would be implemented in your blockchain service)
          const blockHashes = await this.blockchainData.mineBlocks(
            data.blocks,
            data.address,
          );

          // Notify all clients that mining is complete
          this.io.emit("mining_complete", {
            blockHashes,
          });

          // Update all clients with new blockchain data
          this.broadcastBlockchainUpdate();
        } catch (error: any) {
          console.error("Error mining blocks:", error);
          socket.emit("error", {
            message: "Error mining blocks",
            error: error.message,
          });
        }
      },
    );

    // Handle transaction creation request
    socket.on(
      "create_transaction",
      async (data: {
        fromWallet: string;
        toAddress: string;
        amount: number;
      }) => {
        try {
          console.log("Transaction creation request received:", data);

          // Call the transaction creation method (this would be implemented in your blockchain service)
          const result = await this.blockchainData.createTransaction(
            data.fromWallet,
            data.toAddress,
            data.amount,
          );

          // Notify the client that the transaction was created
          socket.emit("transaction_created", result);

          // Notify all clients about the new transaction
          this.io.emit("new_transaction", {
            txid: result.txid,
            fromWallet: data.fromWallet,
            toAddress: data.toAddress,
            amount: data.amount,
          });

          // Update all clients with new blockchain data
          this.broadcastBlockchainUpdate();
        } catch (error: any) {
          console.error("Error creating transaction:", error);
          socket.emit("error", {
            message: "Error creating transaction",
            error: error.message,
          });
        }
      },
    );
  }

  /**
   * Configure API routes
   */
  private configureRoutes(): void {
    // Get blockchain data
    this.app.get("/api/blockchain", async (req: any, res: any) => {
      try {
        const data = await this.blockchainData.getBlockchainVisualizationData();
        res.json(data);
      } catch (error) {
        console.error("API error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Get block details
    this.app.get("/api/block/:hash", async (req: any, res: any) => {
      try {
        const block = await this.blockchainData.getBlock(req.params.hash);
        res.json(block);
      } catch (error) {
        console.error("API error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Get transaction details
    this.app.get("/api/tx/:txid", async (req: any, res: any) => {
      try {
        const tx = await this.blockchainData.getTransaction(req.params.txid);
        res.json(tx);
      } catch (error) {
        console.error("API error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Get mempool data
    this.app.get("/api/mempool", async (req: any, res: any) => {
      try {
        const txids = await this.blockchainData.getMempoolTransactions();
        const info = await this.blockchainData.getMempoolInfo();
        res.json({ txids, info });
      } catch (error) {
        console.error("API error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Get chain info
    this.app.get("/api/chain-info", async (req: any, res: any) => {
      try {
        const info = await this.blockchainData.getChainInfo();
        res.json(info);
      } catch (error) {
        console.error("API error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Get recent blocks
    this.app.get("/api/recent-blocks", async (req: any, res: any) => {
      try {
        const count = parseInt((req.query.count as string) || "10");
        const blocks = await this.blockchainData.getRecentBlocks(count);
        res.json(blocks);
      } catch (error) {
        console.error("API error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Mine blocks (POST endpoint)
    this.app.post("/api/mine-block", async (req: any, res: any) => {
      try {
        const { blocks, address } = req.body;

        // Validate input
        if (!blocks || isNaN(blocks) || blocks <= 0) {
          return res.status(400).json({ error: "Invalid number of blocks" });
        }

        // Notify all clients that mining has started
        this.io.emit("mining_started", {
          blocks,
          address: address || "default_address",
        });

        // Call the mining method (this would be implemented in your blockchain service)
        const blockHashes = await this.blockchainData.mineBlocks(
          blocks,
          address,
        );

        // Notify all clients that mining is complete
        this.io.emit("mining_complete", {
          blockHashes,
        });

        // Update all clients with new blockchain data
        this.broadcastBlockchainUpdate();

        res.json({ success: true, blockHashes });
      } catch (error) {
        console.error("API error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Create transaction (POST endpoint)
    this.app.post("/api/create-transaction", async (req: any, res: any) => {
      try {
        const { fromWallet, toAddress, amount } = req.body;

        // Validate input
        if (
          !fromWallet ||
          !toAddress ||
          !amount ||
          isNaN(amount) ||
          amount <= 0
        ) {
          return res.status(400).json({ error: "Invalid transaction data" });
        }

        // Call the transaction creation method (this would be implemented in your blockchain service)
        const result = await this.blockchainData.createTransaction(
          fromWallet,
          toAddress,
          amount,
        );

        // Notify all clients about the new transaction
        this.io.emit("new_transaction", {
          txid: result.txid,
          fromWallet,
          toAddress,
          amount,
        });

        // Update all clients with new blockchain data
        this.broadcastBlockchainUpdate();

        res.json(result);
      } catch (error) {
        console.error("API error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Fall back to serving the main HTML file for any other route
    this.app.get("*", (req: any, res: any) => {
      res.sendFile(path.join(this.staticDir, "index.html"));
    });
  }

  /**
   * Send initial data to a newly connected client
   */
  private async sendInitialData(socket: any): Promise<void> {
    try {
      const data = await this.blockchainData.getBlockchainVisualizationData();
      socket.emit("blockchain_update", data);
    } catch (error) {
      console.error("Error sending initial data:", error);
    }
  }

  /**
   * Broadcast blockchain update to all connected clients
   */
  private async broadcastBlockchainUpdate(): Promise<void> {
    try {
      const data = await this.blockchainData.getBlockchainVisualizationData();
      this.io.emit("blockchain_update", data);
    } catch (error) {
      console.error("Error broadcasting blockchain update:", error);
    }
  }

  /**
   * Start the real-time updates
   */
  private startRealTimeUpdates(): void {
    // Clear any existing interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Set up periodic updates (every 5 seconds)
    this.updateInterval = setInterval(async () => {
      // Only send updates if there are connected clients
      if (this.connectedClients > 0) {
        try {
          await this.broadcastBlockchainUpdate();
        } catch (error) {
          console.error("Error during periodic update:", error);
        }
      }
    }, 5000);
  }

  /**
   * Stop the real-time updates
   */
  private stopRealTimeUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(
          `Visualization server running at http://localhost:${this.port}/`,
        );
        this.startRealTimeUpdates();
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    this.stopRealTimeUpdates();

    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
