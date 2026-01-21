export interface PrizeShare {
    match: string;
    winningTickets?: string;
    amount: string | Array<{ '@lang': string; '#text': string }>;
}

export interface PrizeResult {
    category: string | null;
    prizeValue: number | null;
    prizeText?: string | null;
    matchCountMain: number;
    matchCountBonus: number;
    matchCountGrand: number; // For Daily Grand
}

type PrizeRule = {
    matchMain: number;
    matchBonus: boolean; // For Lotto/Max/649/Lottario (matches one of main numbers against bonus)
    matchGrand?: boolean; // For Daily Grand (matches separate Grand Number)
    category: string;
    prizeValue: number | null;
    prizeText: string;
};

const PRIZE_TABLES: Record<string, PrizeRule[]> = {
    'lotto-max': [
        { matchMain: 7, matchBonus: false, category: '7/7', prizeValue: 70000000, prizeText: '$70,000,000' },
        { matchMain: 6, matchBonus: true, category: '6/7 + Bonus', prizeValue: 196159, prizeText: '$196,159' },
        { matchMain: 6, matchBonus: false, category: '6/7', prizeValue: 4440, prizeText: '$4,440' },
        { matchMain: 5, matchBonus: true, category: '5/7 + Bonus', prizeValue: 960, prizeText: '$960' },
        { matchMain: 5, matchBonus: false, category: '5/7', prizeValue: 122, prizeText: '$122' },
        { matchMain: 4, matchBonus: true, category: '4/7 + Bonus', prizeValue: 56, prizeText: '$56' },
        { matchMain: 4, matchBonus: false, category: '4/7', prizeValue: 20, prizeText: '$20' },
        { matchMain: 3, matchBonus: true, category: '3/7 + Bonus', prizeValue: 20, prizeText: '$20' },
        { matchMain: 3, matchBonus: false, category: '3/7', prizeValue: 5, prizeText: 'FREE PLAY' },
    ],
    'lotto-649': [
        { matchMain: 6, matchBonus: false, category: '6/6', prizeValue: 5000000, prizeText: '$5,000,000' },
        { matchMain: 5, matchBonus: true, category: '5/6 + Bonus', prizeValue: 104177, prizeText: '$104,177' },
        { matchMain: 5, matchBonus: false, category: '5/6', prizeValue: 1042, prizeText: '$1,042' },
        { matchMain: 4, matchBonus: false, category: '4/6', prizeValue: 78, prizeText: '$78' },
        { matchMain: 3, matchBonus: false, category: '3/6', prizeValue: 10, prizeText: '$10' },
        { matchMain: 2, matchBonus: true, category: '2/6 + Bonus', prizeValue: 5, prizeText: '$5' },
        { matchMain: 2, matchBonus: false, category: '2/6', prizeValue: 3, prizeText: 'FREE PLAY' },
    ],
    'daily-grand': [
        { matchMain: 5, matchBonus: false, matchGrand: true, category: '5/5 + GN', prizeValue: null, prizeText: '$1,000 a DAY for LIFE' },
        { matchMain: 5, matchBonus: false, matchGrand: false, category: '5/5', prizeValue: null, prizeText: '$25,000 a YEAR for LIFE' },
        { matchMain: 4, matchBonus: false, matchGrand: true, category: '4/5 + GN', prizeValue: 1000, prizeText: '$1,000' },
        { matchMain: 4, matchBonus: false, matchGrand: false, category: '4/5', prizeValue: 500, prizeText: '$500' },
        { matchMain: 3, matchBonus: false, matchGrand: true, category: '3/5 + GN', prizeValue: 100, prizeText: '$100' },
        { matchMain: 3, matchBonus: false, matchGrand: false, category: '3/5', prizeValue: 20, prizeText: '$20' },
        { matchMain: 2, matchBonus: false, matchGrand: true, category: '2/5 + GN', prizeValue: 10, prizeText: '$10' },
        { matchMain: 1, matchBonus: false, matchGrand: true, category: '1/5 + GN', prizeValue: 4, prizeText: '$4' },
        { matchMain: 0, matchBonus: false, matchGrand: true, category: 'GN Only', prizeValue: 3, prizeText: 'FREE PLAY' },
    ],
    'lottario': [
        { matchMain: 6, matchBonus: false, category: '6/6', prizeValue: 250000, prizeText: '$250,000' },
        { matchMain: 5, matchBonus: true, category: '5/6 + Bonus', prizeValue: 10000, prizeText: '$10,000' },
        { matchMain: 5, matchBonus: false, category: '5/6', prizeValue: 500, prizeText: '$500' },
        { matchMain: 4, matchBonus: true, category: '4/6 + Bonus', prizeValue: 30, prizeText: '$30' },
        { matchMain: 4, matchBonus: false, category: '4/6', prizeValue: 10, prizeText: '$10' },
        { matchMain: 3, matchBonus: true, category: '3/6 + Bonus', prizeValue: 5, prizeText: '$5' },
        { matchMain: 3, matchBonus: false, category: '3/6', prizeValue: 4, prizeText: '$4' },
        { matchMain: 0, matchBonus: true, category: '0/6 + Bonus', prizeValue: 1, prizeText: 'FREE PLAY' },
    ],
};

