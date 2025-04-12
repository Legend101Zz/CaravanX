//@ts-nocheck
import { BitcoinRpcClient } from "./rpc";
import { UTXO } from "../types/bitcoin";
import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import * as ecc from "tiny-secp256k1";
import * as bip32 from "bip32";

// Initialize libraries
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const BIP32 = bip32.BIP32Factory(ecc);

/**
 * Service for Bitcoin wallet operations
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
      return await this.rpc.createWallet(name, disablePrivateKeys, blank);
    } catch (error) {
      console.error(`Error creating wallet ${name}:`, error);
      throw error;
    }
  }

  /**
   * Get info about a wallet
   */
  async getWalletInfo(wallet: string): Promise<any> {
    try {
      return await this.rpc.getWalletInfo(wallet);
    } catch (error) {
      console.error(`Error getting info for wallet ${wallet}:`, error);
      throw error;
    }
  }

  /**
   * Generate a new address from a wallet
   */
  async getNewAddress(wallet: string, label = ""): Promise<string> {
    try {
      return await this.rpc.getNewAddress(wallet, label);
    } catch (error) {
      console.error(`Error generating address for wallet ${wallet}:`, error);
      throw error;
    }
  }

  /**
   * Get detailed info about an address
   */
  async getAddressInfo(wallet: string, address: string): Promise<any> {
    try {
      return await this.rpc.getAddressInfo(wallet, address);
    } catch (error) {
      console.error(
        `Error getting info for address ${address} in wallet ${wallet}:`,
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
      return await this.rpc.listWallets();
    } catch (error) {
      console.error("Error listing wallets:", error);
      throw error;
    }
  }

  /**
   * List unspent outputs for an address or wallet
   */
  async listUnspent(wallet: string, addresses: string[] = []): Promise<UTXO[]> {
    try {
      return await this.rpc.listUnspent(wallet, 0, 9999999, addresses);
    } catch (error) {
      console.error(
        `Error listing unspent outputs for wallet ${wallet}:`,
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
      return await this.rpc.getTransaction(wallet, txid);
    } catch (error) {
      console.error(
        `Error getting transaction ${txid} in wallet ${wallet}:`,
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
      return await this.rpc.callRpc("sendtoaddress", [address, amount], wallet);
    } catch (error) {
      console.error(
        `Error sending to address ${address} from wallet ${wallet}:`,
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
      await this.rpc.createWallet(name, false, false);

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

      try {
        await this.rpc.callRpc(
          "importprivkey",
          [privateKey, "imported", false],
          name,
        );
      } catch (error) {
        console.error(`Error importing private key to wallet ${name}:`, error);
        throw error;
      }

      // Get new address from the wallet for verification
      const address = await this.getNewAddress(name);

      return { wallet: name, wif: privateKey, address };
    } catch (error) {
      console.error(`Error creating private key wallet ${name}:`, error);
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
      // For regtest, we'll manually derive the xpub from seed
      const seedHex = await this.rpc.callRpc(
        "dumpwallet",
        ["/tmp/temp-wallet.txt"],
        wallet,
      );

      // Extract seed or private key info from the wallet dump
      // This is simplified and would need more robust error handling in practice
      const seed = Buffer.from(seedHex, "hex");
      const node = BIP32.fromSeed(seed, this.network);

      // Derive the path
      const derivedNode = node.derivePath(path);

      // Get the extended public key
      const xpub = derivedNode.neutered().toBase58();

      // Get the root fingerprint
      const rootFingerprint = node.fingerprint.toString("hex");

      return { xpub, path, rootFingerprint };
    } catch (error) {
      console.error(
        `Error getting extended public key for wallet ${wallet}:`,
        error,
      );

      // Fallback to a more direct method
      try {
        const result = await this.rpc.callRpc(
          "getdescriptorinfo",
          [`wpkh(${path})`],
          wallet,
        );
        return { xpub: result.descriptor, path };
      } catch (fallbackError) {
        console.error("Fallback also failed:", fallbackError);
        throw error;
      }
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
    await this.createWallet(walletName);

    // Generate HD seed
    await this.rpc.callRpc("sethdseed", [true], walletName);

    // Get the xpub information
    const xpubInfo = await this.getExtendedPubKey(walletName, path);

    // For the demo, we can also extract a private key
    let wif;
    try {
      const dumpResult = await this.rpc.callRpc(
        "dumpprivkey",
        [await this.getNewAddress(walletName)],
        walletName,
      );
      wif = dumpResult;
    } catch (error) {
      console.warn(`Could not dump private key for ${walletName}:`, error);
    }

    return {
      wallet: walletName,
      xpub: xpubInfo.xpub,
      path: xpubInfo.path,
      rootFingerprint: xpubInfo.rootFingerprint,
      wif,
    };
  }

  /**
   * Extract private key for address
   */
  async dumpPrivateKey(wallet: string, address: string): Promise<string> {
    try {
      return await this.rpc.callRpc("dumpprivkey", [address], wallet);
    } catch (error) {
      console.error(
        `Error dumping private key for address ${address} in wallet ${wallet}:`,
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
      return await this.rpc.generateToAddress(numBlocks, address);
    } catch (error) {
      console.error(
        `Error generating ${numBlocks} blocks to address ${address}:`,
        error,
      );
      throw error;
    }
  }
}
