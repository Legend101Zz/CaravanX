import axios, { AxiosRequestConfig } from "axios";
import * as fs from "fs-extra";
import { execSync } from "child_process";
import { BitcoinRpcConfig } from "../types/config";
import chalk from "chalk";

/**
 * Client for communicating with the Bitcoin Core via RPC
 */
export class BitcoinRpcClient {
  public readonly config: BitcoinRpcConfig;
  public readonly baseUrl: string;
  public readonly auth: { username: string; password: string };

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
        timeout: 5000,
      };

      const response = await axios(requestConfig);

      if (response.data.error) {
        throw new Error(JSON.stringify(response.data.error));
      }

      return response.data.result;
    } catch (error: any) {
      // More descriptive error message
      if (error.code === "ECONNREFUSED") {
        throw new Error(
          `Connection refused - Bitcoin Core not running at ${this.baseUrl}`,
        );
      } else if (error.response && error.response.status === 401) {
        throw new Error(
          `Authentication failed - Check RPC username and password`,
        );
      } else if (error.message.includes("timeout")) {
        throw new Error(`Connection timed out - Bitcoin Core not responding`);
      }

      // Log the error for debugging
      console.error(`RPC call failed for method: ${method}`, error.message);

      // Try fallback method if possible
      try {
        if (this.config.dataDir && fs.existsSync(this.config.dataDir)) {
          const cliCommand = `${method} ${params.map((p) => JSON.stringify(p)).join(" ")}`;
          const result = this.executeCliCommand(cliCommand, wallet);
          return JSON.parse(result) as T;
        } else {
          throw new Error(
            `Specified data directory "${this.config.dataDir}" does not exist.`,
          );
        }
      } catch (cliError: any) {
        throw new Error(
          `${error.message}${cliError.message ? "\n" + cliError.message : ""}`,
        );
      }
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

  // ======== Wallet-related methods =======

  /**
   * Lists all currently loaded wallets.
   *
   * This method calls the Bitcoin Core RPC method `listwallets`, which returns an array
   * of wallet names that are currently loaded in the Bitcoin Core node.
   *
   * @returns {Promise<string[]>} A promise that resolves to an array of wallet names.
   *
   * @see https://developer.bitcoin.org/reference/rpc/listwallets.html
   */
  async listWallets(): Promise<string[]> {
    return this.callRpc<string[]>("listwallets");
  }

  /**
   * Creates a new wallet.
   *
   * This method calls the Bitcoin Core RPC method `createwallet` with the following parameters:
   * - `name`: The unique name for the new wallet.
   * - `disablePrivateKeys`: If true, the wallet will be created without private keys (watch-only).
   * - `blank`: If true, creates a blank wallet without an HD seed.
   *
   * Additional fixed parameters used in this call:
   * - Passphrase is set to an empty string.
   * - `avoid_reuse` is set to false.
   * - `descriptors` is set to true.
   * - `load_on_startup` is set to true.
   *
   * @param {string} name - The name of the wallet to be created.
   * @param {boolean} [disablePrivateKeys=false] - Whether to disable private key generation.
   * @param {boolean} [blank=false] - Whether to create a blank wallet.
   * @returns {Promise<any>} A promise that resolves to the wallet creation result.
   *
   * @see https://developer.bitcoin.org/reference/rpc/createwallet.html
   */
  async createWallet(
    name: string,
    disablePrivateKeys = false,
    blank = false,
  ): Promise<any> {
    return this.callRpc("createwallet", [
      name,
      disablePrivateKeys,
      blank,
      "",
      false,
      true,
      true,
    ]);
  }

  /**
   * Retrieves information about the specified wallet.
   *
   * This method calls the Bitcoin Core RPC method `getwalletinfo`, which returns an object
   * containing various wallet details such as balance, transaction count, and more.
   *
   * @param {string} wallet - The name of the wallet.
   * @returns {Promise<any>} A promise that resolves to an object containing wallet information.
   *
   * @see https://developer.bitcoin.org/reference/rpc/getwalletinfo.html
   */
  async getWalletInfo(wallet: string): Promise<any> {
    return this.callRpc("getwalletinfo", [], wallet);
  }

  /**
   * Generates a new Bitcoin address for receiving funds.
   *
   * This method calls the Bitcoin Core RPC method `getnewaddress` with optional parameters:
   * - `label`: An optional label for the new address.
   * - `addressType`: The type of Bitcoin address to generate (default is `bech32`).
   *
   * @param {string} wallet - The wallet for which to generate the new address.
   * @param {string} [label=''] - An optional label for the address.
   * @param {string} [addressType='bech32'] - The type of address to generate (e.g., 'bech32', 'p2sh-segwit').
   * @returns {Promise<string>} A promise that resolves to the newly generated Bitcoin address.
   *
   * @see https://developer.bitcoin.org/reference/rpc/getnewaddress.html
   */
  async getNewAddress(
    wallet: string,
    label = "",
    addressType = "bech32",
  ): Promise<string> {
    return this.callRpc<string>("getnewaddress", [label, addressType], wallet);
  }

  /**
   * Retrieves detailed information about a specific Bitcoin address.
   *
   * This method calls the Bitcoin Core RPC method `getaddressinfo`, which provides details
   * about the address (such as its script type, whether it is part of the wallet, etc.).
   *
   * @param {string} wallet - The wallet context to use.
   * @param {string} address - The Bitcoin address to query.
   * @returns {Promise<any>} A promise that resolves to an object containing address details.
   *
   * @see https://developer.bitcoin.org/reference/rpc/getaddressinfo.html
   */
  async getAddressInfo(wallet: string, address: string): Promise<any> {
    return this.callRpc("getaddressinfo", [address], wallet);
  }

  /**
   * Lists unspent transaction outputs (UTXOs) for the specified wallet.
   *
   * This method calls the Bitcoin Core RPC method `listunspent` with the following parameters:
   * - `minConf`: The minimum number of confirmations required for UTXOs (default is 0).
   * - `maxConf`: The maximum number of confirmations allowed (default is 9999999).
   * - `addresses`: (Optional) A list of Bitcoin addresses to filter the UTXOs.
   *
   * @param {string} wallet - The wallet from which to list UTXOs.
   * @param {number} [minConf=0] - The minimum confirmations a UTXO must have.
   * @param {number} [maxConf=9999999] - The maximum confirmations a UTXO can have.
   * @param {string[]} [addresses=[]] - An optional array of addresses to filter by.
   * @returns {Promise<any[]>} A promise that resolves to an array of UTXO objects.
   *
   * @see https://developer.bitcoin.org/reference/rpc/listunspent.html
   */
  async listUnspent(
    wallet: string,
    minConf = 0,
    maxConf = 9999999,
    addresses: string[] = [],
  ): Promise<any[]> {
    return this.callRpc("listunspent", [minConf, maxConf, addresses], wallet);
  }

  /**
   * Retrieves detailed information about a specific transaction.
   *
   * This method calls the Bitcoin Core RPC method `gettransaction`, which returns details
   * about the specified transaction including confirmations, fee, and transaction details.
   *
   * @param {string} wallet - The wallet context to use for the transaction.
   * @param {string} txid - The transaction ID (txid) of the transaction to retrieve.
   * @returns {Promise<any>} A promise that resolves to an object containing transaction details.
   *
   * @see https://developer.bitcoin.org/reference/rpc/gettransaction.html
   */
  async getTransaction(wallet: string, txid: string): Promise<any> {
    return this.callRpc("gettransaction", [txid], wallet);
  }

  /**
   * Imports one or more descriptors into the specified wallet.
   *
   * This method calls the Bitcoin Core RPC method `importdescriptors`, which takes an array
   * of descriptor objects. Descriptors define how addresses are derived (e.g., via public keys, scripts).
   *
   * Each descriptor object typically contains:
   * - `desc`: The descriptor string.
   * - `active`: A boolean indicating whether the descriptor is active.
   * - `range`: The range of keys to scan (if applicable).
   * - Additional keys as defined by Bitcoin Core documentation.
   *
   * @param {string} wallet - The wallet into which descriptors will be imported.
   * @param {any[]} descriptors - An array of descriptor objects to be imported.
   * @returns {Promise<any>} A promise that resolves to the result of the import operation.
   *
   * @see https://developer.bitcoin.org/reference/rpc/importdescriptors.html
   */
  async importDescriptors(wallet: string, descriptors: any[]): Promise<any> {
    try {
      return await this.callRpc("importdescriptors", [descriptors], wallet);
    } catch (error: any) {
      if (error.message.includes("Method not found")) {
        console.error(
          chalk.yellow(
            "importdescriptors method not supported. Your Bitcoin Core may be outdated.",
          ),
        );
        throw new Error(
          "importdescriptors method not supported. Please upgrade your Bitcoin Core to use multisig wallets.",
        );
      }
      throw error;
    }
  }

  // ========== Transaction-related methods ===========

  /**
   * Creates a Partially Signed Bitcoin Transaction (PSBT) using the wallet's funds.
   *
   * This method calls the Bitcoin Core RPC method `walletcreatefundedpsbt` with the following parameters:
   * - An empty array for inputs, letting Bitcoin Core automatically select UTXOs.
   * - An array of output objects where each key is a Bitcoin address and each value is the amount in BTC.
   * - A fee rate of 0 (which allows Bitcoin Core to estimate the fee).
   * - An options object with `includeWatching` set to true, enabling the inclusion of watch-only addresses.
   *
   * @param {string} wallet - The wallet to use for creating the PSBT.
   * @param {Record<string, number>[]} outputs - An array of objects mapping addresses to BTC amounts.
   * @returns {Promise<any>} A promise that resolves to the created PSBT object.
   *
   * @see https://developer.bitcoin.org/reference/rpc/walletcreatefundedpsbt.html
   */
  async createPSBT(
    wallet: string,
    outputs: Record<string, number>[],
  ): Promise<any> {
    return this.callRpc(
      "walletcreatefundedpsbt",
      [[], outputs, 0, { includeWatching: true }],
      wallet,
    );
  }

  /**
   * Processes a PSBT by attempting to sign it with the keys available in the wallet.
   *
   * This method calls the Bitcoin Core RPC method `walletprocesspsbt` which signs as many inputs as possible.
   *
   * @param {string} wallet - The wallet to use for processing the PSBT.
   * @param {string} psbtBase64 - The base64-encoded PSBT string.
   * @returns {Promise<any>} A promise that resolves to the processed PSBT object, possibly with partial signatures.
   *
   * @see https://developer.bitcoin.org/reference/rpc/walletprocesspsbt.html
   */
  async processPSBT(wallet: string, psbtBase64: string): Promise<any> {
    return this.callRpc("walletprocesspsbt", [psbtBase64], wallet);
  }

  /**
   * Decodes a base64-encoded PSBT.
   *
   * This method calls the Bitcoin Core RPC method `decodepsbt` which returns a detailed JSON representation
   * of the PSBT, including information about inputs, outputs, and any associated signatures.
   *
   * @param {string} psbtBase64 - The base64-encoded PSBT string to decode.
   * @returns {Promise<any>} A promise that resolves to the decoded PSBT details.
   *
   * @see https://developer.bitcoin.org/reference/rpc/decodepsbt.html
   */
  async decodePSBT(psbtBase64: string): Promise<any> {
    return this.callRpc("decodepsbt", [psbtBase64]);
  }

  /**
   * Finalizes a PSBT by completing all available signatures and assembling the final transaction.
   *
   * This method calls the Bitcoin Core RPC method `finalizepsbt`, which finalizes the PSBT. The response may
   * include the complete raw transaction ready for broadcasting if all required signatures are present.
   *
   * @param {string} psbtBase64 - The base64-encoded PSBT string to finalize.
   * @returns {Promise<any>} A promise that resolves to an object containing the finalized transaction details.
   *
   * @see https://developer.bitcoin.org/reference/rpc/finalizepsbt.html
   */
  async finalizePSBT(psbtBase64: string): Promise<any> {
    return this.callRpc("finalizepsbt", [psbtBase64]);
  }

  /**
   * Broadcasts a raw transaction to the Bitcoin network.
   *
   * This method calls the Bitcoin Core RPC method `sendrawtransaction`, which takes a hexadecimal string of
   * the serialized transaction and broadcasts it to the network.
   *
   * @param {string} hexstring - The raw transaction in hexadecimal format.
   * @returns {Promise<string>} A promise that resolves to the transaction ID (txid) of the broadcast transaction.
   *
   * @see https://developer.bitcoin.org/reference/rpc/sendrawtransaction.html
   */
  async sendRawTransaction(hexstring: string): Promise<string> {
    return this.callRpc<string>("sendrawtransaction", [hexstring]);
  }

  // ========== Blockchain methods ===========

  /**
   * Retrieves general information about the current state of the blockchain.
   *
   * This method calls the Bitcoin Core RPC method `getblockchaininfo`, which provides data such as the
   * current chain, network, number of blocks, and verification progress.
   *
   * @returns {Promise<any>} A promise that resolves to an object containing blockchain information.
   *
   * @see https://developer.bitcoin.org/reference/rpc/getblockchaininfo.html
   */
  async getBlockchainInfo(): Promise<any> {
    return this.callRpc("getblockchaininfo");
  }

  /**
   * Mines a specified number of blocks and sends the block rewards to a given address.
   *
   * This method calls the Bitcoin Core RPC method `generatetoaddress`, which generates new blocks and
   * directs the coinbase rewards to the specified address.
   *
   * @param {number} blocks - The number of blocks to generate.
   * @param {string} address - The Bitcoin address to receive the mining rewards.
   * @returns {Promise<string[]>} A promise that resolves to an array of block hashes for the mined blocks.
   *
   * @see https://developer.bitcoin.org/reference/rpc/generatetoaddress.html
   */
  async generateToAddress(blocks: number, address: string): Promise<string[]> {
    return this.callRpc<string[]>("generatetoaddress", [blocks, address]);
  }

  /**
   * Estimates the fee rate (in BTC/kB) required for a transaction to be confirmed within a specified number of blocks.
   *
   * This method calls the Bitcoin Core RPC method `estimatesmartfee`. The fee estimate helps users determine an
   * appropriate fee to use to have their transaction confirmed within the target number of blocks.
   *
   * @param {number} [blocks=6] - The target number of blocks within which the transaction should be confirmed.
   * @returns {Promise<any>} A promise that resolves to an object containing the estimated fee rate and additional details.
   *
   * @see https://developer.bitcoin.org/reference/rpc/estimatesmartfee.html
   */
  async estimateSmartFee(blocks = 6): Promise<any> {
    return this.callRpc("estimatesmartfee", [blocks]);
  }

  /**
   * Retrieves detailed information about a specific block.
   *
   * This method calls the Bitcoin Core RPC method `getblock`, which returns data such as the block's size,
   * transactions, and header information. The verbosity parameter controls how much detail is returned:
   * - A verbosity of 1 returns a JSON object with basic information.
   * - Higher verbosity levels return more detailed data.
   *
   * @param {string} blockhash - The hash of the block to retrieve.
   * @param {number} [verbosity=1] - The verbosity level (default is 1).
   * @returns {Promise<any>} A promise that resolves to an object containing block details.
   *
   * @see https://developer.bitcoin.org/reference/rpc/getblock.html
   */
  async getBlock(blockhash: string, verbosity = 1): Promise<any> {
    return this.callRpc("getblock", [blockhash, verbosity]);
  }

  // Utility methods
  isWalletAddressNotFoundError(error: any): boolean {
    return (
      error.response &&
      error.response.data &&
      error.response.data.error &&
      error.response.data.error.code === -4
    );
  }
}
