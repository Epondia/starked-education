/**
 * Report Generation Service for Plagiarism Detection
 * Generates structured plagiarism reports in various formats (JSON, CSV, HTML)
 */

const crypto = require('crypto');

const ReportFormat = {
  JSON: 'json',
  CSV: 'csv',
  HTML: 'html',
};

function generateReport(reportId, cache, format = ReportFormat.JSON) {
  let cacheEntry = null;
  for (const entry of cache.values()) {
    if ((entry.result && entry.result.reportId === reportId) || entry.key === reportId) {
      cacheEntry = entry;
      break;
    }
  }

  if (!cacheEntry) {
    throw new Error(`Report with ID ${reportId} not found`);
  }

  const result = cacheEntry.result;

  switch (format) {
    case ReportFormat.JSON:
      return generateJsonReport(result);
    case ReportFormat.CSV:
      return generateCsvReport(result);
    case ReportFormat.HTML:
      return generateHtmlReport(result);
    default:
      throw new Error(`Unsupported report format: ${format}`);
  }
}

function generateJsonReport(result) {
  const report = {
    reportId: result.reportId,
    status: result.status,
    overallSimilarity: result.overallSimilarity,
    originalityScore: result.originalityScore,
    processingTime: result.processingTime,
    needsReview: result.needsReview,
    generatedAt: new Date().toISOString(),
    summary: {
      totalMatches: result.matches.length,
      highestSimilarity: result.matches.length > 0
        ? Math.max(...result.matches.map(m => m.similarityPercentage))
        : 0,
      averageSimilarity: result.matches.length > 0
        ? result.matches.reduce((sum, m) => sum + m.similarityPercentage, 0) / result.matches.length
        : 0,
      detectionMethodsUsed: [...new Set(result.matches.map(m => m.detectionMethod))],
    },
    matches: result.matches.map(m => ({
      id: m.id,
      source: {
        id: m.source.id,
        type: m.source.type,
        title: m.source.title,
        url: m.source.url,
        author: m.source.author,
        confidence: m.source.confidence,
        similarityScore: m.source.similarityScore,
      },
      detectionMethod: m.detectionMethod,
      similarityPercentage: m.similarityPercentage,
      matchedWords: m.matchedWords,
      totalWords: m.totalWords,
      isParaphrased: m.isParaphrased,
      isTranslated: m.isTranslated,
      originalText: m.originalText,
      matchedText: m.matchedText,
    })),
  };

  return JSON.stringify(report, null, 2);
}

function generateCsvReport(result) {
  const lines = [];
  lines.push('Report ID,Status,Overall Similarity,Originality Score,Processing Time,Needs Review,Match ID,Source ID,Source Type,Source Title,Source URL,Detection Method,Similarity %,Matched Words,Total Words,Is Paraphrased,Is Translated');

  if (result.matches.length === 0) {
    lines.push(`${result.reportId},${result.status},${result.overallSimilarity},${result.originalityScore},${result.processingTime},${result.needsReview},,,,,,,,,,,,`);
  }

  for (const m of result.matches) {
    lines.push([
      `"${result.reportId}"`,
      `"${result.status}"`,
      result.overallSimilarity,
      result.originalityScore,
      result.processingTime,
      result.needsReview,
      `"${m.id}"`,
      `"${m.source.id}"`,
      `"${m.source.type}"`,
      `"${m.source.title}"`,
      `"${m.source.url || ''}"`,
      `"${m.detectionMethod}"`,
      m.similarityPercentage,
      m.matchedWords,
      m.totalWords,
      m.isParaphrased,
      m.isTranslated,
    ].join(','));
  }

  return lines.join('\n');
}

