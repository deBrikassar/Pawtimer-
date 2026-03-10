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
- 📈 **Smart progression engine** — increases time on success, holds on mild distress, reverts on strong distress
- 📊 **Statistics** — total sessions, distress breakdown, best time, streak counter, progress chart
- 💡 **Training tips** — evidence-based guidance personalised with your dog's name
- 💾 **No backend needed** — all data saved in your browser's localStorage

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React (Vite) |
| Charts | Recharts |
| Styling | Plain CSS-in-JS |
| Storage | localStorage |
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

## Deploying for free

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

| Outcome | Next session |
|---------|-------------|
| ✅ No distress | +15% duration (minimum +5s) |
| ⚠️ Mild distress | Hold — same duration |
| ❌ Strong distress | Revert to last fully calm duration |

---

## Future improvements

- 🔔 Browser push notifications for daily reminders
- 📱 PWA support (install on phone, works offline)
- ☁️ Cloud sync across devices (via Supabase)
- 📤 Export session history to CSV
- 📷 Photo log per session
- 🌙 Dark mode

---

## License

MIT — free to use, modify, and share.
