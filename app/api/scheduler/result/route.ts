/**
 * Scheduler Result API
 *
 * Scrapes official results, ingests official draws, and evaluates all
 * generated candidates for each draw (one evaluation per candidate).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { scrapeGameHistory, ingestOfficialDraws } from '@/lib/scraper';
import { evaluatePrediction, type PrizeShare } from '@/lib/evaluator/prizes';

interface ResultPayload {
    gameSlug?: string;
    startDate?: string; // YYYY-MM-DD
    endDate?: string;   // YYYY-MM-DD
}

const TORONTO_TZ = 'America/Toronto';

function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
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

async function evaluateCandidatesForDraw(params: {
    gameId: string;
    gameSlug: string;
    gameCost: number;
    drawAt: Date;
    officialDrawId: string;
    officialNumbers: string;
    officialBonus: string | null;
    prizeShares?: PrizeShare[];
}): Promise<{ evaluated: number; skipped: number }> {
    const { start, end } = getCandidateWindow(params.drawAt);
    const drawDateKey = toTorontoDateString(params.drawAt);

    const candidates = await prisma.generatedCandidate.findMany({
        where: {
            gameId: params.gameId,
            intendedDrawAt: {
                gte: start,
                lte: end
            }
        }
    });

    let evaluated = 0;
    let skipped = 0;

    for (const candidate of candidates) {
        if (toTorontoDateString(candidate.intendedDrawAt) !== drawDateKey) {
            skipped++;
            continue;
        }

        const evaluation = evaluatePrediction(
            params.gameSlug,
            candidate.numbers,
            candidate.bonusNumbers,
            params.officialNumbers,
            params.officialBonus,
            params.prizeShares,
            params.gameCost
        );

        if (!evaluation) {
            skipped++;
            continue;
        }

        await prisma.evaluation.upsert({
            where: {
                officialDrawId_candidateId: {
                    officialDrawId: params.officialDrawId,
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
                officialDrawId: params.officialDrawId,
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

        evaluated++;
    }

    return { evaluated, skipped };
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

        const payload: ResultPayload = await request.json().catch(() => ({}));
        const now = new Date();

        const games = payload.gameSlug
            ? await prisma.game.findMany({ where: { slug: payload.gameSlug } })
            : await prisma.game.findMany();

        const results: Array<{
            game: string;
            drawsScraped: number;
            drawsIngested: number;
            candidatesEvaluated: number;
            candidatesSkipped: number;
            errors: string[];
        }> = [];

        const lookbackDays = parseInt(process.env.RESULTS_SYNC_LOOKBACK_DAYS || '10', 10);

        for (const game of games) {
            const latestOfficial = await prisma.officialDraw.findFirst({
                where: { gameId: game.id },
                orderBy: { drawAt: 'desc' }
            });

            const rangeStart = payload.startDate
                ?? formatDate(new Date((latestOfficial?.drawAt ?? now).getTime() - lookbackDays * 24 * 60 * 60 * 1000));
            const rangeEnd = payload.endDate ?? formatDate(now);

            const scrape = await scrapeGameHistory(game.slug, {
                startDate: rangeStart,
                endDate: rangeEnd
            });

            const ingestion = await ingestOfficialDraws(scrape.draws);

            let candidatesEvaluated = 0;
            let candidatesSkipped = 0;

            for (const draw of scrape.draws) {
                const officialDraw = await prisma.officialDraw.findUnique({
                    where: {
                        gameId_drawAt: {
                            gameId: game.id,
                            drawAt: draw.drawAt
                        }
                    }
                });

                if (!officialDraw) {
                    continue;
                }

                const prizeShares = draw.prizeShares ?? parsePrizeData(officialDraw.prizeData ?? null);

                const evalResult = await evaluateCandidatesForDraw({
                    gameId: game.id,
                    gameSlug: game.slug,
                    gameCost: game.cost,
                    drawAt: draw.drawAt,
                    officialDrawId: officialDraw.id,
                    officialNumbers: officialDraw.numbers,
                    officialBonus: officialDraw.bonus,
                    prizeShares
                });

                candidatesEvaluated += evalResult.evaluated;
                candidatesSkipped += evalResult.skipped;
            }

            results.push({
                game: game.slug,
                drawsScraped: scrape.draws.length,
                drawsIngested: ingestion.inserted,
                candidatesEvaluated,
                candidatesSkipped,
                errors: [...scrape.errors, ...ingestion.errors]
            });
        }

        return NextResponse.json({
            success: true,
            refreshedAt: now.toISOString(),
            results
        });
    } catch (error) {
        console.error('[Result API] Error:', error);
        return NextResponse.json(
            { error: 'Result processing failed', details: String(error) },
            { status: 500 }
        );
    }
}

// GET endpoint to check status and return global performance
export async function GET() {
    try {
        // Fetch all evaluations with game details to calculate cost
        const evaluations = await prisma.evaluation.findMany({
            include: {
                officialDraw: {
                    include: {
                        game: true
                    }
                }
            }
        });

        // Aggregate stats by strategy
        const performance: Record<string, { spent: number; won: number; plays: number; roi: number }> = {};

        for (const ev of evaluations) {
            const strat = ev.strategy;
            const cost = ev.officialDraw.game.cost;
            const prize = ev.prizeValue || 0;

            if (!performance[strat]) {
                performance[strat] = { spent: 0, won: 0, plays: 0, roi: 0 };
            }

            performance[strat].spent += cost;
            performance[strat].won += prize;
            performance[strat].plays += 1;
        }

        // Calculate ROI
        for (const strat in performance) {
            const p = performance[strat];
            if (p.spent > 0) {
                p.roi = ((p.won - p.spent) / p.spent) * 100;
            }
        }

        return NextResponse.json({
            endpoint: '/api/scheduler/result',
            description: 'Scrapes official results and evaluates all candidates',
            performance
        });
    } catch (error) {
        return NextResponse.json({
            error: 'Failed to fetch performance stats',
            details: String(error)
        }, { status: 500 });
    }
}
