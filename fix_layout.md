Here is the updated layout and CSS code implementing the global mobile responsiveness fixes across the app.

### 1. Global Wrapper Component (`App.jsx`)
Update your main `App.jsx` layout rendering section to use a structured wrapper that respects the safe area and centers the content.

```jsx
// Replace the return statement in App.jsx with this structured layout

return (
  <>
    {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    {needRefresh && (
      <div className="update-banner" role="status" aria-live="polite">
        <span>Update available</span>
        <button type="button" className="update-banner-btn" onClick={() => updateServiceWorker(true)}>Reload</button>
      </div>
    )}
    <AppContext.Provider value={appContextValue}>
      <div className="app-wrapper">
        
        {/* Main Scrollable View Container */}
        <main className={`app-main ${phase === "running" ? "is-timer-active" : ""}`}>
          <div className={`tab-panel tab-panel--${tabMotionDirection}`} key={tab}>
            {tab === "home" && <HomeScreen />}
            {tab === "history" && <HistoryScreen />}
            {tab === "progress" && <StatsScreen />}
            {tab === "settings" && <SettingsScreen />}
          </div>
        </main>

        {/* Safe Area Bottom Navigation */}
        <nav className="bottom-nav-safe-area">
          <div className="tabs">
            {[
              { id: "home", label: "Train", icon: <HomeIcon /> }, 
              { id: "history", label: "History", icon: <HistoryIcon /> }, 
              { id: "progress", label: "Progress", icon: <ChartIcon /> }, 
              { id: "settings", label: "Settings", icon: <SettingsIcon /> }
            ].map((t) => (
              <button 
                key={t.id} 
                className={`tab-btn ${tab === t.id ? "active" : ""}`} 
                onClick={() => { appContextValue.vibrate(10); handleTabChange(t.id); }}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </nav>
        
      </div>
    </AppContext.Provider>
  </>
);
```

### 2. Global CSS Refactoring (`app.css` / `shared.css`)
Append or replace your layout styles with this global configuration to enforce the 5 responsiveness rules.

```css
/* ==========================================================================
   GLOBAL MOBILE RESPONSIVENESS & LAYOUT REFACTOR
   ========================================================================== */

/* 1. Global Fluidity & Box-Sizing */
*, *::before, *::after {
  box-sizing: border-box !important;
}

html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  overflow-x: hidden; /* Prevent horizontal scroll on mobile */
  background-color: var(--bg);
}

/* 2 & 3. Standardized Mobile Padding, Fluid Widths, and Margin */
.app-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 100vh;
}

.app-main {
  /* Replace hardcoded 380px with fluid percentage and max-width */
  width: 100%;
  max-width: 600px;
  margin: 0 auto; 
  
  /* Standardized mobile side padding */
  padding-left: 16px;
  padding-right: 16px;
  
  /* 5. Safe Area & Bottom Navigation Fix */
  padding-bottom: calc(90px + env(safe-area-inset-bottom, 20px));
  
  /* Ensure parent does not clip shadows */
  overflow: visible; 
}

.tab-panel {
  width: 100%;
  /* Remove any rogue padding from individual panels */
  padding: 0; 
}

/* 4. Neumorphism Shadow Protection */
/* Remove fixed widths and add enough internal padding/margin so shadows aren't clipped */
.neumorphic-card, .pt-card, .progress-card, .stat-card {
  width: 100%;
  max-width: 100%;
  margin: 16px 0; /* Vertical spacing only; rely on .app-main for horizontal padding */
  padding: 24px;
  border-radius: 24px;
  background: var(--surface);
  /* Protect shadows by ensuring overflow is visible */
  overflow: visible;
  /* Example Neumorphic shadow */
  box-shadow: 8px 8px 16px rgba(0,0,0,0.06), -8px -8px 16px rgba(255,255,255,0.8);
}

/* Eradicate rogue margins from child items inside cards or lists */
.neumorphic-card > *, .pt-card > * {
  margin-left: 0 !important;
  margin-right: 0 !important;
}

/* 6. Flexbox Alignment Rules */

/* Left-aligned Headers and Lists */
.screen-header, .list-container, .history-list {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  width: 100%;
  text-align: left;
}

/* Perfectly Centered Widgets (e.g., Progress Circles, Timer UI) */
.widget-centered, .timer-circle-container, .empty-state-container {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column; /* Stack children centrally if needed */
  width: 100%;
  margin: 24px auto;
  text-align: center;
}

/* Bottom Navigation Wrapper & Layout */
.bottom-nav-safe-area {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  z-index: 1000;
  background: transparent;
  /* Apply safe-area inset at the absolute bottom */
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.tabs {
  display: flex;
  justify-content: space-around;
  align-items: center;
  width: 100%;
  max-width: 600px;
  margin: 0 auto; /* Center nav on tablets/desktops */
  height: 80px; /* Taller touch target area for mobile */
  background: var(--surface);
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  box-shadow: 0 -4px 24px rgba(0,0,0,0.06); /* Soft upward shadow */
}

/* Clean up legacy fixed width classes if they still exist anywhere */
.fixed-width-container, .w-380 {
  width: 100% !important;
  max-width: 600px !important;
}
```
