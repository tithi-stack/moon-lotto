import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
    try {
        // Rate limiting (more lenient for read-only)
        const clientId = getClientIdentifier(request);
        const rateLimit = await checkRateLimit(`dashboard:${clientId}`);
        if (!rateLimit.success) {
            return NextResponse.json(
                { error: 'Rate limit exceeded' },
                { status: 429, headers: { 'Retry-After': '60' } }
            );
        }

        // Get all games with their latest candidates and stats
        const games = await prisma.game.findMany({
            include: {
                generatedCandidates: {
                    orderBy: { createdAt: 'desc' },
                    take: 4, // Latest 2 per strategy
                    include: {
                        event: true
                    }
                },
                officialDraws: {
                    orderBy: { drawAt: 'desc' },
                    take: 5
                }
            }
        });

        // Get recent evaluations
        const recentEvaluations = await prisma.evaluation.findMany({
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: {
                candidate: true,
                officialDraw: {
                    include: { game: true }
                }
            }
        });

        // Get stats
        const stats = await prisma.evaluation.aggregate({
            _avg: { matchCountMain: true },
            _max: { matchCountMain: true },
            _count: true
        });

        // Count by strategy
        const strategyStats = await prisma.evaluation.groupBy({
            by: ['strategy'],
            _avg: { matchCountMain: true },
            _count: true
        });

        return NextResponse.json({
            games,
            recentEvaluations,
            stats: {
                totalEvaluations: stats._count,
                avgMatches: stats._avg.matchCountMain || 0,
                maxMatches: stats._max.matchCountMain || 0
            },
            strategyStats
        });
    } catch (error) {
        console.error('Dashboard API error:', error);
        return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
    }
}
