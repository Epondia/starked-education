/**
 * Tests for PlagiarismAdministrativeService
 * Tests review queue management, moderation settings, and statistics
 */

import { PlagiarismAdministrativeService, ReviewAction, ModerationSettings } from '../plagiarismAdministrativeService';
import {
  PlagiarismReport,
  PlagiarismAppeal,
  PlagiarismSettings,
  PlagiarismStatus,
  PlagiarismType,
  DetectionMethod,
} from '../../models/PlagiarismDetection';

function makeReport(overrides: Partial<PlagiarismReport> = {}): PlagiarismReport {
  return {
    id: 'report-1',
    submissionId: 'sub-1',
    userId: 'user-1',
    contentType: PlagiarismType.TEXT,
    status: PlagiarismStatus.COMPLETED,
    overallSimilarity: 25,
    originalityScore: 75,
    matches: [],
    sources: [],
    detectionMethods: [DetectionMethod.TEXT_SIMILARITY],
    processingTime: 1.5,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PlagiarismAdministrativeService', () => {
  let service: PlagiarismAdministrativeService;

  beforeEach(() => {
    service = new PlagiarismAdministrativeService();
  });

  describe('getReviewQueue', () => {
    it('returns a queue object with all status arrays', () => {
      const queue = service.getReviewQueue();

      expect(queue).toHaveProperty('pending');
      expect(queue).toHaveProperty('inProgress');
      expect(queue).toHaveProperty('completed');
      expect(queue).toHaveProperty('escalated');
      expect(Array.isArray(queue.pending)).toBe(true);
      expect(Array.isArray(queue.inProgress)).toBe(true);
      expect(Array.isArray(queue.completed)).toBe(true);
      expect(Array.isArray(queue.escalated)).toBe(true);
    });

    it('returns empty queues initially', () => {
      const queue = service.getReviewQueue();

      expect(queue.pending).toHaveLength(0);
      expect(queue.inProgress).toHaveLength(0);
      expect(queue.completed).toHaveLength(0);
      expect(queue.escalated).toHaveLength(0);
    });
  });

  describe('addToReviewQueue', () => {
    it('auto-approves low similarity reports (< autoApproveThreshold)', async () => {
      const report = makeReport({ overallSimilarity: 5 });
      await service.addToReviewQueue(report);

      const queue = service.getReviewQueue();
      expect(queue.completed).toContain(report);
      expect(report.isFalsePositive).toBe(true);
      expect(report.status).toBe(PlagiarismStatus.COMPLETED);
    });

    it('auto-rejects high similarity reports (> autoRejectThreshold)', async () => {
      const report = makeReport({ overallSimilarity: 95 });
      await service.addToReviewQueue(report);

      const queue = service.getReviewQueue();
      expect(queue.completed).toContain(report);
      expect(report.isFalsePositive).toBe(false);
      expect(report.status).toBe(PlagiarismStatus.COMPLETED);
    });

    it('adds medium similarity reports to pending queue', async () => {
      const report = makeReport({ overallSimilarity: 50 });
      await service.addToReviewQueue(report);

      const queue = service.getReviewQueue();
      expect(queue.pending).toContain(report);
      expect(queue.completed).not.toContain(report);
    });
  });

  describe('assignReviewer', () => {
    it('throws when report not found in queue', async () => {
      await expect(service.assignReviewer('nonexistent-id', 'reviewer-1')).rejects.toThrow(
        'Report not found in queue'
      );
    });

    it('throws when reviewer is not authorized', async () => {
      const report = makeReport({ overallSimilarity: 50 });
      await service.addToReviewQueue(report);

      await expect(service.assignReviewer('report-1', 'unauthorized-reviewer')).rejects.toThrow(
        'Reviewer not authorized'
      );
    });

    it('moves report to inProgress when assigned', async () => {
      const settings = service.getModerationSettings();
      settings.allowedReviewers = ['reviewer-1'];
      service.updateModerationSettings(settings);

      const report = makeReport({ overallSimilarity: 50 });
      await service.addToReviewQueue(report);

      await service.assignReviewer('report-1', 'reviewer-1');

      const queue = service.getReviewQueue();
      expect(queue.inProgress).toContain(report);
      expect(queue.pending).not.toContain(report);
      expect(report.status).toBe(PlagiarismStatus.REVIEW_REQUIRED);
    });
  });

  describe('submitReview', () => {
    it('throws when report not found in queue', async () => {
      const action: ReviewAction = {
        type: 'approve',
        reviewerId: 'reviewer-1',
        timestamp: new Date(),
      };
      await expect(service.submitReview('nonexistent-id', action)).rejects.toThrow(
        'Report not found in queue'
      );
    });

    it('approves report and moves to completed', async () => {
      const settings = service.getModerationSettings();
      settings.allowedReviewers = ['reviewer-1'];
      service.updateModerationSettings(settings);

      const report = makeReport({ overallSimilarity: 50 });
      await service.addToReviewQueue(report);
      await service.assignReviewer('report-1', 'reviewer-1');

      const action: ReviewAction = {
        type: 'approve',
        reviewerId: 'reviewer-1',
        notes: 'Looks original',
        timestamp: new Date(),
      };
      await service.submitReview('report-1', action);

      const queue = service.getReviewQueue();
      expect(queue.completed).toContain(report);
      expect(queue.inProgress).not.toContain(report);
      expect(report.isFalsePositive).toBe(true);
      expect(report.reviewedBy).toBe('reviewer-1');
      expect(report.reviewNotes).toBe('Looks original');
    });

    it('rejects report and moves to completed', async () => {
      const settings = service.getModerationSettings();
      settings.allowedReviewers = ['reviewer-1'];
      service.updateModerationSettings(settings);

      const report = makeReport({ overallSimilarity: 50 });
      await service.addToReviewQueue(report);
      await service.assignReviewer('report-1', 'reviewer-1');

      const action: ReviewAction = {
        type: 'reject',
        reviewerId: 'reviewer-1',
        timestamp: new Date(),
      };
      await service.submitReview('report-1', action);

      const queue = service.getReviewQueue();
      expect(queue.completed).toContain(report);
      expect(report.isFalsePositive).toBe(false);
    });

    it('escalates report to escalated queue', async () => {
      const settings = service.getModerationSettings();
      settings.allowedReviewers = ['reviewer-1'];
      service.updateModerationSettings(settings);

      const report = makeReport({ overallSimilarity: 50 });
      await service.addToReviewQueue(report);
      await service.assignReviewer('report-1', 'reviewer-1');

      const action: ReviewAction = {
        type: 'escalate',
        reviewerId: 'reviewer-1',
        notes: 'Needs senior review',
        timestamp: new Date(),
      };
      await service.submitReview('report-1', action);

      const queue = service.getReviewQueue();
      expect(queue.escalated).toContain(report);
      expect(report.reviewNotes).toBe('Needs senior review');
    });

    it('flags report back to pending', async () => {
      const settings = service.getModerationSettings();
      settings.allowedReviewers = ['reviewer-1'];
      service.updateModerationSettings(settings);

      const report = makeReport({ overallSimilarity: 50 });
      await service.addToReviewQueue(report);
      await service.assignReviewer('report-1', 'reviewer-1');

      const action: ReviewAction = {
        type: 'flag',
        reviewerId: 'reviewer-1',
        timestamp: new Date(),
      };
      await service.submitReview('report-1', action);

      const queue = service.getReviewQueue();
      expect(queue.pending).toContain(report);
    });

    it('requests revision and returns to pending', async () => {
      const settings = service.getModerationSettings();
      settings.allowedReviewers = ['reviewer-1'];
      service.updateModerationSettings(settings);

      const report = makeReport({ overallSimilarity: 50 });
      await service.addToReviewQueue(report);
      await service.assignReviewer('report-1', 'reviewer-1');

      const action: ReviewAction = {
        type: 'request_revision',
        reviewerId: 'reviewer-1',
        timestamp: new Date(),
      };
      await service.submitReview('report-1', action);

      const queue = service.getReviewQueue();
      expect(queue.pending).toContain(report);
      expect(report.status).toBe(PlagiarismStatus.PENDING);
    });
  });

  describe('handleAppeal', () => {
    it('throws when report not found', async () => {
      const appeal: PlagiarismAppeal = {
        id: 'appeal-1',
        reportId: 'nonexistent-report',
        userId: 'user-1',
        reason: 'I did not plagiarize',
        explanation: 'This is a false positive',
        evidence: [],
        status: 'pending',
        createdAt: new Date(),
      };

      await expect(service.handleAppeal(appeal)).rejects.toThrow('Report not found');
    });

    it('marks appeal as under_review and adds report to escalated queue', async () => {
      const report = makeReport({ overallSimilarity: 75 });
      await service.addToReviewQueue(report);

      const appeal: PlagiarismAppeal = {
        id: 'appeal-1',
        reportId: 'report-1',
        userId: 'user-1',
        reason: 'I did not plagiarize',
        explanation: 'This is a false positive',
        evidence: [],
        status: 'pending',
        createdAt: new Date(),
      };

      await service.handleAppeal(appeal);

      expect(appeal.status).toBe('under_review');
      const queue = service.getReviewQueue();
      expect(queue.escalated).toContain(report);
    });
  });

  describe('getReviewStatistics', () => {
    it('returns statistics with required fields', () => {
      const stats = service.getReviewStatistics();

      expect(stats).toHaveProperty('totalReviewed');
      expect(stats).toHaveProperty('averageReviewTime');
      expect(stats).toHaveProperty('approvalRate');
      expect(stats).toHaveProperty('rejectionRate');
      expect(stats).toHaveProperty('escalationRate');
      expect(stats).toHaveProperty('reviewerPerformance');
    });

    it('returns zero stats for empty queue', () => {
      const stats = service.getReviewStatistics();

      expect(stats.totalReviewed).toBe(0);
      expect(stats.approvalRate).toBe(0);
      expect(stats.rejectionRate).toBe(0);
      expect(stats.escalationRate).toBe(0);
    });
  });

  describe('moderationSettings', () => {
    it('getModerationSettings returns default settings', () => {
      const settings = service.getModerationSettings();

      expect(settings).toHaveProperty('autoApproveThreshold');
      expect(settings).toHaveProperty('autoRejectThreshold');
      expect(settings).toHaveProperty('requireDualReview');
      expect(settings).toHaveProperty('escalationThreshold');
      expect(settings).toHaveProperty('reviewTimeout');
      expect(settings).toHaveProperty('allowedReviewers');
      expect(settings).toHaveProperty('notificationSettings');
    });

    it('getModerationSettings returns notificationSettings with email, sms, inApp', () => {
      const settings = service.getModerationSettings();

      expect(settings.notificationSettings).toHaveProperty('email');
      expect(settings.notificationSettings).toHaveProperty('sms');
      expect(settings.notificationSettings).toHaveProperty('inApp');
    });

    it('updateModerationSettings merges partial updates', () => {
      const original = service.getModerationSettings();
      service.updateModerationSettings({ autoApproveThreshold: 20 });
      const updated = service.getModerationSettings();

      expect(updated.autoApproveThreshold).toBe(20);
      expect(updated.autoRejectThreshold).toBe(original.autoRejectThreshold);
    });
  });

  describe('getFalsePositiveManagement', () => {
    it('returns management data with required fields', () => {
      const data = service.getFalsePositiveManagement();

      expect(data).toHaveProperty('totalReports');
      expect(data).toHaveProperty('falsePositives');
      expect(data).toHaveProperty('falsePositiveRate');
      expect(data).toHaveProperty('commonFalsePositivePatterns');
    });

    it('returns common false positive patterns', () => {
      const data = service.getFalsePositiveManagement();

      expect(data.commonFalsePositivePatterns.length).toBeGreaterThan(0);
      expect(data.commonFalsePositivePatterns[0]).toHaveProperty('pattern');
      expect(data.commonFalsePositivePatterns[0]).toHaveProperty('count');
      expect(data.commonFalsePositivePatterns[0]).toHaveProperty('percentage');
    });
  });

  describe('exportReviewData', () => {
    it('exports as JSON', () => {
      const data = service.exportReviewData('json');
      const parsed = JSON.parse(data);

      expect(parsed).toHaveProperty('queue');
      expect(parsed).toHaveProperty('statistics');
      expect(parsed).toHaveProperty('settings');
      expect(parsed).toHaveProperty('falsePositiveManagement');
      expect(parsed).toHaveProperty('exportedAt');
    });

    it('exports as CSV', () => {
      const data = service.exportReviewData('csv');

      expect(data).toContain('report_id');
      expect(data).toContain('status');
      expect(data).toContain('similarity');
      expect(data).toContain('reviewed_by');
      expect(data).toContain('reviewed_at');
    });

    it('includes queue data in export', () => {
      const data = service.exportReviewData('json');
      const parsed = JSON.parse(data);

      expect(parsed.queue).toHaveProperty('pending');
      expect(parsed.queue).toHaveProperty('inProgress');
      expect(parsed.queue).toHaveProperty('completed');
      expect(parsed.queue).toHaveProperty('escalated');
    });
  });

  describe('bulkReview', () => {
    it('processes multiple reports and returns results', async () => {
      const settings = service.getModerationSettings();
      settings.allowedReviewers = ['reviewer-1'];
      service.updateModerationSettings(settings);

      const report1 = makeReport({ id: 'report-1', overallSimilarity: 30 });
      const report2 = makeReport({ id: 'report-2', overallSimilarity: 30 });
      await service.addToReviewQueue(report1);
      await service.addToReviewQueue(report2);

      const action: ReviewAction = {
        type: 'approve',
        reviewerId: 'reviewer-1',
        timestamp: new Date(),
      };

      const results = await service.bulkReview(['report-1', 'report-2'], action);

      expect(results.successful).toContain('report-1');
      expect(results.successful).toContain('report-2');
      expect(results.failed).toHaveLength(0);
    });

    it('returns failed IDs for non-existent reports', async () => {
      const action: ReviewAction = {
        type: 'approve',
        reviewerId: 'reviewer-1',
        timestamp: new Date(),
      };

      const results = await service.bulkReview(['nonexistent'], action);

      expect(results.failed).toContain('nonexistent');
      expect(results.successful).toHaveLength(0);
    });
  });
});
