---
name: Lotto Max Rules
description: Complete rules, prize tiers, and logic for Lotto Max (Ontario).
---

# Lotto Max Knowledge Base

**"Dream to the Max"**

## 1. Game Format
- **Main Draw**: Select **7** numbers from **1 to 50**.
- **Bonus Ball**: Drawn from the remaining 43 balls (applies to secondary prizes only).
- **Cost**: **$5.00** per play.
- **Lines per Play**: Each $5 play gives you **3 lines** of numbers.
- **Draw Schedule**: Tuesdays and Fridays at **10:30 PM ET**.

## 2. Prize Structure (Main Draw)

| Match Rule | Prize Tier | Prize Type | Est. Value | Allocation | Odds (per $5 play) |
|------------|------------|------------|------------|------------|--------------------|
| **7/7** | Jackpot | Variable | $10M - $80M | 87.25% of Pool | 1 in 33,294,800 |
| **6/7 + Bonus** | 2nd | Variable | ~$100,000 | 2.5% of Pool | 1 in 4,756,400 |
| **6/7** | 3rd | Variable | ~$4,000 | 2.5% of Pool | 1 in 113,248 |
| **5/7 + Bonus** | 4th | Variable | ~$900 | 1.5% of Pool | 1 in 37,749 |
| **5/7** | 5th | Variable | ~$100 | 3.5% of Pool | 1 in 1,841 |
| **4/7 + Bonus** | 6th | Variable | ~$50 | 2.75% of Pool | 1 in 1,105 |
| **4/7** | 7th | Fixed | **$20.00** | - | 1 in 82.9 |
| **3/7 + Bonus** | 8th | Fixed | **$20.00** | - | 1 in 82.9 |
| **3/7** | 9th | Fixed | **Free Play** | $5 Value | 1 in 8.5 |

*Note: Percentages apply to the "Pools Fund" (48% of sales).*

## 3. MaxMillions
- **Trigger**: When Main Jackpot reaches **$50 Million**.
- **Format**: Separate draws of **7 numbers** (from 1-50).
- **Prize**: **$1 Million** (Fixed).
- **Winning Rule**: Must match **7/7** exactly.
- **Subsidiary Prizes**: None. You win $1M or nothing.
- **Sharing**: If multiple winning tickets match the same MaxMillions draw, the $1M is split.

## 4. Evaluation Logic
To determine the prize for a generated line:

1. **Check vs Main Draw**:
   - Count matches in Main Numbers (1-7).
   - Check if Bonus Number is matched (if applicable).
   - Lookup in Main Prize Table (above).

2. **Check vs MaxMillions** (if active):
   - For EACH MaxMillions draw, count matches.
   - Only **7/7** counts as a win ($1,000,000).

## 5. Future Changes (April 2026)
- **Range**: 1-52 (currently 1-50).
- **Cost**: $6 (currently $5).
- **New Feature**: MAXPLUS.

**Current App Version**: Uses Pre-2026 Rules (1-50).
