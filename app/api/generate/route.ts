import { PrismaClient } from '@prisma/client';
import { NextResponse } from 'next/server';
import { generateNumbers, GAME_CONFIGS } from '@/lib/generator';
import { loadHistoricalStats } from '@/lib/generator/history';
import { getNextTithiChange, getNextNakshatraChange, getTithi, getNakshatra } from '@/lib/astronomy/engine';

const prisma = new PrismaClient();
const TORONTO_TZ = 'America/Toronto';

function getZonedParts(date: Date, timeZone: string): {
    year: number;
    month: number;
    day: number;
    weekday: string;
    hour: number;
    minute: number;
    second: number;
} {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const parts = formatter.formatToParts(date).reduce((acc, part) => {
        if (part.type !== 'literal') {
            acc[part.type] = part.value;
        }
        return acc;
    }, {} as Record<string, string>);

    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        weekday: parts.weekday,
        hour: Number(parts.hour),
        minute: Number(parts.minute),
        second: Number(parts.second)
    };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
    const parts = getZonedParts(date, timeZone);
    const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return asUTC - date.getTime();
}

function toUtcDate(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    timeZone: string
): Date {
    const assumedUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    const offsetMs = getTimeZoneOffsetMs(assumedUtc, timeZone);
    return new Date(assumedUtc.getTime() - offsetMs);
}

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
    const now = new Date();
    const daySet = new Set(drawDays.split(',').map((d) => d.trim().toLowerCase()));
    const [drawHour, drawMinute] = drawTime.split(':').map(Number);

    for (let i = 0; i <= 7; i++) {
        const candidate = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
        const parts = getZonedParts(candidate, TORONTO_TZ);

        if (!daySet.has(parts.weekday.toLowerCase())) {
            continue;
        }

        const drawUtc = toUtcDate(parts.year, parts.month, parts.day, drawHour, drawMinute, 0, TORONTO_TZ);
        if (drawUtc.getTime() > now.getTime()) {
            return drawUtc;
        }
    }

    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
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
