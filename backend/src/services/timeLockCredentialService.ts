import { TimeLockedCredential, ITimeLockedCredential } from '../models/TimeLockedCredential';
import { v4 as uuidv4 } from 'uuid';
import { Redis } from 'ioredis';
import courseCacheService, { KEY_PREFIX, DEFAULT_TTL } from './courseCacheService';

interface IssueCredentialParams {
  issuer: string;
  recipient: string;
  credentialHash: string;
  metadata: string;
  releaseTime: Date;
}

interface CreateScheduleParams {
  creator: string;
  credentialIds: string[];
  releaseTimes: Date[];
}

export class TimeLockCredentialService {
  private redis: Redis | null = null;

  constructor() {
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379');
    
    try {
      this.redis = new Redis({
        host: redisHost,
        port: redisPort,
        password: process.env.REDIS_PASSWORD || undefined,
      });
    } catch (error) {
      console.warn('Redis not available, caching disabled');
    }
  }

  /**
   * Issue a new time-locked credential
   */
  async issueCredential(params: IssueCredentialParams): Promise<ITimeLockedCredential> {
    const { issuer, recipient, credentialHash, metadata, releaseTime } = params;

    // Validate release time is in the future
    if (releaseTime <= new Date()) {
      throw new Error('Release time must be in the future');
    }

    const credentialId = uuidv4();

    const credential = new TimeLockedCredential({
      credentialId,
      issuer,
      recipient,
      credentialHash,
      metadata,
      releaseTime,
    });

    await (credential as any).addAuditEntry('ISSUE', issuer, 'Credential issued with time lock');

    // Cache the credential
    await this.cacheCredential(credential);

    // Schedule notification job
    await this.scheduleReleaseNotification(credential);

    return credential;
  }

  /**
   * Release a single credential
   */
  async releaseCredential(credentialId: string, caller: string): Promise<ITimeLockedCredential> {
    const credential = await TimeLockedCredential.findOne({ credentialId });

    if (!credential) {
      throw new Error('Credential not found');
    }

    if (credential.isReleased) {
      throw new Error('Credential already released');
    }

    if (credential.isRevoked) {
      throw new Error('Credential has been revoked');
    }

    if (credential.releaseTime > new Date()) {
      throw new Error('Time lock not yet expired');
    }

    if (credential.issuer !== caller && credential.recipient !== caller) {
      throw new Error('Unauthorized caller');
    }

    credential.isReleased = true;
    await (credential as any).addAuditEntry('RELEASE', caller, 'Credential released');

    // Update cache
    await this.cacheCredential(credential);

    // Emit event via Redis pub/sub
    await this.emitReleaseEvent(credential);

    return credential;
  }

  /**
   * Batch release multiple credentials (gas optimized)
   */
  async batchReleaseCredentials(credentialIds: string[], caller: string): Promise<any[]> {
    const results = await (TimeLockedCredential as any).batchRelease(credentialIds, caller);

    // Cache updated credentials
    for (const result of results) {
      if (result.success) {
        const credential = await TimeLockedCredential.findOne({ credentialId: result.credentialId });
        if (credential) {
          await this.cacheCredential(credential);
        }
      }
    }

    return results;
  }

  /**
   * Emergency revoke a credential (within 5 minutes)
   */
  async emergencyRevoke(
    credentialId: string,
    admin: string,
    reason: string
  ): Promise<ITimeLockedCredential> {
    const credential = await TimeLockedCredential.findOne({ credentialId });

    if (!credential) {
      throw new Error('Credential not found');
    }

    if (credential.isRevoked) {
      throw new Error('Credential already revoked');
    }

    // Verify admin privileges (implement your admin check logic here)
    const isAdmin = await this.verifyAdminPrivileges(admin);
    if (!isAdmin) {
      throw new Error('Not authorized');
    }

    credential.isRevoked = true;
    credential.emergencyOverrideBy = admin;
    credential.revokeReason = reason;
    await (credential as any).addAuditEntry('EMERGENCY_REVOKE', admin, `Emergency revoke: ${reason}`);

    // Update cache
    await this.cacheCredential(credential);

    // Emit emergency event
    await this.emitEmergencyRevokeEvent(credential, admin, reason);

    return credential;
  }

  /**
   * Create a release schedule for multiple credentials
   */
  async createReleaseSchedule(params: CreateScheduleParams): Promise<string> {
    const { creator, credentialIds, releaseTimes } = params;

    if (credentialIds.length !== releaseTimes.length) {
      throw new Error('Credential and release time counts must match');
    }

    const scheduleId = uuidv4();

    // Update all credentials with schedule ID
    for (let i = 0; i < credentialIds.length; i++) {
      const credential = await TimeLockedCredential.findOne({ 
        credentialId: credentialIds[i] 
      });

      if (!credential) {
        throw new Error(`Credential ${credentialIds[i]} not found`);
      }

      if (credential.issuer !== creator) {
        throw new Error(`Not authorized to modify credential ${credentialIds[i]}`);
      }

      credential.scheduleId = scheduleId;
      await credential.save();

      // Drop stale cached copy of the updated credential (invalidation on write)
      await courseCacheService.invalidateCredential(credential.credentialId);
    }

    // Cache schedule metadata
    if (this.redis) {
      await this.redis.setex(
        `schedule:${scheduleId}`,
        86400 * 30, // 30 days
        JSON.stringify({
          credentialIds,
          releaseTimes: releaseTimes.map(t => t.getTime()),
          creator,
          createdAt: Date.now(),
        })
      );
    }

    return scheduleId;
  }

