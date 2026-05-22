# PawTimer IA Refactor Plan (2026-04-16)

## Product model anchors
- **Train = focus/action:** start, run, and close a single session with minimal distraction.
- **History = story/timeline:** review meaningful events as an understandable narrative.
- **Progress = emotional progress:** confidence trajectory and coaching context, not raw BI.
- **Settings = calm control:** profile, behavior, defaults, and diagnostics in one premium-feeling control space.

## Current-state IA audit

### Train (Home)
- Strengths: clear session control and completion flow.
- Issues:
  - Mixed in dashboard-style metrics rings (duplicated with Progress).
  - "Today's logs" section naming made utility logging feel primary.
  - Context hints could stack and compete with primary CTA.

### History
- Strengths: unified timeline across session/walk/pattern/feeding with edit/delete.
- Issues:
  - Framed as an "Activity Log" which reads as operational data, not story.
  - Weak orientation at top; users enter a flat list without narrative framing.

### Progress
- Strengths: good recommendation context + chart + supporting metrics.
- Issues:
  - Section labels felt analytical and generic ("Key metrics", "Daily patterns").
  - Emotional framing could be stronger for dog owners.

### Settings
- Strengths: broad control coverage and good grouping.
- Issues:
  - Main heading tone felt utilitarian; sections could feel more product-native.

### Onboarding
- Strengths: step flow and controls align with app system.
- Issues:
  - Copy tone partially disconnected from renamed core screen roles.

## Responsibility map (target)

| Screen | Must own | Must avoid | Cross-links |
|---|---|---|---|
| Train | Session focus, in-session controls, quick supportive routine logging | Dashboard analytics, long historical browsing | Link out to Progress/History only via deliberate navigation |
| History | Narrative timeline and corrections (edit/delete) | Dense raw logs with no context | CTA to Train when empty |
| Progress | Confidence status, trend, humane interpretation | Operational logs and settings controls | CTA to Train when no data |
| Settings | Dog profile, reminders, controls, diagnostics | Live training actions and timeline interaction | N/A |

## Duplication removal plan
1. **Remove dashboard rings from Train** and keep a compact focus strip with one actionable signal (next calm session) and light context (today count).
2. **Keep support logs lightweight in Train** by positioning as quick routine actions, not historical review.
3. **Promote narrative framing in History** with story-first heading and compact summary chips to avoid "dump of logs" feel.
4. **Retone Progress content** to emotional language while preserving existing metrics.
5. **Retone Settings entry IA** with premium, calm-control copy and grouped section labels.
6. **Align onboarding language** with the same four-screen model for conceptual continuity.

## Move / collapse / group / remove recommendations

### Move
- Move "how am I doing?" visual status from Train to Progress (already represented by chart + confidence cards).

### Collapse
- Collapse Train context into one focus strip instead of two ring widgets.

### Group
- Group non-session actions in Train as **Support routines** (walk, pattern break, feeding).
- Group settings labels by user intent: dog+routine, guidance+diagnostics, account+device.

### Remove
- Remove framing that implies Train is a dashboard or History is a raw event sink.

## Guardrails
- Logs never dominate Train hierarchy.
- Hints remain short, contextual, and dismissible-by-flow (not permanent clutter blocks).
- Dog-specific emotional tone is preserved in all headings and helper text.
