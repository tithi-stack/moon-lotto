import { PrismaClient } from '@prisma/client';
import { generateNumbers, GAME_CONFIGS, Strategy } from './index';
import { buildHistoricalStats, HistoricalDraw } from './history';
import { computeMatches } from '../evaluation/index';

const prisma = new PrismaClient();

interface StrategyStats {
    total: number;
    totalMatches: number;
    maxMatches: number;
    threePlus: number;
}

async function backtestGame(gameSlug: string) {
    const config = GAME_CONFIGS[gameSlug];
    if (!config) {
        console.log(`Skipping unknown game ${gameSlug}`);
        return;
    }

    const game = await prisma.game.findUnique({ where: { slug: gameSlug } });
    if (!game) {
        console.log(`Game not found: ${gameSlug}`);
        return;
    }

    const draws = await prisma.historicalDraw.findMany({
        where: { gameId: game.id },
        orderBy: { drawAt: 'asc' }
    });

    const parsedDraws: HistoricalDraw[] = draws.map(draw => ({
        drawAt: draw.drawAt,
        numbers: JSON.parse(draw.numbers) as number[],
        bonus: draw.bonus ? (JSON.parse(draw.bonus) as number[]) : undefined
    }));
    const defaultWindow = config.historyCount ?? 60;
    const windowSize = Math.min(defaultWindow, Math.max(10, Math.floor(parsedDraws.length / 2)));

    if (parsedDraws.length <= windowSize) {
        console.log(`${game.name}: Not enough historical draws (${parsedDraws.length})`);
        return;
    }
    const strategies: Strategy[] = ['TITHI', 'NAKSHATRA'];
    const statsByStrategy: Record<string, StrategyStats> = {
        TITHI: { total: 0, totalMatches: 0, maxMatches: 0, threePlus: 0 },
        NAKSHATRA: { total: 0, totalMatches: 0, maxMatches: 0, threePlus: 0 }
    };

    for (let i = windowSize; i < parsedDraws.length; i++) {
        const window = parsedDraws.slice(i - windowSize, i);
        const actual = parsedDraws[i];
        const historyStats = buildHistoricalStats(window, config);

        for (const strategy of strategies) {
            const generated = generateNumbers(
                gameSlug,
                strategy,
                actual.drawAt,
                actual.drawAt.getTime(),
                historyStats
            );

            const match = computeMatches(
                generated.mainNumbers,
                actual.numbers,
                generated.bonusNumbers,
                actual.bonus
            );

            const entry = statsByStrategy[strategy];
            entry.total += 1;
            entry.totalMatches += match.mainMatches;
            entry.maxMatches = Math.max(entry.maxMatches, match.mainMatches);
            if (match.mainMatches >= 3) {
                entry.threePlus += 1;
            }
        }
    }

    console.log(`\n${config.name} (${gameSlug}) Backtest`);
    for (const strategy of strategies) {
        const entry = statsByStrategy[strategy];
        const avg = entry.total > 0 ? entry.totalMatches / entry.total : 0;
        const hitRate = entry.total > 0 ? (entry.threePlus / entry.total) * 100 : 0;
        console.log(
            `  ${strategy}: draws=${entry.total}, avgMatches=${avg.toFixed(2)}, ` +
            `maxMatches=${entry.maxMatches}, 3+ hit rate=${hitRate.toFixed(1)}%`
        );
    }
}

async function run() {
    console.log('Historical Backtest (rolling window)');
    for (const gameSlug of Object.keys(GAME_CONFIGS)) {
        await backtestGame(gameSlug);
    }
}

run()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
