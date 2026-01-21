/**
 * Step 3.1 Audit Tests - Event Worker + Generator
 * 
 * Tests:
 * 1. Property tests: generate 10,000 candidates; never invalid numbers or duplicates
 * 2. Determinism: same event + same seed → same output
 * 3. Simulated event replay: run past timestamps without timeouts
 */

import {
    generateNumbers,
    validateNumbers,
    digitalRoot,
    GAME_CONFIGS,
    Strategy,
    GenerationResult
} from './index';
import { buildHistoricalStats, HistoricalStats } from './history';

// Test configuration
const PROPERTY_TEST_COUNT = 10000;
const DETERMINISM_TEST_COUNT = 100;
const REPLAY_TEST_COUNT = 50;

interface TestResult {
    name: string;
    passed: boolean;
    details: string;
}

const results: TestResult[] = [];

// Helper to generate random dates across 2026
function randomDate2026(): Date {
    const start = new Date('2026-01-01').getTime();
    const end = new Date('2026-12-31').getTime();
    return new Date(start + Math.random() * (end - start));
}

// Test 1: Property Tests - 10,000 candidates with no invalid numbers or duplicates
function testPropertyValidNumbers(): TestResult {
    const strategies: Strategy[] = ['TITHI', 'NAKSHATRA'];
    const gameSlugs = Object.keys(GAME_CONFIGS);

    let totalGenerated = 0;
    let failures = 0;
    const errorSamples: string[] = [];

    const startTime = Date.now();

    while (totalGenerated < PROPERTY_TEST_COUNT) {
        for (const gameSlug of gameSlugs) {
            for (const strategy of strategies) {
                const eventDate = randomDate2026();
                const seed = Math.floor(Math.random() * 1000000);

                try {
                    const result = generateNumbers(gameSlug, strategy, eventDate, seed);
                    const validation = validateNumbers(result);

                    if (!validation.valid) {
                        failures++;
                        if (errorSamples.length < 5) {
                            errorSamples.push(`${gameSlug}/${strategy}: ${validation.errors.join(', ')}`);
                        }
                    }
                } catch (e) {
                    failures++;
                    if (errorSamples.length < 5) {
                        errorSamples.push(`${gameSlug}/${strategy}: ${e}`);
                    }
                }

                totalGenerated++;
                if (totalGenerated >= PROPERTY_TEST_COUNT) break;
            }
            if (totalGenerated >= PROPERTY_TEST_COUNT) break;
        }
    }

    const elapsed = Date.now() - startTime;

    return {
        name: 'Property Test: Valid Numbers (10,000 candidates)',
        passed: failures === 0,
        details: failures === 0
            ? `All ${PROPERTY_TEST_COUNT} candidates valid. Time: ${elapsed}ms`
            : `${failures} failures. Examples: ${errorSamples.join('; ')}`
    };
}

// Test 2: Determinism - same event + same seed → same output
function testDeterminism(): TestResult {
    const strategies: Strategy[] = ['TITHI', 'NAKSHATRA'];
    const gameSlugs = Object.keys(GAME_CONFIGS);

    let failures = 0;
    const errorSamples: string[] = [];

    for (let i = 0; i < DETERMINISM_TEST_COUNT; i++) {
        const gameSlug = gameSlugs[i % gameSlugs.length];
        const strategy = strategies[i % strategies.length];
        const eventDate = randomDate2026();
        const seed = Math.floor(Math.random() * 1000000);

        // Generate twice with same inputs
        const result1 = generateNumbers(gameSlug, strategy, eventDate, seed);
        const result2 = generateNumbers(gameSlug, strategy, eventDate, seed);

        // Compare outputs
        const mainMatch = JSON.stringify(result1.mainNumbers) === JSON.stringify(result2.mainNumbers);
        const bonusMatch = JSON.stringify(result1.bonusNumbers) === JSON.stringify(result2.bonusNumbers);
        const digitalRootMatch = result1.digitalRoot === result2.digitalRoot;

        if (!mainMatch || !bonusMatch || !digitalRootMatch) {
            failures++;
            if (errorSamples.length < 3) {
                errorSamples.push(`${gameSlug}/${strategy}: main=${mainMatch}, bonus=${bonusMatch}, dr=${digitalRootMatch}`);
            }
        }
    }

    return {
        name: 'Determinism Test: Same Input → Same Output',
        passed: failures === 0,
        details: failures === 0
            ? `All ${DETERMINISM_TEST_COUNT} pairs matched`
            : `${failures} mismatches. Examples: ${errorSamples.join('; ')}`
    };
}

