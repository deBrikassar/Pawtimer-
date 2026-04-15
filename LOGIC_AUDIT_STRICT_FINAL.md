# PawTimer Strict Logic Audit (Final)

Date: 2026-04-15
Scope: Application logic only (no UI/UX/design/copy review).

## Audit method
- Read and traced core logic paths in protocol/recommendation/date normalization/state mutation layers.
- Executed full automated test suite.
- Mapped requested 12 scenarios to existing and inferred behavior.

## Scenario outcomes
1. **Single short calm session below target** → holds (no escalation) ✅
2. **Repeated short calm sessions** → hold/repeat branch engaged ✅
3. **Repeated near-threshold calm sessions** → near-threshold plateau hold ✅
4. **Full calm sessions reaching target** → progressive increase path ✅
5. **Distress after calm streak** → recovery mode activation ✅
6. **Malformed session with missing fields** → normalized safely with conservative defaults ✅
7. **Contradictory session fields** → distress dominates below-threshold false ✅
8. **Missing plannedDuration + large actualDuration** → treated as unreliable plan (conservative/non-progressive) ✅
9. **Mixed valid + malformed history** → malformed rows dropped from progression calculations ✅
10. **Out-of-order / invalid-date history** → sorted and invalid-date filtered for recommendation path ✅
11. **Edit mutation and recompute** → recompute path exercised and covered by tests ✅
12. **Delete mutation and recompute** → recompute path exercised and covered by tests ✅

## Remaining logic issues

### 1) Threshold confirmation policy contradiction
- **Severity:** Minor
- **Confidence:** High
- **Where:** `src/lib/protocol.js` (`hasThresholdConfirmation`, protocol constants)
- **What is wrong:** `PROTOCOL.thresholdConfirmationStreak` is set to `2`, but `hasThresholdConfirmation()` returns `true` when exactly one recent session exists and that session is a calm, below-threshold success.
- **Why this is a logic problem:** The implementation bypasses configured streak policy in low-history cases, allowing escalation after one success despite a two-success threshold parameter.

### 2) Distress severity field can diverge from normalized distress level
- **Severity:** Minor
- **Confidence:** Medium-High
- **Where:** `src/features/app/storage.js` (`normalizeSession`)
- **What is wrong:** `distressLevel` is reconstructed via legacy decoding, but `distressSeverity` is assigned from raw `normalizedDistressSeverity` instead of the reconstructed level.
- **Why this is a logic problem:** Creates dual truth sources (`distressLevel` vs `distressSeverity`) that can disagree for legacy/malformed rows, risking inconsistent downstream decisions/serialization.

## Bottom line
- Core progression/recovery/hold mechanics are mostly robust and well-covered by tests.
- However, two internal consistency issues remain (policy bypass + dual-field inconsistency).
- Verdict: **Minor logic issues remain**.
