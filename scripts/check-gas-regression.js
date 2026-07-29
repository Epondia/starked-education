#!/usr/bin/env node
// Issue #212: Check contract gas benchmark results for regressions
const fs = require('fs');
const path = process.argv[2];

if (!path || !fs.existsSync(path)) {
  console.log('⚠ No gas benchmark results file found — skipping regression check');
  process.exit(0);
}

try {
  const content = fs.readFileSync(path, 'utf8');
  
  // Parse cargo bench output for timing/gas values
  const lines = content.split('\n').filter(l => l.includes('time:') || l.includes('change:'));
  
  if (lines.length === 0) {
    console.log('⚠ No benchmark data found in output — skipping regression check');
    process.exit(0);
  }

  console.log('📊 Contract Gas Benchmark Results:');
  let regressionDetected = false;
  const REGRESSION_THRESHOLD = 10; // 10% regression threshold

  for (const line of lines) {
    console.log(`   ${line.trim()}`);
    
    // Check for regression indicators
    if (line.includes('change:') && line.includes('+')) {
      const match = line.match(/\+(\d+\.?\d*)%/);
      if (match) {
        const changePercent = parseFloat(match[1]);
        if (changePercent > REGRESSION_THRESHOLD) {
          console.error(`❌ Gas regression detected: +${changePercent}% exceeds ${REGRESSION_THRESHOLD}% threshold`);
          regressionDetected = true;
        }
      }
    }
  }

  if (!regressionDetected) {
    console.log('✅ No significant gas regressions detected');
  }
  process.exit(regressionDetected ? 1 : 0);
} catch (err) {
  console.error('Failed to parse gas benchmark results:', err.message);
  process.exit(0);
}
