/**
 * Multi-Strategy Audit Tests
 *
 * Validates that each strategy responds to different historical profiles
 * and still produces valid outputs.
 */

import { GAME_CONFIGS } from './index';
import { STRATEGIES, generateMultiStrategy } from './multi-strategy';
import { buildMultiStrategyStats } from './multi-strategy-stats';
import { HistoricalDraw } from './history';

interface TestResult {
    name: string;
    passed: boolean;
    details: string;
}

const results: TestResult[] = [];

function buildSyntheticDraws(numbers: number[], count: number): HistoricalDraw[] {
    const draws: HistoricalDraw[] = [];
    const start = new Date('2025-01-01T00:00:00Z').getTime();

    for (let i = 0; i < count; i++) {
        draws.push({
            drawAt: new Date(start + i * 24 * 60 * 60 * 1000),
            numbers: [...numbers]
        });
    }

    return draws;
}

function validateNumbers(numbers: number[], min: number, max: number, count: number): boolean {
    if (numbers.length !== count) return false;
    const unique = new Set(numbers);
    if (unique.size !== count) return false;
    return numbers.every(n => n >= min && n <= max);
}

function testStrategySensitivity(): TestResult {
    const config = GAME_CONFIGS['lotto-max'];
    const lowProfile = buildSyntheticDraws([1, 2, 3, 4, 5, 6, 7], 30);
    const highProfile = buildSyntheticDraws([5, 15, 25, 35, 45, 46, 50], 30);

    const statsLow = buildMultiStrategyStats(lowProfile, config);
    const statsHigh = buildMultiStrategyStats(highProfile, config);

    const eventDate = new Date('2026-01-20T00:00:00Z');
    const seed = 123456;
    let failures = 0;
    const samples: string[] = [];

    for (const strategy of STRATEGIES) {
        const low = generateMultiStrategy('lotto-max', strategy, eventDate, seed, statsLow);
        const high = generateMultiStrategy('lotto-max', strategy, eventDate, seed, statsHigh);

        const lowValid = validateNumbers(low.mainNumbers, config.mainMin, config.mainMax, config.mainCount);
        const highValid = validateNumbers(high.mainNumbers, config.mainMin, config.mainMax, config.mainCount);
        const differs = JSON.stringify(low.mainNumbers) !== JSON.stringify(high.mainNumbers);

        if (!lowValid || !highValid || !differs) {
            failures++;
            if (samples.length < 5) {
                samples.push(`${strategy}: validLow=${lowValid}, validHigh=${highValid}, differs=${differs}`);
            }
        }
    }

    return {
        name: 'Strategies respond to different historical profiles',
        passed: failures === 0,
        details: failures === 0 ? 'All strategies produced valid, distinct outputs' : samples.join('; ')
    };
}

async function runAudit() {
    console.log('='.repeat(60));
    console.log('MULTI-STRATEGY AUDIT');
    console.log('='.repeat(60));
    console.log('');

    results.push(testStrategySensitivity());

    let passCount = 0;
    let failCount = 0;

    for (const result of results) {
        const status = result.passed ? 'PASS' : 'FAIL';
        console.log(`${status}: ${result.name}`);
        console.log(`  ${result.details}`);
        if (result.passed) passCount++;
        else failCount++;
    }

    console.log('='.repeat(60));
    console.log(`SUMMARY: ${passCount} passed, ${failCount} failed`);
    console.log('='.repeat(60));

    process.exit(failCount > 0 ? 1 : 0);
}

runAudit().catch(console.error);
