import { PrismaClient } from '@prisma/client';
import { NextResponse } from 'next/server';

const prisma = new PrismaClient();

// Get historical draws for all games
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const gameSlug = searchParams.get('game');
    const limit = parseInt(searchParams.get('limit') || '108');

    try {
        let games;

        if (gameSlug) {
            const game = await prisma.game.findUnique({
                where: { slug: gameSlug }
            });
            games = game ? [game] : [];
        } else {
            games = await prisma.game.findMany();
        }

        const result = [];

        for (const game of games) {
            // Get historical draws (stored official results)
            const historicalDraws = await prisma.historicalDraw.findMany({
                where: { gameId: game.id },
                orderBy: { drawAt: 'desc' },
                take: game.slug === 'lottario' ? 52 : limit
            });

            // Get official draws with evaluations
            const officialDraws = await prisma.officialDraw.findMany({
                where: { gameId: game.id },
                orderBy: { drawAt: 'desc' },
                take: 20,
                include: {
                    evaluation: {
                        include: {
                            candidate: true
                        }
                    }
                }
            });

            // Get generated candidates
            const candidates = await prisma.generatedCandidate.findMany({
                where: { gameId: game.id },
                orderBy: { createdAt: 'desc' },
                take: 20,
                include: {
                    event: true
                }
            });

            result.push({
                game: {
                    slug: game.slug,
                    name: game.name,
                    cost: game.cost,
                    format: game.format,
                    drawDays: game.drawDays,
                    drawTime: game.drawTime
                },
                historicalDrawCount: historicalDraws.length,
                historicalDraws,
                officialDraws,
                candidates,
                stats: {
                    totalHistorical: historicalDraws.length,
                    requiredHistorical: game.slug === 'lottario' ? 52 : 108
                }
            });
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('History API error:', error);
        return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
    }
}
