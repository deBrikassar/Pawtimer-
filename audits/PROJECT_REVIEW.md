# PawTimer Project Review (Updated)

This file tracks the major issues found during review and their status.

## ✅ Fixed in code

1. **Supabase schema mismatch fixed**
   - App sync now uses normalized Supabase tables (`sessions`, `walks`, `patterns`) instead of a non-existent `activities` table.

2. **Remote delete behavior improved**
   - Deleting single history items now deletes from the correct remote table.
   - "Clear sessions" now also performs remote delete by `dog_id`.

3. **Documentation drift reduced**
   - README now documents optional Supabase sync and explicit GitHub/Vercel + Supabase setup steps.

4. **Protocol logic extracted for testability**
   - Core progression logic moved to `src/lib/protocol.js`.

## ⚠️ Still recommended next

1. **RLS hardening**
   - Current policies intentionally allow broad anon access for easy partner sharing.
   - For production privacy, move to stricter row-level policies (dog secret or authenticated users).

2. **Component size refactor**
   - `src/App.jsx` is still large and should be split by feature over time.

3. **CI quality checks**
   - Add CI workflow in GitHub Actions to run `npm run build` and tests on every PR.