  /**
   * Get upcoming releases for notification system
   */
  async getUpcomingReleases(recipient: string, timeWindowMs: number = 86400000): Promise<ITimeLockedCredential[]> {
    // Check cache first
    const cacheKey = `upcoming:${recipient}:${timeWindowMs}`;
    
    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const upcoming = await (TimeLockedCredential as any).findUpcomingReleases(recipient, timeWindowMs);

    // Cache for 5 minutes
    if (this.redis) {
      await this.redis.setex(cacheKey, 300, JSON.stringify(upcoming));
    }

    return upcoming;
  }

  /**
   * Cache-first read of a single credential.
   * On a miss (or Redis failure) it falls back to the database and backfills
   * the cache, so hot reads don't hit the DB on every request.
   */
  async getCredentialById(credentialId: string): Promise<ITimeLockedCredential | null> {
    return courseCacheService.getOrSet(
      KEY_PREFIX.CREDENTIAL + credentialId,
      () => TimeLockedCredential.findOne({ credentialId }),
      { ttl: DEFAULT_TTL.CREDENTIAL_DETAIL },
    );
  }

  /**
   * Get credentials by recipient (cached, short TTL)
   */
  async getCredentialsByRecipient(recipient: string): Promise<ITimeLockedCredential[]> {
    return courseCacheService.getOrSet(
      KEY_PREFIX.CREDENTIAL_LIST + 'recipient:' + recipient,
      () => TimeLockedCredential.find({ recipient }).sort({ createdAt: -1 }),
      { ttl: DEFAULT_TTL.CREDENTIAL_LIST },
    );
  }

  /**
   * Get credentials by issuer (cached, short TTL)
   */
  async getCredentialsByIssuer(issuer: string): Promise<ITimeLockedCredential[]> {
    return courseCacheService.getOrSet(
      KEY_PREFIX.CREDENTIAL_LIST + 'issuer:' + issuer,
      () => TimeLockedCredential.find({ issuer }).sort({ createdAt: -1 }),
      { ttl: DEFAULT_TTL.CREDENTIAL_LIST },
    );
  }

  /**
   * Get audit trail for a credential
   */
  async getAuditTrail(credentialId: string): Promise<any> {
    const credential = await this.getCredentialById(credentialId);
    if (!credential) {
      throw new Error('Credential not found');
    }

    return {
      credentialId,
      auditTrail: credential.auditTrail,
      totalEntries: credential.auditTrail.length,
    };
  }

  /**
   * Helper: Cache credential data (write-through) and invalidate the
   * recipient/issuer list caches that this credential belongs to.
   */
  private async cacheCredential(credential: ITimeLockedCredential): Promise<void> {
    await courseCacheService.setCredential(credential);

    // List reads for this recipient/issuer are now stale — drop them so the
    // next read re-fetches from the DB (invalidation on write).
    await Promise.all([
      courseCacheService.invalidate(KEY_PREFIX.CREDENTIAL_LIST + 'recipient:' + credential.recipient),
      courseCacheService.invalidate(KEY_PREFIX.CREDENTIAL_LIST + 'issuer:' + credential.issuer),
    ]);
  }

  /**
   * Helper: Schedule release notification
   */
  private async scheduleReleaseNotification(credential: ITimeLockedCredential): Promise<void> {
    // Implement notification scheduling using node-cron or similar
    // This would integrate with your existing notification system
    console.log(`Scheduled notification for credential ${credential.credentialId} at ${credential.releaseTime}`);
  }

  /**
   * Helper: Emit release event
   */
  private async emitReleaseEvent(credential: ITimeLockedCredential): Promise<void> {
    if (!this.redis) return;

    await this.redis.publish(
      'credential:released',
      JSON.stringify({
        credentialId: credential.credentialId,
        recipient: credential.recipient,
        issuer: credential.issuer,
        timestamp: new Date().toISOString(),
      })
    );
  }

  /**
   * Helper: Emit emergency revoke event
   */
  private async emitEmergencyRevokeEvent(
    credential: ITimeLockedCredential,
    admin: string,
    reason: string
  ): Promise<void> {
    if (!this.redis) return;

    await this.redis.publish(
      'credential:emergency_revoked',
      JSON.stringify({
        credentialId: credential.credentialId,
        admin,
        reason,
        timestamp: new Date().toISOString(),
      })
    );
  }

  /**
   * Helper: Verify admin privileges
   */
  private async verifyAdminPrivileges(admin: string): Promise<boolean> {
    // Implement your admin verification logic here
    // This could check against a database, role system, etc.
    const emergencyAdmin = process.env.EMERGENCY_ADMIN_ADDRESS;
    return admin === emergencyAdmin;
  }
}

export const timeLockCredentialService = new TimeLockCredentialService();
