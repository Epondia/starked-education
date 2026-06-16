export class SessionKeyService {
  constructor(config: any) {}
  createSessionKey(walletAddress: string, permissions: any, validUntil: Date): Promise<any> { return Promise.resolve({}); }
  getActiveSessionKeys(walletAddress: string): Promise<any[]> { return Promise.resolve([]); }
}
