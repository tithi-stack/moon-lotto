import { BrutalButton } from "@/components/ui/BrutalButton";
import { BrutalCard } from "@/components/ui/BrutalCard";
import { ArrowRight, Moon, Star, Calendar, RefreshCw } from "lucide-react";
import { CountdownCard } from "@/components/CountdownCard";
import { getNextTithiChange, getTithi, getNakshatra } from "@/lib/astronomy/engine";
import Link from 'next/link';

export default function Home() {
  const now = new Date();
  const nextTithiChange = getNextTithiChange(now);
  const currentTithi = getTithi(now);
  // Nakshatra unused
  // const _currentNakshatra = getNakshatra(now);

  return (
    <div className="min-h-screen bg-moon-bg font-sans text-foreground overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed w-full z-50 top-0 border-b-2 border-black bg-moon-bg/95 backdrop-blur-sm">
        <div className="flex h-20 max-w-7xl mx-auto px-6 items-center justify-between">
          <a href="#" className="flex items-center gap-2 group">
            <div className="w-10 h-10 bg-moon-yellow rounded-lg border-2 border-black flex items-center justify-center brutal-shadow-sm group-hover:rotate-6 transition-transform">
              <Moon className="w-6 h-6 stroke-[1.5]" />
            </div>
            <span className="text-xl font-bold tracking-tight font-heading">Moon Lotto</span>
          </a>

          <div className="hidden md:flex items-center gap-8 font-semibold text-sm">
            <Link href="/" className="underline decoration-2 underline-offset-4">Dashboard</Link>
            <Link href="/history" className="hover:underline decoration-2 underline-offset-4">History</Link>
            <Link href="/admin" className="hover:underline decoration-2 underline-offset-4">Admin</Link>
          </div>

          <Link href="/admin">
            <BrutalButton variant="primary">Access Console</BrutalButton>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern -z-20"></div>
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">

          <div className="relative z-10 max-w-xl">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border-2 border-black bg-moon-green brutal-shadow-sm mb-8 transform -rotate-1">
              <Star className="w-4 h-4 stroke-[1.5]" />
              <span className="text-xs font-bold tracking-wide uppercase">Exact Jyotish Timing Engine</span>
            </div>

            <h1 className="text-5xl md:text-7xl tracking-tight leading-[1] mb-8 font-heading font-medium">
              Timing is everything.
              <span className="relative inline-block px-2">
                <span className="absolute inset-0 bg-moon-pink -rotate-2 border-2 border-black rounded-lg brutal-shadow-sm -z-10"></span>
                Literally.
              </span>
            </h1>

            <p className="text-xl text-zinc-600 mb-10 leading-relaxed font-medium">
              Generate lottery picks at the exact moment of Tithi and Nakshatra changes. A personal tool for celestial synchronization.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/history">
                <BrutalButton className="flex items-center justify-center gap-3 h-14 text-base">
                  View Upcoming Draws
                  <ArrowRight className="w-5 h-5 stroke-[1.5]" />
                </BrutalButton>
              </Link>
              <Link href="/admin">
                <BrutalButton variant="secondary" className="flex items-center justify-center gap-3 h-14 text-base">
                  <RefreshCw className="w-5 h-5 stroke-[1.5]" />
                  Generate Picks
                </BrutalButton>
              </Link>
            </div>
          </div>

          {/* Right Visual: Card Stack (Upcoming Events) */}
          <div className="relative h-[500px] hidden lg:flex items-center justify-center">
            <div className="relative w-[400px]">
              {/* Back Card */}
              <BrutalCard className="absolute -top-8 -right-4 w-72 h-80 rotate-3 z-10 flex flex-col justify-between white">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-moon-blue rounded-full border-2 border-black flex items-center justify-center">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm">Lotto Max</div>
                      <div className="text-xs text-zinc-500">Tue, 10:30 PM</div>
                    </div>
                  </div>
                  <div className="font-bold text-lg">$70M</div>
                </div>
                <div className="space-y-2 my-4">
                  <div className="flex gap-1 justify-center">
                    {[5, 12, 23, 34, 45, 48, 50].map(n => (
                      <span key={n} className="w-8 h-8 rounded-full border-2 border-black flex items-center justify-center bg-gray-100 font-bold text-xs">{n}</span>
                    ))}
                  </div>
                  <div className="text-center text-xs font-bold text-moon-green bg-black/5 py-1 rounded">Strategy: TITHI</div>
                </div>
              </BrutalCard>

              {/* Front Card - Timer */}
              <CountdownCard
                targetDate={nextTithiChange}
                label="Next Tithi Change"
                subLabel={`Current: Tithi ${currentTithi.index}`}
                type="tithi"
              />
            </div>
          </div>

        </div>
      </section>

      {/* Stats/Games Grid */}
      <section id="dashboard" className="py-24 px-6 bg-white border-y-2 border-black">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-sm font-bold tracking-widest uppercase text-zinc-500 mb-3 block">Supported Games</span>
            <h2 className="text-4xl md:text-5xl tracking-tight font-medium font-heading">Your Celestial Portfolio</h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Daily Grand */}
            <BrutalCard className="bg-moon-blue hover:-translate-y-1 transition-transform">
              <h3 className="text-xl font-bold mb-2">Daily Grand</h3>
              <div className="text-sm font-bold opacity-70 mb-4">Mon & Thu</div>
              <div className="flex justify-between items-end border-t-2 border-black pt-4">
                <span className="text-xs font-bold uppercase">Next Draw</span>
                <span className="text-lg font-bold">10:30 PM</span>
              </div>
            </BrutalCard>

            {/* Lotto Max */}
            <BrutalCard className="bg-moon-yellow hover:-translate-y-1 transition-transform">
              <h3 className="text-xl font-bold mb-2">Lotto Max</h3>
              <div className="text-sm font-bold opacity-70 mb-4">Tue & Fri</div>
              <div className="flex justify-between items-end border-t-2 border-black pt-4">
                <span className="text-xs font-bold uppercase">Next Draw</span>
                <span className="text-lg font-bold">Tomorrow</span>
              </div>
            </BrutalCard>

            {/* Lotto 6/49 */}
            <BrutalCard className="bg-moon-pink hover:-translate-y-1 transition-transform">
              <h3 className="text-xl font-bold mb-2">Lotto 6/49</h3>
              <div className="text-sm font-bold opacity-70 mb-4">Wed & Sat</div>
              <div className="flex justify-between items-end border-t-2 border-black pt-4">
                <span className="text-xs font-bold uppercase">Next Draw</span>
                <span className="text-lg font-bold">Wed</span>
              </div>
            </BrutalCard>

            {/* Lottario */}
            <BrutalCard className="bg-moon-green hover:-translate-y-1 transition-transform">
              <h3 className="text-xl font-bold mb-2">Lottario</h3>
              <div className="text-sm font-bold opacity-70 mb-4">Sat</div>
              <div className="flex justify-between items-end border-t-2 border-black pt-4">
                <span className="text-xs font-bold uppercase">Next Draw</span>
                <span className="text-lg font-bold">Sat</span>
              </div>
            </BrutalCard>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white text-black py-12 px-6 border-t-2 border-black mt-20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-moon-yellow rounded-lg border-2 border-black flex items-center justify-center">
              <Moon className="w-5 h-5 stroke-[1.5]" />
            </div>
            <span className="font-bold text-xl font-heading">Moon Lotto</span>
          </div>
          <div className="text-zinc-500 text-sm font-medium">
            (c) 2026 Moon Lotto. Personal Project.
          </div>
        </div>
      </footer>
    </div>
  );
}
