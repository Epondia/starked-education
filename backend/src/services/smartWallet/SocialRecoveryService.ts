export class SocialRecoveryService {
  constructor(config: any) {}
  setupSocialRecovery(walletAddress: string, guardians: any[], threshold: number): Promise<string> { return Promise.resolve('0x'); }
  initiateRecovery(walletAddress: string, newOwner: string, guardianAddress: string, guardianSignature: string): Promise<any> { return Promise.resolve({}); }
  supportRecovery(recoveryId: string, guardianAddress: string, guardianSignature: string): Promise<any> { return Promise.resolve({}); }
  getRecoveryRequest(recoveryId: string): Promise<any> { return Promise.resolve(null); }
}
