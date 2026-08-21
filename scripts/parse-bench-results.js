#!/usr/bin/env node
// Issue #212: Parse the JSON output from the `bench_gas` example into a
// normalized results file consumed by the gas regression check.

const fs = require('fs');

const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile || !outputFile) {
  console.error('Usage: node parse-bench-results.js <input.json> <output.json>');
  process.exit(1);
}

function extractJson(content) {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    // The example prints pure JSON, but tolerate stray tool output on stdout
    // by extracting the first balanced JSON object.
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end <= start) throw err;
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

try {
  const content = fs.readFileSync(inputFile, 'utf8');
  const results = extractJson(content);

  if (typeof results !== 'object' || results === null || Array.isArray(results)) {
    throw new Error(`Expected a JSON object of benchmark results, got: ${typeof results}`);
  }

  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2) + '\n');
  console.log(`✅ Parsed ${Object.keys(results).length} benchmark result(s) to ${outputFile}`);
} catch (err) {
  console.error('Failed to parse benchmark output:', err.message);
  process.exit(1);
}
