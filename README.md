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

1. **First session starts conservatively** — with no history yet, the app starts at about **80% of the dog's current calm-alone estimate** from onboarding, with a 30-second minimum.
2. **Safe-alone time is recalculated from recent calm sessions** — calm sessions are weighted by recency and confidence so newer successful reps matter most.
3. **All-calm streaks unlock the clearest increase** — when the latest 5 training sessions are fully calm, the next target is usually **+15%** from the latest calm duration.
4. **Distress slows or reverses progression**:
   - **Subtle stress** → usually repeat the same duration.
   - **Active distress** → shorten the next target by about **25%**.
   - **Severe distress / panic** → move into a deeper stabilization step at about **60%** of the safe-alone estimate.
5. **Risk management can insert easier sessions** — higher relapse risk or regular “easy session” checkpoints can temporarily drop the target to **80%** of the safe-alone estimate instead of pushing forward.
6. **Context can trim the target further** — if recent walks are mostly intense and stability is still low, the final recommendation can be reduced by another **5%**.

In short: the next target is based on the current safe-alone estimate, recent calm streaks, distress severity, relapse risk, and a small amount of walk/cue context — not on one fixed step rule every time.

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
