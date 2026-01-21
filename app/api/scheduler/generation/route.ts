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
                    strategySeed
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
    const drawDays = game.drawDays.split(',').map(d => d.trim().toLowerCase());
    const [drawHour, drawMinute] = game.drawTime.split(':').map(Number);

    // Find the next draw from event time
    let nextDraw = new Date(eventTime);
    nextDraw.setHours(drawHour, drawMinute, 0, 0);

    // If today's draw time has passed, start from tomorrow
    if (nextDraw <= eventTime) {
        nextDraw.setDate(nextDraw.getDate() + 1);
    }

    // Find the next valid draw day
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    let attempts = 0;
    while (attempts < 7) {
        const dayName = dayNames[nextDraw.getDay()];
        if (drawDays.includes(dayName)) {
            break;
        }
        nextDraw.setDate(nextDraw.getDate() + 1);
        attempts++;
    }

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
