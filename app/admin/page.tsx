'use client';

import { useState, useEffect } from 'react';
import { BrutalButton } from "@/components/ui/BrutalButton";
import { BrutalCard } from "@/components/ui/BrutalCard";
import { Moon, RefreshCw, Play, Database, Clock, Zap } from "lucide-react";
import Link from 'next/link';

interface GeneratedResult {
    game: string;
    strategy: string;
    numbers: number[];
    bonusNumbers?: number[];
    intendedDrawAt: string;
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
    candidates: Array<{
        id: string;
        strategy: string;
        numbers: string;
        intendedDrawAt: string;
        createdAt: string;
        eligible: boolean;
    }>;
    stats: {
        totalHistorical: number;
        requiredHistorical: number;
    };
}

interface TimingInfo {
    now: string;
    current: {
        tithi: { index: number; phaseAngle: number };
        nakshatra: { index: number; longitude: number };
    };
    next: {
        tithiChange: string;
        nakshatraChange: string;
    };
}

export default function AdminPage() {
    const [loading, setLoading] = useState(false);
    const [generatedResults, setGeneratedResults] = useState<GeneratedResult[]>([]);
    const [history, setHistory] = useState<GameHistory[]>([]);
    const [timing, setTiming] = useState<TimingInfo | null>(null);
    const [message, setMessage] = useState<string>('');

    // Fetch timing info on load
    useEffect(() => {
        fetchTiming();
        fetchHistory();
    }, []);

    const fetchTiming = async () => {
        try {
            const res = await fetch('/api/generate');
            const data = await res.json();
            setTiming(data);
        } catch (e) {
            console.error('Failed to fetch timing:', e);
        }
    };

    const fetchHistory = async () => {
        try {
            const res = await fetch('/api/history');
            const data = await res.json();
            setHistory(data);
        } catch (e) {
            console.error('Failed to fetch history:', e);
        }
    };

    const generatePicks = async () => {
        setLoading(true);
        setMessage('Generating picks...');
        try {
            const res = await fetch('/api/generate', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setGeneratedResults(data.results);
                setMessage(`✅ Generated ${data.results.length} picks!`);
                fetchHistory(); // Refresh history
            } else {
                setMessage(`❌ Error: ${data.error}`);
            }
        } catch (e) {
            setMessage(`❌ Error: ${e}`);
        }
        setLoading(false);
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('en-CA', {
            timeZone: 'America/Toronto',
            dateStyle: 'medium',
            timeStyle: 'short'
        });
    };

    const formatCountdown = (dateStr: string) => {
        const target = new Date(dateStr).getTime();
        const now = Date.now();
        const diff = target - now;

        if (diff <= 0) return 'Now';

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        return `${hours}h ${mins}m`;
    };

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
                        <Link href="/history" className="hover:underline decoration-2 underline-offset-4">History</Link>
                        <Link href="/admin" className="underline decoration-2 underline-offset-4">Admin</Link>
                    </div>
                </div>
            </nav>

            <main className="pt-28 pb-20 px-6 max-w-7xl mx-auto">
                <h1 className="text-4xl font-heading font-medium mb-8">Admin Console</h1>

                {/* Timing Info */}
                {timing && (
                    <div className="grid md:grid-cols-2 gap-6 mb-8">
                        <BrutalCard className="bg-moon-yellow">
                            <div className="flex items-center gap-3 mb-4">
                                <Clock className="w-6 h-6" />
                                <h2 className="text-xl font-bold">Current Jyotish</h2>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <div className="font-bold">Tithi</div>
                                    <div className="text-2xl font-heading">{timing.current.tithi.index}</div>
                                    <div className="text-xs opacity-70">Phase: {timing.current.tithi.phaseAngle.toFixed(1)}°</div>
                                </div>
                                <div>
                                    <div className="font-bold">Nakshatra</div>
                                    <div className="text-2xl font-heading">{timing.current.nakshatra.index}</div>
                                    <div className="text-xs opacity-70">Long: {timing.current.nakshatra.longitude.toFixed(1)}°</div>
                                </div>
                            </div>
                        </BrutalCard>

                        <BrutalCard className="bg-moon-green">
                            <div className="flex items-center gap-3 mb-4">
                                <Zap className="w-6 h-6" />
                                <h2 className="text-xl font-bold">Next Events</h2>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <div className="font-bold">Tithi Change</div>
                                    <div className="text-lg font-heading">{formatCountdown(timing.next.tithiChange)}</div>
                                    <div className="text-xs opacity-70">{formatDate(timing.next.tithiChange)}</div>
                                </div>
                                <div>
                                    <div className="font-bold">Nakshatra Change</div>
                                    <div className="text-lg font-heading">{formatCountdown(timing.next.nakshatraChange)}</div>
                                    <div className="text-xs opacity-70">{formatDate(timing.next.nakshatraChange)}</div>
                                </div>
                            </div>
                        </BrutalCard>
                    </div>
                )}

                {/* Actions */}
                <BrutalCard className="bg-white mb-8">
                    <div className="flex items-center gap-3 mb-4">
                        <Play className="w-6 h-6" />
                        <h2 className="text-xl font-bold">Generate Picks Now</h2>
                    </div>
                    <p className="text-sm text-zinc-600 mb-4">
                        Manually trigger number generation for all games using the current Tithi/Nakshatra values.
                    </p>
                    <div className="flex items-center gap-4">
                        <BrutalButton onClick={generatePicks} disabled={loading}>
                            {loading ? (
                                <><RefreshCw className="w-4 h-4 animate-spin" /> Generating...</>
                            ) : (
                                <><Zap className="w-4 h-4" /> Generate All Picks</>
                            )}
                        </BrutalButton>
                        {message && <span className="text-sm">{message}</span>}
                    </div>
                </BrutalCard>

                {/* Generated Results */}
                {generatedResults.length > 0 && (
                    <BrutalCard className="bg-moon-pink mb-8">
                        <h2 className="text-xl font-bold mb-4">Latest Generated Picks</h2>
                        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {generatedResults.map((result, idx) => (
                                <div key={idx} className="bg-white rounded-lg border-2 border-black p-4">
                                    <div className="font-bold">{result.game}</div>
                                    <div className="text-xs text-zinc-500 mb-2">{result.strategy}</div>
                                    <div className="flex flex-wrap gap-1">
                                        {result.numbers.map((n, i) => (
                                            <span key={i} className="w-8 h-8 rounded-full border-2 border-black flex items-center justify-center bg-moon-yellow font-bold text-xs">
                                                {n}
                                            </span>
                                        ))}
                                    </div>
                                    {result.bonusNumbers && (
                                        <div className="mt-2 flex gap-1">
                                            <span className="text-xs">Grand:</span>
                                            {result.bonusNumbers.map((n, i) => (
                                                <span key={i} className="w-6 h-6 rounded-full border-2 border-black flex items-center justify-center bg-moon-green font-bold text-xs">
                                                    {n}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </BrutalCard>
                )}

                {/* History by Game */}
                <BrutalCard className="bg-white">
                    <div className="flex items-center gap-3 mb-4">
                        <Database className="w-6 h-6" />
                        <h2 className="text-xl font-bold">Database Status</h2>
                    </div>
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {history.map((item) => (
                            <div key={item.game.slug} className="border-2 border-black rounded-lg p-4">
                                <div className="font-bold text-lg">{item.game.name}</div>
                                <div className="text-xs text-zinc-500 mb-3">{item.game.drawDays} @ {item.game.drawTime}</div>

                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span>Historical Draws:</span>
                                        <span className={`font-bold ${item.stats.totalHistorical >= item.stats.requiredHistorical ? 'text-green-600' : 'text-orange-500'}`}>
                                            {item.stats.totalHistorical} / {item.stats.requiredHistorical}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Generated Candidates:</span>
                                        <span className="font-bold">{item.candidates.length}</span>
                                    </div>
                                </div>

                                {item.candidates.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-black/20">
                                        <div className="text-xs font-bold mb-1">Latest Pick:</div>
                                        <div className="flex flex-wrap gap-1">
                                            {JSON.parse(item.candidates[0].numbers).map((n: number, i: number) => (
                                                <span key={i} className="w-6 h-6 rounded-full border border-black flex items-center justify-center bg-gray-100 text-xs font-bold">
                                                    {n}
                                                </span>
                                            ))}
                                        </div>
                                        <div className="text-xs text-zinc-500 mt-1">
                                            {item.candidates[0].strategy}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </BrutalCard>
            </main>
        </div>
    );
}
