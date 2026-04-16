import { useState } from "react";
import { CALM_DURATIONS, GOAL_DURATIONS, LEAVE_OPTIONS } from "../app/helpers";
import { PawIcon } from "../app/ui";

const CREATE_DOG_STEPS = [
  { key: "name", progressLabel: "Step 1 of 4" },
  { key: "leaving", progressLabel: "Step 2 of 4" },
  { key: "calm", progressLabel: "Step 3 of 4" },
  { key: "goal", progressLabel: "Step 4 of 4" },
];

export function WelcomeScreen({ onStart, onManageDogs }) {
  return (
    <div className="welcome-screen">
      <div className="ws-hero">
        <div className="ws-halo ws-halo--one" aria-hidden="true" />
        <div className="ws-halo ws-halo--two" aria-hidden="true" />
        <div className="ws-paw">
          <PawIcon size={66} />
        </div>
        <div className="ws-eyebrow">Calm dog training</div>
        <h1 className="ws-title">PawTimer</h1>
        <p className="ws-copy">
          Gentle, science-led sessions that help your dog feel safer when home alone.
        </p>
      </div>

      <div className="ws-footer">
        <button
          className="ws-cta button-base button-primary button--lg button-size-primary-cta button--block"
          type="button"
          onClick={onStart}
        >
          Start setup
        </button>
        <button className="ws-secondary" type="button" onClick={onManageDogs}>
          I already have a dog profile
        </button>
      </div>
    </div>
  );
}

export function Onboarding({ onComplete, onBack }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [leaves, setLeaves] = useState(null);
  const [calm, setCalm] = useState(null);
  const [goal, setGoal] = useState(null);

  const cleanName = name.replace(/\s+/g, " ").trim();
  const canNext = [cleanName.length >= 1, leaves !== null, calm !== null, true][step];
  const displayName = cleanName || "your dog";
  const activeStep = CREATE_DOG_STEPS[step];

  const handleNext = () => {
    if (step < 3) setStep((s) => s + 1);
    else onComplete({ dogName: cleanName, leavesPerDay: leaves, currentMaxCalm: calm, goalSeconds: goal });
  };

  return (
    <div className="onboarding">
      <div className="ob-hero">
        <div className="ob-hero-icon"><PawIcon size={48} /></div>
        <div className="ob-eyebrow">Create dog</div>
        <div className="ob-title">{displayName === "your dog" ? "Start a calm journey" : `${displayName}'s calm journey`}</div>
        <div className="ob-subtitle">{activeStep.progressLabel} • One focused choice at a time.</div>
        <div className="ob-step-indicator">
          {[0, 1, 2, 3].map((i) => <div key={i} className={`ob-step-dot ${i < step ? "done" : i === step ? "active" : ""}`} />)}
        </div>
      </div>
      <div className="ob-body">
        <div key={step} className="ob-step-panel">
          {step === 0 && <>
            <div className="ob-question">Who are we training with today?</div>
            <div className="ob-note prose">Your dog's name personalizes every cue and progress view.</div>
            <div className="ob-hint">You can update this later in settings if needed.</div>
            <input className="ob-input" placeholder="e.g. Luna, Mochi, Rocco…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && canNext && handleNext()} autoFocus />
          </>}
          {step === 1 && <>
            <div className="ob-question">How often is {displayName} home alone?</div>
            <div className="ob-hint">This helps shape your weekly rhythm and guidance intensity.</div>
            <div className="ob-options">
              {LEAVE_OPTIONS.map((o) => (
                <button key={o.value} className={`ob-option ${leaves === o.value ? "selected" : ""}`} onClick={() => setLeaves(o.value)}>
                  <div><div className="ob-option-label">{o.label}</div><div className="ob-option-sub">{o.sub}</div></div>
                </button>
              ))}
            </div>
          </>}
          {step === 2 && <>
            <div className="ob-question">How long does {displayName} stay calm right now?</div>
            <div className="ob-hint">We'll start gently from this baseline and build calm confidence over time.</div>
            <div className="ob-duration-grid">
              {CALM_DURATIONS.map((d) => (
                <button key={d.value} className={`ob-dur-btn ${calm === d.value ? "selected" : ""}`} onClick={() => setCalm(d.value)}>
                  <div className="ob-dur-val">{d.label}</div><div className="ob-dur-lbl">{d.sub}</div>
                </button>
              ))}
            </div>
          </>}
          {step === 3 && <>
            <div className="ob-question">Choose a future calm goal for {displayName}</div>
            <div className="ob-note prose">Optional: skip for now and set this after a few sessions.</div>
            <div className="ob-hint">Goals keep motivation high — training still works even without one.</div>
            <div className="ob-duration-grid">
              {GOAL_DURATIONS.map((d) => (
                <button key={d.value} className={`ob-dur-btn ${goal === d.value ? "selected" : ""}`} onClick={() => setGoal(d.value)}>
                  <div className="ob-dur-val">{d.label}</div><div className="ob-dur-lbl">{d.sub}</div>
                </button>
              ))}
            </div>
          </>}
        </div>
      </div>
      <div className="ob-footer">
        <button className="ob-btn-next button-base button-primary button--lg button-size-primary-cta button--block" onClick={handleNext} disabled={!canNext}>
          {step < 3 ? "Continue →" : `Begin ${displayName}'s plan`}
        </button>
        <button className="ob-back-btn" onClick={() => step === 0 ? onBack?.() : setStep((s) => s - 1)}>
          ← {step === 0 ? "Back to dogs" : "Back"}
        </button>
      </div>
    </div>
  );
}

