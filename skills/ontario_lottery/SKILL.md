---
name: Ontario Lottery Knowledge
description: Comprehensive rules, schedules, and logic for Ontario Lottery games (Lotto 6/49, Lotto Max, Daily Grand, Lottario).
---

# Ontario Lottery Games Knowledge Base

This skill provides the authoritative source of truth for Ontario Lottery games managed by OLG.

## 1. Lotto 6/49

**"The Classic National Lottery"**

*   **Format**: Select **6** numbers from **1 to 49**.
*   **Cost**: **$3** per play.
*   **Draw Schedule**: Wednesdays and Saturdays at **10:30 PM ET**.
*   **Prize Structure**:
    *   **Classic Jackpot**: Fixed at **$5 Million** (shared if multiple winners). Match 6/6.
    *   **Gold Ball Jackpot**: Guaranteed **$1 Million** prize, or a growing jackpot (starts at $10M, caps at $68M).
        *   Each play includes a unique 10-digit Gold Ball Draw Number.
        *   A "Gold Ball" draw determines if the winner gets $1M (White Ball) or the Jackpot (Gold Ball).
    *   **Secondary Prizes**:
        *   5/6 + Bonus: ~2.5% of Pools Fund.
        *   5/6: ~2% of Pools Fund.
        *   4/6: ~44% of Pools Fund.
        *   Fixed prizes for 3/6 ($10), 2/6+Bonus ($5), 2/6 (Free Play).

## 2. Lotto Max

**"The Big Jackpot Game"**

*   **Format**: Select **7** numbers from **1 to 50**.
*   **Play Structure**: **$5** gives you **3 lines** of numbers.
*   **Draw Schedule**: Tuesdays and Fridays at **10:30 PM ET**.
*   **Jackpot**:
    *   Starts at **$10 Million**.
    *   Caps at **$70 Million** (can grow to $80M).
    *   **MaxMillions**: When jackpot > $50M, additional separate **$1 Million** prizes are drawn.
*   **Future Change (April 2026)**:
    *   Format changes to 4 lines of 7 numbers from **1-52**.
    *   Cost increases to **$6**.
    *   New "MAXPLUS" feature.
*   **Prize Structure**:
    *   Match 7/7: Jackpot (87.25% of pool).
    *   Match 6/7 + Bonus: 2.5% of pool.
    *   Fixed prizes for lower matches (e.g., $20 for 4/7).

## 3. Daily Grand

**"Set for Life"**

*   **Format**: Select **5** main numbers (**1-49**) + **1** Grand Number (**1-7**).
*   **Cost**: **$3** per play.
*   **Draw Schedule**: Mondays and Thursdays at **10:30 PM ET**.
*   **Top Prize**: **$1,000 a day for life** (or $7,000,000 lump sum).
*   **Second Prize**: **$25,000 a year for life** (or $500,000 lump sum) for matching 5/5 (no Grand).
*   **Odds**: 1 in 13,348,188 for top prize.

## 4. Lottario

**"Ontario's Exclusive Game"**

*   **Format**: Select **6** numbers from **1 to 45**.
*   **Play Structure**: **$1** gives you **2 lines** (two sets of numbers).
*   **Draw Schedule**: Saturdays at **10:30 PM ET**.
*   **Jackpot**: Starts at **$250,000** and grows until won.
*   **Early Bird**: Tickets purchased by Friday 11:59:59 PM ET are entered into an Early Bird draw for **$50,000**.
*   **Prize Structure**:
    *   Match 6/6: Jackpot.
    *   5/6 + Bonus: $10,000.
    *   Fixed prizes for lower matches.
    *   Free play for matching Bonus only (0/6 + Bonus).

## Summary Table

| Game | Main Numbers | Range | Bonus/Grand | Range | Draw Days | Time (ET) | Cost |
|------|--------------|-------|-------------|-------|-----------|-----------|------|
| **Daily Grand** | 5 | 1-49 | 1 (Grand) | 1-7 | Mon, Thu | 10:30 PM | $3 |
| **Lotto Max** | 7 | 1-50 | - | - | Tue, Fri | 10:30 PM | $5 (3 lines) |
| **Lotto 6/49** | 6 | 1-49 | 1 (Bonus)* | - | Wed, Sat | 10:30 PM | $3 |
| **Lottario** | 6 | 1-45 | 1 (Bonus)* | - | Sat | 10:30 PM | $1 (2 lines) |

*\*Bonus number is drawn from the remaining balls and applies to secondary prizes, not selected by player.*

## Key Rules for App Implementation

1.  **Cutoff Times**: While draws are at 10:30 PM, sales technically close at 10:30 PM.
2.  **Generation Logic**:
    *   **Lotto Max**: When simulating a "Play", we should arguably generate 3 predictive lines, or clarify that our candidates are individual lines.
    *   **Lottario**: Similarly, a $1 play is 2 lines.
3.  **Data Models**:
    *   `OfficialDraw` ingestion needs to handle valid ranges and bonus numbers correctly.
    *   `Evaluation` needs to account for Daily Grand's "Grand Number" matching logic which is distinct from a "Bonus Ball". (Grand is selected by player, Bonus is not).

## Resources
- [OLG Winning Numbers](https://www.olg.ca/en/lottery/winning-numbers-results.html)
- [Official Game Conditions](https://www.olg.ca/en/lottery-games.html)
