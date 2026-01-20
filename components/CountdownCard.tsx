'use client';

import { useState, useEffect } from "react";
import { Moon, Star } from "lucide-react";
import { BrutalCard } from "@/components/ui/BrutalCard";
import { BrutalButton } from "@/components/ui/BrutalButton";

interface CountdownProps {
    targetDate: Date;
    label: string;
    subLabel: string;
    type: 'tithi' | 'nakshatra';
}

export function CountdownCard({ targetDate, label, subLabel, type }: CountdownProps) {
    const [timeLeft, setTimeLeft] = useState("");

    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date();
            const diff = targetDate.getTime() - now.getTime();

            if (diff <= 0) {
                setTimeLeft("00:00:00");
                return;
            }

            const h = Math.floor(diff / (1000 * 60 * 60));
            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((diff % (1000 * 60)) / 1000);

            setTimeLeft(
                `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
            );
        }, 1000);

        return () => clearInterval(interval);
    }, [targetDate]);

    return (
        <BrutalCard className={`absolute top-12 left-0 w-72 h-80 ${type === 'tithi' ? 'bg-moon-yellow' : 'bg-moon-green'} -rotate-3 z-20 flex flex-col justify-between`}>
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-full border-2 border-black flex items-center justify-center">
                        {type === 'tithi' ? <Moon className="w-5 h-5" /> : <Star className="w-5 h-5" />}
                    </div>
                    <div>
                        <div className="font-bold text-sm">{label}</div>
                        <div className="text-xs text-zinc-600">{subLabel}</div>
                    </div>
                </div>
            </div>
            <div className="text-center py-6">
                <div className="text-4xl font-bold font-heading">{timeLeft || "Loading..."}</div>
                <div className="text-sm font-bold mt-2">Time Remaining</div>
            </div>
            <BrutalButton className="w-full">System Active</BrutalButton>
        </BrutalCard>
    );
}
