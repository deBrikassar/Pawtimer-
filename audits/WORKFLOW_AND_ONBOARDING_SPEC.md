# PawTimer Workflow & Onboarding UX Logic Spec (Flow-First, No UI Redesign)

## Scope
This document maps:
1. The **current** end-to-end PawTimer flow (as implemented today).
2. The **ideal** user workflows before any UI redesign.
3. Confusion points, contextual hint moments, and change-explanation moments.
4. Recommended interaction patterns for critical moments.
5. A full redesigned onboarding flow definition (screen sequence + copy + hints).

This is intentionally focused on **UX flow logic** and behavioral messaging, not visual layout changes.

---

## A) Current App Flow Audit (As Implemented)

## A1. System entry and top-level navigation
- App has three top-level states:
  - `screen = "select"` → dog selection/join screen.
  - `screen = "onboard"` → setup flow.
  - `screen = "app"` → main app tabs (Train, History, Progress, Settings).
- If an active dog cannot be hydrated, app falls back to dog selection.
- Once in app, user navigates across tabs with bottom tab bar.

## A2. First launch / no dog flow
1. User lands on **Dog Select**.
2. User can:
   - Add a new dog.
   - Join via dog ID.
3. Add new dog enters onboarding flow (4 setup steps).
4. On completion, profile is saved, active dog is set, user lands in app (Train tab).

## A3. Returning user flow
1. App tries to restore active dog from storage.
2. If dog is found, app hydrates dog-specific activity data.
3. User lands directly in app with previous context.
4. Sync layer runs in background (if enabled), with status reflected in settings/profile context.

## A4. Existing dog shared-join flow
1. On Dog Select, user enters dog ID.
2. Validation checks rough ID format.
3. If sync backend returns dog profile, app imports dog + activities and opens app.
4. If not found, user gets toast + error guidance.

## A5. Session execution flow (Train tab)
1. User sees recommendation/next target and can start session.
2. During running phase, elapsed timer runs.
3. User ends session → enters rating panel.
4. User records outcome (calm/distress details).
5. Session is committed locally and pushed to sync.
6. Recommendation target is recalculated.

## A6. Stress/recovery dynamics (as behavior)
- Distress outcomes can shift recommendation state into recovery behavior.
- When recovery mode is active, user sees recovery card pulse + modal details on tap.
- Recommendation summary changes based on protocol state.

## A7. Daily repeat loop
- Typical loop: open app → Train tab → run session → optionally log walk/pattern break/feeding → review progress/history → leave.
- Daily caps and max sessions can block additional sessions; user gets warning/copy.

## A8. History and progress behavior
- **History:** unified timeline (sessions, walks, pattern breaks, feedings) with per-item expansion/actions.
- **Progress:** current recommendation, key metrics, trend chart, and supporting pattern metrics.

## A9. Settings behavior
- Profile/dog ID copy, reminders, training settings, custom pattern labels, help, diagnostics, account actions.
- Account includes re-run setup and switch dog.
- Danger zone removes dog from current device (with confirmation).

---

## B) Ideal Workflow Definition (Target UX Logic)

## B1. First-time user (ideal)
1. **Welcome**: calm one-screen orientation (“what this app does in one sentence”).
2. **Path choice**: Create new dog vs Join existing dog by ID.
3. **Light setup** based on choice.
4. **Training model primer** (very short, progressive disclosure).
5. **Transition to Train** with one actionable CTA.
6. First session starts with just-in-time hints, not a tutorial wall.

**Success criteria**
- User understands: “We train below threshold, then progress gradually.”
- User can start first session in <60 seconds after setup.

## B2. Returning user (ideal)
1. Open directly to Train with current recommendation.
2. Show only essential deltas since last use (if any):
   - new recommendation state,
   - recovery active,
   - sync issue.
3. One-tap continuation: Start session.

**Success criteria**
- No forced re-explainer.
- High confidence in “what to do next now.”

## B3. User creating a new dog (ideal)
1. Start from onboarding choice.
2. Enter dog name.
3. Select departure frequency.
4. Select current calm duration.
5. Optional goal (with skip + default logic).
6. Confirmation micro-summary (“Starting target will be ~X”).
7. Enter Train.

**Success criteria**
- User understands why starting target is not equal to max calm time.

## B4. User joining existing dog by ID (ideal)
1. Enter ID with format helper and pasted-input sanitization.
2. Validate and fetch dog/household summary.
3. Confirm identity (“Is this Bella’s household?”).
4. Assign user to shared context and import state.
5. Enter Train with quick “shared profile connected” confirmation.

