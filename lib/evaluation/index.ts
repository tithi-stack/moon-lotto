/**
 * Evaluation Matching Engine
 * 
 * Features:
 * - Evaluates every candidate for a draw (one evaluation per candidate)
 * - Computes match counts between generated picks and official results
 */

import { PrismaClient } from '@prisma/client';
import { evaluatePrediction, type PrizeShare } from '../evaluator/prizes';

const prisma = new PrismaClient();
const TORONTO_TZ = 'America/Toronto';

export interface MatchResult {
    mainMatches: number;
    bonusMatches: number;
    grandMatches: number;
    category: string;
}

// Compute match counts between generated and official numbers
export function computeMatches(
    generatedNumbers: number[],
    officialNumbers: number[],
    generatedBonus?: number[],
    officialBonus?: number[]
): MatchResult {
    // Count main number matches
    const mainMatches = generatedNumbers.filter(n => officialNumbers.includes(n)).length;

    // Count bonus matches
    let bonusMatches = 0;
    let grandMatches = 0;

    if (officialBonus && officialBonus.length > 0) {
        if (generatedBonus && generatedBonus.length > 0) {
            // Case 1: Separate Drum (e.g. Daily Grand)
            // User picks explicit bonus number(s) to match official bonus
            grandMatches = generatedBonus.filter(n => officialBonus.includes(n)).length;
        } else {
            // Case 2: Single Drum (e.g. Lotto 6/49, Lottario)
            // Bonus match means one of the MAIN numbers matched the BONUS ball
            // Note: A number cannot match both Main and Bonus in a single draw
            bonusMatches = generatedNumbers.filter(n => officialBonus.includes(n)).length;
        }
    }

    // Determine category based on matches (simplified)
    let category = `${mainMatches} Match`;
    if (mainMatches === 0) {
        category = 'No Match';
    } else if (mainMatches >= 6) {
        category = 'Jackpot Range';
    } else if (mainMatches >= 4) {
        category = 'Prize Winner';
    }

    if (grandMatches > 0) {
        category += ' + Grand';
    }

    return {
        mainMatches,
        bonusMatches,
        grandMatches,
        category
    };
}

function toTorontoDateString(date: Date): string {
    return date.toLocaleDateString('en-CA', { timeZone: TORONTO_TZ });
}

function getCandidateWindow(drawAt: Date): { start: Date; end: Date } {
    const bufferMs = 36 * 60 * 60 * 1000;
    return {
        start: new Date(drawAt.getTime() - bufferMs),
        end: new Date(drawAt.getTime() + bufferMs)
    };
}

function parsePrizeData(prizeData: string | null): PrizeShare[] | undefined {
    if (!prizeData) return undefined;
    try {
        const parsed = JSON.parse(prizeData);
        if (Array.isArray(parsed)) {
            return parsed;
        }
        if (parsed && typeof parsed === 'object') {
            return [parsed as PrizeShare];
        }
        return undefined;
    } catch {
        return undefined;
    }
}

// Process an official draw and create evaluations for all candidates
export async function processOfficialDraw(officialDrawId: string): Promise<{
    evaluationsCreated: number;
    skipped: number;
    errors: string[];
}> {
    const errors: string[] = [];
    let evaluationsCreated = 0;
    let skipped = 0;

    // Get the official draw
    const officialDraw = await prisma.officialDraw.findUnique({
        where: { id: officialDrawId },
        include: { game: true }
    });

    if (!officialDraw) {
        return { evaluationsCreated: 0, skipped: 0, errors: ['Official draw not found'] };
    }

    const drawDateKey = toTorontoDateString(officialDraw.drawAt);
    const { start, end } = getCandidateWindow(officialDraw.drawAt);

    const candidates = await prisma.generatedCandidate.findMany({
        where: {
            gameId: officialDraw.gameId,
            intendedDrawAt: {
                gte: start,
                lte: end
            }
        }
    });

    const prizeShares = parsePrizeData(officialDraw.prizeData ?? null);

    for (const candidate of candidates) {
        if (toTorontoDateString(candidate.intendedDrawAt) !== drawDateKey) {
            skipped++;
            continue;
        }

        const evaluation = evaluatePrediction(
            officialDraw.game.slug,
            candidate.numbers,
            candidate.bonusNumbers,
            officialDraw.numbers,
            officialDraw.bonus,
            prizeShares,
            officialDraw.game.cost
        );

        if (!evaluation) {
            skipped++;
            continue;
        }

        try {
            await prisma.evaluation.upsert({
                where: {
                    officialDrawId_candidateId: {
                        officialDrawId,
                        candidateId: candidate.id
                    }
                },
                update: {
                    matchCountMain: evaluation.matchCountMain,
                    matchCountBonus: evaluation.matchCountBonus,
                    matchCountGrand: evaluation.matchCountGrand,
                    category: evaluation.category,
                    prizeValue: evaluation.prizeValue,
                    prizeText: evaluation.prizeText ?? null,
                    strategy: candidate.strategy
                },
                create: {
                    officialDrawId,
                    candidateId: candidate.id,
                    strategy: candidate.strategy,
                    matchCountMain: evaluation.matchCountMain,
                    matchCountBonus: evaluation.matchCountBonus,
                    matchCountGrand: evaluation.matchCountGrand,
                    category: evaluation.category,
                    prizeValue: evaluation.prizeValue,
                    prizeText: evaluation.prizeText ?? null
                }
            });

            evaluationsCreated++;
        } catch (e) {
            errors.push(`Failed to create evaluation for ${candidate.strategy}: ${e}`);
        }
    }

    return { evaluationsCreated, skipped, errors };
}

// Get evaluations for a draw
export async function getEvaluationsForDraw(officialDrawId: string) {
    return prisma.evaluation.findMany({
        where: { officialDrawId },
        include: {
            candidate: true,
            officialDraw: true
        }
    });
}
