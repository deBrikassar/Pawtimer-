# Structural Review (Maintainability + Technical Cleanliness)

## 1) High-level structural assessment

PawTimer is functional and shows clear product intent, but the current implementation is **highly centralized** and increasingly fragile around Train/Stats evolution.

- `src/App.jsx` combines domain logic, sync/storage integration, state orchestration, and full-screen rendering in one file.
- The styling system has the right primitives (`theme.css` and `shared.css`), but ownership boundaries are blurred by many overlapping rules in `app.css`.
- Train and Stats have useful extracted child components, but orchestration remains in `App`, so behavior and presentation are still tightly coupled.

Net: strong feature coverage, but weak module boundaries.

---

## 2) Main structural problems

### A. `App.jsx` is a god component (scope + size)

**What is wrong**
- `src/App.jsx` is ~2.7k lines and mixes data layer + domain layer + UI layer.
- It holds a large number of independent state slices and effect blocks in one scope.

**Why this is a problem**
- High cognitive load and difficult change isolation.
- Higher regression risk when touching Train/Stats/settings because all concerns share one render/effect context.

**Severity**: **High**

**Refactor direction**
- Keep `App` as shell/router + top-level context only.
- Extract feature containers (`TrainTab`, `StatsTab`, `HistoryTab`, `SettingsTab`) and move related state/effects with each feature.

---

### B. Sync/hydration data flow is tightly coupled and race-prone

**What is wrong**
- Sync polling does fetch, reconciliation, write-back to local storage, local-to-remote feeding patching, and UI status updates inside one `useEffect`.
- The poll effect reads from outer closure state (`dogs`, `feedings`) while only depending on `activeDogId`.

**Why this is a problem**
- Behavior is hard to reason about and hard to test.
- Closure drift can create stale reads during long-lived polling intervals.
- Conflict rules (local vs remote precedence) are implicit and scattered.

**Severity**: **High**

**Refactor direction**
- Move sync orchestration to `useDogSync(activeDogId)` or `services/sync/*`.
- Define explicit merge policy per entity (`sessions`, `walks`, `patterns`, `feedings`) and keep UI effects read-only.

---

### C. Stats domain logic is duplicated between protocol layer and App

**What is wrong**
- `src/lib/protocol.js` already computes core stats (`stability`, `momentum`, `relapseRisk`, `adherence`) via `calculateTrainingStats`.
- `src/App.jsx` recomputes overlapping heuristics and tones for stats cards.

**Why this is a problem**
- Formula drift risk: recommendations and Stats UI can disagree over time.
- Adds maintenance overhead and duplicate bug-fix surface.

**Severity**: **High**

**Refactor direction**
- Introduce a single selector adapter (e.g., `selectStatsViewModel`) using protocol outputs.
- Keep Stats tab presentational: formatting + display only.

---

### D. Styling ownership is inconsistent; primitives are redefined

**What is wrong**
- `src/styles/shared.css` defines shared card/heading/button primitives.
- `src/styles/app.css` redefines several of the same classes and includes duplicate selectors (e.g., `.notif-toggle`, `.btn-pat:active`).

**Why this is a problem**
- Cascade order becomes the de-facto API.
- Increases visual regressions when changing one section.
- Makes true design-system migration harder.

**Severity**: **Medium-High**

**Refactor direction**
- Establish strict ownership:
  - `theme.css` = tokens only
  - `shared.css` = reusable primitives
  - `app.css` = screen-specific layouts only
- Remove duplicate selectors and merge to canonical definitions.

---

### E. Repeated inline style literals bypass typography/spacing tokens

**What is wrong**
- Frequent inline object styles in JSX for typography, spacing, and color (especially chart labels, legends, small layout blocks).

**Why this is a problem**
- Hard to enforce consistent spacing/type rules.
- Prevents centralized theme changes and creates small visual drifts.

**Severity**: **Medium**

**Refactor direction**
- Convert repeated inline patterns into utility classes (e.g., muted helper text rows, legend rows, tokenized spacing helpers).
- Keep inline styles only for genuinely dynamic numeric values.

---

### F. Tab naming and feature intent are inconsistent

**What is wrong**
- Tab id `tips` renders the Settings screen.
- Internal naming no longer matches UI purpose.

**Why this is a problem**
- Reduces readability and increases onboarding friction.
- Encourages future mismatches when code gets split.

**Severity**: **Medium**

**Refactor direction**
- Rename semantic IDs to match behavior (`settings`, `stats`, etc.) during feature extraction.

---

### G. Train + Stats sections still hold too many responsibilities in App render

**What is wrong**
- Train contains timer control, rating flow, recommendation messaging, rings, quick actions, and context/tool overlays inside one render branch.
- Stats combines KPI derivation + card rendering + chart config + explanatory modal wiring.

**Why this is a problem**
- Local changes in one subsection can accidentally affect unrelated branches.
- Hard to write focused tests for each section.

**Severity**: **Medium-High**

**Refactor direction**
- Extract section-level composites (`TrainSummaryRings`, `StatsOverviewCard`, `OutcomeBreakdownCard`, `StatsHelpModal`).
- Keep parent tab as orchestrator of section props only.

---

### H. Test coverage is strong for protocol logic but thin for integration/UI structure

**What is wrong**
- Tests currently focus on `src/lib/protocol.js` behavior.
- There is no equivalent coverage for App-level data orchestration and tab interactions.

**Why this is a problem**
- High-risk areas (sync + state wiring + render branching) are unguarded.
- Structural refactors become risky without integration confidence.

**Severity**: **Medium**

**Refactor direction**
- Add focused integration tests for tab-level flows and sync state transitions after extracting feature modules.

---

## 3) Prioritized action plan

### Fix now (highest ROI)
1. Extract sync/hydration from `App.jsx` into dedicated hook/service with explicit merge policy.
2. Unify Stats calculations behind one domain selector using `calculateTrainingStats`.
3. Remove duplicated CSS selectors and define style ownership boundaries.

### Fix soon
1. Split Train and Stats into feature-level containers/components.
2. Replace repeated inline style literals with shared tokenized utility classes.
3. Normalize tab and feature naming (`tips` -> `settings`) while preserving behavior.

### Later / optional
1. Add structural integration tests around tab flows and sync edge cases.
2. Continue pruning legacy/compatibility artifacts after module boundaries stabilize.

---

## 4) Files/areas to clean first

1. `src/App.jsx` — first target for feature extraction and sync isolation.
2. `src/styles/app.css` + `src/styles/shared.css` — consolidate duplicate class ownership.
3. `src/lib/protocol.js` + Stats-related App derivations — remove duplicated metrics logic.
4. `tests/` — add integration coverage after extraction.

---

## 5) What is currently fine and should stay

- `src/styles/theme.css` token foundation is solid and should remain the source-of-truth for theme values.
- `src/lib/protocol.js` is a good domain core and should be reused, not bypassed.
- Existing small presentational components (`EmptyState`, `TrainProgressBar`, `StatsInsightsGrid`, `StatsChartSection`) are good extraction seeds.

---

## 6) Centralize vs keep local

### Centralize
- Sync + persistence orchestration
- Stats/recommendation selectors
- Reusable UI primitives (cards, section headings, button variants)
- Typography/spacing helper classes mapped to tokens

### Keep local
- Screen-specific copy
- One-off micro-interactions that are not repeated
- Truly context-specific layout wrappers