function normalizeAmountText(amount: PrizeShare['amount']): string {
    if (Array.isArray(amount)) {
        const english = amount.find((entry) => entry['@lang'] === 'en');
        return (english ?? amount[0])?.['#text']?.toString().trim() ?? '';
    }
    return String(amount ?? '').trim();
}

function parsePrizeValue(amountText: string, gameCost?: number): number | null {
    if (!amountText) return null;
    const upper = amountText.toUpperCase();
    if (upper.includes('FREE PLAY')) {
        return typeof gameCost === 'number' ? gameCost : 0;
    }
    if (upper.includes('LIFE')) {
        return null;
    }
    const numeric = Number.parseFloat(amountText.replace(/[^0-9.]/g, ''));
    return Number.isFinite(numeric) ? numeric : null;
}

function parseMatchDescriptor(
    gameSlug: string,
    matchText: string
): { matchMain: number; matchBonus: boolean; matchGrand: boolean } | null {
    const normalized = matchText.toUpperCase().replace(/\s+/g, ' ').trim();

    if (!normalized) return null;

    if (normalized.includes('EARLY BIRD')) {
        return null;
    }

    if (gameSlug === 'daily-grand') {
        const mainMatch = normalized.match(/(\d)\s*\/\s*5/);
        if (!mainMatch) return null;
        return {
            matchMain: Number.parseInt(mainMatch[1], 10),
            matchBonus: false,
            matchGrand: normalized.includes('GN') || normalized.includes('GRAND')
        };
    }

    if (normalized.startsWith('MATCH ')) {
        const match = normalized.match(/MATCH\s+(\d+)\s+OF\s+\d+/);
        if (!match) return null;
        return {
            matchMain: Number.parseInt(match[1], 10),
            matchBonus: normalized.includes('BONUS'),
            matchGrand: false
        };
    }

    const plusMatch = normalized.match(/(\d+)\+\/\d+/);
    if (plusMatch) {
        return {
            matchMain: Number.parseInt(plusMatch[1], 10),
            matchBonus: true,
            matchGrand: false
        };
    }

    const standardMatch = normalized.match(/(\d+)\s*\/\s*\d+/);
    if (standardMatch) {
        return {
            matchMain: Number.parseInt(standardMatch[1], 10),
            matchBonus: normalized.includes('BONUS'),
            matchGrand: false
        };
    }

    return null;
}

