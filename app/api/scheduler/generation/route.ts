/**
 * Scheduler Generation API
 * 
 * Called by Cloudflare Durable Object when Tithi/Nakshatra changes.
 * Generates 1 line per strategy (5 strategies) for each game and saves to database.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateMultiStrategy, STRATEGIES, type MultiStrategy } from '@/lib/generator/multi-strategy';
import { GAME_CONFIGS } from '@/lib/generator';
import { loadMultiStrategyStats } from '@/lib/generator/multi-strategy-stats';

interface GenerationPayload {
    eventType: 'TITHI_CHANGE' | 'NAKSHATRA_CHANGE';
    eventTime: string;
    tithiIndex: number;
    nakshatraIndex: number;
    isFullMoon: boolean;
    games: string[];
    strategies: string[];
    linesPerStrategy: number;
}

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

function getNextDrawTimeToronto(eventTime: Date, drawDays: string, drawTime: string): Date {
    const daySet = new Set(drawDays.split(',').map((d) => d.trim().toLowerCase()));
    const [drawHour, drawMinute] = drawTime.split(':').map(Number);

    for (let i = 0; i <= 7; i++) {
        const candidate = new Date(eventTime.getTime() + i * 24 * 60 * 60 * 1000);
        const parts = getZonedParts(candidate, TORONTO_TZ);

        if (!daySet.has(parts.weekday.toLowerCase())) {
            continue;
        }

        const drawUtc = toUtcDate(parts.year, parts.month, parts.day, drawHour, drawMinute, 0, TORONTO_TZ);
        if (drawUtc.getTime() > eventTime.getTime()) {
            return drawUtc;
        }
    }

    return new Date(eventTime.getTime() + 24 * 60 * 60 * 1000);
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

        const payload: GenerationPayload = await request.json();
        const eventTime = new Date(payload.eventTime);

        console.log(`[Generation API] Received ${payload.eventType} at ${eventTime.toISOString()}`);
        console.log(`  Tithi: ${payload.tithiIndex}, Nakshatra: ${payload.nakshatraIndex}, FullMoon: ${payload.isFullMoon}`);

        // Create the generation event record
        const generationEvent = await prisma.generationEvent.create({
            data: {
                type: payload.eventType,
                computedAtUtc: eventTime,
                computedAtLocal: eventTime, // TODO: Convert to Toronto time
                tithiIndex: payload.tithiIndex,
                nakshatraIndex: payload.nakshatraIndex,
                phase: null
            }
        });

        const results: Array<{
            game: string;
            strategy: string;
            line: number;
            numbers: number[];
            bonus?: number[];
            eligible: boolean;
        }> = [];

        // Generate for each game
        for (const gameSlug of payload.games) {
            const gameConfig = GAME_CONFIGS[gameSlug];
            if (!gameConfig) {
                console.warn(`Unknown game: ${gameSlug}`);
                continue;
            }

            // Get the game from database
            const game = await prisma.game.findUnique({
                where: { slug: gameSlug }
            });

            if (!game) {
                console.warn(`Game not found in DB: ${gameSlug}`);
                continue;
            }

            // Check eligibility based on draw schedule
            const eligibility = checkEligibility(game, eventTime);
            const strategyStats = await loadMultiStrategyStats(prisma, gameSlug, gameConfig, gameConfig.historyCount);

            // Generate for each strategy (5 strategies, 1 line each)
            for (const strategyName of payload.strategies) {
                const strategy = strategyName as MultiStrategy;

                // Validate strategy
                if (!STRATEGIES.includes(strategy)) {
                    console.warn(`Unknown strategy: ${strategyName}`);
                    continue;
                }

                // Create unique seed for each strategy
                const baseSeed = eventTime.getTime();
                const strategySeed = baseSeed + STRATEGIES.indexOf(strategy) * 1000;

                const genResult = generateMultiStrategy(
                    gameSlug,
                    strategy,
                    eventTime,
                    strategySeed,
                    strategyStats ?? undefined
                );

                // Save to database
                await prisma.generatedCandidate.create({
                    data: {
                        gameId: game.id,
                        strategy: strategy,
                        eventId: generationEvent.id,
                        intendedDrawAt: eligibility.nextDrawTime,
                        numbers: JSON.stringify(genResult.mainNumbers),
                        bonusNumbers: genResult.bonusNumbers ? JSON.stringify(genResult.bonusNumbers) : null,
                        eligible: eligibility.eligible,
                        eligibilityReason: eligibility.reason,
                        modifierApplied: genResult.isFullMoon,
                        modifierBefore: null,
                        modifierAfter: null,
                        modifierRepairSteps: null
                    }
                });

                results.push({
                    game: gameSlug,
                    strategy,
                    line: 1,
                    numbers: genResult.mainNumbers,
                    bonus: genResult.bonusNumbers,
                    eligible: eligibility.eligible
                });
            }
        }

        console.log(`[Generation API] Generated ${results.length} candidate lines`);

        return NextResponse.json({
            success: true,
            eventId: generationEvent.id,
            eventType: payload.eventType,
            eventTime: eventTime.toISOString(),
            candidatesGenerated: results.length,
            results
        });

    } catch (error) {
        console.error('[Generation API] Error:', error);
        return NextResponse.json(
            { error: 'Generation failed', details: String(error) },
            { status: 500 }
        );
    }
}

/**
 * Check if the generated numbers are eligible for the next draw
 * Based on draw schedule and lead time requirements
 */
function checkEligibility(
    game: { drawDays: string; drawTime: string; minLeadMinutes: number },
    eventTime: Date
): { eligible: boolean; reason: string; nextDrawTime: Date } {
    const nextDraw = getNextDrawTimeToronto(eventTime, game.drawDays, game.drawTime);

    // Check if we have enough lead time
    const leadTimeMs = nextDraw.getTime() - eventTime.getTime();
    const leadTimeMinutes = leadTimeMs / (1000 * 60);
    const eligible = leadTimeMinutes >= game.minLeadMinutes;

    return {
        eligible,
        reason: eligible
            ? `${Math.floor(leadTimeMinutes)} minutes before draw`
            : `Only ${Math.floor(leadTimeMinutes)} minutes lead time (need ${game.minLeadMinutes})`,
        nextDrawTime: nextDraw
    };
}

// Also handle GET for status check
export async function GET() {
    return NextResponse.json({
        endpoint: '/api/scheduler/generation',
        description: 'Receives generation requests from Cloudflare scheduler',
        method: 'POST'
    });
}