// Test 3: Simulated Event Replay - run past timestamps without timeouts
function testSimulatedReplay(): TestResult {
    const strategies: Strategy[] = ['TITHI', 'NAKSHATRA'];
    const gameSlugs = Object.keys(GAME_CONFIGS);

    // Define specific past dates to test
    const pastDates = [
        new Date('2026-01-01T00:00:00'),
        new Date('2026-01-15T12:30:00'),
        new Date('2026-02-14T18:45:00'),
        new Date('2026-03-20T06:00:00'),
        new Date('2026-06-21T12:00:00'),
        new Date('2026-09-22T15:30:00'),
        new Date('2026-12-21T09:00:00'),
    ];

    let totalGenerated = 0;
    let failures = 0;
    const timings: number[] = [];
    const TIMEOUT_MS = 1000; // 1 second per generation is too slow

    for (const eventDate of pastDates) {
        for (const gameSlug of gameSlugs) {
            for (const strategy of strategies) {
                const startTime = Date.now();

                try {
                    generateNumbers(gameSlug, strategy, eventDate, eventDate.getTime());
                    const elapsed = Date.now() - startTime;
                    timings.push(elapsed);

                    if (elapsed > TIMEOUT_MS) {
                        failures++;
                    }
                } catch {
                    failures++;
                }

                totalGenerated++;
                if (totalGenerated >= REPLAY_TEST_COUNT) break;
            }
            if (totalGenerated >= REPLAY_TEST_COUNT) break;
        }
        if (totalGenerated >= REPLAY_TEST_COUNT) break;
    }

    const avgTime = timings.length > 0 ? timings.reduce((a, b) => a + b, 0) / timings.length : 0;
    const maxTime = timings.length > 0 ? Math.max(...timings) : 0;

    return {
        name: 'Simulated Event Replay: Past Timestamps',
        passed: failures === 0,
        details: failures === 0
            ? `${totalGenerated} replays completed. Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime}ms`
            : `${failures} timeouts/failures`
    };
}

// Test 4: Full Moon Modifier applies correctly
function testFullMoonModifier(): TestResult {
    // Find a known full moon date (February 1, 2026 based on earlier test)
    const fullMoonDate = new Date('2026-02-01T22:10:00Z');

    const results: GenerationResult[] = [];
    let modifierAppliedCount = 0;

    for (const gameSlug of Object.keys(GAME_CONFIGS)) {
        for (const strategy of ['TITHI', 'NAKSHATRA'] as Strategy[]) {
            const result = generateNumbers(gameSlug, strategy, fullMoonDate, 12345);
            results.push(result);
            if (result.modifierApplied) {
                modifierAppliedCount++;
            }
        }
    }

    // At least some should have modifier applied on full moon date
    return {
        name: 'Full Moon Modifier Application',
        passed: modifierAppliedCount > 0,
        details: `${modifierAppliedCount}/${results.length} had modifier applied on Full Moon date`
    };
}

// Test 5: Digital root calculation is correct
function testDigitalRoot(): TestResult {
    const testCases = [
        { input: 1, expected: 1 },
        { input: 9, expected: 9 },
        { input: 10, expected: 1 },
        { input: 15, expected: 6 },
        { input: 27, expected: 9 },
        { input: 30, expected: 3 },
        { input: 99, expected: 9 },
    ];

    // Import digitalRoot from generator (added to top imports)

    let failures = 0;
    const errorSamples: string[] = [];

    for (const tc of testCases) {
        const result = digitalRoot(tc.input);
        if (result !== tc.expected) {
            failures++;
            errorSamples.push(`digitalRoot(${tc.input}) = ${result}, expected ${tc.expected}`);
        }
    }

    return {
        name: 'Digital Root Calculation',
        passed: failures === 0,
        details: failures === 0
            ? `All ${testCases.length} test cases passed`
            : `${failures} failures: ${errorSamples.join(', ')}`
    };
}

// Test 6: All game configs produce valid outputs
function testAllGameConfigs(): TestResult {
    const eventDate = new Date('2026-06-15T12:00:00');
    let failures = 0;
    const errorSamples: string[] = [];

    for (const gameSlug of Object.keys(GAME_CONFIGS)) {
        const config = GAME_CONFIGS[gameSlug];

        for (const strategy of ['TITHI', 'NAKSHATRA'] as Strategy[]) {
            const result = generateNumbers(gameSlug, strategy, eventDate, 42);

            // Verify main numbers count
            if (result.mainNumbers.length !== config.mainCount) {
                failures++;
                errorSamples.push(`${gameSlug}: wrong main count`);
            }

            // Verify bonus if applicable
            if (config.bonusCount && (!result.bonusNumbers || result.bonusNumbers.length !== config.bonusCount)) {
                failures++;
                errorSamples.push(`${gameSlug}: wrong bonus count`);
            }
        }
    }

    return {
        name: 'All Game Configs Produce Valid Outputs',
        passed: failures === 0,
        details: failures === 0
            ? `All 4 games × 2 strategies = 8 combinations valid`
            : `${failures} failures: ${errorSamples.join(', ')}`
    };
}

