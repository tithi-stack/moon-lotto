import { PrismaClient } from '@prisma/client';
import { NextResponse } from 'next/server';
import { generateNumbers, GAME_CONFIGS } from '@/lib/generator';
import { loadHistoricalStats } from '@/lib/generator/history';
import { getNextTithiChange, getNextNakshatraChange, getTithi, getNakshatra } from '@/lib/astronomy/engine';

const prisma = new PrismaClient();

// Generate picks for all games immediately
export async function POST() {
    try {
        const games = await prisma.game.findMany();
        const now = new Date();
        const results = [];

        // Create a generation event
        const tithi = getTithi(now);
        const nakshatra = getNakshatra(now);

        const event = await prisma.generationEvent.create({
            data: {
                type: 'MANUAL_TRIGGER',
                computedAtUtc: now,
                computedAtLocal: now,
                tithiIndex: tithi.index,
                nakshatraIndex: nakshatra.index,
                phase: tithi.phaseAngle
            }
        });

        // Calculate next draw time for each game
        for (const game of games) {
            const config = GAME_CONFIGS[game.slug];
            const historicalStats = config
                ? await loadHistoricalStats(prisma, game.slug, config, config.historyCount)
                : null;
            const nextDrawAt = getNextDrawTime(game.slug, game.drawDays, game.drawTime);

            for (const strategy of ['TITHI', 'NAKSHATRA'] as const) {
                const generated = generateNumbers(
                    game.slug,
                    strategy,
                    now,
                    now.getTime(),
                    historicalStats ?? undefined
                );

                const candidate = await prisma.generatedCandidate.create({
                    data: {
                        gameId: game.id,
                        strategy,
                        eventId: event.id,
                        intendedDrawAt: nextDrawAt,
                        numbers: JSON.stringify(generated.mainNumbers),
                        bonusNumbers: generated.bonusNumbers ? JSON.stringify(generated.bonusNumbers) : null,
                        eligible: true,
                        eligibilityReason: 'Manual generation',
                        modifierApplied: generated.modifierApplied,
                        modifierBefore: generated.modifierBefore?.toString(),
                        modifierAfter: generated.modifierAfter?.toString(),
                        modifierRepairSteps: generated.modifierRepairSteps
                    }
                });

                results.push({
                    game: game.name,
                    strategy,
                    numbers: generated.mainNumbers,
                    bonusNumbers: generated.bonusNumbers,
                    candidateId: candidate.id,
                    intendedDrawAt: nextDrawAt
                });
            }
        }

        // Log job run
        await prisma.jobRun.create({
            data: {
                jobType: 'GENERATOR',
                status: 'SUCCESS',
                message: `Generated ${results.length} candidates for ${games.length} games`,
                endedAt: new Date()
            }
        });

        return NextResponse.json({
            success: true,
            eventId: event.id,
            results
        });
    } catch (error) {
        console.error('Generate API error:', error);
        return NextResponse.json({ error: 'Failed to generate picks' }, { status: 500 });
    }
}

// Helper to calculate next draw time
function getNextDrawTime(gameSlug: string, drawDays: string, drawTime: string): Date {
    const days = drawDays.split(',').map(d => d.trim());
    const [hours, minutes] = drawTime.split(':').map(Number);

    const dayMap: Record<string, number> = {
        'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
    };

    const now = new Date();
    const today = now.getDay();

    // Find next draw day
    let daysUntilDraw = 7;
    for (const day of days) {
        const targetDay = dayMap[day];
        if (targetDay !== undefined) {
            let diff = targetDay - today;
            if (diff < 0) diff += 7;
            if (diff === 0) {
                // Check if draw time has passed today
                const drawToday = new Date(now);
                drawToday.setHours(hours, minutes, 0, 0);
                if (now < drawToday) {
                    daysUntilDraw = 0;
                    break;
                }
                diff = 7;
            }
            if (diff < daysUntilDraw) {
                daysUntilDraw = diff;
            }
        }
    }

    const nextDraw = new Date(now);
    nextDraw.setDate(nextDraw.getDate() + daysUntilDraw);
    nextDraw.setHours(hours, minutes, 0, 0);

    return nextDraw;
}

// Get next events timing
export async function GET() {
    const now = new Date();
    const nextTithi = getNextTithiChange(now);
    const nextNakshatra = getNextNakshatraChange(now);
    const currentTithi = getTithi(now);
    const currentNakshatra = getNakshatra(now);

    return NextResponse.json({
        now: now.toISOString(),
        current: {
            tithi: currentTithi,
            nakshatra: currentNakshatra
        },
        next: {
            tithiChange: nextTithi.toISOString(),
            nakshatraChange: nextNakshatra.toISOString()
        }
    });
}
