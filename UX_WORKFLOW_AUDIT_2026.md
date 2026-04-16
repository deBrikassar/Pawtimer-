# PawTimer Workflow Audit & UX Logic Map (Pre-Redesign)

## Scope
This document maps the **current** PawTimer user journey and defines a target **workflow logic** for a 2026 premium, calm, dog-first mobile UX.

- No visual redesign decisions are included yet.
- Existing business logic (recommendation engine, recovery states, session logging rules, sync behavior) is treated as authoritative.

---

## 1) Current App Flow Audit (First Launch → Daily Reuse)

## A. Entry routing (what opens first)
1. App boot hydrates dogs + active dog from local storage.
2. If no active dog, app goes to dog selection (`screen = "select"`).
3. If active dog exists and profile has setup fields, app opens main app (`screen = "app"`).
4. If profile missing setup fields, app routes to onboarding (`screen = "onboard"`).

### Primary branches at first launch
- **No dogs yet** → Dog Select screen with:
  - “Add a new dog” CTA
  - “Join with dog ID” input
- **Join with ID**:
  - If sync enabled, app attempts remote fetch by canonical dog ID.
  - On success: imports dog + activities, persists locally, opens app.
  - On failure: error toast/state.
- **Create new dog**:
  - 4-step onboarding (name, leaves/day, current calm max, goal).
  - App creates dog profile and initializes target around 80% of current calm max (bounded by protocol minimum).

## B. Main app lifecycle (repeat use)
Bottom tabs:
- **Train (home)** = action loop
- **History** = timeline + edit/delete
- **Progress** = summary metrics + trend
- **Settings** = profile/reminders/help/advanced/account

### Daily training loop in current app
1. User lands on Train tab.
2. Sees target/goal context + primary session control.
3. Starts session timer if daily limits allow.
4. Ends session manually (or cancels without saving).
5. Rates distress outcome in rating overlay.
6. App logs session + recomputes recommendation.
7. App gives toast feedback (calm/hold/rollback style messaging).
8. User may log supporting activities (walk/pattern break/feeding).

### Recovery mode behavior in current app
- If recommendation engine enters recovery mode, Train screen shows recovery signal.
- User can tap for expanded recovery explanation modal.
- Recovery progress copy depends on recommendation type and recovery steps.

---

## 2) Ideal Workflow Definitions by User Type / Moment

## 2.1 First-time user (no dog yet)
### Goal
Immediate understanding: “This helps me train my dog to stay calm when left alone.”

### Ideal workflow
1. Open app → dog-first welcome with two choices:
   - Create new dog
   - Join existing dog by ID
2. One-sentence product purpose visible before any form fields.
3. User chooses path.
4. After completion, app enters Train screen with a guided “first action” state.

### Key UX logic
- Product meaning before data collection.
- Binary choice upfront reduces ambiguity.
- First actionable next step should be explicit (“Start first baseline session”).

## 2.2 Returning user
### Goal
Fast re-entry into today’s next best action.

### Ideal workflow
1. Open app directly to Train.
2. Hero explains current target + why this is today’s recommendation.
3. Primary CTA = start session.
4. Secondary actions collapsed/contextual (history/progress/settings via tabs).

### Key UX logic
- “What should I do right now?” is always answered at first glance.

## 2.3 User creating a new dog
### Goal
Set baseline accurately without overwhelm.

### Ideal workflow
1. Enter dog name.
2. Capture leave frequency.
3. Capture current calm tolerance.
4. Capture goal.
5. Confirm generated first target with short rationale.

### Key UX logic
- Keep 1 question per step.
- Explain impact of each answer at input moment.
- After completion, acknowledge personalization (“Plan tuned for {dogName}”).

## 2.4 User joining existing dog by ID
### Goal
Confident shared-profile linking, low fear of mistakes.

### Ideal workflow
1. Enter ID with real-time format guidance.
2. Show clear state: checking → found/not found.
3. On success: show what syncs (dog profile + activity timeline).
4. On partial sync/schema limits: soft warning with what is missing.

### Key UX logic
- Users must understand whether join failed because ID is wrong, owner hasn’t shared yet, or connectivity/schema issue exists.

## 2.5 User running a session
### Goal
Calm execution with zero ambiguity.

### Ideal workflow
1. User sees session target + readiness context.
2. Starts session via dominant hero control.
3. During run: single focus on elapsed/remaining and optional end/cancel.
4. Ends session.
5. Rates distress with clear behavioral definitions.
6. Saves outcome and sees immediate “what next” feedback.