**Success criteria**
- User trusts they joined the right dog before data merge.

## B5. User running a session (ideal)
1. Train home shows next recommended target + why (one line).
2. User taps Start.
3. During session, calm timer experience; minimal controls.
4. User ends session.
5. Post-session outcome capture (calm vs stress type) with high-clarity labels.
6. App immediately explains next target effect (“same/up/down + reason”).

**Success criteria**
- Outcome logging feels quick, and algorithm reaction feels predictable.

## B6. User seeing time reduction after stress (ideal)
1. After distress outcome, app shows gentle non-judgmental explanation.
2. Explicit reason: “We lower time temporarily to rebuild confidence.”
3. Show what success looks like next (“2 calm sessions unlock progression”).
4. Give CTA: “Start recovery session.”

**Success criteria**
- User interprets reduction as plan intelligence, not punishment/regression.

## B7. User checking history (ideal)
1. Timeline grouped by meaningful recency (Today, Yesterday, Earlier).
2. Item expansion reveals details + safe edit actions.
3. Destructive actions show plain-language consequence.
4. If sync/pending, status is visible but unobtrusive.

**Success criteria**
- User can trust records and confidently correct mistakes.

## B8. User checking progress (ideal)
1. First card answers: “Are we improving?”
2. Show next target, best calm time, risk state.
3. Chart includes brief interpretation (“trend steady/rising/volatile”).
4. If little data, show constructive empty states pointing to Train.

**Success criteria**
- User can narrate progress in one sentence.

## B9. User changing settings (ideal)
1. Settings IA remains compact, grouped by intent.
2. Sensitive actions (training overrides, delete/remove) include friction + rationale.
3. Device/account/sync status copy is plain-language.
4. Re-setup flow preserves data unless explicitly resetting.

**Success criteria**
- User can safely adjust behavior without fear of losing data.

---

## C) Stage-by-Stage UX Matrix (Screen, Action, Confusion, Interface Response)

| Stage | Screen | Primary user action | Likely user question/confusion | How interface should answer |
|---|---|---|---|---|
| Launch | Dog Select | Choose create vs join | “What does PawTimer actually do?” | One-line value proposition under logo; tiny “How it works” link. |
| Onboarding choice | Choice step | Tap create or join | “Which path should I use?” | Two-option cards with subcopy + examples (“Create if this is your first setup”, “Join if household already has an ID”). |
| Create step 1 | Dog name | Enter name | “Is this editable later?” | Inline reassurance: “You can edit this later in Settings.” |
| Create step 2 | Leave frequency | Select frequency | “Why does this matter?” | Context note: “Used to tune daily pattern-break recommendations.” |
| Create step 3 | Current calm time | Select current baseline | “Should I pick best-ever or reliable average?” | Hint: “Choose a typical successful calm time, not maximum one-off.” |
| Create step 4 | Goal (optional) | Pick or skip goal | “Do I need this now?” | Optional badge + default fallback text (“Can be changed anytime”). |
| Join step 1 | Join input | Enter ID | “Where do I find this?” | Help text: “Found in Settings > Dog profile on the other device.” |
| Join step 2 | Confirm dog | Confirm household | “Am I joining the right profile?” | Show dog name + created date/last activity summary before confirm. |
| Train idle | Train tab | Start session | “Why this exact target?” | One-line reason chip (“Based on last calm session + pattern load”). |
| Train running | Timer state | End/cancel | “Should I stop now?” | Soft threshold hint near target completion + no-alarm language. |
| Session rating | Post-session | Mark calm/stress | “Which stress option fits?” | Micro examples under each stress option. |
| Post-rating result | Train feedback | Continue | “Why did target change?” | Explicit delta card: “Next target changed from X to Y because Z.” |
| Recovery mode | Train + modal | Review recovery steps | “Did we regress?” | Copy reframes as confidence rebuild with step count remaining. |
| Daily block | Train warning | Attempt start when capped | “Why can’t I train now?” | Constraint reason + next valid action (“Log walk/pattern now; resume tomorrow”). |
| History | Activity Log | Expand/edit/delete | “If I edit, what changes?” | Clear scope labels (“Edits this entry only”). |
| Progress | Progress tab | Read metrics | “Is this good?” | Use direction cues (improving/stable/watchful) and short trend interpretation. |
| Settings reminders | Settings > Reminders | Toggle/edit reminder | “Why can’t I set time?” | Inline rule: “Turn reminder on first.” |
| Settings account | Account panel | Edit profile/switch dog | “Will this delete history?” | Confirmation copy explicitly states preserved vs deleted data. |