function buildPrizeRules(
    gameSlug: string,
    prizeShares: PrizeShare[],
    gameCost?: number
): PrizeRule[] {
    const rules: PrizeRule[] = [];

    for (const share of prizeShares) {
        const parsed = parseMatchDescriptor(gameSlug, share.match);
        if (!parsed) continue;

        const prizeText = normalizeAmountText(share.amount);
        const prizeValue = parsePrizeValue(prizeText, gameCost);

        rules.push({
            matchMain: parsed.matchMain,
            matchBonus: parsed.matchBonus,
            matchGrand: parsed.matchGrand,
            category: share.match,
            prizeValue,
            prizeText
        });
    }

    return rules;
}

function getFallbackRules(gameSlug: string, gameCost?: number): PrizeRule[] | null {
    const base = PRIZE_TABLES[gameSlug];
    if (!base) return null;

    return base.map((rule) => {
        if (rule.prizeText.toUpperCase().includes('FREE PLAY')) {
            return {
                ...rule,
                prizeValue: typeof gameCost === 'number' ? gameCost : rule.prizeValue
            };
        }
        return rule;
    });
}

function parseNumbers(nums: string): number[] {
    try {
        return JSON.parse(nums);
    } catch {
        // Fallback if numbers are not JSON stringified
        return nums
            .split(',')
            .map((n) => Number.parseInt(n.trim(), 10))
            .filter((n) => Number.isFinite(n));
    }
}

export function evaluatePrediction(
    gameSlug: string,
    candidateNumbers: string, // JSON or CSV
    candidateBonus: string | null, // JSON or CSV (For Daily Grand GN)
    officialNumbers: string, // JSON or CSV
    officialBonus: string | null, // JSON or CSV
    prizeShares?: PrizeShare[],
    gameCost?: number
): PrizeResult | null {
    const rules = prizeShares && prizeShares.length > 0
        ? buildPrizeRules(gameSlug, prizeShares, gameCost)
        : getFallbackRules(gameSlug, gameCost);

    if (!rules || rules.length === 0) return null;

    const userNums = parseNumbers(candidateNumbers);
    const drawNums = parseNumbers(officialNumbers);
    const drawBonus = officialBonus ? parseNumbers(officialBonus)[0] : null;

    // Intersect Main Numbers
    const matchMainCount = userNums.filter((n) => drawNums.includes(n)).length;

    // Bonus/Grand Logic
    let matchBonusCount = 0;
    let matchGrandCount = 0;

    if (gameSlug === 'daily-grand') {
        // For Daily Grand, candidateBonus IS the chosen Grand Number
        // officialBonus IS the drawn Grand Number
        const userGrand = candidateBonus ? parseNumbers(candidateBonus)[0] : null;
        const drawGrand = drawBonus;

        // We treat "matchGrand" as the trigger
        if (userGrand !== null && drawGrand !== null && userGrand === drawGrand) {
            matchGrandCount = 1;
        }
    } else {
        // For others, "Bonus" is matched from your MAIN numbers against the DRAW BONUS
        // You do not pick a bonus number.
        if (drawBonus !== null && userNums.includes(drawBonus)) {
            matchBonusCount = 1;
        }
    }

    // Find highest prize
    for (const rule of rules) {
        let matchesRule = false;

        if (gameSlug === 'daily-grand') {
            const grandReq = !!rule.matchGrand;
            const grandEffective = matchGrandCount > 0;
            if (matchMainCount === rule.matchMain && grandReq === grandEffective) {
                matchesRule = true;
            }
        } else {
            const bonusReq = rule.matchBonus;
            const bonusEffective = matchBonusCount > 0;
            if (matchMainCount === rule.matchMain && bonusReq === bonusEffective) {
                matchesRule = true;
            }
        }

        if (matchesRule) {
            return {
                category: rule.category,
                prizeValue: rule.prizeValue,
                prizeText: rule.prizeText,
                matchCountMain: matchMainCount,
                matchCountBonus: matchBonusCount,
                matchCountGrand: matchGrandCount,
            };
        }
    }

    // No Win
    return {
        category: null,
        prizeValue: 0,
        prizeText: null,
        matchCountMain: matchMainCount,
        matchCountBonus: matchBonusCount,
        matchCountGrand: matchGrandCount,
    };
}
