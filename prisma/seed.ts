import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Create default user
    await prisma.user.upsert({
        where: { id: 'default-user' },
        update: {},
        create: {
            id: 'default-user',
            name: 'Moon Lotto User',
        },
    });

    const games = [
        {
            slug: 'daily-grand',
            name: 'Daily Grand',
            cost: 3.0,
            format: '5/49+1/7',
            drawDays: 'Mon,Thu',
            drawTime: '22:30',
        },
        {
            slug: 'lotto-max',
            name: 'Lotto Max',
            cost: 5.0,
            format: '7/50',
            drawDays: 'Tue,Fri',
            drawTime: '22:30',
        },
        {
            slug: 'lotto-649',
            name: 'Lotto 6/49',
            cost: 3.0,
            format: '6/49',
            drawDays: 'Wed,Sat',
            drawTime: '22:30',
        },
        {
            slug: 'lottario',
            name: 'Lottario',
            cost: 1.0,
            format: '6/45',
            drawDays: 'Sat',
            drawTime: '22:30',
        },
    ];

    for (const game of games) {
        await prisma.game.upsert({
            where: { slug: game.slug },
            update: game, // Ensure properties are up to date if changed
            create: game,
        });
    }

    console.log('Seeding completed.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
