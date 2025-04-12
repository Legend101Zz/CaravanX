import { BitcoinRpcClient } from "./rpc";
import { UTXO } from "../types/bitcoin";
import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import * as ecc from "tiny-secp256k1";
import * as bip32 from "bip32";
import ora from "ora";
import {
  colors,
  formatBitcoin,
  formatSuccess,
  formatWarning,
  formatError,
  boxText,
  keyValue,
  truncate,
} from "../utils/terminal";

// Initialize libraries
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const BIP32 = bip32.BIP32Factory(ecc);

/**
 * Service for Bitcoin wallet operations with improved progress indicators
 */
export class BitcoinService {
  public readonly rpc: BitcoinRpcClient;
  private readonly network: bitcoin.networks.Network;

  constructor(rpc: BitcoinRpcClient, isRegtest = true) {
    this.rpc = rpc;
    this.network = isRegtest
      ? bitcoin.networks.regtest
      : bitcoin.networks.testnet;
  }

  /**
   * Create a new wallet
   */
  async createWallet(
    name: string,
    options: {
      disablePrivateKeys?: boolean;
      blank?: boolean;
      descriptorWallet?: boolean;
    } = {},
  ): Promise<any> {
    const {
      disablePrivateKeys = false,
      blank = false,
      descriptorWallet = true,
    } = options;

    try {
      console.log(
        boxText(
          `${keyValue("disablePrivateKeys", disablePrivateKeys.toString())}\n` +
            `${keyValue("blank", blank.toString())}\n` +
            `${keyValue("descriptorWallet", descriptorWallet.toString())}`,
          { title: `Creating Wallet: ${name}`, titleColor: colors.info },
        ),
      );

      // Try the direct RPC call first with a more compatible format
      const spinner = ora("Creating wallet...").start();
      try {
        const result = await this.rpc.callRpc("createwallet", [
          name, // wallet_name
          disablePrivateKeys, // disable_private_keys
          blank, // blank
          "", // passphrase
          false, // avoid_reuse
          descriptorWallet, // descriptors
          true, // load_on_startup
        ]);
        spinner.succeed(`Wallet "${name}" created successfully`);
        return result;
      } catch (error: any) {
        // If the above fails, try with named parameters
        if (
          error.message.includes("unknown named parameter") ||
          error.message.includes("incorrect number of parameters")
        ) {
          spinner.warn("Using alternative wallet creation method");

          // Create params object for named parameters
          const params: any = {
            wallet_name: name,
            disable_private_keys: disablePrivateKeys,
            blank: blank,
          };

          // Only add descriptors if needed (for compatibility with older versions)
          if (descriptorWallet) {
            params.descriptors = true;
          }

          const result = await this.rpc.callRpc("createwallet", [params]);
          spinner.succeed(`Wallet "${name}" created successfully`);
          return result;
        } else {
          // Last resort: try the core createWallet method with fewer parameters
          spinner.warn("Using simplified wallet creation");
          const result = await this.rpc.createWallet(
            name,
            disablePrivateKeys,
            blank,
          );
          spinner.succeed(`Wallet "${name}" created successfully`);
          return result;
        }
      }
    } catch (error) {
      console.error(formatError(`Error creating wallet ${name}:`), error);
      throw error;
    }
  }

  /**
   * Get info about a wallet
   */
  async getWalletInfo(wallet: string): Promise<any> {
    try {
      const spinner = ora(`Getting info for wallet "${wallet}"...`).start();
      const info = await this.rpc.getWalletInfo(wallet);
      spinner.succeed("Wallet info retrieved");
      return info;
    } catch (error) {
      console.error(
        formatError(`Error getting info for wallet ${wallet}:`),
        error,
      );
      throw error;
    }
  }

  /**
   * Generate a new address from a wallet
   */
  async getNewAddress(wallet: string, label = ""): Promise<string> {
    try {
      const spinner = ora(
        `Generating address for wallet "${wallet}"...`,
      ).start();
      const address = await this.rpc.getNewAddress(wallet, label);
      spinner.succeed(`Address generated: ${address}`);
      return address;
    } catch (error) {
      console.error(
        formatError(`Error generating address for wallet ${wallet}:`),
        error,
      );
      throw error;
    }
  }

