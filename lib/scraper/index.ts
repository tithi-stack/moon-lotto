/**
 * OLG Results Scraper
 *
 * Uses OLG's public feeds for past winning numbers.
 * Features:
 * - Response validation
 * - Parse error capture with raw payload storage
 * - Idempotent ingestion for historical + official draws
 */

import { PrismaClient } from '@prisma/client';
import type { PrizeShare } from '../evaluator/prizes';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const API_BASE = 'https://gateway.www.olg.ca/feeds';
const DEFAULT_CLIENT_ID = '9c92a16d25b542048aa93a397093efe2';
const DEFAULT_SITE_CODE = 'playolg.ca';

const API_GAME_KEYS: Record<string, string> = {
    'daily-grand': 'dailygrand',
    'lotto-max': 'lottomax',
    'lotto-649': 'lotto649',
    'lottario': 'lottario'
};

const GAME_RULES: Record<string, {
    mainCount: number;
    mainMin: number;
    mainMax: number;
    bonusCount: number;
    bonusMin: number;
    bonusMax: number;
    bonusFromSameDrum: boolean;
}> = {
    'daily-grand': {
        mainCount: 5,
        mainMin: 1,
        mainMax: 49,
        bonusCount: 1,
        bonusMin: 1,
        bonusMax: 7,
        bonusFromSameDrum: false
    },
    'lotto-max': {
        mainCount: 7,
        mainMin: 1,
        mainMax: 50,
        bonusCount: 1,
        bonusMin: 1,
        bonusMax: 50,
        bonusFromSameDrum: true
    },
    'lotto-649': {
        mainCount: 6,
        mainMin: 1,
        mainMax: 49,
        bonusCount: 1,
        bonusMin: 1,
        bonusMax: 49,
        bonusFromSameDrum: true
    },
    'lottario': {
        mainCount: 6,
        mainMin: 1,
        mainMax: 45,
        bonusCount: 1,
        bonusMin: 1,
        bonusMax: 45,
        bonusFromSameDrum: true
    }
};

const ERROR_DIR = path.join(process.cwd(), 'scraper-errors');
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

export interface ParsedDraw {
    gameSlug: string;
    drawAt: Date;
    numbers: number[];
    bonus?: number[];
    prizeShares?: PrizeShare[];
}

export interface ScrapeResult {
    success: boolean;
    draws: ParsedDraw[];
    errors: string[];
    rawPayloadSaved?: string;
}

interface ScrapeHistoryOptions {
    startDate?: string;
    endDate?: string;
    draws?: number;
    mockPayload?: unknown;
}

function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseNumberList(raw: string | undefined): number[] {
    if (!raw) return [];
    return raw
        .split(',')
        .map(value => parseInt(value.trim(), 10))
        .filter(value => Number.isFinite(value));
}

function buildDrawAt(dateString: string): Date {
    const [year, month, day] = dateString.split('-').map(Number);
    if (!year || !month || !day) {
        return new Date(`${dateString}T22:30:00`);
    }
    return toUtcDate(year, month, day, 22, 30, 0, TORONTO_TZ);
}

