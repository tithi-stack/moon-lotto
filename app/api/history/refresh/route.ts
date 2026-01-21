import { PrismaClient } from '@prisma/client';
import { NextResponse } from 'next/server';
import { scrapeGameHistory, ingestHistoricalDraws } from '@/lib/scraper';

const prisma = new PrismaClient();

function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const REQUIRED_DRAWS: Record<string, number> = {
    'daily-grand': 108,
    'lotto-max': 108,
    'lotto-649': 108,
    'lottario': 52
};

export async function POST(request: Request) {
    try {
        const apiSecret = process.env.SCHEDULER_API_SECRET;
        if (apiSecret) {
            const providedSecret = request.headers.get('X-API-Secret');
            if (providedSecret !== apiSecret) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }

        const payload = await request.json().catch(() => null) as { gameSlug?: string } | null;
        const gameSlug = payload?.gameSlug;

        const games = gameSlug
            ? await prisma.game.findMany({ where: { slug: gameSlug } })
            : await prisma.game.findMany();

        const results: Array<{
            game: string;
            inserted: number;
            skipped: number;
            errors: string[];
        }> = [];

        const lookbackDays = parseInt(process.env.HISTORY_SYNC_LOOKBACK_DAYS || '10', 10);
        const now = new Date();

        for (const game of games) {
            const latest = await prisma.historicalDraw.findFirst({
                where: { gameId: game.id },
                orderBy: { drawAt: 'desc' }
            });

            let scrape;
            if (latest) {
                const startDate = new Date(latest.drawAt.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
                scrape = await scrapeGameHistory(game.slug, {
                    startDate: formatDate(startDate),
                    endDate: formatDate(now)
                });
            } else {
                scrape = await scrapeGameHistory(game.slug, {
                    draws: REQUIRED_DRAWS[game.slug] ?? 108
                });
            }

            const ingestion = await ingestHistoricalDraws(scrape.draws);
            results.push({
                game: game.slug,
                inserted: ingestion.inserted,
                skipped: ingestion.skipped,
                errors: [...scrape.errors, ...ingestion.errors]
            });
        }

        return NextResponse.json({
            success: true,
            refreshedAt: now.toISOString(),
            results
        });
    } catch (error) {
        console.error('History refresh error:', error);
        return NextResponse.json({ error: 'Failed to refresh history' }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        endpoint: '/api/history/refresh',
        description: 'Refreshes historical winning numbers via OLG feed',
        method: 'POST'
    });
}
