export class AccountAbstractionService {
  constructor(config: any) {}
  createSmartWallet(ownerAddress: string, socialRecoveryConfig?: any): Promise<any> { return Promise.resolve({}); }
  executeTransaction(walletAddress: string, to: string, value: bigint, data: string, signature: string): Promise<string> { return Promise.resolve('0x'); }
  executeBatchTransactions(walletAddress: string, txs: any[], signature: string): Promise<string> { return Promise.resolve('0x'); }
}
