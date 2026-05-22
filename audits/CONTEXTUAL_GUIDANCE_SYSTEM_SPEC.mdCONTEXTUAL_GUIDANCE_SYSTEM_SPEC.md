# PawTimer Contextual Guidance System Spec (2026 Premium UX)

## Purpose
Design a calm, minimal guidance layer that helps users understand key training concepts **at the exact moment they need them**, without creating persistent visual clutter.

This system:
- keeps the app emotionally soft and premium,
- explains recommendation logic with clarity,
- preserves one-primary-focus-per-screen,
- and remains specific to dog training behavior (not generic productivity guidance).

---

## 1) Guidance Architecture

## 1.1 Guidance Principles
1. **Context-first:** Guidance appears only when a user action, state change, or first-time moment warrants it.
2. **Soft delivery:** No jarring popups. Use inline hints, soft banners, tap-to-explain chips, and bottom sheets.
3. **Single-message discipline:** One guidance message visible per surface region at a time.
4. **Progressive disclosure:** Show brief copy first; deeper explanation appears on tap.
5. **Emotionally intelligent tone:** Supportive, non-judgmental language ("Let’s step back and rebuild calmly").
6. **Dog-aware framing:** Copy references the dog and training context ("{dogName}'s comfort zone").

## 1.2 Guidance Layers (from subtle to detailed)
- **L0 — Affordance Dot/Chip (tap-to-explain):** Small "Why?" / info chip next to dynamic values.
- **L1 — Inline Hint:** Low-height helper text below the hero or section header.
- **L2 — Soft Banner:** Temporary top-of-content ribbon for state changes.
- **L3 — Bottom Sheet Explainers:** Rich explanation with rationale + next action.
- **L4 — First-Time Overlay Coachmark:** Subtle spotlight + short sentence on first entry only.

---

## 2) Hint Types and Usage

## H1: First-Visit Coachmark Overlay
**Use for:** first time entering Train screen.
- Visual: dimmed soft scrim, one highlighted hero element, 1–2 sentence guidance, "Got it".
- Motion: fade + slight upward drift (200–280ms), no spring snap.
- Content:
  - "This is {dogName}'s training circle. It guides one calm session at a time."
- Follow-up: transitions into one inline hint (H2) after dismissal.

## H2: Inline Hero Hint
**Use for:** explaining hero circle + first actionable next step.
- Placement: directly under hero circle.
- Behavior: appears when hero is idle and user has not started a session.
- Example copy:
  - "The circle shows today’s calm training target."
  - "Next step: run one session and rate how your dog handled it."

## H3: Target Time Explain Chip + Sheet
**Use for:** explaining target time meaning and recommendation basis.
- UI: small "Why this target?" chip next to target time label.
- On tap: opens bottom sheet with:
  - current target,
  - recent influencing sessions,
  - brief protocol logic summary,
  - "What helps it increase" actions.

## H4: Adaptive Change Banner (Increase)
**Use for:** explaining why time increased.
- Trigger: new recommendation > previous recommendation after save.
- Visual: soft green banner, subtle check icon.
- Copy: "Nice progress — target increased from 8m to 9m after calm completion."
- CTA: "See why" opens detail sheet.

## H5: Adaptive Change Banner (Decrease)
**Use for:** explaining why time decreased after stress.
- Trigger: new recommendation < previous recommendation after save.
- Visual: warm amber/neutral banner (not alarming red).
- Copy: "Target adjusted from 9m to 7m to protect {dogName}'s confidence after stress signs."
- CTA: "How to recover" opens recovery sheet.

## H6: Recovery Mode State Card
**Use for:** explaining recovery mode/reset behavior.
- Placement: in Train hero stack, replacing generic helper copy while recovery is active.
- Content:
  - what recovery mode means,
  - how many calm confirmations remain,
  - expected behavior of recommendations during recovery.
- Optional action: "Recovery plan" → bottom sheet with next 2–3 steps.

## H7: Session-End Next Step Card
**Use for:** explaining what to do next after session ends.
- Trigger: after rating/save completes.
- Content personalized by outcome:
  - calm outcome → "Great. Log a short departure later today if ready."
  - stress outcome → "Keep next attempt shorter and easier."
  - limit reached → "You’re done for today. Resume tomorrow."
- Style: inline card in post-session state (no modal interruption).

## H8: Progress State Story Chips
**Use for:** explaining key progress states.
- Placement: Progress screen under hero trend metric.
- States:
  - "Building consistency"
  - "Stable at current level"
  - "Recovering confidence"
  - "Ready to stretch"
- Tap chip → bottom sheet with state definition + what signals transition to next state.

## H9: Join-by-ID Guided Input Hint
**Use for:** explaining join dog by ID flow.
- Placement: onboarding join form (above input + inline validation zone).
- States:
  - default hint (where to get ID),
  - checking hint,
  - found confirmation,
  - not found troubleshooting.
