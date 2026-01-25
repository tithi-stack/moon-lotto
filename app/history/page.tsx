'use client';

import { useState, useEffect, useCallback } from 'react';
import { BrutalCard } from "@/components/ui/BrutalCard";
import { Moon, Calendar, TrendingUp, History as HistoryIcon } from "lucide-react";
import Link from 'next/link';

interface HistoricalDraw {
    id: string;
    drawAt: string;
    numbers: string;
    bonus: string | null;
}

interface Candidate {
    id: string;
    strategy: string;
    numbers: string;
    bonusNumbers: string | null;
    intendedDrawAt: string;
    createdAt: string;
    eligible: boolean;
    event: {
        type: string;
        tithiIndex: number | null;
        nakshatraIndex: number | null;
    };
}
// ... (GameHistory and OfficialDraw remain same, just update Candidate interface above)



interface OfficialDraw {
    id: string;
    drawAt: string;
    numbers: string;
    bonus: string | null;
    evaluation: Array<{
        strategy: string;
        matchCountMain: number;
        category: string | null;
        prizeValue: number | null;
        prizeText: string | null;
        candidate: {
            numbers: string;
        };
    }>;
}

interface GameHistory {
    game: {
        slug: string;
        name: string;
        cost: number;
        format: string;
        drawDays: string;
        drawTime: string;
    };
    historicalDrawCount: number;
    historicalDraws: HistoricalDraw[];
    officialDraws: OfficialDraw[];
    candidates: Candidate[];
    stats: {
        totalHistorical: number;
        requiredHistorical: number;
    };
}

function scoreEvaluation(evaluation: OfficialDraw['evaluation'][number]) {
    if (evaluation.prizeText && evaluation.prizeText.toUpperCase().includes('LIFE')) {
        return Number.POSITIVE_INFINITY;
    }
    if (typeof evaluation.prizeValue === 'number') {
        return evaluation.prizeValue;
    }
    return evaluation.matchCountMain;
}

function summarizeEvaluations(evaluations: OfficialDraw['evaluation']) {
    const byStrategy = new Map<string, OfficialDraw['evaluation']>();

    for (const evaluation of evaluations) {
        const bucket = byStrategy.get(evaluation.strategy);
        if (bucket) {
            bucket.push(evaluation);
        } else {
            byStrategy.set(evaluation.strategy, [evaluation]);
        }
    }

    const summary = Array.from(byStrategy.entries()).map(([strategy, items]) => {
        const best = items.reduce((currentBest, candidate) => {
            const currentScore = scoreEvaluation(currentBest);
            const candidateScore = scoreEvaluation(candidate);
            if (candidateScore > currentScore) {
                return candidate;
            }
            if (candidateScore === currentScore && candidate.matchCountMain > currentBest.matchCountMain) {
                return candidate;
            }
            return currentBest;
        }, items[0]);

        return {
            strategy,
            best,
            count: items.length
        };
    });

    return summary.sort((a, b) => a.strategy.localeCompare(b.strategy));
}

