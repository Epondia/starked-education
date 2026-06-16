export class MultiSigService {
  constructor(config: any) {}
  setupMultiSig(walletAddress: string, signers: any[], threshold: number): Promise<string> { return Promise.resolve('0x'); }
  proposeTransaction(walletAddress: string, to: string, value: bigint, data: string, proposer: string): Promise<any> { return Promise.resolve({}); }
  getPendingTransactions(walletAddress: string): Promise<any[]> { return Promise.resolve([]); }
}