- Use soft banners for status transitions instead of alert dialogs.

---

## 3) Behavior Rules

## 3.1 Show Rules (When Guidance Appears)
1. **First-time moments:** show once automatically (H1, baseline H9).
2. **State transitions:** show when recommendation changes, recovery toggles, or session ends (H4/H5/H6/H7).
3. **On-demand explanation:** always available via chips (H3/H8).
4. **Blocked/confusing moments:** show contextual helper only when user stalls or errors (join ID not found, incomplete action).

## 3.2 Auto-dismiss Rules
- Inline hints (H2/H6/H7/H9): remain while context is active; collapse when user completes primary action.
- Banners (H4/H5): auto-dismiss after 5–7 seconds **unless** user is interacting; persist in recent event log for retrieval.
- Coachmark overlay (H1): dismiss on tap/primary CTA; never re-open automatically after completion.
- Bottom sheets (H3/H4/H5/H6/H8): dismiss with swipe/tap-outside; restore scroll position.

## 3.3 "Seen" Persistence Rules
Track per-dog and per-user where relevant:
- `seen.train.first_entry_coachmark` (global once)
- `seen.train.hero_explained` (once per dog)
- `seen.train.target_time_explainer` (once per dog, still manually accessible)
- `seen.onboarding.join_id_help` (global once)
- `seen.progress.state_explainer.<state>` (once per state)

State-change banners (increase/decrease) are **event-based**, not permanent "seen once" content; they can reappear when triggered again.

## 3.4 Reusability Rules
- Reusable every trigger: H4/H5/H6/H7 (because recommendation states can recur).
- Reusable on demand only: H3/H8.
- One-time automatic, later manual access via help icon: H1/H2/H9.

## 3.5 Priority Rules (Collision Handling)
If multiple hints qualify simultaneously:
1. Safety/clarity changes first (decrease, recovery) → H5/H6
2. Immediate next action second (session-end) → H7
3. Explanatory optional hints last → H2/H3/H8

Only one banner and one inline hint may be visible at once.

---

## 4) Mapping by Screen and Situation

| Screen | Situation | Hint Type | Trigger | Dismiss | Re-show |
|---|---|---|---|---|---|
| Train | First entry ever | H1 Coachmark | First open of Train | Tap "Got it" | Manual from help center only |
| Train | Hero visible, no session started | H2 Inline Hero Hint | Idle state + no active timer | Start session or navigate away | Auto next visit until first session completed |
| Train | User asks meaning of target | H3 Chip + Sheet | Tap "Why this target?" | Swipe/close sheet | Always |
| Train | Recommendation increased | H4 Increase Banner | Save outcome with higher target | Auto 5–7s or manual close | Every qualifying increase |
| Train | Recommendation decreased | H5 Decrease Banner | Save outcome with lower target | Auto 7s or open details | Every qualifying decrease |
| Train | Recovery mode active | H6 Recovery Card | Recovery flag true | Ends when recovery exits | Always while active |
| Train | Session saved | H7 Next Step Card | Post-save state | Start another action / leave | Each session outcome |
| Progress | Key state changes/readability need | H8 Story Chips | Progress state computed | Persistent chips | Always tap-accessible |
| Onboarding (Join) | Enter join flow | H9 Guided Input Hint | Join path selected | Auto when validated/success | On each join attempt state |
| Onboarding (Join) | ID not found / sync issue | H9 + soft status banner | Lookup fails or partial sync | Auto after edit/new attempt | Every relevant failure |

---

## 5) Premium Motion + Tone Spec

## Motion
- Use ease-out opacity/translate; avoid bounce or sharp spring.
- Duration bands:
  - micro hints: 160–220ms
  - banners/cards: 220–280ms
  - bottom sheets: 260–320ms
- Stagger when needed: content appears 40–80ms after container to feel refined.

## Tone
- Calm, supportive, non-blaming language.
- Avoid technical engine language by default; provide details in sheets.
- Always pair explanation with a next action.

## Visual Restraint
- Max one primary guidance element in hero region at a time.
- Keep hint copy to one sentence + optional CTA.
- Never pin educational copy permanently in headers.

---

## 6) Minimal Data Model (Implementation-ready)

```ts
GuidanceEvent {
  id: string
  dogId?: string
  screen: 'train' | 'progress' | 'onboarding' | 'settings'
  type: 'coachmark' | 'inline' | 'banner' | 'sheet' | 'chip'
  key: string // e.g. target_decreased, recovery_active
  context: Record<string, any> // oldTarget, newTarget, outcome, state
  createdAt: number
}

GuidanceSeen {
  userId: string
  dogId?: string
  key: string
  firstSeenAt: number
  lastSeenAt: number
  count: number
}
```

This keeps visual guidance logic modular and decoupled from training recommendation business logic.
