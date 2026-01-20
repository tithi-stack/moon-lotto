import { PrismaClient } from '@prisma/client';

export interface HistoryGameConfig {
    slug: string;
    mainCount: number;
    mainMin: number;
    mainMax: number;
    bonusCount?: number;
    bonusMin?: number;
    bonusMax?: number;
    bonusFromSameDrum?: boolean;
    historyCount?: number;
}

export interface HistoricalDraw {
    drawAt: Date;
    numbers: number[];
    bonus?: number[];
}

export interface HistoricalStats {
    mainScores: Map<number, number>;
    bonusScores?: Map<number, number>;
    totalDraws: number;
    lastDrawAt?: Date;
}

function computeScores(
    draws: HistoricalDraw[],
    rangeMin: number,
    rangeMax: number,
    getNumbers: (draw: HistoricalDraw) => number[]
): Map<number, number> {
    const sorted = [...draws].sort((a, b) => b.drawAt.getTime() - a.drawAt.getTime());
    const totalDraws = sorted.length;
    const maxGap = Math.max(1, totalDraws - 1);
    const counts = new Map<number, number>();
    const lastSeenIndex = new Map<number, number | null>();

    for (let n = rangeMin; n <= rangeMax; n++) {
        counts.set(n, 0);
        lastSeenIndex.set(n, null);
    }

    sorted.forEach((draw, index) => {
        for (const number of getNumbers(draw)) {
            if (!counts.has(number)) continue;
            counts.set(number, (counts.get(number) ?? 0) + 1);
            if (lastSeenIndex.get(number) === null) {
                lastSeenIndex.set(number, index);
            }
        }
    });

    const scores = new Map<number, number>();
    for (let n = rangeMin; n <= rangeMax; n++) {
        const count = counts.get(n) ?? 0;
        const frequencyScore = totalDraws > 0 ? (count / totalDraws) * 10 : 0;
        const gapIndex = lastSeenIndex.get(n);
        const gapScore = gapIndex === null ? 5 : (Math.min(gapIndex, maxGap) / maxGap) * 5;
        scores.set(n, frequencyScore + gapScore);
    }

    return scores;
}

export function buildHistoricalStats(draws: HistoricalDraw[], config: HistoryGameConfig): HistoricalStats {
    const sorted = [...draws].sort((a, b) => b.drawAt.getTime() - a.drawAt.getTime());
    const mainScores = computeScores(sorted, config.mainMin, config.mainMax, draw => draw.numbers);

    let bonusScores: Map<number, number> | undefined;
    if (config.bonusCount && config.bonusMin !== undefined && config.bonusMax !== undefined) {
        bonusScores = computeScores(sorted, config.bonusMin, config.bonusMax, draw => draw.bonus ?? []);
    }

    return {
        mainScores,
        bonusScores,
        totalDraws: sorted.length,
        lastDrawAt: sorted[0]?.drawAt
    };
}

export async function loadHistoricalStats(
    prisma: PrismaClient,
    gameSlug: string,
    config: HistoryGameConfig,
    historyCount?: number
): Promise<HistoricalStats | null> {
    const game = await prisma.game.findUnique({
        where: { slug: gameSlug }
    });

    if (!game) return null;

    const draws = await prisma.historicalDraw.findMany({
        where: { gameId: game.id },
        orderBy: { drawAt: 'desc' },
        take: historyCount ?? config.historyCount ?? 120
    });

    if (draws.length === 0) return null;

    const parsed: HistoricalDraw[] = draws.map(draw => ({
        drawAt: draw.drawAt,
        numbers: JSON.parse(draw.numbers) as number[],
        bonus: draw.bonus ? (JSON.parse(draw.bonus) as number[]) : undefined
    }));

    return buildHistoricalStats(parsed, config);
}
