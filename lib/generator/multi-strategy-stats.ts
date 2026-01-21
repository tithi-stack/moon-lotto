import { PrismaClient } from '@prisma/client';
import { GameConfig } from './index';
import { HistoricalDraw } from './history';

export interface MultiStrategyStats {
    frequency: Map<number, number>;
    gaps: Map<number, number>;
    sumMean: number;
    sumStdDev: number;
    oddMean: number;
    deltaWeights: Map<number, number>;
    transitions: Map<number, Map<number, number>>;
    lastDraw?: number[];
    totalDraws: number;
}

function mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[], avg: number): number {
    if (values.length === 0) return 0;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
    return Math.sqrt(variance);
}

export function buildMultiStrategyStats(draws: HistoricalDraw[], config: GameConfig): MultiStrategyStats {
    const sorted = [...draws].sort((a, b) => b.drawAt.getTime() - a.drawAt.getTime());
    const totalDraws = sorted.length;

    const frequency = new Map<number, number>();
    const gaps = new Map<number, number>();
    const deltaWeights = new Map<number, number>();
    const transitions = new Map<number, Map<number, number>>();

    for (let n = config.mainMin; n <= config.mainMax; n++) {
        frequency.set(n, 0);
        gaps.set(n, totalDraws);
        transitions.set(n, new Map());
    }

    const sums: number[] = [];
    const oddCounts: number[] = [];

    sorted.forEach((draw, index) => {
        const numbers = [...draw.numbers].sort((a, b) => a - b);
        const sum = numbers.reduce((a, b) => a + b, 0);
        const odds = numbers.filter(n => n % 2 === 1).length;
        sums.push(sum);
        oddCounts.push(odds);

        for (const n of numbers) {
            frequency.set(n, (frequency.get(n) ?? 0) + 1);
            if (gaps.get(n) === totalDraws) {
                gaps.set(n, index);
            }
        }

        for (let i = 0; i < numbers.length - 1; i++) {
            const delta = numbers[i + 1] - numbers[i];
            if (delta > 0) {
                deltaWeights.set(delta, (deltaWeights.get(delta) ?? 0) + 1);
            }
        }

        for (const x of numbers) {
            const row = transitions.get(x);
            if (!row) continue;
            for (const y of numbers) {
                if (x === y) continue;
                row.set(y, (row.get(y) ?? 0) + 1);
            }
        }
    });

    const sumMean = mean(sums);
    const sumStdDev = stdDev(sums, sumMean);
    const oddMean = mean(oddCounts);
    const lastDraw = sorted[0]?.numbers;

    return {
        frequency,
        gaps,
        sumMean,
        sumStdDev,
        oddMean,
        deltaWeights,
        transitions,
        lastDraw,
        totalDraws
    };
}

export async function loadMultiStrategyStats(
    prisma: PrismaClient,
    gameSlug: string,
    config: GameConfig,
    historyCount?: number
): Promise<MultiStrategyStats | null> {
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

    return buildMultiStrategyStats(parsed, config);
}
