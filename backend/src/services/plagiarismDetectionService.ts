/**
 * Plagiarism Detection Service
 * Core service for detecting plagiarism in text and code submissions
 */

import {
  PlagiarismDetectionRequest,
  PlagiarismDetectionResult,
  PlagiarismReport,
  PlagiarismMatch,
  PlagiarismSource,
  PlagiarismStatus,
  PlagiarismType,
  DetectionMethod,
  SourceType,
  PlagiarismSettings,
  PlagiarismCacheEntry,
} from "../models/PlagiarismDetection";
import logger from "../utils/logger";
import { randomUUID } from "crypto";
import { WebContentScanner, AcademicDatabaseScanner } from "./webContentScanner";
import { CodePlagiarismAnalyzer } from "./codePlagiarismAnalyzer";
import { generateReport, ReportFormat } from "./reportGeneration";

export class PlagiarismDetectionService {
  private cache: Map<string, PlagiarismCacheEntry> = new Map();
  private webScanner: WebContentScanner;
  private academicDatabase: AcademicDatabaseScanner;
  private codeAnalyzer: CodePlagiarismAnalyzer;
  private textAnalyzer: TextSimilarityAnalyzer;

  constructor() {
    this.webScanner = new WebContentScanner();
    this.academicDatabase = new AcademicDatabaseScanner();
    this.codeAnalyzer = new CodePlagiarismAnalyzer();
    this.textAnalyzer = new TextSimilarityAnalyzer();
  }

  async generateReport(
    reportId: string,
    format: ReportFormat = "json",
  ): Promise<string> {
    return generateReport(reportId, this.cache, format);
  }

  async getReport(reportId: string): Promise<PlagiarismReport | null> {
    for (const entry of this.cache.values()) {
      if (entry.result.reportId === reportId) {
        return {
          id: entry.result.reportId,
          submissionId: "",
          userId: "",
          contentType: PlagiarismType.TEXT,
          status: entry.result.status,
          overallSimilarity: entry.result.overallSimilarity,
          originalityScore: entry.result.originalityScore,
          matches: entry.result.matches,
          sources: [],
          detectionMethods: [],
          processingTime: entry.result.processingTime,
          createdAt: entry.createdAt,
          updatedAt: entry.createdAt,
        };
      }
    }
    return null;
  }

