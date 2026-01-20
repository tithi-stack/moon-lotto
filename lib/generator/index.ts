/**
 * Number Generator - Moon Lotto
 * 
 * Generates lottery picks based on Tithi/Nakshatra strategies with:
 * - Historical DB-derived scoring (simplified for MVP)
 * - Digital root bias based on Tithi/Nakshatra
 * - Full Moon modifier
 * - Deterministic output with seeded RNG
 */

import { getTithi, getNakshatra, isFullMoonDate } from '../astronomy/engine';
import { HistoricalStats } from './history';

// Game configurations
export interface GameConfig {
    slug: string;
    name: string;
    mainCount: number;      // Number of main numbers to pick
    mainMin: number;        // Min value for main numbers
    mainMax: number;        // Max value for main numbers
    bonusCount?: number;    // Number of bonus numbers (e.g., Grand Number)
    bonusMin?: number;      // Min value for bonus
    bonusMax?: number;      // Max value for bonus
    bonusFromSameDrum?: boolean; // If true, bonus numbers cannot duplicate main numbers
    historyCount?: number;  // Number of historical draws to use for stats
}

export const GAME_CONFIGS: Record<string, GameConfig> = {
    'daily-grand': {
        slug: 'daily-grand',
        name: 'Daily Grand',
        mainCount: 5,
        mainMin: 1,
        mainMax: 49,
        bonusCount: 1,
        bonusMin: 1,
        bonusMax: 7,
        bonusFromSameDrum: false,
        historyCount: 108
    },
    'lotto-max': {
        slug: 'lotto-max',
        name: 'Lotto Max',
        mainCount: 7,
        mainMin: 1,
        mainMax: 50,
        // No bonus generated for Lotto Max (it has bonus ball but we predict main set)
        // Wait, Skill says "7 numbers...". Bonus is secondary.
        // Generator typically predicts the *Main* line (ticket).
        // A ticket is just 7 numbers. The bonus comes from the draw.
        // So we don't need to generate a bonus number for the *ticket*?
        // Correct. For Lotto Max, you pick 7 numbers. You don't pick a bonus.
        // So for "prediction", we generate 7 numbers.
        // The *draw* has a bonus.
        historyCount: 108
    },
    'lotto-649': {
        slug: 'lotto-649',
        name: 'Lotto 6/49',
        mainCount: 6,
        mainMin: 1,
        mainMax: 49,
        // You pick 6 numbers. Bonus is from draw.
        // So no generated bonus.
        historyCount: 108
    },
    'lottario': {
        slug: 'lottario',
        name: 'Lottario',
        mainCount: 6,
        mainMin: 1,
        mainMax: 45,
        // You pick 6 numbers. Bonus is from draw.
        historyCount: 52
    }
};

// Strategy types
export type Strategy = 'TITHI' | 'NAKSHATRA';

// Generation result
export interface GenerationResult {
    gameSlug: string;
    strategy: Strategy;
    mainNumbers: number[];
    bonusNumbers?: number[];
    tithiIndex?: number;
    nakshatraIndex?: number;
    digitalRoot: number;
    modifierApplied: boolean;
    modifierBefore?: number;
    modifierAfter?: number;
    modifierRepairSteps?: number;
    generatedAt: Date;
    seed: number;
}

