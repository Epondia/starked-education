// Stellar wallets kit has SDK compatibility issues with @stellar/freighter-api
// Using stub implementation until dependency chain is resolved
import * as StellarSdk from '@stellar/stellar-sdk';

export const WalletNetwork = {
  TESTNET: 'testnet' as const,
  PUBLIC: 'public' as const,
};

export const WalletType = {
  FREIGHTER: 'freighter' as const,
  ALBEDO: 'albedo' as const,
  XBULL: 'xbull' as const,
};

export const SUPPORTED_WALLETS: any[] = [];

export const TESTNET_DETAILS = {
  network: WalletNetwork.TESTNET,
  networkPassphrase: StellarSdk.Networks.TESTNET,
  horizonUrl: 'https://horizon-testnet.stellar.org',
};

export const MAINNET_DETAILS = {
  network: WalletNetwork.PUBLIC,
  networkPassphrase: StellarSdk.Networks.PUBLIC,
  horizonUrl: 'https://horizon.stellar.org',
};

export class StellarWalletsKit {
  private network: any;
  private walletId: any;

  constructor(config: any) {
    this.network = config.network;
    this.walletId = config.selectedWalletId;
  }

  async openModal(_opts: any) {}
  async getAddress(): Promise<{ address: string }> {
    return { address: 'G' + 'A'.repeat(55) };
  }
  async sign(_params: any): Promise<{ result: string }> {
    return { result: '' };
  }
  setNetwork(network: any) { this.network = network; }
  setWallet(id: any) { this.walletId = id; }
  getSelectedWalletId() { return this.walletId; }
  getNetwork() { return this.network; }
}

export class StellarWallet {
  private kit: StellarWalletsKit;
  private network: any;

  constructor(network: string = WalletNetwork.TESTNET) {
    this.network = network;
    this.kit = new StellarWalletsKit({
      network: this.network,
      selectedWalletId: WalletType.FREIGHTER,
      modules: SUPPORTED_WALLETS,
    });
  }

  async connect(): Promise<{ address: string; walletType: string }> {
    await this.kit.openModal({
      onWalletSelected: async (option: any) => {
        this.kit.setWallet(option.id);
        return option;
      },
    });

    const { address } = await this.kit.getAddress();
    return { address, walletType: this.kit.getSelectedWalletId() };
  }

  async disconnect(): Promise<void> {}

  async getPublicKey(): Promise<string> {
    const { address } = await this.kit.getAddress();
    return address;
  }

  async signTransaction(xdr: string): Promise<{ result: string }> {
    return this.kit.sign({ xdr, network: this.network });
  }

  setNetwork(network: any) {
    this.network = network;
    this.kit.setNetwork(network);
  }

  getNetwork() {
    return this.network;
  }
}

export const stellarWallet = new StellarWallet();
