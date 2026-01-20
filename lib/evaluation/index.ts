/**
 * Evaluation Selector & Matching Engine
 * 
 * Features:
 * - Selects latest eligible candidate per strategy for each draw
 * - Computes match counts between generated picks and official results
 * - Records fallback reasons when no eligible candidate exists
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

// Select the best candidate for evaluation
export async function selectCandidateForEvaluation(
    gameId: string,
    drawAt: Date,
    strategy: 'TITHI' | 'NAKSHATRA'
): Promise<{ candidateId: string; fallbackReason?: string } | null> {
    // Find eligible candidates for this draw and strategy
    const candidates = await prisma.generatedCandidate.findMany({
        where: {
            gameId,
            intendedDrawAt: drawAt,
            strategy,
            eligible: true
        },
        orderBy: {
            createdAt: 'desc'
        },
        take: 1
    });

    if (candidates.length > 0) {
        return { candidateId: candidates[0].id };
    }

    // Fallback: use latest non-eligible candidate
    const fallbackCandidates = await prisma.generatedCandidate.findMany({
        where: {
            gameId,
            intendedDrawAt: drawAt,
            strategy
        },
        orderBy: {
            createdAt: 'desc'
        },
        take: 1
    });

    if (fallbackCandidates.length > 0) {
        return {
            candidateId: fallbackCandidates[0].id,
            fallbackReason: 'No eligible candidates - using latest ineligible'
        };
    }

    return null;
}

// Create evaluation for an official draw
export async function createEvaluation(
    officialDrawId: string,
    strategy: 'TITHI' | 'NAKSHATRA',
    candidateId: string,
    matchResult: MatchResult
): Promise<string> {
    const evaluation = await prisma.evaluation.upsert({
        where: {
            officialDrawId_strategy: {
                officialDrawId,
                strategy
            }
        },
        update: {
            candidateId,
            matchCountMain: matchResult.mainMatches,
            matchCountBonus: matchResult.bonusMatches,
            matchCountGrand: matchResult.grandMatches,
            category: matchResult.category
        },
        create: {
            officialDrawId,
            strategy,
            candidateId,
            matchCountMain: matchResult.mainMatches,
            matchCountBonus: matchResult.bonusMatches,
            matchCountGrand: matchResult.grandMatches,
            category: matchResult.category
        }
    });

    return evaluation.id;
}

// Process an official draw and create evaluations for both strategies
export async function processOfficialDraw(officialDrawId: string): Promise<{
    evaluationsCreated: number;
    errors: string[];
}> {
    const errors: string[] = [];
    let evaluationsCreated = 0;

    // Get the official draw
    const officialDraw = await prisma.officialDraw.findUnique({
        where: { id: officialDrawId },
        include: { game: true }
    });

    if (!officialDraw) {
        return { evaluationsCreated: 0, errors: ['Official draw not found'] };
    }

    const officialNumbers = JSON.parse(officialDraw.numbers) as number[];
    const officialBonus = officialDraw.bonus ? JSON.parse(officialDraw.bonus) as number[] : undefined;

    // Process both strategies
    for (const strategy of ['TITHI', 'NAKSHATRA'] as const) {
        const selection = await selectCandidateForEvaluation(
            officialDraw.gameId,
            officialDraw.drawAt,
            strategy
        );

        if (!selection) {
            errors.push(`No candidate found for ${strategy} strategy`);
            continue;
        }

        // Get the candidate's numbers
        const candidate = await prisma.generatedCandidate.findUnique({
            where: { id: selection.candidateId }
        });

        if (!candidate) {
            errors.push(`Candidate ${selection.candidateId} not found`);
            continue;
        }

        const generatedNumbers = JSON.parse(candidate.numbers) as number[];
        const generatedBonus = candidate.bonusNumbers ? JSON.parse(candidate.bonusNumbers) as number[] : undefined;

        // Compute matches
        const matchResult = computeMatches(
            generatedNumbers,
            officialNumbers,
            generatedBonus,
            officialBonus
        );

        // Create evaluation
        try {
            await createEvaluation(officialDrawId, strategy, selection.candidateId, matchResult);
            evaluationsCreated++;
        } catch (e) {
            errors.push(`Failed to create evaluation for ${strategy}: ${e}`);
        }
    }

    return { evaluationsCreated, errors };
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
