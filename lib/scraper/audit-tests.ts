/**
 * Step 4.1 Audit Tests - Results Scraping + Evaluation + Matching
 * 
 * Tests:
 * 1. Parser robustness: HTML change causes clear error + raw HTML saved
 * 2. Idempotency: Rerun scraper; does not duplicate draws
 * 3. Fixture tests: Known candidate vs known official draw → expected match counts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import {
    scrapeGameHistory,
    parsePastWinningNumbers,
    ingestHistoricalDraws
} from '../scraper/index';
import {
    computeMatches,
} from '../evaluation/index';

const prisma = new PrismaClient();

interface TestResult {
    name: string;
    passed: boolean;
    details: string;
}

const results: TestResult[] = [];



// Test 1: Parser robustness - HTML change causes clear error + raw HTML saved
async function testParserRobustness(): Promise<TestResult> {
    const ERROR_DIR = path.join(process.cwd(), 'scraper-errors');

    // Clean up any previous error files
    if (fs.existsSync(ERROR_DIR)) {
        const files = fs.readdirSync(ERROR_DIR);
        for (const file of files) {
            if (file.startsWith('daily-grand_')) {
                fs.unlinkSync(path.join(ERROR_DIR, file));
            }
        }
    }

    // Test with invalid payload (simulating structure change)
    const invalidPayload = { unexpected: 'shape' };
    const result = await scrapeGameHistory('daily-grand', { mockPayload: invalidPayload });

    // Verify error was captured
    const hasError = result.errors.length > 0;
    const payloadSaved = result.rawPayloadSaved !== undefined;

    // Verify the saved file exists and contains the error
    let savedFileValid = false;
    if (payloadSaved && result.rawPayloadSaved) {
        if (fs.existsSync(result.rawPayloadSaved)) {
            const content = fs.readFileSync(result.rawPayloadSaved, 'utf-8');
            savedFileValid = content.includes('Missing draw list') && content.includes('unexpected');
        }
    }

    const passed = hasError && payloadSaved && savedFileValid;

    return {
        name: 'Parser Robustness: Payload Change → Error + Raw Payload Saved',
        passed,
        details: passed
            ? `Error captured: "${result.errors[0]?.substring(0, 50)}...". Payload saved to ${result.rawPayloadSaved}`
            : `hasError=${hasError}, payloadSaved=${payloadSaved}, savedFileValid=${savedFileValid}`
    };
}

// Test 2: Idempotency - Rerun scraper; does not duplicate draws
async function testIdempotency(): Promise<TestResult> {
    // Clean up first
    await prisma.historicalDraw.deleteMany({
        where: {
            game: { slug: 'lotto-max' }
        }
    });

    // Create mock payload with test draw
    const mockPayload = {
        response: {
            statusCode: '0',
            winnings: {
                lottomax: {
                    draw: [
                        {
                            date: '2026-01-14',
                            main: {
                                regular: '05,12,23,34,45,48,50',
                                bonus: '33'
                            }
                        }
                    ]
                }
            }
        }
    };

    // First scrape and ingest
    const result1 = await scrapeGameHistory('lotto-max', { mockPayload });
    const ingest1 = await ingestHistoricalDraws(result1.draws);

    // Second scrape and ingest (should be idempotent)
    const result2 = await scrapeGameHistory('lotto-max', { mockPayload });
    const ingest2 = await ingestHistoricalDraws(result2.draws);

    // Third scrape and ingest
    const result3 = await scrapeGameHistory('lotto-max', { mockPayload });
    const ingest3 = await ingestHistoricalDraws(result3.draws);

    // Count draws in database
    const game = await prisma.game.findUnique({ where: { slug: 'lotto-max' } });
    const drawCount = await prisma.historicalDraw.count({
        where: { gameId: game?.id }
    });

    const passed = drawCount === 1 && ingest1.inserted === 1 && ingest2.inserted === 1 && ingest3.inserted === 1;

    return {
        name: 'Idempotency: Rerun Scraper Does Not Duplicate Draws',
        passed,
        details: passed
            ? `Single draw in DB after 3 ingestions. Upserts worked correctly.`
            : `Expected 1 draw, found ${drawCount}. Inserts: ${ingest1.inserted}, ${ingest2.inserted}, ${ingest3.inserted}`
    };
}

// Test 3: Fixture tests - Known candidate vs known official draw → expected match counts
async function testFixtureMatching(): Promise<TestResult> {
    // Test case 1: 3 matches
    const match1 = computeMatches(
        [1, 2, 3, 4, 5, 6],      // Generated
        [1, 2, 3, 10, 11, 12],   // Official
        undefined,
        undefined
    );

    // Test case 2: 0 matches
    const match2 = computeMatches(
        [1, 2, 3, 4, 5, 6],
        [10, 11, 12, 13, 14, 15],
        undefined,
        undefined
    );

    // Test case 3: 6 matches (jackpot)
    const match3 = computeMatches(
        [1, 2, 3, 4, 5, 6],
        [1, 2, 3, 4, 5, 6],
        undefined,
        undefined
    );

    // Test case 4: With Grand Number match
    const match4 = computeMatches(
        [10, 20, 30, 40, 49],
        [10, 11, 12, 13, 14],    // 1 main match
        [3],                      // Generated Grand
        [3]                       // Official Grand
    );

    const test1Pass = match1.mainMatches === 3;
    const test2Pass = match2.mainMatches === 0 && match2.category === 'No Match';
    const test3Pass = match3.mainMatches === 6 && match3.category.includes('Jackpot');
    const test4Pass = match4.mainMatches === 1 && match4.grandMatches === 1 && match4.category.includes('Grand');

    const allPassed = test1Pass && test2Pass && test3Pass && test4Pass;

    return {
        name: 'Fixture Tests: Known Inputs → Expected Match Counts',
        passed: allPassed,
        details: allPassed
            ? `All 4 fixture tests passed: 3-match, 0-match, jackpot, grand-match`
            : `Failures: 3-match=${test1Pass}, 0-match=${test2Pass}, jackpot=${test3Pass}, grand=${test4Pass}`
    };
}

// Test 4: Match counting edge cases
async function testMatchEdgeCases(): Promise<TestResult> {
    const testCases = [
        {
            name: 'Empty arrays',
            gen: [] as number[],
            off: [] as number[],
            expected: 0
        },
        {
            name: 'Single match',
            gen: [42],
            off: [42],
            expected: 1
        },
        {
            name: 'No overlap large sets',
            gen: [1, 2, 3, 4, 5, 6, 7],
            off: [10, 20, 30, 40, 50, 8, 9],
            expected: 0
        },
        {
            name: 'Partial overlap',
            gen: [1, 5, 10, 15, 20, 25, 30],
            off: [5, 15, 25, 35, 45, 2, 3],
            expected: 3
        }
    ];

    let failures = 0;
    const failedCases: string[] = [];

    for (const tc of testCases) {
        const result = computeMatches(tc.gen, tc.off);
        if (result.mainMatches !== tc.expected) {
            failures++;
            failedCases.push(`${tc.name}: got ${result.mainMatches}, expected ${tc.expected}`);
        }
    }

    return {
        name: 'Match Edge Cases',
        passed: failures === 0,
        details: failures === 0
            ? `All ${testCases.length} edge case tests passed`
            : `${failures} failures: ${failedCases.join(', ')}`
    };
}

// Test 5: Category assignment
async function testCategoryAssignment(): Promise<TestResult> {
    const testCases = [
        { matches: 0, expectedContains: 'No Match' },
        { matches: 1, expectedContains: '1 Match' },
        { matches: 4, expectedContains: 'Prize' },
        { matches: 6, expectedContains: 'Jackpot' },
    ];

    let failures = 0;
    const failedCases: string[] = [];

    for (const tc of testCases) {
        // Create arrays with the right number of matches
        const gen = Array.from({ length: tc.matches }, (_, i) => i + 1);
        const off = Array.from({ length: 6 }, (_, i) => i + 1);

        const result = computeMatches(gen, off);
        if (!result.category.includes(tc.expectedContains)) {
            failures++;
            failedCases.push(`${tc.matches} matches: got "${result.category}", expected to contain "${tc.expectedContains}"`);
        }
    }

    return {
        name: 'Category Assignment',
        passed: failures === 0,
        details: failures === 0
            ? `All ${testCases.length} category tests passed`
            : `${failures} failures: ${failedCases.join(', ')}`
    };
}

// Test 6: Valid mock HTML parsing
async function testValidMockParsing(): Promise<TestResult> {
    const fixturePath = path.join(process.cwd(), 'scraper-fixtures', 'olg-past-winning-numbers-lotto649.json');
    const raw = fs.readFileSync(fixturePath, 'utf-8');
    const payload = JSON.parse(raw);
    const parsed = parsePastWinningNumbers(payload, 'lotto-649');

    const passed = parsed.length > 0 &&
        parsed[0].numbers.length === 6 &&
        typeof parsed[0].drawAt.getTime() === 'number';

    return {
        name: 'Valid Fixture Parsing',
        passed,
        details: passed
            ? `Successfully parsed ${parsed.length} draws from fixture JSON`
            : `Parse failed: parsed=${parsed.length}`
    };
}

// Run all tests
async function runAudit() {
    console.log('='.repeat(60));
    console.log('STEP 4.1 AUDIT - Results Scraping + Evaluation + Matching');
    console.log('='.repeat(60));
    console.log('');

    try {
        results.push(await testParserRobustness());
        results.push(await testIdempotency());
        results.push(await testFixtureMatching());
        results.push(await testMatchEdgeCases());
        results.push(await testCategoryAssignment());
        results.push(await testValidMockParsing());
    } catch (e) {
        console.error('Error during tests:', e);
    }

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

    await prisma.$disconnect();

    // Exit with appropriate code
    process.exit(failCount > 0 ? 1 : 0);
}

runAudit().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