### Key UX logic
- Session loop must remain interruption-free.
- All explanatory text appears only when relevant (start blocked, recovery active, rating needed).

## 2.6 User sees time reduction after stress
### Goal
Prevent discouragement and confusion.

### Ideal workflow
1. After distress save, surface:
   - Old target → new target change
   - Why change happened (stress signal, risk protection, recovery)
2. Offer “what to do next” micro-plan (e.g., short calm rebuild sessions).
3. Keep tone supportive, not punitive.

### Key UX logic
- A reduction without explanation feels like random punishment.
- Must connect algorithm decision to observed dog behavior.

## 2.7 User checking history
### Goal
Understand story, not just raw logs.

### Ideal workflow
1. Timeline shows sessions, walks, pattern breaks, feedings.
2. Expand items for details + edit/delete actions.
3. If edits affect recommendations, explain that historical changes can alter targets.

### Key UX logic
- History supports reflection + correction.
- Editing should feel safe and reversible where possible (or clearly irreversible when delete).

## 2.8 User checking progress
### Goal
See momentum and emotional reassurance.

### Ideal workflow
1. Headline: current recommendation + status tone.
2. Key metrics: best calm, next target, risk.
3. Chart trend + interpretation.
4. Supporting habits metrics.

### Key UX logic
- Frame progress as adaptive journey (not linear perfection).

## 2.9 User changing settings
### Goal
Calm control without accidental damage.

### Ideal workflow
1. Settings hub with grouped rows (profile/reminders/training/help/advanced/account).
2. Each row opens focused sheet/modal.
3. Risky actions (protocol overrides, device removal) gated with clear consequences.

### Key UX logic
- Destructive/high-impact actions require friction and plain-language consequences.

---

## 3) Stage-by-Stage UX Logic Table

| Stage | Screen | User action | Likely question/confusion | How interface should answer |
|---|---|---|---|---|
| App open first time | Dog Select | Choose create vs join | “What is this app for?” | Hero subtitle + one-line purpose specific to separation anxiety training |
| Dog create start | Onboarding step 1 | Enter dog name | “Why do you need this?” | Inline hint: personalization + shared profile identity |
| Leaves/day step | Onboarding step 2 | Select leave frequency | “Does this change training?” | Context hint: affects pattern-break recommendation |
| Current calm step | Onboarding step 3 | Select current max calm | “Will this overpush my dog?” | Hint that first target starts lower and adapts |
| Goal step | Onboarding step 4 | Select goal | “Is this permanent?” | Hint: editable later + gradual progression |
| Join flow | Dog Select join row | Input ID + tap Join | “Did it fail because ID or sync?” | Explicit status messaging for not found vs sync errors vs partial sync |
| Train idle | Train tab | Review main card | “What does this circle/number mean?” | Context label: next session target, not lifetime max |
| Start blocked | Train tab | Tap start when capped | “Why can’t I start?” | Inline warning with exact cap reason (time cap/session cap) |
| Session running | Train tab | Monitor timer | “Am I doing this right now?” | Minimal running state with remaining/over-target language |
| Session rating | Rating overlay | Choose distress outcome | “What counts as subtle vs active?” | Short definitions on each option + optional detail fields |
| Post-save | Train toast + hero | Save outcome | “Why did target change?” | Immediate delta explanation + reason + next action |
| Recovery active | Train card + recovery modal | Tap recovery info | “Why are we in recovery?” | Step-based explanation with remaining sessions |
| History browse | History | Expand timeline card | “Can I fix wrong logs?” | Discoverable edit/delete actions in expanded row |
| History edits | History modal | Save date/duration edits | “Does this affect recommendations?” | Soft notice when edits can change computed target |
| Progress check | Progress | View metrics/chart | “Are we improving?” | Trend label + risk tone + concise interpretation |
| Settings profile | Settings → Dog profile | Copy dog ID | “How do I share this dog?” | Context copy: share this ID to join on another device |
| Training override | Settings → Training settings | Edit protocol values | “Should I touch this?” | Warning banner + acknowledgment gate |
| Remove dog local | Settings danger zone | Confirm remove | “Will this delete shared data?” | Explicit local-only vs shared-cloud impact text |

---

## 4) Confusion Map (Critical Confusion Hotspots)

## High-risk confusion
1. **Product purpose ambiguity at first open**
   - Risk: mistaken as generic timer.
   - Impact: weak onboarding completion.

