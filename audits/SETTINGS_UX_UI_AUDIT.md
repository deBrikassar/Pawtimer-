# Settings Tab UX/UI Audit (Second Pass)

Date: 2026-04-01
Scope: Settings tab only (`src/features/settings/SettingsScreen.jsx` + settings-related styles).

## Overall score
- **7.1 / 10**

## Top 7 issues
1. **Visual hierarchy is still too flat across high-importance and low-importance groups.**
2. **Section rhythm is card-heavy and repetitive, reducing scan speed.**
3. **Help and Advanced collapsibles are visually over-prominent for secondary content.**
4. **Reminders row has weak affordance and label/value structure clarity.**
5. **Custom labels rows feel tool-like (admin-ish) instead of lightweight consumer settings.**
6. **Diagnostics presentation leaks technical density into the Settings experience.**
7. **Account + Danger area separation is present but still lacks stronger intent framing.**

## Detailed findings

### 1) Hierarchy flattening across groups
- **Area/component:** Primary groups (`Profile & sync`, `Reminders`, `Training`) and lower-priority groups (`Support`, `Advanced`) all using similar card treatment.
- **What feels wrong:** Most sections use near-identical card/chrome weight (`share-card`, similar heading scale, similar spacing), so the eye does not quickly identify “main controls” vs “reference/help/diagnostics”.
- **Why it hurts:** Users spend extra time parsing importance; increases cognitive load and settings-fatigue.
- **Type:** hierarchy
- **Severity:** major
- **Recommendation:** Keep primary settings in full cards; demote Support/Advanced to lighter list rows or text-links with subtler containers and tighter vertical footprint.

### 2) Card repetition and weak vertical rhythm
- **Area/component:** Repeated `settings-section-label` + `share-card` pattern through most of the screen.
- **What feels wrong:** Repetition creates a “stack of equivalent blocks” feeling; little pacing variation.
- **Why it hurts:** Scanning becomes linear and slower; the screen feels longer than necessary on mobile.
- **Type:** density
- **Severity:** major
- **Recommendation:** Merge adjacent low-complexity sections (e.g., reminder + training summaries as row groups), reduce container count, and introduce mixed row/card rhythm.

### 3) Secondary collapsibles are too visually loud
- **Area/component:** `Help & guidance` and `Sync diagnostics` cards with quiet gradient containers and large toggle affordance.
- **What feels wrong:** Even with “quiet” style, they still read as full feature cards and compete with key settings.
- **Why it hurts:** Secondary/support content steals visual attention from edit actions users came for.
- **Type:** hierarchy / consistency
- **Severity:** medium
- **Recommendation:** Present as compact disclosure rows with smaller title scale and less container fill; move detailed prose inside only after expansion.

### 4) Reminders control row lacks strong structure
- **Area/component:** Daily reminder block (`notif-toggle` + conditional time input).
- **What feels wrong:** Binary toggle text (“On/Off”) plus inline time input can appear like two unrelated controls; no persistent value summary when off.
- **Why it hurts:** Weak immediate comprehension of current state and expected tap target.
- **Type:** clarity
- **Severity:** medium
- **Recommendation:** Convert to a standard setting row: left label/subtext, right status/value chip (e.g., “On · 8:00 AM” / “Off”), tapping row opens inline editor.

### 5) Custom labels interaction feels utilitarian
- **Area/component:** Pattern label rows with icon + text + edit/reset icon buttons.
- **What feels wrong:** Dense row actions with two small utility icons per row create an “editor tool” feel rather than calm settings.
- **Why it hurts:** Increases perceived complexity and makes this section visually busy.
- **Type:** polish / density
- **Severity:** medium
- **Recommendation:** Collapse actions under a single “Edit” affordance per row (or swipe/reveal), and show reset inside edit mode only.

### 6) Diagnostics content is too technical for in-tab presentation
- **Area/component:** Advanced diagnostics grid and raw JSON pre block.
- **What feels wrong:** Environment variable labels and JSON dump introduce heavy technical texture in a consumer settings screen.
- **Why it hurts:** Trust and calm can drop when technical internals appear in same visual system as everyday settings.
- **Type:** consistency / readability
- **Severity:** medium
- **Recommendation:** Keep only plain-language status summary in Settings; move raw technical detail to a dedicated debug sheet/screen behind an explicit “Developer details” action.

### 7) Account + Danger zone could be framed with clearer intent
- **Area/component:** Account actions and danger action near bottom.
- **What feels wrong:** The danger separator exists, but CTA weight still feels similar to other buttons; emotional/context framing is minimal.
- **Why it hurts:** Risky action discoverability is high without sufficient friction context, while account actions feel equally weighted.
- **Type:** hierarchy / polish
- **Severity:** medium
- **Recommendation:** Add a short danger helper line, reduce baseline visual parity with normal settings buttons, and consider stronger spacing isolation before destructive action.

## What is already good (do not regress)
- Clear uppercase section eyebrows provide structural chunking.
- Primary surfaces use a restrained warm palette and consistent corner radius language.
- Sync status badge with concise detail is directionally good for trust.
- Training modal warning gate is a solid safety UX pattern.

## Fix priority order
1. Rebuild hierarchy: demote Support/Advanced visual weight.
2. Reduce card repetition and improve vertical rhythm.
3. Refactor Reminders row into clearer state/value pattern.
4. Simplify Custom labels action model.
5. Move technical diagnostics detail out of primary Settings surface.
6. Tighten Account/Danger framing and spacing.
7. Micro-polish typography balance and helper text restraint across secondary rows.
