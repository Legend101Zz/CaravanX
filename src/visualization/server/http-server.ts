import * as http from "http";
import * as url from "url";
import * as path from "path";
import * as fs from "fs-extra";
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
 * HTTP Server for blockchain visualization
 */
export class VisualizationServer {
  private server: http.Server;
  private port: number;
  private staticDir: string;
  private blockchainData: BlockchainDataService;

  constructor(
    blockchainData: BlockchainDataService,
    staticDir: string,
    port: number = 3000,
  ) {
    this.blockchainData = blockchainData;
    this.staticDir = staticDir;
    this.port = port;
    this.server = http.createServer(this.handleRequest.bind(this));
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
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
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

  /**
   * Handle HTTP requests
   */
  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    try {
      const parsedUrl = url.parse(req.url || "/", true);
      const pathname = parsedUrl.pathname || "/";

      // Handle API requests
      if (pathname.startsWith("/api/")) {
        await this.handleApiRequest(pathname, req, res);
        return;
      }

      // Handle static files
      let filePath = path.join(
        this.staticDir,
        pathname === "/" ? "index.html" : pathname,
      );

      // Check if file exists
      if (
        !(await fs.pathExists(filePath)) ||
        (await fs.stat(filePath)).isDirectory()
      ) {
        // Try adding .html extension
        if (await fs.pathExists(`${filePath}.html`)) {
          filePath = `${filePath}.html`;
        } else {
          res.statusCode = 404;
          res.end("404 Not Found");
          return;
        }
      }

      // Determine content type
      const ext = path.extname(filePath).toLowerCase();
      const contentType = CONTENT_TYPES[ext] || "application/octet-stream";

      // Read and serve the file
      const content = await fs.readFile(filePath);
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    } catch (error) {
      console.error("Error handling request:", error);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  }

  /**
   * Handle API requests
   */
  private async handleApiRequest(
    pathname: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    res.setHeader("Content-Type", "application/json");

    try {
      // Route API requests
      if (pathname === "/api/blockchain") {
        const data = await this.blockchainData.getBlockchainVisualizationData();
        res.end(JSON.stringify(data));
      } else if (pathname.startsWith("/api/block/")) {
        const hash = pathname.substring("/api/block/".length);
        const block = await this.blockchainData.getBlock(hash);
        res.end(JSON.stringify(block));
      } else if (pathname.startsWith("/api/tx/")) {
        const txid = pathname.substring("/api/tx/".length);
        const tx = await this.blockchainData.getTransaction(txid);
        res.end(JSON.stringify(tx));
      } else if (pathname === "/api/mempool") {
        const txids = await this.blockchainData.getMempoolTransactions();
        const info = await this.blockchainData.getMempoolInfo();
        res.end(JSON.stringify({ txids, info }));
      } else if (pathname === "/api/chain-info") {
        const info = await this.blockchainData.getChainInfo();
        res.end(JSON.stringify(info));
      } else if (pathname === "/api/recent-blocks") {
        const parsedUrl = url.parse(req.url || "", true);
        const count = parseInt((parsedUrl.query.count as string) || "10");
        const blocks = await this.blockchainData.getRecentBlocks(count);
        res.end(JSON.stringify(blocks));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "API endpoint not found" }));
      }
    } catch (error) {
      console.error("API error:", error);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
}
