/**
 * Scheduler Result API
 * 
 * Called after a lottery draw to scrape results and evaluate predictions.
 * Compares all generated candidates with official results and builds track record.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface ResultPayload {
    gameSlug: string;
    drawDate?: string; // Optional - if not provided, uses today
}

export async function POST(request: NextRequest) {
    try {
        // Verify API secret if configured
        const apiSecret = process.env.SCHEDULER_API_SECRET;
        if (apiSecret) {
            const providedSecret = request.headers.get('X-API-Secret');
            if (providedSecret !== apiSecret) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }

        const payload: ResultPayload = await request.json();
        const { gameSlug } = payload;

        console.log(`[Result API] Fetching results for ${gameSlug}`);

        // Get the game
        const game = await prisma.game.findUnique({
            where: { slug: gameSlug }
        });

        if (!game) {
            return NextResponse.json({ error: `Game not found: ${gameSlug}` }, { status: 404 });
        }

        // Scrape the latest result (using existing scraper logic)
        // For now, we'll just check if there's a recent official draw
        const latestDraw = await prisma.officialDraw.findFirst({
            where: { gameId: game.id },
            orderBy: { drawAt: 'desc' }
        });

        if (!latestDraw) {
            return NextResponse.json({
                success: false,
                message: 'No official draw found. Run scraper first.'
            });
        }

        // Find all candidates that were intended for this draw and haven't been evaluated
        const candidates = await prisma.generatedCandidate.findMany({
            where: {
                gameId: game.id,
                eligible: true,
                // Check if not already evaluated
                evaluations: {
                    none: {}
                },
                // Intended for draws on or before latest official
                intendedDrawAt: {
                    lte: latestDraw.drawAt
                }
            }
        });

        console.log(`[Result API] Found ${candidates.length} candidates to evaluate`);

        const officialNumbers: number[] = JSON.parse(latestDraw.numbers);
        const officialBonus: number[] | null = latestDraw.bonus ? JSON.parse(latestDraw.bonus) : null;

        const evaluations: Array<{
            strategy: string;
            matchCountMain: number;
            matchCountBonus: number;
            numbers: number[];
        }> = [];

        for (const candidate of candidates) {
            const candidateNumbers: number[] = JSON.parse(candidate.numbers);

            // Calculate matches
            const matchCountMain = candidateNumbers.filter(n => officialNumbers.includes(n)).length;
            const matchCountBonus = officialBonus
                ? candidateNumbers.filter(n => officialBonus.includes(n)).length
                : 0;

            // Determine prize category (simplified)
            const category = getPrizeCategory(game.slug, matchCountMain, matchCountBonus);

            // Create evaluation record
            await prisma.evaluation.create({
                data: {
                    officialDrawId: latestDraw.id,
                    strategy: candidate.strategy,
                    candidateId: candidate.id,
                    matchCountMain,
                    matchCountBonus,
                    category,
                    prizeValue: null // Could calculate based on prize table
                }
            });

            evaluations.push({
                strategy: candidate.strategy,
                matchCountMain,
                matchCountBonus,
                numbers: candidateNumbers
            });
        }

        // Calculate summary stats
        const summary = calculateTrackRecord(evaluations);

        return NextResponse.json({
            success: true,
            gameSlug,
            drawDate: latestDraw.drawAt.toISOString(),
            officialNumbers,
            officialBonus,
            candidatesEvaluated: evaluations.length,
            evaluations,
            trackRecord: summary
        });

    } catch (error) {
        console.error('[Result API] Error:', error);
        return NextResponse.json(
            { error: 'Result processing failed', details: String(error) },
            { status: 500 }
        );
    }
}

/**
 * Determine prize category based on matches
 */
function getPrizeCategory(gameSlug: string, mainMatches: number, bonusMatches: number): string | null {
    // Simplified prize categories
    if (gameSlug === 'lotto-max') {
        if (mainMatches === 7) return 'JACKPOT';
        if (mainMatches === 6) return '2ND';
        if (mainMatches === 5) return '3RD';
        if (mainMatches === 4) return '4TH';
        if (mainMatches === 3) return 'FREE_PLAY';
    } else if (gameSlug === 'lotto-649') {
        if (mainMatches === 6) return 'JACKPOT';
        if (mainMatches === 5 && bonusMatches >= 1) return '2ND';
        if (mainMatches === 5) return '3RD';
        if (mainMatches === 4) return '4TH';
        if (mainMatches === 3) return '5TH';
        if (mainMatches === 2 && bonusMatches >= 1) return '6TH';
        if (mainMatches === 2) return 'FREE_PLAY';
    } else if (gameSlug === 'daily-grand') {
        if (mainMatches === 5 && bonusMatches === 1) return 'JACKPOT';
        if (mainMatches === 5) return '2ND';
        if (mainMatches === 4 && bonusMatches === 1) return '3RD';
        if (mainMatches === 4) return '4TH';
        if (mainMatches === 3 && bonusMatches === 1) return '5TH';
        if (mainMatches === 3) return '6TH';
        if (mainMatches === 2 && bonusMatches === 1) return '7TH';
        if (mainMatches === 1 && bonusMatches === 1) return '8TH';
        if (mainMatches === 0 && bonusMatches === 1) return 'BONUS_ONLY';
    } else if (gameSlug === 'lottario') {
        if (mainMatches === 6) return 'JACKPOT';
        if (mainMatches === 5 && bonusMatches >= 1) return '2ND';
        if (mainMatches === 5) return '3RD';
        if (mainMatches === 4) return '4TH';
        if (mainMatches === 3) return '5TH';
        if (mainMatches === 2) return 'FREE_PLAY';
    }

    return null;
}

/**
 * Calculate track record summary
 */
function calculateTrackRecord(evaluations: Array<{ strategy: string; matchCountMain: number }>) {
    const byStrategy: Record<string, { total: number; hits: Record<number, number> }> = {};

    for (const ev of evaluations) {
        if (!byStrategy[ev.strategy]) {
            byStrategy[ev.strategy] = { total: 0, hits: {} };
        }
        byStrategy[ev.strategy].total++;
        byStrategy[ev.strategy].hits[ev.matchCountMain] =
            (byStrategy[ev.strategy].hits[ev.matchCountMain] || 0) + 1;
    }

    return byStrategy;
}

// GET endpoint to check status
export async function GET() {
    try {
        // Return summary of all evaluations
        const summary = await prisma.evaluation.groupBy({
            by: ['strategy'],
            _count: { id: true },
            _avg: { matchCountMain: true }
        });

        return NextResponse.json({
            endpoint: '/api/scheduler/result',
            description: 'Evaluates predictions against official results',
            trackRecord: summary
        });
    } catch {
        return NextResponse.json({
            endpoint: '/api/scheduler/result',
            description: 'Evaluates predictions against official results'
        });
    }
}
