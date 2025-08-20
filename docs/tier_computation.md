# Tier Computation Approach

## Overview
This MTG tournament meta-analysis uses a statistical approach to assign tier rankings to deck archetypes based on their competitive performance.

## Data Sources
- Tournament results from JSON files (MTGOArchetypeParser data)
- Win/loss records aggregated by player and archetype
- Confidence intervals calculated using robust linear models with clustered standard errors

## Tier Assignment Method

### 1. Lower Bound Calculation
- For each archetype, calculate the **lower bound of the 95% confidence interval** on win rate
- This represents the "worst case" performance we can be confident about
- Uses clustered standard errors to account for individual player skill differences

### 2. Statistical Standardization
- Calculate the **mean** and **standard deviation** of all lower bounds
- Use these as reference points for tier boundaries

### 3. Tier Boundaries (based on standard deviations from mean)
- **Tier 0**: ≥ mean + 3×std (exceptional)
- **Tier 0.5**: ≥ mean + 2×std (very strong)  
- **Tier 1**: ≥ mean + 1×std (strong)
- **Tier 1.5**: ≥ mean (average/playable)
- **Tier 2**: ≥ mean - 1×std (below average)
- **Tier 2.5**: ≥ mean - 2×std (weak)
- **Tier 3**: ≥ mean - 3×std (very weak)

## Key Features
- **Conservative approach**: Uses lower confidence bounds rather than point estimates
- **Presence filtering**: Only archetypes above a minimum meta share are tiered
- **Recursive refinement**: "Other" category archetypes are excluded and tiers recalculated
- **Statistical rigor**: Each tier represents exactly one standard deviation of performance difference

## Interpretation
- Tier 1.5 represents "average" competitive performance
- Lower tier numbers indicate stronger performance
- The approach accounts for sample size differences between archetypes through confidence intervals