// Simple seeded random number generator (Mulberry32)
function createSeededRandom(seed: number): () => number {
    return function () {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// Calculate digital root (sum digits until single digit 1-9)
export function digitalRoot(n: number): number {
    if (n === 0) return 9; // Special case for Nakshatra mod 9
    const result = n % 9;
    return result === 0 ? 9 : result;
}

// Calculate bias based on digital root match
function calculateBias(numberDigitalRoot: number, anchorDigitalRoot: number, biasStrength: number = 10): number {
    if (numberDigitalRoot === anchorDigitalRoot) {
        return biasStrength;
    }
    // ±1 away (with wrap around 1-9)
    const diff = Math.abs(numberDigitalRoot - anchorDigitalRoot);
    if (diff === 1 || diff === 8) {
        return biasStrength / 2;
    }
    return 0;
}

// Generate base scores for numbers (simplified MVP - no actual historical data)
function generateBaseScores(min: number, max: number, seed: number): Map<number, number> {
    const random = createSeededRandom(seed);
    const scores = new Map<number, number>();

    for (let n = min; n <= max; n++) {
        // Base score is a combination of:
        // - Simulated frequency (random for MVP, would come from historical DB)
        // - Simulated recency (random for MVP)
        // In production, this would use actual historical data
        scores.set(n, random() * 10);
    }

    return scores;
}

// Full Moon modifier: +1 to ones digit of last number
function applyFullMoonModifier(
    numbers: number[],
    min: number,
    max: number
): { numbers: number[]; applied: boolean; before: number | undefined; after: number | undefined; repairSteps: number | undefined } {
    const sorted = [...numbers].sort((a, b) => a - b);
    const lastIdx = sorted.length - 1;
    const original = sorted[lastIdx];

    let modified = original;
    let repairSteps = 0;

    // Try +1 to ones digit up to 10 times
    for (let attempt = 0; attempt < 10; attempt++) {
        const tensDigit = Math.floor(modified / 10);
        const onesDigit = modified % 10;
        const newOnesDigit = (onesDigit + 1) % 10;
        modified = tensDigit * 10 + newOnesDigit;
        repairSteps++;

        // Validate: within range and not duplicate
        if (modified >= min && modified <= max && !sorted.slice(0, lastIdx).includes(modified)) {
            sorted[lastIdx] = modified;
            return {
                numbers: sorted,
                applied: true,
                before: original,
                after: modified,
                repairSteps
            };
        }
    }

    // If still invalid after 10 attempts, keep original
    return {
        numbers: sorted,
        applied: false,
        before: original,
        after: original,
        repairSteps
    };
}

// Main generation function
export function generateNumbers(
    gameSlug: string,
    strategy: Strategy,
    eventDate: Date,
    seed?: number,
    historicalStats?: HistoricalStats
): GenerationResult {

    const config = GAME_CONFIGS[gameSlug];
    if (!config) {
        throw new Error(`Unknown game: ${gameSlug}`);
    }

    // Use provided seed or derive from date
    const effectiveSeed = seed ?? eventDate.getTime();
    const random = createSeededRandom(effectiveSeed);

    // Get Tithi/Nakshatra based on strategy
    const tithi = getTithi(eventDate);
    const nakshatra = getNakshatra(eventDate);

    // Determine digital root anchor based on strategy
    let anchorDigitalRoot: number;
    if (strategy === 'TITHI') {
        anchorDigitalRoot = digitalRoot(tithi.index);
    } else {
        // Nakshatra: use mod 9 with 0->9
        const nakMod = nakshatra.index % 9;
        anchorDigitalRoot = nakMod === 0 ? 9 : nakMod;
    }

    // Generate base scores
    const baseScores = historicalStats?.mainScores ?? generateBaseScores(config.mainMin, config.mainMax, effectiveSeed);

    // Apply bias and sort candidates
    const candidates: Array<{ number: number; score: number }> = [];
    for (let n = config.mainMin; n <= config.mainMax; n++) {
        const baseScore = baseScores.get(n) || 0;
        const bias = calculateBias(digitalRoot(n), anchorDigitalRoot);
        candidates.push({ number: n, score: baseScore + bias });
    }

    // Sort by score (desc), then by number (asc) for determinism
    candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.number - b.number;
    });

    // Pick top N numbers
    let mainNumbers = candidates.slice(0, config.mainCount).map(c => c.number);
    mainNumbers.sort((a, b) => a - b); // Final sort ascending

    // Check for Full Moon and apply modifier
    let modifierResult = {
        numbers: mainNumbers,
        applied: false,
        before: undefined as number | undefined,
        after: undefined as number | undefined,
        repairSteps: undefined as number | undefined
    };

    if (isFullMoonDate(eventDate)) {
        modifierResult = applyFullMoonModifier(mainNumbers, config.mainMin, config.mainMax);
        mainNumbers = modifierResult.numbers;
    }

    // Generate bonus numbers if applicable
    let bonusNumbers: number[] | undefined;
    if (config.bonusCount && config.bonusMin !== undefined && config.bonusMax !== undefined) {
        bonusNumbers = [];
        const bonusBaseScores = historicalStats?.bonusScores
            ?? generateBaseScores(config.bonusMin, config.bonusMax, effectiveSeed + 1000);
        const bonusCandidates: Array<{ number: number; score: number }> = [];

        for (let n = config.bonusMin; n <= config.bonusMax; n++) {
            const baseScore = bonusBaseScores.get(n) || 0;
            const bias = calculateBias(digitalRoot(n), anchorDigitalRoot);
            bonusCandidates.push({ number: n, score: baseScore + bias });
        }

        if (config.bonusFromSameDrum) {
            const mainSet = new Set(mainNumbers);
            const filteredCandidates = bonusCandidates.filter(c => !mainSet.has(c.number));

            filteredCandidates.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return a.number - b.number;
            });
            bonusNumbers = filteredCandidates.slice(0, config.bonusCount).map(c => c.number);
        } else {
            bonusCandidates.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return a.number - b.number;
            });
            bonusNumbers = bonusCandidates.slice(0, config.bonusCount).map(c => c.number);
        }
    }

    return {
        gameSlug,
        strategy,
        mainNumbers,
        bonusNumbers,
        tithiIndex: tithi.index,
        nakshatraIndex: nakshatra.index,
        digitalRoot: anchorDigitalRoot,
        modifierApplied: modifierResult.applied,
        modifierBefore: modifierResult.before,
        modifierAfter: modifierResult.after,
        modifierRepairSteps: modifierResult.repairSteps,
        generatedAt: eventDate,
        seed: effectiveSeed
    };
}

// Validate generated numbers
export function validateNumbers(result: GenerationResult): { valid: boolean; errors: string[] } {
    const config = GAME_CONFIGS[result.gameSlug];
    const errors: string[] = [];

    if (!config) {
        errors.push(`Unknown game: ${result.gameSlug}`);
        return { valid: false, errors };
    }

    // Check main number count
    if (result.mainNumbers.length !== config.mainCount) {
        errors.push(`Expected ${config.mainCount} main numbers, got ${result.mainNumbers.length}`);
    }

    // Check for duplicates
    const uniqueMain = new Set(result.mainNumbers);
    if (uniqueMain.size !== result.mainNumbers.length) {
        errors.push(`Duplicate main numbers found`);
    }

    // Check range
    for (const n of result.mainNumbers) {
        if (n < config.mainMin || n > config.mainMax) {
            errors.push(`Main number ${n} out of range [${config.mainMin}, ${config.mainMax}]`);
        }
    }

    // Check bonus numbers if applicable
    if (config.bonusCount && config.bonusMin !== undefined && config.bonusMax !== undefined) {
        if (!result.bonusNumbers || result.bonusNumbers.length !== config.bonusCount) {
            errors.push(`Expected ${config.bonusCount} bonus numbers`);
        } else {
            for (const n of result.bonusNumbers) {
                if (n < config.bonusMin || n > config.bonusMax) {
                    errors.push(`Bonus number ${n} out of range [${config.bonusMin}, ${config.bonusMax}]`);
                }
            }
        }
    }

    return { valid: errors.length === 0, errors };
}
