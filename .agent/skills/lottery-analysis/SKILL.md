---
name: lottery-analysis
description: Frameworks and mathematical theories for analyzing and predicting lottery numbers.
---

# Lottery Analysis & Prediction Frameworks

This skill documents the mathematical theories and pattern-finding frameworks used for analyzing lottery draws (specifically Lotto Max). While lottery draws are theoretically independent events, these frameworks look for short-term statistical anomalies, distribution biases, and probability density patterns.

## 1. Statistical Analysis (Frequency & Gap)
**Concept**: Law of Large Numbers & Regression to the Mean.
- **Frequency**: Numbers drawn most often in a sample size (e.g., last 100 draws) are "Hot".
- **Gap (Staleness)**: How many draws since a number last appeared.
- **Theory**: "Due" numbers are those with high frequency but large current gaps.
- **Formula**: `Score = (Frequency * Weight_F) + (Gap * Weight_G)`

## 2. Poisson & Probability Analysis
**Concept**: Probability Density Functions (PDF) & Normal Distribution.
- **Sum Analysis**: The sum of the 7 winning numbers usually follows a Bell Curve (Normal Distribution).
    - *Lotto Max (7/50)*: Peak probability for sum is approx 170-179.
    - *Filter*: Reject combinations with Sum < 140 or Sum > 210.
- **Parity (Odd/Even)**:
    - *Probability*: It is extremely rare for all 7 numbers to be Odd or Even.
    - *Filter*: Target 3-Odd/4-Even or 4-Odd/3-Even splits.
- **Low/High**:
    - Numbers 1-25 (Low) vs 26-50 (High). Balanced mix is statistically most probable.

## 3. Delta Analysis (Geometry)
**Concept**: Analysis of the *differences* between numbers.
- **Deltas**: The difference between adjacent sorted numbers (e.g., Draw: 2, 5, 10 -> Deltas: 2, 3, 5).
- **Distribution**: In smaller lotteries, deltas like 1, 2, 3, 4 are significantly more common than larger deltas.
- **Application**: Construct a line by choosing *deltas* from the most common distribution curve and summing them up.

## 4. Markov Chain (Sequential Probability)
**Concept**: State transitions and short-term bias.
- **Assumption**: While technically independent, physical machines or pseudorandom algorithms might show slight "memory" or clustering.
- **Transition Matrix**: `P(B|A)` - Probability that number B follows number A (either in the same draw as a pair, or in the next draw).
- **Walk**: Start with a "Seed" number (e.g., last draw's bonus) and "walk" the chain to find the next most probable numbers.

## 5. Hybrid "Smart Filter"
**Concept**: Combining multiple weak indicators into a strong predictor.
- **Mechanism**:
    1.  Generate a large pool of candidates using **Statistical** weights.
    2.  Apply **Poisson** filters (Sum, Parity) to prune impossible outliers.
    3.  Apply **Delta** filters to ensure realistic spacing.
    4.  The remaining candidates represent the statistically "safest" bets.

## Usage
When predicting numbers, generate lines using *each* strategy to diversify risk.
- **Statistical Line**: For playing the "trends".
- **Poisson Line**: For playing the "math".
- **Delta Line**: For playing the "structure".
- **Hybrid Line**: For the balanced approach.
