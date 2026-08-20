#!/usr/bin/env node
// Issue #212: Parse raw contract gas benchmark output into a results file.
// Usage: node scripts/parse-bench-results.js <raw-input.json> <current.json>
const fs = require('fs');

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !fs.existsSync(inputPath)) {
  console.error('❌ No raw gas benchmark input file found — nothing to parse');
  process.exit(1);
}

if (!outputPath) {
  console.error('❌ Missing output path for parsed benchmark results');
  process.exit(1);
}

try {
  const content = fs.readFileSync(inputPath, 'utf8');

  // The bench_gas example prints a single JSON object, but cargo may emit
  // log lines around it — extract the first balanced { ... } block.
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    console.error('❌ No JSON object found in raw benchmark output');
    process.exit(1);
  }

  const results = JSON.parse(content.slice(start, end + 1));

  // Normalize: keep only numeric gas values, dropping any non-numeric noise.
  const gasResults = {};
  for (const [op, value] of Object.entries(results)) {
    const num = Number(value);
    if (Number.isFinite(num)) {
      gasResults[op] = num;
    }
  }

  if (Object.keys(gasResults).length === 0) {
    console.error('❌ Raw benchmark output contained no numeric gas values');
    process.exit(1);
  }

  const current = {
    generatedAt: new Date().toISOString(),
    ops: gasResults
  };

  fs.writeFileSync(outputPath, JSON.stringify(current, null, 2) + '\n');
  console.log('📊 Parsed gas benchmark results:');
  for (const [op, value] of Object.entries(gasResults)) {
    console.log(`   ${op}: ${value}`);
  }
  console.log(`✅ Wrote ${Object.keys(gasResults).length} results to ${outputPath}`);
} catch (err) {
  console.error('Failed to parse gas benchmark results:', err.message);
  process.exit(1);
}