export function DogSelect({ dogs, onSelect, onCreateNew }) {
  const [joinId, setJoinId] = useState("");
  const [joinError, setJoinError] = useState("");
  const [activePath, setActivePath] = useState(null);

  const handleJoin = () => {
    const id = joinId.trim().toUpperCase();
    if (id.length < 3 || !id.includes("-")) {
      setJoinError("Enter a valid dog ID — e.g. LUNA-4829");
      return;
    }
    setJoinError("");
    onSelect(id, true);
  };

  return (
    <div className="dog-select">
      <div className="ds-hero">
        <div className="ds-logo"><PawIcon size={68} /></div>
        <div className="ds-title">PawTimer</div>
        <div className="ds-sub">Choose how you want to get started.</div>
      </div>
      <div className="ds-body">
        <div className="ds-path-grid">
          <button
            className={`ds-path-card ${activePath === "create" ? "selected" : ""}`}
            type="button"
            onClick={() => {
              setActivePath("create");
              onCreateNew();
            }}
          >
            <div className="ds-path-title">Create new dog</div>
            <div className="ds-path-copy">Set up your dog's calm plan in under a minute.</div>
          </button>
          <button
            className={`ds-path-card ${activePath === "join" ? "selected" : ""}`}
            type="button"
            onClick={() => setActivePath("join")}
          >
            <div className="ds-path-title">Join existing dog by ID</div>
            <div className="ds-path-copy">Use a shared ID to track the same dog together.</div>
          </button>
        </div>

        <div className={`ds-join-panel ${activePath === "join" ? "is-open" : ""}`}>
          <div className="ds-section-label">Join with a dog ID</div>
          <div className="ds-note">IDs are unique and matched securely, case-insensitive.</div>
          <div className="ds-join-row">
            <input
              className="ds-join-input"
              placeholder="e.g. LUNA-4829"
              value={joinId}
              onChange={(e) => { setJoinId(e.target.value); setJoinError(""); }}
              onKeyDown={(e) => e.key === "Enter" && joinId.trim() && handleJoin()}
              maxLength={14}
            />
            <button className="ds-join-btn" onClick={handleJoin}>Join →</button>
          </div>
          {joinError && <div className="ds-join-error">{joinError}</div>}
          <div className="ds-join-hint">Find this ID in PawTimer → Settings.</div>
        </div>

        {dogs.length > 0 && <>
          <div className="ds-section-label u-mt-section-tight">Your dogs</div>
          {dogs.map((d) => (
            <button key={d.id} className="ds-dog-card surface-row--interactive interactive-row-card" type="button" onClick={() => onSelect(d.id)}>
              <span className="interactive-row-card__icon"><PawIcon size={30} /></span>
              <div className="interactive-row-card__content">
                <div className="ds-dog-name">{d.dogName || "Your dog"}</div>
                <div className="ds-dog-id">ID: {d.id}</div>
              </div>
              <div className="ds-dog-arrow interactive-row-card__trailing">›</div>
            </button>
          ))}
        </>}
      </div>
    </div>
  );
}