  /**
   * Get detailed info about an address
   */
  async getAddressInfo(wallet: string, address: string): Promise<any> {
    try {
      const spinner = ora(`Getting info for address ${address}...`).start();
      const info = await this.rpc.getAddressInfo(wallet, address);
      spinner.succeed("Address information retrieved");
      return info;
    } catch (error) {
      console.error(
        formatError(
          `Error getting info for address ${address} in wallet ${wallet}:`,
        ),
        error,
      );
      throw error;
    }
  }

  /**
   * List wallets on the node
   */
  async listWallets(): Promise<string[]> {
    try {
      const spinner = ora("Listing available wallets...").start();
      const wallets = await this.rpc.listWallets();
      spinner.succeed(`Found ${wallets.length} wallet(s)`);
      return wallets;
    } catch (error) {
      console.error(formatError("Error listing wallets:"), error);
      throw error;
    }
  }

  /**
   * List unspent outputs for an address or wallet
   */
  async listUnspent(wallet: string, addresses: string[] = []): Promise<UTXO[]> {
    try {
      const spinner = ora(
        `Listing unspent outputs for wallet "${wallet}"...`,
      ).start();
      const utxos = await this.rpc.listUnspent(wallet, 0, 9999999, addresses);
      spinner.succeed(`Found ${utxos.length} unspent output(s)`);
      return utxos;
    } catch (error) {
      console.error(
        formatError(`Error listing unspent outputs for wallet ${wallet}:`),
        error,
      );
      throw error;
    }
  }

  /**
   * Get transaction details
   */
  async getTransaction(wallet: string, txid: string): Promise<any> {
    try {
      const spinner = ora(
        `Getting transaction ${truncate(txid, 10)}...`,
      ).start();
      const tx = await this.rpc.getTransaction(wallet, txid);
      spinner.succeed("Transaction retrieved");
      return tx;
    } catch (error) {
      console.error(
        formatError(`Error getting transaction ${txid} in wallet ${wallet}:`),
        error,
      );
      throw error;
    }
  }

  /**
   * Send to address
   */
  async sendToAddress(
    wallet: string,
    address: string,
    amount: number,
  ): Promise<string> {
    try {
      const spinner = ora(
        `Sending ${formatBitcoin(amount)} to ${address}...`,
      ).start();
      const txid: any = await this.rpc.callRpc(
        "sendtoaddress",
        [address, amount],
        wallet,
      );
      spinner.succeed(`Transaction sent successfully (${truncate(txid, 10)})`);
      return txid;
    } catch (error) {
      console.error(
        formatError(
          `Error sending to address ${address} from wallet ${wallet}:`,
        ),
        error,
      );
      throw error;
    }
  }

  /**
   * Create a wallet with a known private key (for testing)
   */
  async createPrivateKeyWallet(
    name: string,
    wif?: string,
  ): Promise<{ wallet: string; wif: string; address: string }> {
    try {
      // Create the wallet
      const createSpinner = ora(`Creating wallet "${name}"...`).start();
      await this.rpc.createWallet(name, false, false);
      createSpinner.succeed(`Wallet "${name}" created`);

      let keyPair;
      if (wif) {
        // Use provided private key
        keyPair = ECPair.fromWIF(wif, this.network);
      } else {
        // Generate a random private key
        keyPair = ECPair.makeRandom({ network: this.network });
        wif = keyPair.toWIF();
      }

      // Import the private key
      const privateKey = wif;
      const keySpinner = ora("Importing private key...").start();

      try {
        await this.rpc.callRpc(
          "importprivkey",
          [privateKey, "imported", false],
          name,
        );
        keySpinner.succeed("Private key imported");
      } catch (error) {
        keySpinner.fail("Failed to import private key");
        console.error(
          formatError(`Error importing private key to wallet ${name}:`),
          error,
        );
        throw error;
      }

      // Get new address from the wallet for verification
      const addrSpinner = ora("Generating address...").start();
      const address = await this.getNewAddress(name);
      addrSpinner.succeed(`Address generated: ${address}`);

      return { wallet: name, wif: privateKey, address };
    } catch (error) {
      console.error(
        formatError(`Error creating private key wallet ${name}:`),
        error,
      );
      throw error;
    }
  }