function generateHtmlReport(result) {
  const safeText = (s) => (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeHtml = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Plagiarism Report - ${safeText(result.reportId)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
    .header { background: #f4f4f4; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .summary { display: flex; gap: 20px; margin-bottom: 20px; }
    .summary-card { flex: 1; background: #f9f9f9; padding: 15px; border-radius: 8px; text-align: center; }
    .score-high { color: #d32f2f; }
    .score-medium { color: #ff9800; }
    .score-low { color: #4caf50; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #3f51b5; color: white; }
    .match { margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 4px; }
    .matched-text { background: #fff3e0; padding: 10px; margin-top: 10px; border-left: 4px solid #ff9800; font-family: monospace; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Plagiarism Detection Report</h1>
    <p><strong>Report ID:</strong> ${safeText(result.reportId)}</p>
    <p><strong>Status:</strong> ${safeText(result.status)}</p>
    <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
  </div>
  <div class="summary">
    <div class="summary-card">
      <h3>Overall Similarity</h3>
      <div class="score-${result.overallSimilarity > 60 ? 'high' : result.overallSimilarity > 30 ? 'medium' : 'low'}">
        ${result.overallSimilarity.toFixed(2)}%
      </div>
    </div>
    <div class="summary-card">
      <h3>Originality Score</h3>
      <div class="score-${result.originalityScore < 40 ? 'high' : result.originalityScore < 70 ? 'medium' : 'low'}">
        ${result.originalityScore.toFixed(2)}%
      </div>
    </div>
    <div class="summary-card">
      <h3>Processing Time</h3>
      <div>${result.processingTime.toFixed(2)}s</div>
    </div>
    <div class="summary-card">
      <h3>Needs Review</h3>
      <div>${result.needsReview ? 'Yes' : 'No'}</div>
    </div>
  </div>`;

  if (result.matches.length > 0) {
    html += `
  <h2>Matches Found (${result.matches.length})</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Source Title</th>
        <th>Source Type</th>
        <th>URL</th>
        <th>Similarity</th>
        <th>Detection Method</th>
        <th>Paraphrased</th>
        <th>Translated</th>
      </tr>
    </thead>
    <tbody>`;

    result.matches.forEach((m, idx) => {
      html += `
      <tr>
        <td>${idx + 1}</td>
        <td>${safeHtml(m.source.title)}</td>
        <td>${safeHtml(m.source.type)}</td>
        <td>${m.source.url ? `<a href="${safeHtml(m.source.url)}">Link</a>` : 'N/A'}</td>
        <td>${m.similarityPercentage.toFixed(2)}%</td>
        <td>${safeHtml(m.detectionMethod)}</td>
        <td>${m.isParaphrased ? 'Yes' : 'No'}</td>
        <td>${m.isTranslated ? 'Yes' : 'No'}</td>
      </tr>`;
    });

    html += `
    </tbody>
  </table>

  <h2>Detailed Matches</h2>`;

    result.matches.forEach((m, idx) => {
      html += `
  <div class="match">
    <h3>Match #${idx + 1}: ${safeHtml(m.source.title)}</h3>
    <p><strong>Source ID:</strong> ${safeHtml(m.source.id)}</p>
    <p><strong>Source Type:</strong> ${safeHtml(m.source.type)}</p>
    ${m.source.url ? `<p><strong>URL:</strong> <a href="${safeHtml(m.source.url)}">${safeHtml(m.source.url)}</a></p>` : ''}
    ${m.source.author ? `<p><strong>Author:</strong> ${safeHtml(m.source.author)}</p>` : ''}
    <p><strong>Detection Method:</strong> ${safeHtml(m.detectionMethod)}</p>
    <p><strong>Similarity:</strong> ${m.similarityPercentage.toFixed(2)}% (${m.matchedWords}/${m.totalWords} words matched)</p>
    <p><strong>Paraphrased:</strong> ${m.isParaphrased ? 'Yes' : 'No'} | <strong>Translated:</strong> ${m.isTranslated ? 'Yes' : 'No'}</p>
    <div class="matched-text">
      <strong>Matched Text:</strong><br>
      ${safeHtml(m.matchedText)}
    </div>
  </div>`;
    });
  } else {
    html += `
  <div class="match">
    <h3>No matches found</h3>
    <p>No plagiarism detected. This submission appears to be original.</p>
  </div>`;
  }

  html += `
</body>
</html>`;

  return html;
}

function generateUUID() {
  return crypto.randomUUID();
}

module.exports = {
  generateReport,
  ReportFormat,
  generateJsonReport,
  generateCsvReport,
  generateHtmlReport,
  generateUUID,
};
