/**
 * Multi-Strategy Number Generator
 * 
 * Implements 5 distinct prediction strategies based on lottery-analysis skill:
 * 1. STATISTICAL - Frequency & Gap analysis (Hot/Due numbers)
 * 2. POISSON - Sum range, Parity, and Low/High balance
 * 3. DELTA - Difference-based number construction
 * 4. MARKOV - Sequential probability chains
 * 5. HYBRID - Combined smart filter approach
 */

import { getTithi, getNakshatra, isFullMoonDate } from '../astronomy/engine';
import { GAME_CONFIGS, type GameConfig } from './index';

// All available strategies
export const STRATEGIES = [
    'STATISTICAL',
    'POISSON',
    'DELTA',
    'MARKOV',
    'HYBRID'
] as const;

export type MultiStrategy = typeof STRATEGIES[number];

export interface MultiStrategyResult {
    gameSlug: string;
    strategy: MultiStrategy;
    mainNumbers: number[];
    bonusNumbers?: number[];
    tithiIndex: number;
    nakshatraIndex: number;
    isFullMoon: boolean;
    generatedAt: Date;
    seed: number;
    metadata: Record<string, unknown>;
}

// Seeded RNG (Mulberry32)
function createSeededRandom(seed: number): () => number {
    return function () {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// Digital root calculation
function digitalRoot(n: number): number {
    if (n === 0) return 9;
    const result = n % 9;
    return result === 0 ? 9 : result;
}

// Shuffle array with seeded RNG
function shuffleArray<T>(arr: T[], random: () => number): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

/**
 * STATISTICAL Strategy
 * Uses frequency simulation and gap analysis
 * Biased by Tithi digital root for "due" numbers
 */
function generateStatistical(
    config: GameConfig,
    seed: number,
    tithiIndex: number
): { numbers: number[]; metadata: Record<string, unknown> } {
    const random = createSeededRandom(seed);
    const tithiRoot = digitalRoot(tithiIndex);

    // Simulate frequency scores (in production, use actual historical data)
    const candidates: Array<{ n: number; score: number }> = [];

    for (let n = config.mainMin; n <= config.mainMax; n++) {
        const baseFreq = random() * 10;
        const gap = Math.floor(random() * 20);
        const rootBonus = digitalRoot(n) === tithiRoot ? 5 : 0;

        // Score = Frequency * 0.6 + Gap * 0.3 + Root Bonus
        const score = (baseFreq * 0.6) + (gap * 0.3) + rootBonus;
        candidates.push({ n, score });
    }

    candidates.sort((a, b) => b.score - a.score);
    const numbers = candidates.slice(0, config.mainCount).map(c => c.n).sort((a, b) => a - b);

    return {
        numbers,
        metadata: { method: 'frequency_gap', tithiRoot }
    };
}

/**
 * POISSON Strategy
 * Ensures sum is in optimal range and parity is balanced
 */
function generatePoisson(
    config: GameConfig,
    seed: number
): { numbers: number[]; metadata: Record<string, unknown> } {
    const random = createSeededRandom(seed);

    // Target sum range based on game
    const targetSumMin = Math.floor(((config.mainMin + config.mainMax) / 2) * config.mainCount * 0.85);
    const targetSumMax = Math.floor(((config.mainMin + config.mainMax) / 2) * config.mainCount * 1.15);

    // Target parity: ~half odd, half even
    const targetOdd = Math.floor(config.mainCount / 2);

    let bestNumbers: number[] = [];
    let bestScore = -Infinity;

    // Try multiple combinations
    for (let attempt = 0; attempt < 100; attempt++) {
        const pool = Array.from({ length: config.mainMax - config.mainMin + 1 }, (_, i) => config.mainMin + i);
        const shuffled = shuffleArray(pool, random);
        const candidate = shuffled.slice(0, config.mainCount).sort((a, b) => a - b);

        const sum = candidate.reduce((a, b) => a + b, 0);
        const oddCount = candidate.filter(n => n % 2 === 1).length;

        // Score based on how close to target
        let score = 0;
        if (sum >= targetSumMin && sum <= targetSumMax) score += 10;
        if (Math.abs(oddCount - targetOdd) <= 1) score += 10;

        if (score > bestScore) {
            bestScore = score;
            bestNumbers = candidate;
        }

        if (score >= 20) break; // Perfect match
    }

    return {
        numbers: bestNumbers,
        metadata: {
            method: 'sum_parity_balance',
            sum: bestNumbers.reduce((a, b) => a + b, 0),
            oddCount: bestNumbers.filter(n => n % 2 === 1).length
        }
    };
}

/**
 * DELTA Strategy
 * Constructs numbers from common difference patterns
 */
function generateDelta(
    config: GameConfig,
    seed: number
): { numbers: number[]; metadata: Record<string, unknown> } {
    const random = createSeededRandom(seed);

    // Common delta distribution (1-5 are most common)
    const deltaWeights = [0, 20, 18, 15, 12, 10, 8, 6, 5, 4, 3, 2, 1];

    function pickDelta(): number {
        const totalWeight = deltaWeights.reduce((a, b) => a + b, 0);
        let r = random() * totalWeight;
        for (let i = 1; i < deltaWeights.length; i++) {
            r -= deltaWeights[i];
            if (r <= 0) return i;
        }
        return 1;
    }

    let attempts = 0;
    let numbers: number[] = [];

    while (attempts < 50) {
        // Start with a random first number in valid range
        const first = Math.floor(random() * (config.mainMax / 3)) + config.mainMin;
        numbers = [first];

        for (let i = 1; i < config.mainCount; i++) {
            const delta = pickDelta();
            const next = numbers[i - 1] + delta;
            if (next > config.mainMax) break;
            numbers.push(next);
        }

        if (numbers.length === config.mainCount) break;
        attempts++;
    }

    // Fallback if delta method fails
    if (numbers.length !== config.mainCount) {
        const pool = Array.from({ length: config.mainMax - config.mainMin + 1 }, (_, i) => config.mainMin + i);
        numbers = shuffleArray(pool, random).slice(0, config.mainCount).sort((a, b) => a - b);
    }

    const deltas = numbers.slice(1).map((n, i) => n - numbers[i]);

    return {
        numbers,
        metadata: { method: 'delta_construction', deltas }
    };
}

/**
 * MARKOV Strategy
 * Uses sequential probability based on Nakshatra as seed
 */
function generateMarkov(
    config: GameConfig,
    seed: number,
    nakshatraIndex: number
): { numbers: number[]; metadata: Record<string, unknown> } {
    const random = createSeededRandom(seed);

    // Use Nakshatra as the "seed" number for the walk
    const startNum = ((nakshatraIndex * 2) % (config.mainMax - config.mainMin)) + config.mainMin;

    const numbers = new Set<number>([startNum]);
    let current = startNum;

    // Simulate transition probabilities (numbers close together or with similar digital roots)
    while (numbers.size < config.mainCount) {
        // Next number is biased towards nearby numbers or same digital root
        const candidates: Array<{ n: number; prob: number }> = [];

        for (let n = config.mainMin; n <= config.mainMax; n++) {
            if (numbers.has(n)) continue;

            const distance = Math.abs(n - current);
            const rootMatch = digitalRoot(n) === digitalRoot(current) ? 3 : 0;

            // Higher prob for closer numbers or matching roots
            const prob = (1 / (distance + 1)) * 10 + rootMatch + random() * 2;
            candidates.push({ n, prob });
        }

        candidates.sort((a, b) => b.prob - a.prob);

        // Pick from top candidates with some randomness
        const pickIndex = Math.floor(random() * Math.min(5, candidates.length));
        current = candidates[pickIndex].n;
        numbers.add(current);
    }

    const result = Array.from(numbers).sort((a, b) => a - b);

    return {
        numbers: result,
        metadata: { method: 'markov_walk', nakshatraSeed: startNum }
    };
}

/**
 * HYBRID Strategy
 * Combines all methods with smart filtering
 */
function generateHybrid(
    config: GameConfig,
    seed: number,
    tithiIndex: number,
    nakshatraIndex: number,
    isFullMoon: boolean
): { numbers: number[]; metadata: Record<string, unknown> } {
    const random = createSeededRandom(seed);

    // Generate candidates from each strategy
    const statistical = generateStatistical(config, seed + 1000, tithiIndex);
    const poisson = generatePoisson(config, seed + 2000);
    const delta = generateDelta(config, seed + 3000);
    const markov = generateMarkov(config, seed + 4000, nakshatraIndex);

    // Count how many strategies agree on each number
    const votes: Map<number, number> = new Map();

    for (const nums of [statistical.numbers, poisson.numbers, delta.numbers, markov.numbers]) {
        for (const n of nums) {
            votes.set(n, (votes.get(n) || 0) + 1);
        }
    }

    // Sort by votes, then by random tiebreaker
    const candidates = Array.from(votes.entries())
        .map(([n, v]) => ({ n, v, r: random() }))
        .sort((a, b) => b.v - a.v || b.r - a.r);

    let numbers = candidates.slice(0, config.mainCount).map(c => c.n).sort((a, b) => a - b);

    // Apply Full Moon modifier if applicable
    if (isFullMoon && numbers.length > 0) {
        const last = numbers[numbers.length - 1];
        const newOnes = (last % 10 + 1) % 10;
        const modified = Math.floor(last / 10) * 10 + newOnes;
        if (modified >= config.mainMin && modified <= config.mainMax && !numbers.includes(modified)) {
            numbers[numbers.length - 1] = modified;
            numbers.sort((a, b) => a - b);
        }
    }

    return {
        numbers,
        metadata: {
            method: 'consensus_filter',
            votes: Object.fromEntries(candidates.slice(0, 10).map(c => [c.n, c.v])),
            fullMoonModified: isFullMoon
        }
    };
}

/**
 * Main multi-strategy generation function
 */
export function generateMultiStrategy(
    gameSlug: string,
    strategy: MultiStrategy,
    eventDate: Date,
    seed?: number
): MultiStrategyResult {
    const config = GAME_CONFIGS[gameSlug];
    if (!config) {
        throw new Error(`Unknown game: ${gameSlug}`);
    }

    const effectiveSeed = seed ?? eventDate.getTime();
    const tithi = getTithi(eventDate);
    const nakshatra = getNakshatra(eventDate);
    const fullMoon = isFullMoonDate(eventDate);

    let result: { numbers: number[]; metadata: Record<string, unknown> };

    switch (strategy) {
        case 'STATISTICAL':
            result = generateStatistical(config, effectiveSeed, tithi.index);
            break;
        case 'POISSON':
            result = generatePoisson(config, effectiveSeed);
            break;
        case 'DELTA':
            result = generateDelta(config, effectiveSeed);
            break;
        case 'MARKOV':
            result = generateMarkov(config, effectiveSeed, nakshatra.index);
            break;
        case 'HYBRID':
            result = generateHybrid(config, effectiveSeed, tithi.index, nakshatra.index, fullMoon);
            break;
        default:
            throw new Error(`Unknown strategy: ${strategy}`);
    }

    // Generate bonus numbers if applicable
    let bonusNumbers: number[] | undefined;
    if (config.bonusCount && config.bonusMin !== undefined && config.bonusMax !== undefined) {
        const bonusRandom = createSeededRandom(effectiveSeed + 9999);
        const bonusPool = Array.from(
            { length: config.bonusMax - config.bonusMin + 1 },
            (_, i) => config.bonusMin! + i
        );

        if (config.bonusFromSameDrum) {
            const available = bonusPool.filter(n => !result.numbers.includes(n));
            bonusNumbers = shuffleArray(available, bonusRandom).slice(0, config.bonusCount);
        } else {
            bonusNumbers = shuffleArray(bonusPool, bonusRandom).slice(0, config.bonusCount);
        }
    }

    return {
        gameSlug,
        strategy,
        mainNumbers: result.numbers,
        bonusNumbers,
        tithiIndex: tithi.index,
        nakshatraIndex: nakshatra.index,
        isFullMoon: fullMoon,
        generatedAt: eventDate,
        seed: effectiveSeed,
        metadata: result.metadata
    };
}