function saveRawPayload(payload: unknown, gameSlug: string, error: string): string {
    if (!fs.existsSync(ERROR_DIR)) {
        fs.mkdirSync(ERROR_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${gameSlug}_${timestamp}.json`;
    const filepath = path.join(ERROR_DIR, filename);

    const content = JSON.stringify({
        error,
        timestamp,
        payload
    }, null, 2);

    fs.writeFileSync(filepath, content);
    return filepath;
}

export function parsePastWinningNumbers(payload: unknown, gameSlug: string): ParsedDraw[] {
    const apiKey = API_GAME_KEYS[gameSlug];
    if (!apiKey) {
        throw new Error(`Unsupported game slug: ${gameSlug}`);
    }

    const response = payload as {
        response?: {
            statusCode?: string;
            description?: string;
            winnings?: Record<string, {
                draw?: Array<{
                    date: string;
                    main?: {
                        regular?: string;
                        bonus?: string;
                        prizeShares?: {
                            prize?: PrizeShare[];
                        };
                    };
                    prizeShares?: {
                        prize?: PrizeShare[];
                    };
                }>;
            }>;
        }
    };

    const statusCode = response?.response?.statusCode;
    if (statusCode && statusCode !== '0') {
        const description = response?.response?.description ?? 'Unknown error';
        throw new Error(`OLG error ${statusCode}: ${description}`);
    }

    const draws = response?.response?.winnings?.[apiKey]?.draw;
    if (!Array.isArray(draws)) {
        throw new Error(`Missing draw list for ${gameSlug}`);
    }

    return draws.map(draw => {
        const numbers = parseNumberList(draw.main?.regular);
        const bonus = parseNumberList(draw.main?.bonus);
        const rawPrizeShares = draw.main?.prizeShares?.prize ?? draw.prizeShares?.prize;
        const prizeShares = Array.isArray(rawPrizeShares)
            ? rawPrizeShares
            : rawPrizeShares
                ? [rawPrizeShares]
                : undefined;

        return {
            gameSlug,
            drawAt: buildDrawAt(draw.date),
            numbers,
            bonus: bonus.length > 0 ? bonus : undefined,
            prizeShares
        };
    });
}

function validateDraw(draw: ParsedDraw): string[] {
    const errors: string[] = [];
    const rules = GAME_RULES[draw.gameSlug];

    if (!rules) {
        errors.push(`Missing rules for ${draw.gameSlug}`);
        return errors;
    }

    if (draw.numbers.length !== rules.mainCount) {
        errors.push(`Expected ${rules.mainCount} main numbers, got ${draw.numbers.length}`);
    }

    const uniqueMain = new Set(draw.numbers);
    if (uniqueMain.size !== draw.numbers.length) {
        errors.push('Duplicate main numbers found');
    }

    for (const number of draw.numbers) {
        if (number < rules.mainMin || number > rules.mainMax) {
            errors.push(`Main number ${number} out of range [${rules.mainMin}, ${rules.mainMax}]`);
        }
    }

    if (draw.bonus && draw.bonus.length > 0) {
        if (draw.bonus.length !== rules.bonusCount) {
            errors.push(`Expected ${rules.bonusCount} bonus numbers, got ${draw.bonus.length}`);
        }
        for (const number of draw.bonus) {
            if (number < rules.bonusMin || number > rules.bonusMax) {
                errors.push(`Bonus number ${number} out of range [${rules.bonusMin}, ${rules.bonusMax}]`);
            }
        }
        if (rules.bonusFromSameDrum) {
            for (const number of draw.bonus) {
                if (uniqueMain.has(number)) {
                    errors.push(`Bonus number ${number} duplicates main number`);
                }
            }
        }
    }

    return errors;
}

async function fetchJson(url: string): Promise<unknown> {
    const response = await fetch(url, {
        headers: {
            'x-client-id': process.env.OLG_CLIENT_ID ?? DEFAULT_CLIENT_ID,
            'x-site-code': process.env.OLG_SITE_CODE ?? DEFAULT_SITE_CODE,
            'accept': 'application/json',
            'user-agent': 'Mozilla/5.0 (Moon Lotto Scraper)'
        }
    });

    if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

async function fetchPastWinningNumbers(gameSlug: string, startDate: string, endDate: string): Promise<unknown> {
    const apiKey = API_GAME_KEYS[gameSlug];
    if (!apiKey) {
        throw new Error(`Unsupported game slug: ${gameSlug}`);
    }

    const url = `${API_BASE}/past-winning-numbers?game=${apiKey}&startDate=${startDate}&endDate=${endDate}`;
    return fetchJson(url);
}

export async function scrapeGameHistory(gameSlug: string, options: ScrapeHistoryOptions = {}): Promise<ScrapeResult> {
    const result: ScrapeResult = {
        success: false,
        draws: [],
        errors: []
    };
    let payload: unknown | undefined;

    try {
        const endDate = options.endDate ?? formatDate(new Date());
        const startDate = options.startDate;
        const validated: ParsedDraw[] = [];

        const fetchAndValidate = async (rangeStart: string, rangeEnd: string) => {
            payload = options.mockPayload ?? await fetchPastWinningNumbers(gameSlug, rangeStart, rangeEnd);
            const parsed = parsePastWinningNumbers(payload, gameSlug);

            for (const draw of parsed) {
                const errors = validateDraw(draw);
                if (errors.length > 0) {
                    result.errors.push(`${gameSlug} ${draw.drawAt.toISOString()}: ${errors.join('; ')}`);
                } else {
                    validated.push(draw);
                }
            }
        };

        if (options.mockPayload) {
            await fetchAndValidate(endDate, endDate);
        } else if (startDate) {
            await fetchAndValidate(startDate, endDate);
        } else {
            let chunkDays = 90;
            const maxLookbackDays = 365 * 5;
            let cursorEnd = new Date();
            let lookedBack = 0;

            while (lookedBack < maxLookbackDays) {
                const cursorStart = new Date(cursorEnd.getTime() - chunkDays * 24 * 60 * 60 * 1000);
                const rangeStart = formatDate(cursorStart);
                const rangeEnd = formatDate(cursorEnd);

                try {
                    await fetchAndValidate(rangeStart, rangeEnd);
                } catch (e) {
                    const message = e instanceof Error ? e.message : String(e);
                    if (message.includes('date range is too large') && chunkDays > 30) {
                        chunkDays = 30;
                        continue;
                    }
                    throw e;
                }

                if (options.draws && validated.length >= options.draws) {
                    break;
                }

                cursorEnd = new Date(cursorStart.getTime() - 24 * 60 * 60 * 1000);
                lookedBack += chunkDays + 1;
            }
        }

        const unique = new Map<string, ParsedDraw>();
        for (const draw of validated) {
            unique.set(`${draw.gameSlug}-${draw.drawAt.toISOString()}`, draw);
        }

        const deduped = Array.from(unique.values());
        deduped.sort((a, b) => b.drawAt.getTime() - a.drawAt.getTime());
        result.draws = options.draws ? deduped.slice(0, options.draws) : deduped;
        result.success = result.errors.length === 0;
    } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        result.errors.push(errorMsg);
        result.rawPayloadSaved = saveRawPayload(payload ?? options.mockPayload ?? { error: errorMsg }, gameSlug, errorMsg);
    }

    return result;
}

export async function ingestHistoricalDraws(draws: ParsedDraw[]): Promise<{ inserted: number; skipped: number; errors: string[] }> {
    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const draw of draws) {
        try {
            const game = await prisma.game.findUnique({
                where: { slug: draw.gameSlug }
            });

            if (!game) {
                errors.push(`Game not found: ${draw.gameSlug}`);
                continue;
            }

            await prisma.historicalDraw.upsert({
                where: {
                    gameId_drawAt: {
                        gameId: game.id,
                        drawAt: draw.drawAt
                    }
                },
                update: {
                    numbers: JSON.stringify(draw.numbers),
                    bonus: draw.bonus ? JSON.stringify(draw.bonus) : null
                },
                create: {
                    gameId: game.id,
                    drawAt: draw.drawAt,
                    numbers: JSON.stringify(draw.numbers),
                    bonus: draw.bonus ? JSON.stringify(draw.bonus) : null
                }
            });

            inserted++;
        } catch (e) {
            if (e instanceof Error && e.message.includes('Unique constraint')) {
                skipped++;
            } else {
                errors.push(`Error ingesting draw: ${e}`);
            }
        }
    }

    return { inserted, skipped, errors };
}

export async function ingestOfficialDraws(draws: ParsedDraw[]): Promise<{ inserted: number; skipped: number; errors: string[] }> {
    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const draw of draws) {
        try {
            const game = await prisma.game.findUnique({
                where: { slug: draw.gameSlug }
            });

            if (!game) {
                errors.push(`Game not found: ${draw.gameSlug}`);
                continue;
            }

            await prisma.officialDraw.upsert({
                where: {
                    gameId_drawAt: {
                        gameId: game.id,
                        drawAt: draw.drawAt
                    }
                },
                update: {
                    numbers: JSON.stringify(draw.numbers),
                    bonus: draw.bonus ? JSON.stringify(draw.bonus) : null,
                    prizeData: draw.prizeShares ? JSON.stringify(draw.prizeShares) : null
                },
                create: {
                    gameId: game.id,
                    drawAt: draw.drawAt,
                    numbers: JSON.stringify(draw.numbers),
                    bonus: draw.bonus ? JSON.stringify(draw.bonus) : null,
                    prizeData: draw.prizeShares ? JSON.stringify(draw.prizeShares) : null
                }
            });

            inserted++;
        } catch (e) {
            if (e instanceof Error && e.message.includes('Unique constraint')) {
                skipped++;
            } else {
                errors.push(`Error ingesting draw: ${e}`);
            }
        }
    }

    return { inserted, skipped, errors };
}

export async function getOfficialDraw(gameSlug: string, drawAt: Date) {
    const game = await prisma.game.findUnique({
        where: { slug: gameSlug }
    });

    if (!game) return null;

    return prisma.officialDraw.findUnique({
        where: {
            gameId_drawAt: {
                gameId: game.id,
                drawAt
            }
        }
    });
}

export async function getHistoricalDraw(gameSlug: string, drawAt: Date) {
    const game = await prisma.game.findUnique({
        where: { slug: gameSlug }
    });

    if (!game) return null;

    return prisma.historicalDraw.findUnique({
        where: {
            gameId_drawAt: {
                gameId: game.id,
                drawAt
            }
        }
    });
}