---

## D) Confusion Map (Explicit)

## D1. High-risk confusion moments
1. **Create vs Join decision**
   - Risk: wrong branch causes duplicate profiles or failed join attempts.
2. **Current calm time input**
   - Risk: user overstates baseline, causing hard first sessions.
3. **Session outcome taxonomy**
   - Risk: uncertain stress labeling degrades recommendation quality.
4. **Target reductions after distress**
   - Risk: user perceives failure/punishment.
5. **Daily cap blocks**
   - Risk: app feels rigid or “broken” when start is blocked.
6. **History destructive actions**
   - Risk: accidental deletion with regret.
7. **Sync states (local/syncing/error/partial)**
   - Risk: user distrusts whether data is safe.
8. **Danger-zone device removal**
   - Risk: confusion between local removal and cloud/shared persistence.

## D2. Medium-risk confusion moments
- Why pattern breaks matter to separation training.
- Difference between “Best time” vs “Next target.”
- Whether goal is mandatory.
- Why reminders need browser permissions.

---

## E) Hint Map (Where Contextual Hints Are Needed)

## E1. First-time contextual hints (show once, dismissible)
1. Dog Select: “If your partner already tracks this dog, use Join ID.”
2. Onboarding calm-time step: “Choose typical calm success duration.”
3. Train first idle: “Start slightly below max to build reliable wins.”
4. First rating panel: “Pick the closest stress level; estimates are okay.”
5. First recovery event: “Shorter targets are temporary confidence rebuilding.”
6. First history edit: “Edits update progress calculations.”
7. First progress visit: “Next target may differ from best time by design.”

## E2. Persistent just-in-time hints (always available, minimal)
- Join ID field format example.
- Start button blocked reason + next action.
- Reminder time editor dependency (“Turn on first”).
- Danger-zone explanatory subcopy.

---

## F) “Why Something Changed” Map (Explicit Explanation Moments)

The app should gently explain changes at the exact moment they occur:

1. **After session outcome saved**
   - Explain recommendation delta (up/same/down) + reason.
2. **When entering recovery mode**
   - Explain trigger and temporary step plan.
3. **When leaving recovery mode**
   - Explain that normal progression resumed.
4. **When daily caps block a new session**
   - Explain protective rationale (avoid overload) + resume timing.
5. **When sync degrades to partial mode**
   - Explain what is still safe vs what is deferred.
6. **When profile is reconfigured**
   - Explain which settings changed and effect on recommendations.
7. **When deleting/removing data**
   - Explain scope (this device vs shared profile).

Tone rule for all explanations:
- Non-judgmental, specific, brief, and action-oriented.

---

## G) Recommended Interaction Patterns for Critical Moments

1. **Decision forks (Create vs Join)**
   - Pattern: binary card choice + concrete eligibility subcopy + examples.
2. **Potentially irreversible actions (delete/remove)**
   - Pattern: confirm dialog with explicit scope and consequence sentence.
3. **State changes caused by algorithm**
   - Pattern: “Changed from X → Y because Z” inline explanation chip.
4. **Protocol complexity (recovery mode)**
   - Pattern: compact summary + optional “learn more” sheet (progressive disclosure).
5. **Blocked actions (daily cap / max sessions)**
   - Pattern: disable action + reason + substitute CTA.
6. **Shared data trust (Join by ID)**
   - Pattern: pre-confirm identity checkpoint before import.
7. **Low-data situations**
   - Pattern: purposeful empty states with one clear CTA.
8. **Multi-device sync uncertainty**
   - Pattern: status badge with plain-language detail and troubleshooting entry point.

---

## H) Full Onboarding Flow for Redesigned PawTimer

## H1. Onboarding principles
- Smooth, premium, calm, minimal.
- Dog-specific language throughout (never generic productivity wording).
- Progressive disclosure: one decision per screen.
- No long tutorial block.
- First-time hints only where uncertainty is highest.

## H2. Screen sequence
1. **Welcome**
2. **Choose path** (Create new dog / Join existing dog by ID)
3. **Create branch** (4 concise steps) OR **Join branch** (ID + confirm)
4. **How training works** (micro-primer)
5. **Transition screen** → Train tab

---

## H3. Detailed onboarding UX flow

## Screen 1 — Welcome / Product Intro
**Purpose**: Instant mental model.

**Primary copy suggestion**
- Title: “Train calm alone-time, one session at a time.”
- Body: “PawTimer helps you build your dog’s confidence with gentle, data-guided steps.”
- CTA: “Get started”

