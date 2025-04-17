import { BitcoinRpcClient } from "./rpc";
import { UTXO } from "../types/bitcoin";
import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import * as ecc from "tiny-secp256k1";
import * as bip32 from "bip32";
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
      console.log(
        boxText(
          `${keyValue("disablePrivateKeys", disablePrivateKeys.toString())}\n` +
            `${keyValue("blank", blank.toString())}\n` +
            `${keyValue("descriptorWallet", descriptorWallet.toString())}`,
          { title: `Creating Wallet: ${name}`, titleColor: colors.info },
        ),
      );

      // Try the direct RPC call first with a more compatible format
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
        return result;
      } catch (error: any) {
        // If the above fails, try with named parameters
        if (
          error.message.includes("unknown named parameter") ||
          error.message.includes("incorrect number of parameters")
        ) {
          console.log(
            colors.warning("Using alternative wallet creation method"),
          );

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
          return result;
        } else {
          // Last resort: try the core createWallet method with fewer parameters
          console.log(colors.warning("Using simplified wallet creation"));
          const result = await this.rpc.createWallet(
            name,
            disablePrivateKeys,
            blank,
          );
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
      const info = await this.rpc.getWalletInfo(wallet);
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
      const address = await this.rpc.getNewAddress(wallet, label);
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
      const info = await this.rpc.getAddressInfo(wallet, address);
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
      const wallets = await this.rpc.listWallets();
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
      const utxos = await this.rpc.listUnspent(wallet, 0, 9999999, addresses);
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
      const tx = await this.rpc.getTransaction(wallet, txid);
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
      const txid: any = await this.rpc.callRpc(
        "sendtoaddress",
        [address, amount],
        wallet,
      );
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
      await this.createWallet(name, {
        disablePrivateKeys: false,
        blank: false,
        descriptorWallet: false, // Explicitly create a legacy wallet that supports importprivkey
      });

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
        console.error(
          formatError(`Error importing private key to wallet ${name}:`),
          error,
        );
        throw error;
      }

      // Get new address from the wallet for verification
      const address = await this.getNewAddress(name);

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
      // For regtest, we'll manually derive the xpub from seed
      try {
        const dumpResult = await this.rpc.callRpc(
          "dumpwallet",
          ["/tmp/temp-wallet.txt"],
          wallet,
        );

        // Extract seed or private key info from the wallet dump
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

        return { xpub, path, rootFingerprint };
      } catch (error) {
        console.log(colors.warning("Using alternative method to get xpub"));

        // Fallback to a more direct method
        try {
          const result: any = await this.rpc.callRpc(
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
    await this.createWallet(walletName);

    // Generate HD seed
    await this.rpc.callRpc("sethdseed", [true], walletName);

    // Get the xpub information
    const xpubInfo = await this.getExtendedPubKey(walletName, path);

    // For the demo, we can also extract a private key
    let wif;
    try {
      const address = await this.getNewAddress(walletName);
      const dumpResult = await this.rpc.callRpc(
        "dumpprivkey",
        [address],
        walletName,
      );
      wif = dumpResult;
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
      const key: any = await this.rpc.callRpc("dumpprivkey", [address], wallet);
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
      const hashes = await this.rpc.generateToAddress(numBlocks, address);
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