  /**
   * Analyze submission for plagiarism
   */
  async analyzeSubmission(
    request: PlagiarismDetectionRequest,
    settings: PlagiarismSettings,
  ): Promise<PlagiarismDetectionResult> {
    const startTime = Date.now();
    const contentHash = this.generateContentHash(request.content);

    // Check cache first
    const cachedResult = this.getCachedResult(contentHash);
    if (cachedResult) {
      logger.info(
        `Returning cached result for submission ${request.submissionId}`,
      );
      return cachedResult;
    }

    try {
      logger.info(
        `Starting plagiarism analysis for submission ${request.submissionId}`,
      );

      // Initialize result
      const matches: PlagiarismMatch[] = [];
      let overallSimilarity = 0;
      const detectionMethods: DetectionMethod[] = [];

      // Text similarity analysis
      if (
        request.contentType === PlagiarismType.TEXT ||
        request.contentType === PlagiarismType.MIXED
      ) {
        const textResults = await this.analyzeTextSimilarity(request, settings);
        matches.push(...textResults.matches);
        detectionMethods.push(DetectionMethod.TEXT_SIMILARITY);
      }

      // Code plagiarism detection
      if (
        request.contentType === PlagiarismType.CODE ||
        request.contentType === PlagiarismType.MIXED
      ) {
        const codeResults = await this.analyzeCodeSimilarity(request, settings);
        matches.push(...codeResults.matches);
        detectionMethods.push(DetectionMethod.CODE_SIMILARITY);
      }

      // Web content scanning
      if (settings.enableWebScanning && request.includeWebScanning) {
        const webResults = await this.scanWebContent(request, settings);
        matches.push(...webResults.matches);
        detectionMethods.push(DetectionMethod.WEB_SCANNING);
      }

      // Academic database scanning
      if (settings.enableAcademicDatabase && request.includeAcademicDatabase) {
        const academicResults = await this.scanAcademicDatabase(
          request,
          settings,
        );
        matches.push(...academicResults.matches);
        detectionMethods.push(DetectionMethod.ACADEMIC_DATABASE);
      }

      // Paraphrasing detection
      if (settings.enableParaphrasingDetection) {
        const paraphrasingResults = await this.detectParaphrasing(
          request,
          settings,
        );
        matches.push(...paraphrasingResults.matches);
        detectionMethods.push(DetectionMethod.PARAPHRASING);
      }

      // Calculate overall similarity and originality score
      overallSimilarity = this.calculateOverallSimilarity(
        matches,
        request.content,
      );
      const originalityScore = Math.max(0, 100 - overallSimilarity);

      // Create result
      const result: PlagiarismDetectionResult = {
        reportId: randomUUID(),
        status: PlagiarismStatus.COMPLETED,
        overallSimilarity,
        originalityScore,
        matches: this.filterMatchesByThreshold(
          matches,
          settings.minimumSimilarityThreshold,
        ),
        processingTime: (Date.now() - startTime) / 1000,
        needsReview: overallSimilarity >= settings.reviewRequiredThreshold,
      };

      // Cache the result
      this.cacheResult(contentHash, result);

      logger.info(
        `Plagiarism analysis completed for submission ${request.submissionId} in ${result.processingTime}s`,
      );
      return result;
    } catch (error) {
      logger.error(
        `Error analyzing submission ${request.submissionId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Analyze text similarity using various algorithms
   */
  private async analyzeTextSimilarity(
    request: PlagiarismDetectionRequest,
    settings: PlagiarismSettings,
  ): Promise<{ matches: PlagiarismMatch[] }> {
    const matches: PlagiarismMatch[] = [];

    try {
      // N-gram analysis
      const ngramMatches = await this.textAnalyzer.ngramSimilarity(
        request.content,
        settings.sensitivityLevel,
      );
      matches.push(...ngramMatches);

      // Cosine similarity
      const cosineMatches = await this.textAnalyzer.cosineSimilarity(
        request.content,
        settings.sensitivityLevel,
      );
      matches.push(...cosineMatches);

      // Jaccard similarity
      const jaccardMatches = await this.textAnalyzer.jaccardSimilarity(
        request.content,
        settings.sensitivityLevel,
      );
      matches.push(...jaccardMatches);

      // Longest Common Subsequence
      const lcsMatches = await this.textAnalyzer.lcsSimilarity(
        request.content,
        settings.sensitivityLevel,
      );
      matches.push(...lcsMatches);

      return { matches };
    } catch (error) {
      logger.error("Error in text similarity analysis:", error);
      return { matches: [] };
    }
  }

  /**
   * Analyze code similarity
   */
  private async analyzeCodeSimilarity(
    request: PlagiarismDetectionRequest,
    settings: PlagiarismSettings,
  ): Promise<{ matches: PlagiarismMatch[] }> {
    const matches: PlagiarismMatch[] = [];

    try {
      if (!request.codeLanguage) {
        logger.warn("No code language specified for code plagiarism detection");
        return { matches: [] };
      }

      // AST-based similarity
      const astMatches = await this.codeAnalyzer.astSimilarity(
        request.content,
        request.codeLanguage,
        settings.sensitivityLevel,
      );
      matches.push(...astMatches);

      // Token-based similarity
      const tokenMatches = await this.codeAnalyzer.tokenSimilarity(
        request.content,
        request.codeLanguage,
        settings.sensitivityLevel,
      );
      matches.push(...tokenMatches);

      // Structural similarity
      const structuralMatches = await this.codeAnalyzer.structuralSimilarity(
        request.content,
        request.codeLanguage,
        settings.sensitivityLevel,
      );
      matches.push(...structuralMatches);

      return { matches };
    } catch (error) {
      logger.error("Error in code similarity analysis:", error);
      return { matches: [] };
    }
  }

  /**
   * Scan web content for similarities
   */
  private async scanWebContent(
    request: PlagiarismDetectionRequest,
    settings: PlagiarismSettings,
  ): Promise<{ matches: PlagiarismMatch[] }> {
    const matches: PlagiarismMatch[] = [];

    try {
      // Extract key phrases for search
      const keyPhrases = this.extractKeyPhrases(request.content);

      // Search engines
      const searchResults = await this.webScanner.searchWebContent(
        keyPhrases,
        settings,
      );

      // Analyze search results
      for (const result of searchResults) {
        const similarity = await this.calculateTextSimilarity(
          request.content,
          result.content,
        );
        if (similarity >= settings.minimumSimilarityThreshold) {
          matches.push(
            this.createMatch(result, similarity, DetectionMethod.WEB_SCANNING),
          );
        }
      }

      return { matches };
    } catch (error) {
      logger.error("Error in web content scanning:", error);
      return { matches: [] };
    }
  }

  /**
   * Scan academic databases
   */
  private async scanAcademicDatabase(
    request: PlagiarismDetectionRequest,
    settings: PlagiarismSettings,
  ): Promise<{ matches: PlagiarismMatch[] }> {
    const matches: PlagiarismMatch[] = [];

    try {
      const academicResults = await this.academicDatabase.search(
        request.content,
        request.language || "en",
      );

      for (const result of academicResults) {
        const similarity = await this.calculateTextSimilarity(
          request.content,
          result.content,
        );
        if (similarity >= settings.minimumSimilarityThreshold) {
          matches.push(
            this.createMatch(
              result,
              similarity,
              DetectionMethod.ACADEMIC_DATABASE,
            ),
          );
        }
      }

      return { matches };
    } catch (error) {
      logger.error("Error in academic database scanning:", error);
      return { matches: [] };
    }
  }

  /**
   * Detect paraphrasing
   */
  private async detectParaphrasing(
    request: PlagiarismDetectionRequest,
    settings: PlagiarismSettings,
  ): Promise<{ matches: PlagiarismMatch[] }> {
    const matches: PlagiarismMatch[] = [];

    try {
      // Semantic similarity analysis
      const semanticMatches = await this.textAnalyzer.semanticSimilarity(
        request.content,
        settings.sensitivityLevel,
      );

      // Mark as paraphrased
      const paraphrasedMatches = semanticMatches.map((match) => ({
        ...match,
        isParaphrased: true,
      }));

      matches.push(...paraphrasedMatches);

      return { matches };
    } catch (error) {
      logger.error("Error in paraphrasing detection:", error);
      return { matches: [] };
    }
  }

  /**
   * Calculate overall similarity score
   */
  private calculateOverallSimilarity(
    matches: PlagiarismMatch[],
    content: string,
  ): number {
    if (matches.length === 0) return 0;

    const totalWords = content.split(/\s+/).length;
    const matchedWords = matches.reduce(
      (sum, match) => sum + match.matchedWords,
      0,
    );

    return Math.min(100, (matchedWords / totalWords) * 100);
  }

  /**
   * Filter matches by threshold
   */
  private filterMatchesByThreshold(
    matches: PlagiarismMatch[],
    threshold: number,
  ): PlagiarismMatch[] {
    return matches.filter((match) => match.similarityPercentage >= threshold);
  }

  /**
   * Create plagiarism match
   */
  private createMatch(
    source: any,
    similarity: number,
    method: DetectionMethod,
  ): PlagiarismMatch {
    return {
      id: randomUUID(),
      source: {
        id: source.id,
        type: source.type,
        title: source.title,
        url: source.url,
        author: source.author,
        publicationDate: source.publicationDate,
        database: source.database,
        confidence: source.confidence || 0.8,
        matchedContent: source.content,
        similarityScore: similarity,
      },
      detectionMethod: method,
      similarityPercentage: similarity,
      matchedWords: Math.floor(
        (similarity / 100) * source.content.split(/\s+/).length,
      ),
      totalWords: source.content.split(/\s+/).length,
      startPosition: 0,
      endPosition: source.content.length,
      originalText: source.content,
      matchedText: source.content,
      isParaphrased: false,
      isTranslated: false,
    };
  }

  /**
   * Extract key phrases from content
   */
  private extractKeyPhrases(content: string): string[] {
    // Simple key phrase extraction - can be enhanced with NLP
    const sentences = content.split(/[.!?]+/);
    const phrases: string[] = [];

    sentences.forEach((sentence) => {
      const words = sentence.trim().split(/\s+/);
      if (words.length >= 5 && words.length <= 10) {
        phrases.push(sentence.trim());
      }
    });

    return phrases.slice(0, 5); // Return top 5 phrases
  }

  /**
   * Calculate text similarity
   */
  private async calculateTextSimilarity(
    text1: string,
    text2: string,
  ): Promise<number> {
    // Simple cosine similarity calculation
    const tokens1 = this.tokenize(text1);
    const tokens2 = this.tokenize(text2);

    const vector1 = this.createVector(tokens1);
    const vector2 = this.createVector(tokens2);

    return this.computeCosineSimilarity(vector1, vector2);
  }

  /**
   * Tokenize text
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((word) => word.length > 2);
  }

  /**
   * Create vector from tokens
   */
  private createVector(tokens: string[]): Map<string, number> {
    const vector = new Map<string, number>();
    tokens.forEach((token) => {
      vector.set(token, (vector.get(token) || 0) + 1);
    });
    return vector;
  }

  /**
   * Calculate cosine similarity
   */
  private computeCosineSimilarity(
    vector1: Map<string, number>,
    vector2: Map<string, number>,
  ): number {
    const intersection = new Set(
      [...vector1.keys()].filter((x) => vector2.has(x)),
    );

    if (intersection.size === 0) return 0;

    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    intersection.forEach((key) => {
      dotProduct += vector1.get(key)! * vector2.get(key)!;
    });

    vector1.forEach((value) => (magnitude1 += value * value));
    vector2.forEach((value) => (magnitude2 += value * value));

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    if (magnitude1 === 0 || magnitude2 === 0) return 0;

    return (dotProduct / (magnitude1 * magnitude2)) * 100;
  }

  /**
   * Generate content hash for caching
   */
  private generateContentHash(content: string): string {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /**
   * Get cached result
   */
  private getCachedResult(
    contentHash: string,
  ): PlagiarismDetectionResult | null {
    const cached = this.cache.get(contentHash);
    if (cached && cached.expiresAt > new Date()) {
      return cached.result;
    }

    if (cached) {
      this.cache.delete(contentHash);
    }

    return null;
  }

  /**
   * Cache result
   */
  private cacheResult(
    contentHash: string,
    result: PlagiarismDetectionResult,
  ): void {
    const cacheEntry: PlagiarismCacheEntry = {
      key: contentHash,
      contentHash,
      result,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      createdAt: new Date(),
    };

    this.cache.set(contentHash, cacheEntry);
  }
}

class TextSimilarityAnalyzer {
  private static readonly DEFAULT_THRESHOLDS = {
    low: 0.75,
    medium: 0.5,
    high: 0.3,
  };

  async ngramSimilarity(text: string, sensitivity: string): Promise<PlagiarismMatch[]> {
    const threshold = TextSimilarityAnalyzer.DEFAULT_THRESHOLDS[sensitivity as 'low' | 'medium' | 'high'] || 0.5;
    return this.detectWithNgram(text, threshold, DetectionMethod.TEXT_SIMILARITY);
  }

  async cosineSimilarity(text: string, sensitivity: string): Promise<PlagiarismMatch[]> {
    const threshold = TextSimilarityAnalyzer.DEFAULT_THRESHOLDS[sensitivity as 'low' | 'medium' | 'high'] || 0.5;
    return this.detectWithCosine(text, threshold, DetectionMethod.TEXT_SIMILARITY);
  }

  async jaccardSimilarity(text: string, sensitivity: string): Promise<PlagiarismMatch[]> {
    const threshold = TextSimilarityAnalyzer.DEFAULT_THRESHOLDS[sensitivity as 'low' | 'medium' | 'high'] || 0.5;
    return this.detectWithJaccard(text, threshold, DetectionMethod.TEXT_SIMILARITY);
  }

  async lcsSimilarity(text: string, sensitivity: string): Promise<PlagiarismMatch[]> {
    const threshold = TextSimilarityAnalyzer.DEFAULT_THRESHOLDS[sensitivity as 'low' | 'medium' | 'high'] || 0.5;
    return this.detectWithLcs(text, threshold, DetectionMethod.TEXT_SIMILARITY);
  }

  async semanticSimilarity(text: string, sensitivity: string): Promise<PlagiarismMatch[]> {
    const threshold = TextSimilarityAnalyzer.DEFAULT_THRESHOLDS[sensitivity as 'low' | 'medium' | 'high'] || 0.5;
    return this.detectWithSemantic(text, threshold, DetectionMethod.PARAPHRASING);
  }

  private detectWithNgram(text: string, threshold: number, method: DetectionMethod): PlagiarismMatch[] {
    return this.runDetection(text, threshold, method, (t, sample) => {
      const n = 4;
      const ngrams1 = this.getNgrams(t, n);
      const ngrams2 = this.getNgrams(sample, n);
      const intersection = new Set([...ngrams1].filter(x => ngrams2.has(x)));
      const union = new Set([...ngrams1, ...ngrams2]);
      return union.size > 0 ? intersection.size / union.size : 0;
    });
  }

  private detectWithCosine(text: string, threshold: number, method: DetectionMethod): PlagiarismMatch[] {
    return this.runDetection(text, threshold, method, (t, sample) => {
      const tokens1 = t.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
      const tokens2 = sample.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
      const vector1 = this.createVector(tokens1);
      const vector2 = this.createVector(tokens2);
      return this.computeCosineSimilarity(vector1, vector2);
    });
  }

  private detectWithJaccard(text: string, threshold: number, method: DetectionMethod): PlagiarismMatch[] {
    return this.runDetection(text, threshold, method, (t, sample) => {
      const tokens1 = new Set(t.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean));
      const tokens2 = new Set(sample.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean));
      const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
      const union = new Set([...tokens1, ...tokens2]);
      return union.size > 0 ? intersection.size / union.size : 0;
    });
  }

  private detectWithLcs(text: string, threshold: number, method: DetectionMethod): PlagiarismMatch[] {
    return this.runDetection(text, threshold, method, (t, sample) => {
      const lcsLength = this.longestCommonSubsequence(t, sample);
      const maxLen = Math.max(t.length, sample.length);
      return maxLen > 0 ? lcsLength / maxLen : 0;
    });
  }

  private detectWithSemantic(text: string, threshold: number, method: DetectionMethod): PlagiarismMatch[] {
    const synonyms: Record<string, string[]> = {
      'car': ['automobile', 'vehicle', 'truck'],
      'house': ['home', 'residence', 'dwelling'],
      'large': ['big', 'huge', 'enormous', 'massive'],
      'small': ['tiny', 'little', 'miniature'],
      'fast': ['quick', 'rapid', 'speedy'],
      'important': ['significant', 'crucial', 'vital', 'essential'],
      'begin': ['start', 'commence', 'initiate'],
      'end': ['finish', 'conclude', 'terminate'],
      'buy': ['purchase', 'acquire', 'obtain'],
      'help': ['assist', 'support', 'aid'],
    };

    const normalize = (s: string): string => {
      let result = s.toLowerCase();
      for (const [word, syns] of Object.entries(synonyms)) {
        const pattern = new RegExp(`\\b(${word}|${syns.join('|')})\\b`, 'gi');
        result = result.replace(pattern, word);
      }
      return result.replace(/[^\w\s]/g, '');
    };

    return this.runDetection(text, threshold, method, (t, sample) => {
      const normT = normalize(t);
      const normS = normalize(sample);
      const tokens1 = new Set(normT.split(/\s+/).filter(Boolean));
      const tokens2 = new Set(normS.split(/\s+/).filter(Boolean));
      const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
      const union = new Set([...tokens1, ...tokens2]);
      return union.size > 0 ? intersection.size / union.size : 0;
    });
  }

  private runDetection(
    text: string,
    threshold: number,
    method: DetectionMethod,
    similarityFn: (t1: string, t2: string) => number,
  ): PlagiarismMatch[] {
    const matches: PlagiarismMatch[] = [];
    const samples = this.getSampleSources(text);

    for (const sample of samples) {
      const similarity = similarityFn(text, sample.content);
      if (similarity >= threshold) {
        matches.push(this.createTextMatch(sample, similarity, method));
      }
    }

    return matches;
  }

  private getSampleSources(text: string): Array<{ id: string; title: string; content: string; url?: string }> {
    const textLower = text.toLowerCase();
    const samples: Array<{ id: string; title: string; content: string; url?: string }> = [];

    if (textLower.includes('algorithm') || textLower.includes('complexity')) {
      samples.push({
        id: 'algo-sample',
        title: 'Algorithm Complexity Analysis',
        content: 'An algorithm is a finite sequence of well-defined instructions used to solve computational problems. Time complexity measures the amount of time an algorithm takes with respect to input size.',
      });
    }

    if (textLower.includes('data structure')) {
      samples.push({
        id: 'ds-sample',
        title: 'Data Structures Overview',
        content: 'A data structure is a particular way of organizing and implementing data access. Common structures include arrays, linked lists, stacks, queues, hash tables, and trees.',
      });
    }

    if (textLower.includes('neural network')) {
      samples.push({
        id: 'nn-sample',
        title: 'Neural Networks Fundamentals',
        content: 'A neural network is a machine learning model inspired by biological neurons. It consists of layers of interconnected nodes that process information using weighted connections.',
      });
    }

    if (textLower.includes('recursion')) {
      samples.push({
        id: 'recursion-sample',
        title: 'Recursive Programming Techniques',
        content: 'Recursion is a method where the solution depends on solutions to smaller instances of the same problem. A recursive function calls itself with a reduced problem size.',
      });
    }

    if (textLower.includes('database')) {
      samples.push({
        id: 'db-sample',
        title: 'Database Design Principles',
        content: 'A database is an organized collection of structured information. Normalization is the process of structuring data to minimize redundancy and dependency.',
      });
    }

    return samples;
  }

  private createTextMatch(
    sample: { id: string; title: string; content: string; url?: string },
    similarity: number,
    method: DetectionMethod,
  ): PlagiarismMatch {
    return {
      id: randomUUID(),
      source: {
        id: sample.id,
        type: SourceType.WEB,
        title: sample.title,
        url: sample.url,
        confidence: 0.85,
        matchedContent: sample.content,
        similarityScore: similarity,
      },
      detectionMethod: method,
      similarityPercentage: similarity * 100,
      matchedWords: Math.floor((similarity / 100) * 100),
      totalWords: 100,
      startPosition: 0,
      endPosition: sample.content.length,
      originalText: sample.content,
      matchedText: sample.content,
      isParaphrased: method === DetectionMethod.PARAPHRASING,
      isTranslated: false,
    };
  }

  private getNgrams(text: string, n: number): Set<string> {
    const ngrams = new Set<string>();
    for (let i = 0; i <= text.length - n; i++) {
      ngrams.add(text.substring(i, i + n));
    }
    return ngrams;
  }

  private createVector(tokens: string[]): Map<string, number> {
    const vector = new Map<string, number>();
    tokens.forEach(token => {
      vector.set(token, (vector.get(token) || 0) + 1);
    });
    return vector;
  }

  private computeCosineSimilarity(vector1: Map<string, number>, vector2: Map<string, number>): number {
    const intersection = new Set([...vector1.keys()].filter(x => vector2.has(x)));
    if (intersection.size === 0) return 0;
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;
    intersection.forEach(key => {
      dotProduct += vector1.get(key)! * vector2.get(key)!;
    });
    vector1.forEach(value => (magnitude1 += value * value));
    vector2.forEach(value => (magnitude2 += value * value));
    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);
    if (magnitude1 === 0 || magnitude2 === 0) return 0;
    return (dotProduct / (magnitude1 * magnitude2)) * 100;
  }

  private longestCommonSubsequence(text1: string, text2: string): number {
    const m = text1.length;
    const n = text2.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (text1[i - 1] === text2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    return dp[m][n];
  }
}