  /**
   * Generate an extended public key from wallet
   */
  async getExtendedPubKey(
    wallet: string,
    path = "m/44'/1'/0'",
  ): Promise<{ xpub: string; path: string; rootFingerprint?: string }> {
    try {
      const spinner = ora(
        `Getting extended public key for wallet "${wallet}"...`,
      ).start();

      // For regtest, we'll manually derive the xpub from seed
      try {
        const dumpResult = await this.rpc.callRpc(
          "dumpwallet",
          ["/tmp/temp-wallet.txt"],
          wallet,
        );

        // Extract seed or private key info from the wallet dump
        // This is simplified and would need more robust error handling in practice
        // @ts-ignore
        const seed = Buffer.from(dumpResult, "hex");
        const node = BIP32.fromSeed(seed, this.network);

        // Derive the path
        const derivedNode = node.derivePath(path);

        // Get the extended public key
        const xpub = derivedNode.neutered().toBase58();

        // Get the root fingerprint
        // @ts-ignore
        const rootFingerprint = node.fingerprint.toString("hex");

        spinner.succeed("Extended public key retrieved");
        return { xpub, path, rootFingerprint };
      } catch (error) {
        spinner.warn("Using alternative method to get xpub");

        // Fallback to a more direct method
        try {
          const result: any = await this.rpc.callRpc(
            "getdescriptorinfo",
            [`wpkh(${path})`],
            wallet,
          );
          // @ts-ignore
          spinner.succeed("Extended public key retrieved");
          return { xpub: result.descriptor, path };
        } catch (fallbackError) {
          spinner.fail("Could not retrieve extended public key");
          console.error("Fallback also failed:", fallbackError);
          throw error;
        }
      }
    } catch (error) {
      console.error(
        formatError(`Error getting extended public key for wallet ${wallet}:`),
        error,
      );
      throw error;
    }
  }

  /**
   * Create a software wallet for use in Caravan multisig
   */
  async createCaravanKeyWallet(
    name: string,
    path = "m/84'/1'/0'",
  ): Promise<{
    wallet: string;
    xpub: string;
    path: string;
    rootFingerprint: string;
    wif?: string;
  }> {
    // Create a wallet with private keys
    const walletName = `${name}_key`;
    const createSpinner = ora(
      `Creating Caravan key wallet "${walletName}"...`,
    ).start();
    await this.createWallet(walletName);
    createSpinner.succeed(`Wallet "${walletName}" created`);

    // Generate HD seed
    const seedSpinner = ora("Setting HD seed...").start();
    await this.rpc.callRpc("sethdseed", [true], walletName);
    seedSpinner.succeed("HD seed set");

    // Get the xpub information
    const xpubSpinner = ora(
      `Getting extended public key for path ${path}...`,
    ).start();
    const xpubInfo = await this.getExtendedPubKey(walletName, path);
    xpubSpinner.succeed("Extended public key retrieved");

    // For the demo, we can also extract a private key
    let wif;
    try {
      const keySpinner = ora("Getting sample private key...").start();
      const address = await this.getNewAddress(walletName);
      const dumpResult = await this.rpc.callRpc(
        "dumpprivkey",
        [address],
        walletName,
      );
      wif = dumpResult;
      keySpinner.succeed("Sample private key retrieved");
    } catch (error) {
      console.warn(
        formatWarning(`Could not dump private key for ${walletName}:`),
        error,
      );
    }

    return {
      wallet: walletName,
      xpub: xpubInfo.xpub,
      path: xpubInfo.path,
      // @ts-ignore
      rootFingerprint: xpubInfo.rootFingerprint,
      // @ts-ignore
      wif,
    };
  }

  /**
   * Extract private key for address
   */
  async dumpPrivateKey(wallet: string, address: string): Promise<string> {
    try {
      const spinner = ora(
        `Extracting private key for address ${address}...`,
      ).start();
      const key: any = await this.rpc.callRpc("dumpprivkey", [address], wallet);
      spinner.succeed("Private key extracted");
      return key;
    } catch (error) {
      console.error(
        formatError(
          `Error dumping private key for address ${address} in wallet ${wallet}:`,
        ),
        error,
      );
      throw error;
    }
  }

  /**
   * Generate blocks to a specific address
   */
  async generateToAddress(
    numBlocks: number,
    address: string,
  ): Promise<string[]> {
    try {
      const spinner = ora(
        `Mining ${numBlocks} block(s) to address ${address}...`,
      ).start();
      const hashes = await this.rpc.generateToAddress(numBlocks, address);
      spinner.succeed(`Successfully mined ${hashes.length} block(s)`);
      return hashes;
    } catch (error) {
      console.error(
        formatError(
          `Error generating ${numBlocks} blocks to address ${address}:`,
        ),
        error,
      );
      throw error;
    }
  }
}