export default function HistoryPage() {
    const [history, setHistory] = useState<GameHistory[]>([]);
    const [selectedGame, setSelectedGame] = useState<string>('all');
    const [expandedHistorical, setExpandedHistorical] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);

    const fetchHistory = useCallback(async () => {
        try {
            const res = await fetch('/api/history');
            
            if (!res.ok) {
                console.error('History API error:', res.status, res.statusText);
                setHistory([]);
                setLoading(false);
                return;
            }
            
            const data = await res.json();
            
            // Validate that we received an array
            if (!Array.isArray(data)) {
                console.error('History API returned non-array data:', data);
                setHistory([]);
            } else {
                setHistory(data);
            }
        } catch (e) {
            console.error('Failed to fetch history:', e);
            setHistory([]);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchHistory();
    }, [fetchHistory]);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('en-CA', {
            timeZone: 'America/Toronto',
            dateStyle: 'medium',
            timeStyle: 'short'
        });
    };

    const formatNumbers = (numbersStr: string) => {
        try {
            return JSON.parse(numbersStr) as number[];
        } catch {
            return numbersStr.split(',').map(Number);
        }
    };

    const filteredHistory = selectedGame === 'all'
        ? history
        : history.filter(h => h.game.slug === selectedGame);

    return (
        <div className="min-h-screen bg-moon-bg font-sans text-foreground">
            {/* Navigation */}
            <nav className="fixed w-full z-50 top-0 border-b-2 border-black bg-moon-bg/95 backdrop-blur-sm">
                <div className="flex h-20 max-w-7xl mx-auto px-6 items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 group">
                        <div className="w-10 h-10 bg-moon-yellow rounded-lg border-2 border-black flex items-center justify-center brutal-shadow-sm group-hover:rotate-6 transition-transform">
                            <Moon className="w-6 h-6 stroke-[1.5]" />
                        </div>
                        <span className="text-xl font-bold tracking-tight font-heading">Moon Lotto</span>
                    </Link>

                    <div className="hidden md:flex items-center gap-8 font-semibold text-sm">
                        <Link href="/" className="hover:underline decoration-2 underline-offset-4">Dashboard</Link>
                        <Link href="/history" className="underline decoration-2 underline-offset-4">History</Link>
                        <Link href="/admin" className="hover:underline decoration-2 underline-offset-4">Admin</Link>
                    </div>
                </div>
            </nav>

            <main className="pt-28 pb-20 px-6 max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-4xl font-heading font-medium">Generation History</h1>

                    {/* Game Filter */}
                    <select
                        value={selectedGame}
                        onChange={(e) => setSelectedGame(e.target.value)}
                        className="border-2 border-black rounded-lg px-4 py-2 font-bold bg-white"
                    >
                        <option value="all">All Games</option>
                        {history.map(h => (
                            <option key={h.game.slug} value={h.game.slug}>{h.game.name}</option>
                        ))}
                    </select>
                </div>

                {loading ? (
                    <div className="text-center py-20">Loading...</div>
                ) : (
                    <div className="space-y-8">
                        {filteredHistory.map((item) => (
                            <BrutalCard key={item.game.slug} className="bg-white">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className={`w-10 h-10 rounded-lg border-2 border-black flex items-center justify-center
                                        ${item.game.slug === 'daily-grand' ? 'bg-moon-blue' : ''}
                                        ${item.game.slug === 'lotto-max' ? 'bg-moon-yellow' : ''}
                                        ${item.game.slug === 'lotto-649' ? 'bg-moon-pink' : ''}
                                        ${item.game.slug === 'lottario' ? 'bg-moon-green' : ''}
                                    `}>
                                        <Calendar className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold">{item.game.name}</h2>
                                        <div className="text-sm text-zinc-500">
                                            {item.game.drawDays} @ {item.game.drawTime} • ${item.game.cost}/play
                                        </div>
                                    </div>
                                    <div className="ml-auto text-right">
                                        <div className="text-sm font-bold">Historical DB</div>
                                        <div className={`text-lg font-heading ${item.stats.totalHistorical >= item.stats.requiredHistorical
                                            ? 'text-green-600'
                                            : 'text-orange-500'
                                            }`}>
                                            {item.stats.totalHistorical} / {item.stats.requiredHistorical}
                                        </div>
                                    </div>
                                </div>

                                {/* Historical Winning Numbers */}
                                <div className="mb-6">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="font-bold text-lg flex items-center gap-2">
                                            <HistoryIcon className="w-5 h-5" />
                                            Historical Winning Numbers
                                        </h3>
                                        {item.historicalDraws.length > 10 && (
                                            <button
                                                className="text-xs font-bold underline"
                                                onClick={() => setExpandedHistorical(prev => ({
                                                    ...prev,
                                                    [item.game.slug]: !prev[item.game.slug]
                                                }))}
                                            >
                                                {expandedHistorical[item.game.slug] ? 'Show latest 10' : `Show all ${item.historicalDraws.length}`}
                                            </button>
                                        )}
                                    </div>

                                    {item.historicalDraws.length === 0 ? (
                                        <div className="text-zinc-500 text-sm py-4">
                                            No historical draws available yet.
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b-2 border-black">
                                                        <th className="text-left py-2 px-3">Draw Date</th>
                                                        <th className="text-left py-2 px-3">Winning Numbers</th>
                                                        <th className="text-left py-2 px-3">Bonus/Grand</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(expandedHistorical[item.game.slug]
                                                        ? item.historicalDraws
                                                        : item.historicalDraws.slice(0, 10)
                                                    ).map((draw) => (
                                                        <tr key={draw.id} className="border-b border-black/10">
                                                            <td className="py-2 px-3">
                                                                {formatDate(draw.drawAt)}
                                                            </td>
                                                            <td className="py-2 px-3">
                                                                <div className="flex gap-1 flex-wrap">
                                                                    {formatNumbers(draw.numbers).map((n, i) => (
                                                                        <span key={i} className="w-7 h-7 rounded-full border-2 border-black flex items-center justify-center bg-moon-blue font-bold text-xs">
                                                                            {n}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </td>
                                                            <td className="py-2 px-3">
                                                                {draw.bonus ? (
                                                                    <div className="flex items-center gap-1">
                                                                        {formatNumbers(draw.bonus).map((n, i) => (
                                                                            <span key={i} className="w-6 h-6 rounded-full border-2 border-black flex items-center justify-center bg-moon-green font-bold text-xs">
                                                                                {n}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-xs text-zinc-500">-</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>

                                {/* Generated Candidates */}
                                <div className="mb-6">
                                    <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                                        <HistoryIcon className="w-5 h-5" />
                                        Generated Candidates ({item.candidates.length})
                                    </h3>

                                    {item.candidates.length === 0 ? (
                                        <div className="text-zinc-500 text-sm py-4">
                                            No candidates generated yet. Go to Admin → Generate All Picks.
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b-2 border-black">
                                                        <th className="text-left py-2 px-3">Strategy</th>
                                                        <th className="text-left py-2 px-3">Numbers</th>
                                                        <th className="text-left py-2 px-3">For Draw</th>
                                                        <th className="text-left py-2 px-3">Generated</th>
                                                        <th className="text-left py-2 px-3">Event</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {item.candidates.slice(0, 10).map((candidate) => (
                                                        <tr key={candidate.id} className="border-b border-black/10">
                                                            <td className="py-2 px-3">
                                                                <span className={`px-2 py-1 rounded text-xs font-bold ${candidate.strategy === 'TITHI'
                                                                    ? 'bg-moon-yellow'
                                                                    : 'bg-moon-green'
                                                                    }`}>
                                                                    {candidate.strategy}
                                                                </span>
                                                            </td>
                                                            <td className="py-2 px-3">
                                                                <div className="flex flex-col gap-1">
                                                                    <div className="flex gap-1">
                                                                        {formatNumbers(candidate.numbers).map((n, i) => (
                                                                            <span key={i} className="w-7 h-7 rounded-full border border-black flex items-center justify-center bg-gray-50 font-bold text-xs">
                                                                                {n}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                    {candidate.bonusNumbers && (
                                                                        <div className="flex items-center gap-1">
                                                                            <span className="text-[10px] font-bold uppercase text-zinc-500">Grand:</span>
                                                                            {formatNumbers(candidate.bonusNumbers).map((n, i) => (
                                                                                <span key={i} className="w-6 h-6 rounded-full border border-black flex items-center justify-center bg-moon-green font-bold text-xs">
                                                                                    {n}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="py-2 px-3 text-zinc-600">
                                                                {formatDate(candidate.intendedDrawAt)}
                                                            </td>
                                                            <td className="py-2 px-3 text-zinc-600">
                                                                {formatDate(candidate.createdAt)}
                                                            </td>
                                                            <td className="py-2 px-3 text-xs">
                                                                <div>T:{candidate.event?.tithiIndex || '-'}</div>
                                                                <div>N:{candidate.event?.nakshatraIndex || '-'}</div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>

                                {/* Official Draws with Evaluations */}
                                {item.officialDraws.length > 0 && (
                                    <div>
                                        <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                                            <TrendingUp className="w-5 h-5" />
                                            Official Draws & Results ({item.officialDraws.length})
                                        </h3>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b-2 border-black">
                                                        <th className="text-left py-2 px-3">Draw Date</th>
                                                        <th className="text-left py-2 px-3">Winning Numbers</th>
                                                        <th className="text-left py-2 px-3">Strategy Results</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {item.officialDraws.map((draw) => {
                                                        const evaluationSummary = summarizeEvaluations(draw.evaluation);

                                                        return (
                                                            <tr key={draw.id} className="border-b border-black/10">
                                                                <td className="py-2 px-3">
                                                                    {formatDate(draw.drawAt)}
                                                                </td>
                                                                <td className="py-2 px-3">
                                                                    <div className="flex gap-1">
                                                                        {formatNumbers(draw.numbers).map((n, i) => (
                                                                            <span key={i} className="w-7 h-7 rounded-full border-2 border-black flex items-center justify-center bg-moon-yellow font-bold text-xs">
                                                                                {n}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </td>
                                                                <td className="py-2 px-3">
                                                                    {evaluationSummary.length > 0 ? (
                                                                        <div className="flex flex-wrap gap-2">
                                                                            {evaluationSummary.map(({ strategy, best, count }) => (
                                                                                <div
                                                                                    key={strategy}
                                                                                    className="rounded border-2 border-black bg-gray-100 px-2 py-1 text-xs"
                                                                                >
                                                                                    <div className="font-bold">{strategy}</div>
                                                                                    <div>{best.matchCountMain} matches</div>
                                                                                    {best.prizeText && (
                                                                                        <div className="text-[10px]">{best.prizeText}</div>
                                                                                    )}
                                                                                    {count > 1 && (
                                                                                        <div className="text-[10px]">{count} candidates</div>
                                                                                    )}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    ) : '-'}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </BrutalCard>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