// Test 7: Historical stats influence generation
function testHistoricalStatsInfluence(): TestResult {
    const config = GAME_CONFIGS['lotto-649'];
    const forcedScores = new Map<number, number>();
    for (let n = config.mainMin; n <= config.mainMax; n++) {
        forcedScores.set(n, 0);
    }
    for (let n = 1; n <= 6; n++) {
        forcedScores.set(n, 100);
    }

    const stats: HistoricalStats = {
        mainScores: forcedScores,
        totalDraws: 10,
        lastDrawAt: new Date('2026-01-17T22:30:00Z')
    };

    const eventDate = new Date('2026-01-18T12:00:00Z');
    const generated = generateNumbers('lotto-649', 'TITHI', eventDate, 42, stats);
    const expected = [1, 2, 3, 4, 5, 6];
    const match = JSON.stringify(generated.mainNumbers) === JSON.stringify(expected);

    const historyDraws = [
        { drawAt: new Date('2026-01-10T22:30:00Z'), numbers: [1, 2, 3, 4, 5, 6] },
        { drawAt: new Date('2026-01-13T22:30:00Z'), numbers: [1, 7, 8, 9, 10, 11] },
        { drawAt: new Date('2026-01-17T22:30:00Z'), numbers: [1, 12, 13, 14, 15, 16] }
    ];

    const statsFromHistory = buildHistoricalStats(historyDraws, {
        slug: 'lotto-649',
        mainCount: 6,
        mainMin: 1,
        mainMax: 49
    });
    const frequentScore = statsFromHistory.mainScores.get(1) ?? 0;
    const rareScore = statsFromHistory.mainScores.get(49) ?? 0;
    const scoringOk = frequentScore > rareScore;

    const passed = match && scoringOk;

    return {
        name: 'Historical Stats Influence Generation',
        passed,
        details: passed
            ? 'Forced historical scores drive deterministic picks; frequency scoring behaves as expected'
            : `Forced picks match=${match}, scoringOk=${scoringOk}`
    };
}

// Run all tests
async function runAudit() {
    console.log('='.repeat(60));
    console.log('STEP 3.1 AUDIT - Event Worker + Generator');
    console.log('='.repeat(60));
    console.log('');

    results.push(testPropertyValidNumbers());
    results.push(testDeterminism());
    results.push(testSimulatedReplay());
    results.push(testFullMoonModifier());
    results.push(testDigitalRoot());
    results.push(testAllGameConfigs());
    results.push(testHistoricalStatsInfluence());

    // Print results
    let passCount = 0;
    let failCount = 0;

    for (const result of results) {
        const status = result.passed ? '✅ PASS' : '❌ FAIL';
        console.log(`${status}: ${result.name}`);
        console.log(`       ${result.details}`);
        console.log('');

        if (result.passed) passCount++;
        else failCount++;
    }

    console.log('='.repeat(60));
    console.log(`SUMMARY: ${passCount} passed, ${failCount} failed`);
    console.log('='.repeat(60));

    // Sample outputs for manual review
    console.log('');
    console.log('SAMPLE OUTPUTS (for manual review):');
    console.log('-'.repeat(60));

    const sampleDate = new Date('2026-01-19T14:30:00');

    for (const gameSlug of Object.keys(GAME_CONFIGS).slice(0, 2)) {
        for (const strategy of ['TITHI', 'NAKSHATRA'] as Strategy[]) {
            const result = generateNumbers(gameSlug, strategy, sampleDate, 12345);
            console.log(`${gameSlug} / ${strategy}:`);
            console.log(`  Main: [${result.mainNumbers.join(', ')}]`);
            if (result.bonusNumbers) {
                console.log(`  Bonus: [${result.bonusNumbers.join(', ')}]`);
            }
            console.log(`  Digital Root: ${result.digitalRoot}`);
            console.log(`  Tithi: ${result.tithiIndex}, Nakshatra: ${result.nakshatraIndex}`);
            console.log('');
        }
    }

    // Exit with appropriate code
    process.exit(failCount > 0 ? 1 : 0);
}

runAudit().catch(console.error);
