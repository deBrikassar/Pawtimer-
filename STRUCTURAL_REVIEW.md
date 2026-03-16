# Structural Review (Codebase Maintainability)

## 1) High-level assessment

The app is functional, but the structure has become **monolithic and tightly coupled**.

- `src/App.jsx` currently mixes:
  - storage adapters,
  - sync transport,
  - domain normalization,
  - recommendation/statistics derivation,
  - multiple tab UIs,
  - and per-tab interaction state.
- Styling is split across `theme.css`, `shared.css`, and `app.css`, but many patterns are still duplicated or overridden ad-hoc.
- The Train and Stats tabs are where structural complexity is highest and where future changes are most likely to create regressions.

---

## 2) Main structural problems

### Problem A — `App.jsx` is an oversized "god file"

**What is wrong**
- One file handles persistence, syncing, data transforms, recommendation UX, and all major screens.
- It has a very large state surface and many effects/handlers that are not feature-scoped.

**Why this is a problem**
- High cognitive load, hard to test in isolation, and high merge-conflict risk.
- Small UI changes can accidentally impact storage/sync behavior.

**Seriousness**
- **High**

**What should be refactored**
- Extract by concern, minimally:
  - `features/train/*` (session timer + rating UI)
  - `features/stats/*` (metrics/cards/chart)
  - `features/history/*`
  - `features/settings/*`
  - `hooks/useDogData` (hydration + persistence)
  - `services/syncClient` and `services/localStore`

---

### Problem B — Data-flow fragility in sync/hydration logic

**What is wrong**
- Polling sync effect captures and mutates multiple sources (`dogs`, local feedings, remote feedings) from a broad closure.
- Sync fallback/repair logic is embedded directly in UI component effects.

**Why this is a problem**
- Hard to reason about source-of-truth precedence.
- Easy to create stale-closure bugs or race conditions when adding features.

**Seriousness**
- **High**

**What should be refactored**
- Move sync polling and reconciliation into a dedicated hook/service with explicit conflict strategy.
- Keep `App` as consumer of a derived data model, not the reconciliation owner.

---

### Problem C — Stats logic is duplicated between UI and protocol/domain layer

**What is wrong**
- `src/lib/protocol.js` already computes stability/momentum/adherence/relapse signals, while `App.jsx` recomputes several overlapping metrics and risk heuristics.

**Why this is a problem**
- Divergent formulas over time; inconsistent values between recommendation engine and stats UI.

**Seriousness**
- **High**

**What should be refactored**
- Create one stats selector/domain adapter layer used by both Train and Stats tab.
- Keep UI purely presentational for metrics.

---

### Problem D — Styling system is partially centralized, partially duplicated

**What is wrong**
- `shared.css` introduces shared primitives, but `app.css` redefines several of the same patterns.
- Duplicate class definitions exist (e.g., notification toggle rules appear twice), and many inline style literals remain in JSX.

**Why this is a problem**
- Hard to predict which rule wins.
- Increases visual drift and makes global restyling expensive.

**Seriousness**
- **Medium-High**

**What should be refactored**
- Introduce `ui-primitives.css` ownership rules (buttons/cards/section headers/metric text).
- Migrate inline style usage for repeated values into utility classes or tokens.
- Remove duplicate selector definitions.

---

### Problem E — Repeated UI patterns not extracted (cards/metric buttons/section blocks)

**What is wrong**
- Stats cards, section headers, empty states, and action buttons are repeatedly hand-authored in JSX.

**Why this is a problem**
- Increases duplication and inconsistency risk.
- Slows feature changes; every tab edits similar markup separately.

**Seriousness**
- **Medium**

**What should be refactored**
- Extract low-risk shared components first:
  - `SectionBlock`
  - `MetricCard`
  - `EmptyState`
  - `ActionButtonRow`

---

### Problem F — Naming inconsistency and intent drift

**What is wrong**
- Tab IDs and labels are inconsistent with semantic purpose (e.g., `tips` tab renders Settings).
- Legacy/migration artifacts and compatibility comments remain mixed with current behavior in core files.

**Why this is a problem**
- Makes navigation and ownership unclear for future contributors.

**Seriousness**
- **Medium**

**What should be refactored**
- Normalize tab IDs to intent (`settings`, `stats`, etc.) while preserving behavior.
- Move migration utilities to a clearly named module (`migrations/localSchema.ts/js`).

---

### Problem G — Dead/legacy styling and compatibility leftovers

**What is wrong**
- Some style blocks are marked legacy or appear unused by current JSX paths.

**Why this is a problem**
- CSS bloat and uncertainty during refactors.

**Seriousness**
- **Low-Medium**

**What should be refactored**
- Run a class usage audit and prune unused rules in small batches.
- Keep legacy code only if tied to explicit migration windows.

---

## 3) Prioritized action plan

### Fix now (highest ROI / risk reduction)
1. Split `App.jsx` into feature slices (Train, Stats first).
2. Extract sync/hydration into dedicated hook/service.
3. Unify stats derivation to one domain source (protocol selectors).

### Fix soon
1. Consolidate typography/card/button/section primitives and remove duplicate CSS selector definitions.
2. Replace repeated stats/train card markup with shared components.
3. Reduce inline styles used for repeated spacing/typography/color patterns.

### Later / optional
1. Finish dead CSS and legacy migration cleanup.
2. Rename intent-drifted identifiers (like `tips`) once feature extraction lands.

---

## 4) Files/areas to clean up first

1. `src/App.jsx` — split by feature + move data orchestration out.
2. `src/styles/app.css` + `src/styles/shared.css` — remove duplicate ownership and centralize primitives.
3. `src/lib/protocol.js` + Stats tab usage in `App.jsx` — create shared selectors to avoid duplicate calculations.

---

## 5) What is currently fine and should mostly stay

- Token definitions in `src/styles/theme.css` are a good foundation and should remain the design source-of-truth.
- Protocol/recommendation domain logic in `src/lib/protocol.js` is relatively well-contained and should be extended rather than duplicated in UI files.
- Existing normalization helpers are valuable, but should be moved into dedicated modules/services to reduce `App` coupling.

---

## 6) What to centralize vs keep local

### Centralize
- Typography, spacing scales, button/card/section primitives.
- Stats/recommendation selectors.
- Sync + local persistence orchestration.

### Keep local
- Truly screen-specific microcopy.
- One-off visual states that do not repeat (single-purpose banners/modals), provided they consume shared primitives.
