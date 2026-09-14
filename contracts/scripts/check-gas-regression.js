#!/usr/bin/env node
// Issue #212: Check contract gas benchmark results for regressions

const fs = require('fs');
const path = require('path');

const BASELINE_FILE = 'benchmark-results/baseline.json';
const CURRENT_FILE = 'benchmark-results/current.json';
const THRESHOLD_PERCENT = parseInt(process.env.GAS_REGRESSION_THRESHOLD) || 10; // configurable via env

function loadJson(file) {
    if (!fs.existsSync(file)) return null;
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        console.error(`Failed to parse ${file}:`, e.message);
        return null;
    }
}

function main() {
    const baseline = loadJson(BASELINE_FILE);
    const current = loadJson(CURRENT_FILE);

    if (!current) {
        console.log('⚠ No current benchmark data found – skipping regression check');
        process.exit(0);
    }

    if (!baseline) {
        console.log('⚠ No baseline found – creating one from current results.');
        // Create baseline directory if needed
        const dir = path.dirname(BASELINE_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(BASELINE_FILE, JSON.stringify(current, null, 2));
        console.log(`✅ Baseline saved to ${BASELINE_FILE}`);
        process.exit(0);
    }

    let failed = false;
    let anyComparison = false;

    console.log(`📊 Comparing gas usage (threshold: ${THRESHOLD_PERCENT}% increase)`);

    for (const [name, currentVal] of Object.entries(current)) {
        if (!(name in baseline)) {
            console.warn(`⚠ New benchmark "${name}" has no baseline – skipping (add to baseline manually if intentional)`);
            continue;
        }
        anyComparison = true;
        const baselineVal = baseline[name];
        const change = ((currentVal - baselineVal) / baselineVal) * 100;
        const changeSign = change >= 0 ? '+' : '';
        const msg = `${name}: ${changeSign}${change.toFixed(2)}% (baseline: ${baselineVal}, current: ${currentVal})`;
        if (change > THRESHOLD_PERCENT) {
            console.error(`❌ ${msg} – REGRESSION exceeds ${THRESHOLD_PERCENT}%`);
            failed = true;
        } else {
            console.log(`✅ ${msg}`);
        }
    }

    // Check for removed benchmarks
    for (const name of Object.keys(baseline)) {
        if (!(name in current)) {
            console.warn(`⚠ Benchmark "${name}" is missing from current results (removed?)`);
        }
    }

    if (!anyComparison) {
        console.log('⚠ No common benchmarks found – check your benchmark naming.');
        process.exit(0);
    }

    if (failed) {
        console.error('❌ Gas regression detected – failing CI.');
        process.exit(1);
    } else {
        console.log('✅ All benchmarks are within threshold.');
        process.exit(0);
    }
}

main();