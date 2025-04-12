import { BitcoinRpcClient } from "./rpc";
import { PSBTOutput, FinalizedPSBT } from "../types/bitcoin";
import { CaravanWalletConfig } from "../types/caravan";
import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import * as ecc from "tiny-secp256k1";

// Initialize Bitcoin.js components
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

/**
 * Service for handling PSBTs (Partially Signed Bitcoin Transactions)
 */
export class TransactionService {
  private readonly rpc: BitcoinRpcClient;
  private readonly network: bitcoin.networks.Network;

  constructor(rpc: BitcoinRpcClient, isRegtest = true) {
    this.rpc = rpc;
    // Use the appropriate network
    this.network = isRegtest
      ? bitcoin.networks.regtest
      : bitcoin.networks.testnet;
  }

  /**
   * Create a new PSBT from a wallet
   */
  async createPSBT(
    wallet: string,
    outputs: Record<string, number>[],
  ): Promise<string> {
    try {
      const result = await this.rpc.createPSBT(wallet, outputs);
      return result.psbt;
    } catch (error) {
      console.error(`Error creating PSBT in wallet "${wallet}":`, error);
      throw error;
    }
  }

  /**
   * Decode a PSBT to get detailed information
   */
  async decodePSBT(psbtBase64: string): Promise<any> {
    try {
      return await this.rpc.decodePSBT(psbtBase64);
    } catch (error) {
      console.error("Error decoding PSBT:", error);
      throw error;
    }
  }

  /**
   * Process a PSBT with a wallet (sign inputs that the wallet can sign)
   */
  async processPSBT(wallet: string, psbtBase64: string): Promise<string> {
    try {
      const result = await this.rpc.processPSBT(wallet, psbtBase64);
      return result.psbt;
    } catch (error) {
      console.error(`Error processing PSBT with wallet "${wallet}":`, error);
      throw error;
    }
  }

  /**
   * Finalize a PSBT that has all required signatures
   */
  async finalizePSBT(psbtBase64: string): Promise<FinalizedPSBT> {
    try {
      return await this.rpc.finalizePSBT(psbtBase64);
    } catch (error) {
      console.error("Error finalizing PSBT:", error);
      throw error;
    }
  }

  /**
   * Broadcast a finalized transaction to the network
   */
  async broadcastTransaction(txHex: string): Promise<string> {
    try {
      return await this.rpc.sendRawTransaction(txHex);
    } catch (error) {
      console.error("Error broadcasting transaction:", error);
      throw error;
    }
  }

  /**
   * Sign a PSBT with a private key in WIF format
   */
  async signPSBTWithPrivateKey(
    psbtBase64: string,
    privateKeyWIF: string,
  ): Promise<string> {
    try {
      // Parse the PSBT
      const psbt = bitcoin.Psbt.fromBase64(psbtBase64, {
        network: this.network,
      });

      // Import the private key
      const keyPair = ECPair.fromWIF(privateKeyWIF, this.network);

      // Get public key from private key for logging
      const pubkey = Buffer.from(keyPair.publicKey).toString("hex");
      console.log(`Using key with public key: ${pubkey.substring(0, 8)}...`);

      // Try to sign each input
      let signedAny = false;
      const inputCount = psbt.data.inputs.length;
      console.log(`PSBT has ${inputCount} input(s)`);

      for (let i = 0; i < inputCount; i++) {
        try {
          console.log(`Attempting to sign input ${i}...`);
          psbt.signInput(i, keyPair);
          signedAny = true;
          console.log(`Successfully signed input ${i}`);
        } catch (error: any) {
          console.error(`Could not sign input ${i}: ${error.message}`);
        }
      }

      if (!signedAny) {
        throw new Error("Could not sign any inputs with the provided key");
      }

      return psbt.toBase64();
    } catch (error) {
      console.error("Error signing PSBT with private key:", error);
      throw error;
    }
  }

  /**
   * Extract signatures from a PSBT for Caravan
   */
  async extractSignaturesForCaravan(
    psbtBase64: string,
    privateKeyWIF: string,
  ): Promise<any> {
    try {
      // Parse the PSBT
      const psbt = bitcoin.Psbt.fromBase64(psbtBase64, {
        network: this.network,
      });

      // Import the private key
      const keyPair = ECPair.fromWIF(privateKeyWIF, this.network);

      // Get public key from private key
      const pubkey = Buffer.from(keyPair.publicKey).toString("hex");

      // Try to sign each input and extract signatures
      const inputCount = psbt.data.inputs.length;
      const signatures = [];

      for (let i = 0; i < inputCount; i++) {
        try {
          // First try to sign the input
          psbt.signInput(i, keyPair);

          // Then extract the signature
          const input = psbt.data.inputs[i];
          const sigObj = input.partialSig?.find(
            (sig) => Buffer.from(sig.pubkey).toString("hex") === pubkey,
          );

          if (sigObj) {
            const sigHex = sigObj.signature.toString("hex");
            signatures.push(sigHex);
          } else {
            signatures.push(null);
          }
        } catch (error) {
          signatures.push(null);
        }
      }

      // Return in Caravan-compatible format
      return {
        base64: psbt.toBase64(),
        signatures,
        signingPubKey: pubkey,
      };
    } catch (error) {
      console.error("Error extracting signatures for Caravan:", error);
      throw error;
    }
  }

  /**
   * Try to detect which Caravan wallet a PSBT is for
   */
  async detectCaravanWalletForPSBT(
    psbtBase64: string,
    caravanWallets: CaravanWalletConfig[],
  ): Promise<CaravanWalletConfig | null> {
    try {
      // Decode the PSBT
      const decodedPsbt = await this.decodePSBT(psbtBase64);

      // Extract addresses from inputs and outputs
      const addresses: string[] = [];

      // Check inputs
      for (const input of decodedPsbt.inputs) {
        if (
          input.has_utxo &&
          input.utxo.scriptPubKey &&
          input.utxo.scriptPubKey.address
        ) {
          addresses.push(input.utxo.scriptPubKey.address);
        }
      }

      // Check outputs
      for (const output of decodedPsbt.tx.vout) {
        if (output.scriptPubKey && output.scriptPubKey.address) {
          addresses.push(output.scriptPubKey.address);
        }
      }

      if (addresses.length === 0) {
        return null;
      }

      console.log(
        `Found ${addresses.length} addresses in PSBT. Checking against Caravan wallets...`,
      );

      // For each Caravan wallet, check if any address belongs
      for (const caravanConfig of caravanWallets) {
        console.log(`Checking wallet: ${caravanConfig.name}`);

        // Check if a watch-only wallet exists for this Caravan config
        const safeWalletName = `${caravanConfig.name.replace(/\s+/g, "_").toLowerCase()}_watch`;
        const wallets = await this.rpc.listWallets();

        if (wallets.includes(safeWalletName)) {
          console.log(`Found watch wallet: ${safeWalletName}`);

          // Get addresses from this wallet
          // This is simplified - in practice, a more robust approach might be needed
          for (const address of addresses) {
            try {
              await this.rpc.getAddressInfo(safeWalletName, address);
              console.log(
                `Found matching address ${address} in Caravan wallet: ${caravanConfig.name}`,
              );
              return caravanConfig;
            } catch (error) {
              // Address not found in wallet, continue checking
            }
          }
        }
      }

      console.log(
        "Could not automatically determine which Caravan wallet this PSBT belongs to.",
      );
      return null;
    } catch (error) {
      console.error("Error detecting Caravan wallet for PSBT:", error);
      return null;
    }
  }
}
