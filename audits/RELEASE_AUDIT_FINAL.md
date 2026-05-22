# PawTimer Final Pre-release Audit (2026-03-31)

## SECTION A — RELEASE BLOCKERS

### 1) Production build fails due service worker generation error
- **Severity:** Release blocker
- **Where it is:** PWA build pipeline (`vite-plugin-pwa` setup in `vite.config.js`) and release build command (`npm run build`).
- **Why it is dangerous:** The app cannot produce a production artifact at all. This blocks deployment and leaves no safe release path.
- **Exact reproduction path:**
  1. Fresh install dependencies.
  2. Run `npm run build`.
  3. Build completes bundling, then fails with: `Error: Unable to generate service worker from template. 'assignWith is not defined'`.
- **Root cause:** The current PWA/service-worker generation configuration is incompatible at build time in the current dependency/runtime combination, causing Workbox SW template generation to crash.
- **Exact fix recommendation:**
  - Pin and validate a known-good `vite-plugin-pwa` + `workbox-build` version combo; then rerun CI build.
  - As immediate release unblock, disable SW generation for this release (`VitePWA` off) or switch strategy to minimal inject-manifest with verified config.
  - Add a required CI gate: fail PR if `npm run build` fails.

## SECTION B — HIGH-RISK ISSUES

### 1) Editing profile can orphan the active dog record if onboarding is abandoned
- **Severity:** High
- **Where it is:** Account action `Edit {name}'s profile` in Settings.
- **Why it matters:** Core account access can be unintentionally broken. The current dog is removed from `dogs` before onboarding completion, so backing out can make the profile disappear from selectable dogs and appear as data loss to users.
- **Reproduction:**
  1. Open an existing dog profile.
  2. Go to **Settings → Account → Edit profile**.
  3. Confirm prompt.
  4. From onboarding, use back navigation instead of completing.
  5. Return to dog select; profile can be missing from local list.
- **Fix recommendation:**
  - Do not remove the dog up front.
  - Store a draft onboarding state and only replace profile atomically on successful completion.
  - If onboarding is canceled, restore previous profile without mutation.

### 2) “Clear sessions” remote-delete failure is silently misreported as success
- **Severity:** High
- **Where it is:** History `clearSessions` callback.
- **Why it matters:** Users can believe cloud data was deleted while remote rows remain; this creates cross-device inconsistency and trust failure.
- **Reproduction:**
  1. Enable sync and create sessions.
  2. Force `syncDeleteSessionsForDog` to fail (network off / backend denied).
  3. Click **Clear sessions**.
  4. Local sessions clear, but toast logic still reports success because it checks `ok === null` instead of `!ok`.
- **Fix recommendation:**
  - Change condition to `if (!ok) ...`.
  - Keep explicit “local cleared, remote failed” messaging.
  - Add a regression test for false-success toast behavior.

### 3) Sync loop allows overlapping async runs (race condition risk)
- **Severity:** High (likely risk)
- **Where it is:** App-level sync effect uses `setInterval(sync, 15_000)` with async `sync()` and no in-flight lock.
- **Why it matters:** If a sync request takes longer than 15s, a second sync can start concurrently, leading to non-deterministic merge order and potential stale overwrite of UI sync states.
- **Reproduction (likely):**
  1. Use slow/unstable network with high latency.
  2. Keep app open while local changes are pending.
  3. Allow multiple 15s intervals to fire before previous sync completes.
  4. Observe inconsistent sync badges or unexpected entry state flips.
- **Fix recommendation:**
  - Add a mutex/in-flight guard (`if (syncingRef.current) return;`).
  - Prefer `setTimeout` chain after completion instead of fixed `setInterval`.
  - Log and ignore stale responses using request sequence IDs.

## SECTION C — FINAL RELEASE VERDICT

- **Recommendation:** **NO-GO**
- **Top 3 highest-risk areas:**
  1. Production PWA build/deploy path is broken (hard blocker).
  2. Account/onboarding mutation path can orphan profiles.
  3. Sync reliability paths (delete error reporting and overlapping sync races).
- **Minimal fix list required before release:**
  1. Make `npm run build` pass in CI and generate a valid production artifact.
  2. Refactor “Edit profile” flow to be non-destructive until onboarding completion.
  3. Fix clear-session remote failure handling (`!ok`) and add test coverage.
  4. Add in-flight guard to sync loop and verify no concurrent sync calls.