**First-time hint**
- “Setup takes about 1 minute.”

## Screen 2 — Choose Setup Path
**Options**
- Card A: “Create new dog”
  - Subcopy: “Start a fresh training profile.”
- Card B: “Join with dog ID”
  - Subcopy: “Connect to an existing household profile.”

**Support link**
- “Not sure? Use Join if someone already tracks this dog.”

---

## Create Branch

## Screen 3A — Dog name
- Prompt: “What’s your dog’s name?”
- Field placeholder: “e.g., Luna”
- Helper: “You can change this later.”
- CTA: “Continue”

## Screen 4A — Leaving frequency
- Prompt: “How often is [Dog] home alone?”
- Options: Existing leave-frequency tiers.
- Helper: “Used to tune daily routine support suggestions.”
- CTA: “Continue”

## Screen 5A — Current calm time
- Prompt: “How long can [Dog] usually stay calm alone now?”
- Options: Existing calm duration presets.
- Hint: “Choose a typical successful duration, not a one-off maximum.”
- CTA: “Continue”

## Screen 6A — Optional goal
- Prompt: “Set a goal calm time (optional)”
- Options: Goal presets + skip.
- Helper: “You can change this anytime in Settings.”
- CTA: “Continue” / “Skip for now”

## Screen 7A — Create summary confirmation
- Summary row examples:
  - Name
  - Current calm baseline
  - First recommended target (“We’ll start around X”) 
- CTA: “Start training”

---

## Join Branch

## Screen 3B — Enter ID
- Prompt: “Enter dog or household ID”
- Placeholder: “e.g., LUNA-4829”
- Helper: “Find this in Settings on the other device.”
- Input behavior: trim spaces, uppercase normalization.
- CTA: “Continue”

## Screen 4B — Confirm profile
- Show fetched card:
  - Dog name
  - ID
  - Lightweight trust signal (e.g., last activity date)
- Prompt: “Join this household?”
- Secondary action: “This isn’t the right dog”
- CTA: “Join profile”

## Screen 5B — Assignment confirmation
- Copy: “You’re connected to [Dog]’s shared training profile.”
- Micro-note: “Your updates sync across joined devices.”
- CTA: “Go to training”

---

## Shared final onboarding step

## Screen 8 — How Training Works (micro-primer)
**3 short cards, swipe or stacked:**
1. “Start below threshold” — “We begin at manageable durations to protect confidence.”
2. “Log each outcome” — “Your session rating guides the next recommendation.”
3. “Build gradually” — “Calm streaks increase time; stress triggers a temporary reset.”

CTA: “Start first session”

**Important:** keep this to ~15–20 seconds scan time.

---

## Screen 9 — Smooth transition to Train
- Transitional toast/banner:
  - “You’re all set. Today’s target: **X**.”
- Auto-focus primary action: Start Session.
- Show first-run inline hint near Start button:
  - “End before stress builds. Small wins count.”

---

## H4. Required copy suggestions (quick list)

## System voice
- Calm, concise, encouraging, non-clinical.
- Avoid blame words (“failed”, “bad session”).
- Prefer supportive framing (“confidence rebuild”, “next best step”).

## Key microcopy snippets
- Target reduction: “We shortened the next session to rebuild calm confidence.”
- Recovery active: “Temporary recovery steps are active. You’re getting back on track.”
- Daily block: “You’ve hit today’s safe training limit. Let’s continue tomorrow.”
- Join success: “Connected. You’re now tracking [Dog] together.”
- Edit confirmation: “Saved. Progress insights updated.”

---

## H5. Key first-time hints (onboarding + first run)
1. Path choice: “Use Join if this dog already exists on another device.”
2. Calm baseline: “Pick a typical calm success, not best-ever.”
3. First train screen: “Short, calm reps build progress fastest.”
4. First outcome rating: “Closest option is enough—perfection not required.”
5. First target change: “This changed because of your latest result.”
6. First recovery event: “Recovery is temporary and designed to prevent setbacks.”

---

## I) Acceptance Checklist for Flow Readiness

- [ ] A first-time user can choose Create vs Join confidently in one screen.
- [ ] Onboarding can be completed with minimal typing and no dead ends.
- [ ] Every recommendation change has a visible “why”.
- [ ] Recovery mode explains purpose and exit criteria.
- [ ] Daily session blocks always include a reason and next step.
- [ ] History edits/deletes clearly communicate consequence scope.
- [ ] Sync uncertainty is understandable without technical jargon.
- [ ] Transition from onboarding to first Train action is immediate and calm.

