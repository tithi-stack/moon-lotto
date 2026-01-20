/**
 * Seed Historical Draws
 *
 * Populates historical_draws with real OLG historical data.
 */

import { PrismaClient } from '@prisma/client';
import { scrapeGameHistory, ingestHistoricalDraws } from '../lib/scraper';

const prisma = new PrismaClient();

const GAME_TARGETS = [
    { slug: 'daily-grand', draws: 108 },
    { slug: 'lotto-max', draws: 108 },
    { slug: 'lotto-649', draws: 108 },
    { slug: 'lottario', draws: 52 },
];

async function seedHistoricalDraws() {
    console.log('Seeding historical draws (real data)...');

    for (const gameTarget of GAME_TARGETS) {
        const game = await prisma.game.findUnique({
            where: { slug: gameTarget.slug }
        });

        if (!game) {
            console.log(`  Game ${gameTarget.slug} not found, skipping`);
            continue;
        }

        const existingCount = await prisma.historicalDraw.count({
            where: { gameId: game.id }
        });

        console.log(`  ${game.name}: Fetching latest ${gameTarget.draws} draws (existing=${existingCount})...`);
        const scrape = await scrapeGameHistory(gameTarget.slug, { draws: gameTarget.draws });

        if (!scrape.success && scrape.draws.length === 0) {
            console.log(`  ${game.name}: Scrape failed - ${scrape.errors.join('; ')}`);
            continue;
        }

        const ingestion = await ingestHistoricalDraws(scrape.draws);
        const finalCount = await prisma.historicalDraw.count({
            where: { gameId: game.id }
        });

        console.log(
            `  ${game.name}: inserted=${ingestion.inserted}, skipped=${ingestion.skipped}, errors=${ingestion.errors.length}. ` +
            `Total=${finalCount}/${gameTarget.draws}`
        );
    }

    console.log('\nHistorical draws seeding complete.');
}

seedHistoricalDraws()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
