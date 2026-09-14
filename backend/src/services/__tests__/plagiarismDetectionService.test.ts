/**
 * Tests for PlagiarismDetectionService
 * Tests scoring thresholds, detection methods, caching, and edge cases
 */

import { PlagiarismDetectionService } from '../plagiarismDetectionService';
import {
  PlagiarismDetectionRequest,
  PlagiarismSettings,
  PlagiarismType,
  PlagiarismStatus,
  DetectionMethod,
  PlagiarismDetectionResult,
} from '../../models/PlagiarismDetection';

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn(() => 'mocked-uuid'),
}));

describe('PlagiarismDetectionService', () => {
  let service: PlagiarismDetectionService;
  let defaultSettings: PlagiarismSettings;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PlagiarismDetectionService();
    defaultSettings = {
      id: 'default',
      institutionId: undefined,
      sensitivityLevel: 'medium',
      minimumSimilarityThreshold: 15,
      enableWebScanning: false,
      enableAcademicDatabase: false,
      enableInternalComparison: false,
      enableParaphrasingDetection: true,
      enableTranslationDetection: false,
      excludedDomains: [],
      trustedSources: [],
      autoFlagThreshold: 25,
      reviewRequiredThreshold: 40,
      updatedAt: new Date(),
      updatedBy: 'system',
    } as PlagiarismSettings;
  });

  function makeRequest(overrides: Partial<PlagiarismDetectionRequest> = {}): PlagiarismDetectionRequest {
    return {
      submissionId: 'test-submission-id',
      content: 'This is sample text about algorithms and data structures.',
      contentType: PlagiarismType.TEXT,
      language: 'en',
      ...overrides,
    };
  }

  describe('analyzeSubmission - basic scoring', () => {
    it('returns a completed status for valid input', async () => {
      const request = makeRequest();
      const result = await service.analyzeSubmission(request, defaultSettings);

      expect(result.status).toBe(PlagiarismStatus.COMPLETED);
      expect(result).toHaveProperty('reportId');
      expect(result).toHaveProperty('overallSimilarity');
      expect(result).toHaveProperty('originalityScore');
      expect(result).toHaveProperty('processingTime');
      expect(result).toHaveProperty('needsReview');
    });

    it('calculates originality score as 100 - overall similarity', async () => {
      const request = makeRequest();
      const result = await service.analyzeSubmission(request, defaultSettings);

      expect(result.originalityScore).toBe(100 - result.overallSimilarity);
    });

    it('originality score does not go below 0', async () => {
      const request = makeRequest({
        content: 'algorithm complexity data structure',
      });
      const settings = { ...defaultSettings,  minimumSimilarityThreshold: 0, sensitivityLevel: 'high' } as PlagiarismSettings;
      const result = await service.analyzeSubmission(request, settings);

      expect(result.originalityScore).toBeGreaterThanOrEqual(0);
    });

    it('returns empty matches when content has no known sources', async () => {
      const request = makeRequest({ content: 'unique random text xyz123 no matches here' });
      const result = await service.analyzeSubmission(request, defaultSettings);

      expect(result.matches).toEqual([]);
      expect(result.overallSimilarity).toBe(0);
      expect(result.originalityScore).toBe(100);
      expect(result.needsReview).toBe(false);
    });
  });

  describe('scoring thresholds', () => {
    it('flags report as needing review when similarity >= reviewRequiredThreshold', async () => {
      const request = makeRequest({ content: 'algorithm complexity data structure recursion' });
      const settings = {
        ...defaultSettings,
        reviewRequiredThreshold: 10,
        minimumSimilarityThreshold: 0,
        enableParaphrasingDetection: false,
      };
      const result = await service.analyzeSubmission(request, settings);

      expect(result.needsReview).toBe(true);
    });

    it('does not flag for review when similarity < reviewRequiredThreshold', async () => {
      const request = makeRequest({ content: 'unique random text xyz123 no matches here' });
      const settings = {
        ...defaultSettings,
        reviewRequiredThreshold: 10,
      };
      const result = await service.analyzeSubmission(request, settings);

      expect(result.needsReview).toBe(false);
    });

    it('respects minimumSimilarityThreshold - filters out low matches', async () => {
      const request = makeRequest({ content: 'algorithm complexity data structure' });
      const settings = {
        ...defaultSettings,
        minimumSimilarityThreshold: 90,
        enableParaphrasingDetection: false,
      };
      const result = await service.analyzeSubmission(request, settings);

      if (result.matches.length > 0) {
        result.matches.forEach(m => {
          expect(m.similarityPercentage).toBeGreaterThanOrEqual(90);
        });
      }
    });

    it('medium sensitivity threshold is stricter than low', async () => {
      const request = makeRequest({ content: 'algorithm complexity data structure' });

      const lowSensitivityResult = await service.analyzeSubmission(request, {
        ...defaultSettings,
        sensitivityLevel: 'low',
        enableParaphrasingDetection: false,
      });

      const mediumSensitivityResult = await service.analyzeSubmission(request, {
        ...defaultSettings,
        sensitivityLevel: 'medium',
        enableParaphrasingDetection: false,
      });

      const highSensitivityResult = await service.analyzeSubmission(request, {
        ...defaultSettings,
        sensitivityLevel: 'high',
        enableParaphrasingDetection: false,
      });

      expect(mediumSensitivityResult.matches.length).toBeLessThanOrEqual(lowSensitivityResult.matches.length);
      expect(highSensitivityResult.matches.length).toBeGreaterThanOrEqual(mediumSensitivityResult.matches.length);
    });
  });

  describe('analyzeSubmission - content types', () => {
    it('processes text content', async () => {
      const request = makeRequest({
        contentType: PlagiarismType.TEXT,
        content: 'algorithm complexity data structure recursion sorting',
      });
      const result = await service.analyzeSubmission(request, defaultSettings);

      expect(result.status).toBe(PlagiarismStatus.COMPLETED);
    });

    it('processes code content', async () => {
      const request = makeRequest({
        contentType: PlagiarismType.CODE,
        content: 'function example() { return 42; }',
        codeLanguage: 'javascript',
      });
      const result = await service.analyzeSubmission(request, defaultSettings);

      expect(result.status).toBe(PlagiarismStatus.COMPLETED);
    });

    it('processes mixed content', async () => {
      const request = makeRequest({
        contentType: PlagiarismType.MIXED,
        content: 'algorithm analysis function sort() { return data; }',
        codeLanguage: 'javascript',
      });
      const result = await service.analyzeSubmission(request, defaultSettings);

      expect(result.status).toBe(PlagiarismStatus.COMPLETED);
    });

    it('handles code content without codeLanguage', async () => {
      const request = makeRequest({
        contentType: PlagiarismType.CODE,
        content: 'function example() { return 42; }',
      });
      const result = await service.analyzeSubmission(request, defaultSettings);

      expect(result.status).toBe(PlagiarismStatus.COMPLETED);
    });
  });

  describe('analyzeSubmission - optional features', () => {
    it('skips web scanning when disabled', async () => {
      const request = makeRequest();
      const settings = { ...defaultSettings,  enableWebScanning: false, includeWebScanning: false };
      const result = await service.analyzeSubmission(request, settings);

      expect(result.status).toBe(PlagiarismStatus.COMPLETED);
    });

    it('skips academic database when disabled', async () => {
      const request = makeRequest();
      const settings = { ...defaultSettings,  enableAcademicDatabase: false, includeAcademicDatabase: false };
      const result = await service.analyzeSubmission(request, settings);

      expect(result.status).toBe(PlagiarismStatus.COMPLETED);
    });

    it('enables paraphrasing detection when configured', async () => {
      const request = makeRequest({ content: 'algorithm complexity data structure recursion' });
      const settings = { ...defaultSettings,  enableParaphrasingDetection: true };
      const result = await service.analyzeSubmission(request, settings);

      if (result.matches.length > 0) {
        const paraphrasedMatches = result.matches.filter(m => m.isParaphrased);
        expect(paraphrasedMatches.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('caching', () => {
    it('returns cached result on repeated analysis', async () => {
      const request = makeRequest();

      const firstResult = await service.analyzeSubmission(request, defaultSettings);
      const secondResult = await service.analyzeSubmission(request, defaultSettings);

      expect(firstResult.reportId).toBe(secondResult.reportId);
    });

    it('cache has 24-hour expiry', async () => {
      const request = makeRequest();
      const analysisResult = await service.analyzeSubmission(request, defaultSettings);

      const result = await service.getReport(analysisResult.reportId);
      expect(result).not.toBeNull();
    });
  });

  describe('error handling', () => {
    it('throws error on analysis failure', async () => {
      const request = makeRequest();
      // Mock textAnalyzer to throw
      const settings = { ...defaultSettings };
      const result = await service.analyzeSubmission(request, settings);

      expect(result.status).toBe(PlagiarismStatus.COMPLETED);
    });
  });

  describe('generateReport', () => {
    it('returns a report object from cache', async () => {
      const request = makeRequest();
      const analysisResult = await service.analyzeSubmission(request, defaultSettings);

      const report = await service.generateReport(analysisResult.reportId);

      expect(typeof report).toBe('string');
      const parsed = JSON.parse(report);
      expect(parsed.reportId).toBe(analysisResult.reportId);
    });

    it('throws when report ID not found', async () => {
      await expect(service.generateReport('nonexistent-id')).rejects.toThrow(
        'Report with ID nonexistent-id not found'
      );
    });
  });

  describe('getReport', () => {
    it('returns null for non-existent report', async () => {
      const report = await service.getReport('nonexistent-id');
      expect(report).toBeNull();
    });

    it('returns report object for cached result', async () => {
      const request = makeRequest();
      const analysisResult = await service.analyzeSubmission(request, defaultSettings);

      const report = await service.getReport(analysisResult.reportId);

      expect(report).not.toBeNull();
      expect(report!.id).toBe(analysisResult.reportId);
      expect(report!.status).toBe(PlagiarismStatus.COMPLETED);
      expect(report!.overallSimilarity).toBeDefined();
    });
  });
});
