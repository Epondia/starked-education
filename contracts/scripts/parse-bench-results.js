#!/usr/bin/env node
// Save the JSON output from bench_gas example to current.json

const fs = require('fs');
const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile || !outputFile) {
    console.error('Usage: node parse-bench-results.js <input.json> <output.json>');
    process.exit(1);
}

try {
    const content = fs.readFileSync(inputFile, 'utf8');
    // The content should be the JSON emitted by the example
    // Validate it's valid JSON
    JSON.parse(content);
    fs.writeFileSync(outputFile, content);
    console.log(`✅ Parsed benchmark results saved to ${outputFile}`);
} catch (err) {
    console.error('Failed to parse benchmark output:', err.message);
    process.exit(1);
}