import axios, { AxiosRequestConfig } from "axios";
import * as fs from "fs-extra";
import { execSync } from "child_process";
import { BitcoinRpcConfig } from "../types/config";

/**
 * Client for communicating with the Bitcoin Core via RPC
 */
export class BitcoinRpcClient {
  private readonly config: BitcoinRpcConfig;
  private readonly baseUrl: string;
  private readonly auth: { username: string; password: string };

  constructor(config: BitcoinRpcConfig) {
    this.config = config;
    this.baseUrl = `${config.protocol}://${config.host}:${config.port}`;
    this.auth = { username: config.user, password: config.pass };
  }

  /**
   * Call a Bitcoin Core RPC method (Inspired from `@caravan/clients` bitcoind method)
   */
  async callRpc<T>(
    method: string,
    params: any[] = [],
    wallet?: string,
  ): Promise<T> {
    try {
      const url = wallet ? `${this.baseUrl}/wallet/${wallet}` : this.baseUrl;

      const requestConfig: AxiosRequestConfig = {
        method: "post",
        url,
        auth: this.auth,
        data: {
          jsonrpc: "1.0",
          id: "caravanregtest",
          method,
          params,
        },
      };

      const response = await axios(requestConfig);

      if (response.data.error) {
        throw new Error(JSON.stringify(response.data.error));
      }

      return response.data.result;
    } catch (error: any) {
      if (error.response && error.response.data && error.response.data.error) {
        throw new Error(JSON.stringify(error.response.data.error));
      }
      throw error;
    }
  }

  /**
   * Alternative method that uses bitcoin-cli command
   * Useful as a fallback when the RPC method doesn't work
   */
  executeCliCommand(command: string, wallet?: string): string {
    try {
      let cliCommand = `bitcoin-cli -conf="${this.config.dataDir}/bitcoin.conf" -datadir="${this.config.dataDir}" -regtest`;

      if (wallet) {
        cliCommand += ` -rpcwallet=${wallet}`;
      }

      cliCommand += ` ${command}`;

      return execSync(cliCommand).toString().trim();
    } catch (error: any) {
      throw new Error(`Error executing bitcoin-cli command: ${error.message}`);
    }
  }
}
