import * as Astronomy from "astronomy-engine";

// Configuration for Toronto (as per PRD)
// Configuration for Toronto (as per PRD)
// const _LOCATION = { lat: 43.6532, lon: -79.3832, height: 0 };

// Lahiri Ayanamsa (approximate for MVP, finding a library or using fixed offset)
// For MVP, we will use a fixed offset or simple algorithm if astronomy-engine doesn't provide sidereal.
// Astronomy Engine is Tropical. Sidereal = Tropical - Ayanamsa.
// Current Lahiri Ayanamsa is approx ~24 degrees.
// We should compute it properly or use a fixed value for MVP if high precision isn't critical (PRD says "astronomy + Jyotish rules in code").
// Let's use a standard calculation for Ayanamsa (Swiss Ephemeris style is complex, but we can approximate).
// Start with 24.1 deg for 2026.
const AYANAMSA_2000 = 23.85; // Approx
const PRECESSION_RATE = 50.29 / 3600; // degrees per year

// ----------------------------------------------------
// Core Calculations
// ----------------------------------------------------

export function getTithi(date: Date) {
    // MoonPhase returns the phase angle (0-360) where:
    // 0 = New Moon, 90 = First Quarter, 180 = Full Moon, 270 = Last Quarter
    const phaseAngle = Astronomy.MoonPhase(date);

    // Tithi: Each tithi spans 12 degrees (360/30 = 12)
    // Index 1-30 where 1 = Pratipada (Shukla), 15 = Purnima, 16-30 = Krishna paksha
    const tithiIndex = Math.floor(phaseAngle / 12) + 1;
    const fraction = (phaseAngle % 12) / 12;

    return {
        index: tithiIndex,
        fraction: fraction,
        phaseAngle: phaseAngle
    };
}

export function getNakshatra(date: Date) {
    // Get Moon's geocentric position vector
    const moon = Astronomy.GeoVector(Astronomy.Body.Moon, date, true);
    // Convert to ecliptic coordinates
    const moonEcl = Astronomy.Ecliptic(moon);

    // Convert to Sidereal using Ayanamsa
    const ayanamsa = getAyanamsa(date);
    let siderealLon = moonEcl.elon - ayanamsa;
    if (siderealLon < 0) siderealLon += 360;

    // Nakshatra: Each nakshatra spans 13.333... degrees (360/27)
    const nakshatraSpan = 360 / 27;
    const index = Math.floor(siderealLon / nakshatraSpan) + 1;
    const fraction = (siderealLon % nakshatraSpan) / nakshatraSpan;

    return {
        index: index,
        fraction: fraction,
        longitude: siderealLon
    };
}

// Export getAyanamsa for use in getNakshatra
function getAyanamsa(date: Date): number {
    const yearsSince2000 = (date.getTime() - new Date("2000-01-01").getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    return AYANAMSA_2000 + (yearsSince2000 * PRECESSION_RATE);
}


// ----------------------------------------------------
// Solvers (Next Event)
// ----------------------------------------------------

// Binary search implementation for finding next change
export function getNextTithiChange(startDate: Date): Date {
    const startTithi = getTithi(startDate).index;

    // Scan forward in steps
    let t1 = new Date(startDate.getTime());
    const stepMinutes = 60;
    const maxSteps = 48; // Look ahead 2 days max

    // Coarse search
    for (let i = 0; i < maxSteps; i++) {
        t1 = new Date(t1.getTime() + stepMinutes * 60000);
        if (getTithi(t1).index !== startTithi) {
            // Found change between t1-step and t1
            return binarySearchTithi(new Date(t1.getTime() - stepMinutes * 60000), t1, startTithi);
        }
    }

    return t1; // Should not happen with large enough window
}

function binarySearchTithi(tA: Date, tB: Date, originalIndex: number): Date {
    let low = tA.getTime();
    let high = tB.getTime();

    // 5 second precision (5000ms)
    while ((high - low) > 5000) {
        const mid = (low + high) / 2;
        const result = getTithi(new Date(mid));

        if (result.index === originalIndex) {
            // Change is after mid
            low = mid;
        } else {
            // Change is before mid (or at mid)
            high = mid;
        }
    }
    return new Date(high);
}

export function getNextNakshatraChange(startDate: Date): Date {
    const startNak = getNakshatra(startDate).index;

    let t1 = new Date(startDate.getTime());
    const stepMinutes = 60;
    const maxSteps = 48;

    for (let i = 0; i < maxSteps; i++) {
        t1 = new Date(t1.getTime() + stepMinutes * 60000);
        if (getNakshatra(t1).index !== startNak) {
            return binarySearchNakshatra(new Date(t1.getTime() - stepMinutes * 60000), t1, startNak);
        }
    }
    return t1;
}

function binarySearchNakshatra(tA: Date, tB: Date, originalIndex: number): Date {
    let low = tA.getTime();
    let high = tB.getTime();

    while ((high - low) > 5000) {
        const mid = (low + high) / 2;
        const result = getNakshatra(new Date(mid));

        if (result.index === originalIndex) {
            low = mid;
        } else {
            high = mid;
        }
    }
    return new Date(high);
}

export function searchFullMoon(startDate: Date): Date {
    // Phase 180 degrees
    const moon = Astronomy.SearchMoonPhase(180, startDate, 30); // Search within 30 days
    if (!moon) {
        // Fallback or error, but shouldn't happen within 30 days usually
        return new Date(startDate.getTime() + 29.5 * 24 * 3600 * 1000);
    }
    return moon.date;
}

export function isFullMoonDate(checkDate: Date): boolean {
    // Check if the local date of checkDate matches the local date of the Full Moon
    // occurring roughly in this cycle.

    // Simplification for MVP: Find next full moon from checkDate - 15 days.
    const startSearch = new Date(checkDate.getTime() - 15 * 24 * 60 * 60 * 1000);
    const fullMoon = searchFullMoon(startSearch);

    if (!fullMoon) return false;

    // Convert both to Toronto Date string
    const checkStr = checkDate.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
    const fullStr = fullMoon.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });

    return checkStr === fullStr;
}
