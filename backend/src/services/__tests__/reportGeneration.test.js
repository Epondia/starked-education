/**
 * Tests for reportGeneration.js
 * Tests report generation in JSON, CSV, and HTML formats
 */

describe('reportGeneration', () => {
  const {
    generateReport,
    ReportFormat,
    generateJsonReport,
    generateCsvReport,
    generateHtmlReport,
  } = require('../services/reportGeneration');

  let cache;
  let mockResult;

  beforeEach(() => {
    cache = new Map();
    mockResult = {
      reportId: 'test-report-id',
      status: 'completed',
      overallSimilarity: 45.5,
      originalityScore: 54.5,
      processingTime: 2.5,
      needsReview: false,
      matches: [
        {
          id: 'match-1',
          source: {
            id: 'source-1',
            type: 'web',
            title: 'Academic Paper on Algorithms',
            url: 'https://example.com/paper',
            author: 'John Doe',
            confidence: 0.85,
            matchedContent: 'sample content',
            similarityScore: 0.45,
          },
          detectionMethod: 'text_similarity',
          similarityPercentage: 45.5,
          matchedWords: 200,
          totalWords: 444,
          startPosition: 0,
          endPosition: 100,
          originalText: 'original text',
          matchedText: 'matched text',
          isParaphrased: false,
          isTranslated: false,
        },
      ],
    };
    cache.set('hash-key', { key: 'hash-key', result: mockResult, expiresAt: new Date(Date.now() + 86400000), createdAt: new Date() });
  });

  describe('ReportFormat', () => {
    it('exposes JSON, CSV, and HTML formats', () => {
      expect(ReportFormat.JSON).toBe('json');
      expect(ReportFormat.CSV).toBe('csv');
      expect(ReportFormat.HTML).toBe('html');
    });
  });

  describe('generateReport', () => {
    it('throws an error when report ID not found in cache', () => {
      expect(() => generateReport('nonexistent-id', cache, ReportFormat.JSON)).toThrow(
        'Report with ID nonexistent-id not found'
      );
    });

    it('throws an error for unsupported format', () => {
      expect(() => generateReport('test-report-id', cache, 'xml')).toThrow(
        'Unsupported report format: xml'
      );
    });

    it('finds report by result.reportId', () => {
      const json = generateReport('test-report-id', cache, ReportFormat.JSON);
      const parsed = JSON.parse(json);
      expect(parsed.reportId).toBe('test-report-id');
    });

    it('finds report by cache entry key', () => {
      const json = generateReport('hash-key', cache, ReportFormat.JSON);
      const parsed = JSON.parse(json);
      expect(parsed.reportId).toBe('test-report-id');
    });
  });

  describe('generateJsonReport', () => {
    it('returns valid JSON with correct structure', () => {
      const json = generateJsonReport(mockResult);
      const parsed = JSON.parse(json);

      expect(parsed).toHaveProperty('reportId');
      expect(parsed).toHaveProperty('status');
      expect(parsed).toHaveProperty('overallSimilarity');
      expect(parsed).toHaveProperty('originalityScore');
      expect(parsed).toHaveProperty('processingTime');
      expect(parsed).toHaveProperty('needsReview');
      expect(parsed).toHaveProperty('generatedAt');
      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('matches');
    });

    it('includes correct summary fields', () => {
      const json = generateJsonReport(mockResult);
      const parsed = JSON.parse(json);

      expect(parsed.summary.totalMatches).toBe(1);
      expect(parsed.summary.highestSimilarity).toBe(45.5);
      expect(parsed.summary.averageSimilarity).toBe(45.5);
      expect(parsed.summary.detectionMethodsUsed).toContain('text_similarity');
    });

    it('correctly maps match fields', () => {
      const json = generateJsonReport(mockResult);
      const parsed = JSON.parse(json);

      const match = parsed.matches[0];
      expect(match.id).toBe('match-1');
      expect(match.source.id).toBe('source-1');
      expect(match.source.title).toBe('Academic Paper on Algorithms');
      expect(match.source.url).toBe('https://example.com/paper');
      expect(match.detectionMethod).toBe('text_similarity');
      expect(match.similarityPercentage).toBe(45.5);
      expect(match.isParaphrased).toBe(false);
    });

    it('handles empty matches array', () => {
      const result = { ...mockResult, matches: [] };
      const json = generateJsonReport(result);
      const parsed = JSON.parse(json);

      expect(parsed.summary.totalMatches).toBe(0);
      expect(parsed.summary.highestSimilarity).toBe(0);
      expect(parsed.summary.averageSimilarity).toBe(0);
      expect(parsed.matches).toEqual([]);
    });

    it('handles matches with missing optional fields', () => {
      const match = {
        id: 'match-2',
        source: {
          id: 'src-2',
          type: 'academic_database',
          title: 'Test Paper',
          url: undefined,
          author: undefined,
          confidence: 0.9,
          matchedContent: '',
          similarityScore: 0.6,
        },
        detectionMethod: 'academic_database',
        similarityPercentage: 65,
        matchedWords: 100,
        totalWords: 200,
        isParaphrased: true,
        isTranslated: false,
        originalText: 'text',
        matchedText: 'text',
      };
      const result = { ...mockResult, matches: [match] };
      const json = generateJsonReport(result);
      const parsed = JSON.parse(json);

      expect(parsed.matches[0].source.url).toBeUndefined();
      expect(parsed.matches[0].source.author).toBeUndefined();
      expect(parsed.matches[0].isParaphrased).toBe(true);
    });
  });

  describe('generateCsvReport', () => {
    it('returns CSV string with header row', () => {
      const csv = generateCsvReport(mockResult);
      const lines = csv.split('\n');

      expect(lines[0]).toContain('Report ID');
      expect(lines[0]).toContain('Status');
      expect(lines[0]).toContain('Overall Similarity');
      expect(lines[0]).toContain('Originality Score');
      expect(lines[0]).toContain('Match ID');
      expect(lines[0]).toContain('Source ID');
      expect(lines[0]).toContain('Detection Method');
    });

    it('includes one data row per match', () => {
      const csv = generateCsvReport(mockResult);
      const lines = csv.split('\n');

      expect(lines.length).toBe(2); // header + 1 match
      expect(lines[1]).toContain('"test-report-id"');
      expect(lines[1]).toContain('"match-1"');
    });

    it('handles empty matches array', () => {
      const result = { ...mockResult, matches: [] };
      const csv = generateCsvReport(result);
      const lines = csv.split('\n');

      expect(lines.length).toBe(2); // header + 1 empty row
      expect(lines[1]).toContain('test-report-id');
    });

    it('handles multiple matches', () => {
      const result = {
        ...mockResult,
        matches: [
          { ...mockResult.matches[0], id: 'm1' },
          { ...mockResult.matches[0], id: 'm2' },
          { ...mockResult.matches[0], id: 'm3' },
        ],
      };
      const csv = generateCsvReport(result);
      const lines = csv.split('\n');
      expect(lines.length).toBe(4); // header + 3 matches
    });
  });

  describe('generateHtmlReport', () => {
    it('returns HTML with proper structure', () => {
      const html = generateHtmlReport(mockResult);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html>');
      expect(html).toContain('</html>');
    });

    it('includes report metadata', () => {
      const html = generateHtmlReport(mockResult);

      expect(html).toContain('test-report-id');
      expect(html).toContain('completed');
      expect(html).toContain('45.5');
    });

    it('includes summary cards', () => {
      const html = generateHtmlReport(mockResult);

      expect(html).toContain('Overall Similarity');
      expect(html).toContain('Originality Score');
      expect(html).toContain('Processing Time');
      expect(html).toContain('Needs Review');
    });

    it('includes a table of matches when matches exist', () => {
      const html = generateHtmlReport(mockResult);

      expect(html).toContain('<table>');
      expect(html).toContain('Academic Paper on Algorithms');
      expect(html).toContain('https://example.com/paper');
    });

    it('includes matched text section', () => {
      const html = generateHtmlReport(mockResult);

      expect(html).toContain('matched-text');
      expect(html).toContain('matched text');
      expect(html).toContain('Match #1');
    });

    it('handles empty matches', () => {
      const result = { ...mockResult, matches: [] };
      const html = generateHtmlReport(result);

      expect(html).toContain('No matches found');
      expect(html).toContain('original');
    });

    it('handles high similarity score styling', () => {
      const result = { ...mockResult, overallSimilarity: 85 };
      const html = generateHtmlReport(result);

      expect(html).toContain('score-high');
    });

    it('handles medium similarity score styling', () => {
      const result = { ...mockResult, overallSimilarity: 45 };
      const html = generateHtmlReport(result);

      expect(html).toContain('score-medium');
    });

    it('handles low similarity score styling', () => {
      const result = { ...mockResult, overallSimilarity: 15 };
      const html = generateHtmlReport(result);

      expect(html).toContain('score-low');
    });

    it('handles matches with no URL', () => {
      const match = { ...mockResult.matches[0] };
      match.source.url = undefined;
      const result = { ...mockResult, matches: [match] };
      const html = generateHtmlReport(result);

      expect(html).toContain('N/A');
    });

    it('handles matches with no author', () => {
      const match = { ...mockResult.matches[0] };
      match.source.author = undefined;
      const result = { ...mockResult, matches: [match] };
      const html = generateHtmlReport(result);

      expect(html).not.toContain('Author');
    });
  });

  describe('generateReport integration', () => {
    it('generates JSON report by default', () => {
      const output = generateReport('test-report-id', cache, ReportFormat.JSON);
      const parsed = JSON.parse(output);
      expect(parsed.reportId).toBe('test-report-id');
    });

    it('generates CSV report', () => {
      const output = generateReport('test-report-id', cache, ReportFormat.CSV);
      expect(output).toContain('Report ID');
      expect(output).toContain('test-report-id');
    });

    it('generates HTML report', () => {
      const output = generateReport('test-report-id', cache, ReportFormat.HTML);
      expect(output).toContain('<!DOCTYPE html>');
    });
  });
});
