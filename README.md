# 🐾 PawTimer

A simple, mobile-friendly web app to help you train your dog to stay home alone without stress — based on gradual, positive exposure training.

---

## What it does

PawTimer guides you through a science-based separation anxiety training method:

- **Start small** — sessions begin just below your dog's current calm threshold
- **Log outcomes** — No distress / Mild distress / Strong distress
- **Smart progression** — the app automatically suggests the next session duration based on how your dog did
- **Track everything** — full history, stats, and a progress chart

---

## Features

- 🐶 **Personalised onboarding** — enter your dog's name, how often you leave, current calm threshold, and your final goal
- ⏱️ **Session timer** — visual ring timer with a target duration
- ✅ **Three-level outcome logging** — No / Mild / Strong distress
- 📈 **Adaptive progression engine** — starts conservatively, weights recent calm sessions most heavily, slows down after distress, and inserts easier reps when risk rises
- 📊 **Statistics** — total sessions, distress breakdown, best time, streak counter, progress chart
- 💡 **Training tips** — evidence-based guidance personalised with your dog's name
- 💾 **Works offline with localStorage**
- ☁️ **Optional Supabase sync** — share one dog profile across devices using the same Dog ID

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React (Vite) |
| Charts | Recharts |
| Styling | Plain CSS-in-JS |
| Storage | localStorage + optional Supabase |
| Deployment | Vercel / Netlify |

---

## Getting started locally

### 1. Clone the repository

```bash
git clone https://github.com/YOUR-USERNAME/pawtimer.git
cd pawtimer
```

### 2. Install dependencies

```bash
npm install
npm install recharts
```

### 3. Run the development server

```bash
npm run dev
```

Open your browser at `http://localhost:5173`

---

## Project structure

```
pawtimer/
├── public/
├── src/
│   ├── App.jsx        ← main app (all logic + UI)
│   └── main.jsx       ← React entry point
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

---

## Deploying with GitHub + Vercel

1. Create a GitHub repository and push this project.
2. Import the repository into Vercel.
3. Deploy once without environment variables (local-only mode works immediately).
4. (Optional) Add Supabase environment variables in Vercel project settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Redeploy.

---

## Supabase setup (optional cloud sync)

1. Create a new Supabase project.
2. Open **SQL Editor** → run `supabase_setup.sql` from this repository (new projects).
3. If you already have a project with schema drift, run `supabase_schema_alignment.sql` to patch missing tables/columns safely.
4. In Supabase project settings, copy:
   - Project URL
   - Anon public key
5. Add both values as Vercel environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Redeploy your app.

> The app still works without Supabase — cloud sync is optional.

---

## Deploying for free (alternative)

### Vercel (recommended)

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) and sign in with GitHub
3. Click **Add New Project** → select this repo
4. Keep all defaults → click **Deploy**
5. Your app is live in ~60 seconds 🚀

Every `git push` after that will automatically redeploy.

### Netlify

1. Run `npm run build` — this creates a `dist/` folder
2. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
3. Drag and drop the `dist/` folder onto the page
4. Done!

---

## How the training method works

This app is based on the gradual desensitisation method for separation anxiety:

1. Start below the dog's distress threshold
2. Return before any signs of stress appear
3. Only increase session duration when the dog is **completely calm**
4. If distress occurs — go back, never push forward
5. Many short successful sessions beat one long stressful one

> Based on the training approach in [this video](https://www.youtube.com/watch?v=X4XsTPRXgKQ).

---

## Progression logic

PawTimer uses the progression engine in `src/lib/protocol.js` as the source of truth.

### Current emitted recommendation states

The app currently emits these recommendation types:

- `baseline_start`
- `keep_same_duration`
- `repeat_current_duration`
- `departure_cues_first`
- `recovery_mode_active`
- `recovery_mode_resume`

### How those states are decided

1. **`baseline_start` (no training history)**  
   The first target starts conservatively (about 80% of current calm-alone estimate, minimum 30 seconds).

2. **`recovery_mode_active` (after subtle/active/severe distress trigger)**  
   Recovery becomes the first-priority branch and pauses normal progression.  
   - Typical fixed recovery steps are **60s → 120s**.  
   - Severe triggers can extend to **60s → 120s → 120s**.  
   - For subtle-trigger recovery, **any calm follow-up session length counts** toward completion.

3. **`recovery_mode_resume` (recovery completed)**  
   After the required calm recovery sessions, the app emits a cautious resume recommendation once, then returns to normal progression logic.

4. **`repeat_current_duration` (instability hold)**  
   If recent sessions are unstable, the next target holds around the latest reference duration (with possible gap-based trimming).

5. **`keep_same_duration` (steady progression path)**  
   Outside recovery/instability states, targets follow the recent calm baseline with bounded step changes and smoothing.

6. **`departure_cues_first` (cue sensitivity override)**  
   When cue/pattern data suggests strong trigger sensitivity, recommendation type is relabeled to prioritize cue practice before duration expansion.

### Additional context adjustments

- **Walk context trim:** when recent walks are mostly intense and stability is low, the final recommended duration can be trimmed by ~5%.
- **Risk/stability signals:** safe-alone estimate, calm streak, stability score, and relapse risk are always included in the explanation factors.

In short: progression is state-driven, with recovery state machine decisions taking precedence over normal duration growth.

---

## Reminder behavior (current web-safe implementation)

PawTimer uses an **in-app reminder prompt**, not guaranteed background alarms.

- When reminders are enabled, your chosen reminder time is saved in persistent browser storage (service-worker IndexedDB).
- The app checks whether a reminder is due when PawTimer is opened, focused, or brought back to the foreground.
- If the current time is at/after the configured time and no reminder has fired for that day yet, PawTimer shows a local notification prompt.
- If PawTimer stays closed all day, the reminder appears the next time you open the app.

This matches current web platform limits on reliable background scheduling across browsers.

---

## Future improvements

- 🔔 True server-backed push reminders
- 📤 Export session history to CSV
- 📷 Photo log per session

---

## License

MIT — free to use, modify, and share.

## App icon workflow

`public/icons/app-logo.png` is the canonical app logo source. Keep this file as the only app logo asset.