2. **Join-by-ID failure ambiguity**
   - Risk: user cannot tell invalid ID vs missing shared profile vs connectivity/schema issue.
   - Impact: failed multi-owner adoption.

3. **Meaning of main target/time ring**
   - Risk: interpreted as “must hit at all costs” or “max ever.”
   - Impact: unsafe training behavior.

4. **Target reduction after stress**
   - Risk: appears random/punitive.
   - Impact: trust drop, churn.

5. **Distress category uncertainty**
   - Risk: inconsistent outcome logging.
   - Impact: degraded recommendation quality.

6. **Recovery mode opacity**
   - Risk: user thinks progress reset is failure.
   - Impact: motivation loss.

7. **History edit consequences unclear**
   - Risk: user edits past data without realizing target recalculates.
   - Impact: “app changed by itself” perception.

8. **Advanced/settings risk actions**
   - Risk: accidental protocol override or dog removal.
   - Impact: degraded outcomes / data confusion.

---

## 5) Contextual Hint Map (When Hints Are Needed)

## Onboarding hints
- Explain why each input matters at each step (name, leaves/day, calm baseline, goal).
- Explain that recommendations adapt over time.

## Train screen hints
- First idle visit: explain primary circle = “next training target for this session.”
- First start: hint to return before escalation and rate honestly.
- First rating: clarify distress category examples.
- First blocked start (daily cap): explain protocol safety limit.

## Recommendation-change hints
- Whenever next target changes, show compact “changed because …” reason line.
- Distinct wording for:
  - increase after calm consistency
  - hold due to subtle instability
  - reduction due to active/severe distress
  - recovery-mode structured reset

## History hints
- First edit action: “Changes can update future recommendations.”
- First delete action: clear irreversibility warning.

## Progress hints
- First chart view: explain axis meaning and that trend is directional, not verdict.

## Settings hints
- Dog ID panel: “Share this ID to join this dog on another phone.”
- Training override panel: caution + “only if trainer advised.”

---

## 6) “Why Something Changed” Explanation Map

These explanation moments should be explicit and gentle:

1. **After saving any session outcome**
   - Show: previous target → new target (if changed)
   - Explain: primary factor (calm streak, subtle stress, active distress, relapse risk)

2. **When entering recovery mode**
   - Explain trigger and expected number of rebuild sessions.

3. **When leaving recovery mode**
   - Explain that progression is resuming due to completed calm steps.

4. **When start is blocked by daily limits**
   - Explain which limit triggered and when user can proceed again.

5. **When history edits alter computed target**
   - Explain that recommendation recalculated from updated history.

6. **When join/sync is partial**
   - Explain what data sync is currently unavailable and that core tracking continues.

---

## 7) Recommended Interaction Patterns for Critical Moments

## A. First-time comprehension
- Pattern: **Hero + two-path decision card**
- Why: immediate meaning + clear next action.

## B. Join with dog ID
- Pattern: **Inline validation + progressive status row** (idle/checking/found/not found/partial)
- Why: avoids modal interruptions and reduces error ambiguity.

## C. Session start blocked
- Pattern: **Inline soft warning banner near primary CTA**
- Why: contextual, non-jarring, actionable.

## D. Distress rating
- Pattern: **Bottom-sheet style focused decision panel** with concise definitions
- Why: single task focus right after session end.

## E. Target changed after save
- Pattern: **Inline change card** (delta + cause + next step) + subtle toast confirmation
- Why: makes algorithm behavior legible without overwhelming UI.

## F. Recovery mode education
- Pattern: **Tap-to-expand explainer sheet** with step chips and remaining count
- Why: progressive disclosure, calm and confidence-building.

## G. Edit/delete in history
- Pattern: **Expandable row actions + confirmation sheet**
- Why: keeps timeline clean while preserving control.

## H. Advanced/danger actions
- Pattern: **Guardrails with acknowledgment gates** (not abrupt alerts)
- Why: prevents accidental high-impact changes.

---

## 8) Workflow Summary Blueprint (No UI Redesign Yet)

## First-time blueprint
1. Understand purpose instantly.
2. Choose create vs join.
3. Complete minimal setup.
4. Land in Train with guided first action.

## Returning blueprint
1. Land in Train.
2. See next target + why.
3. Run session.
4. Log outcome.
5. Understand any target change + next step.

## Long-term trust blueprint
- Every significant state change is explainable in context.
- Dog identity and emotional tone remain present across tabs.
- Guidance appears just-in-time, then gets out of the way.
