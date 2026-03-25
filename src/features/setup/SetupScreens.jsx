import { useState } from "react";
import { CALM_DURATIONS, GOAL_DURATIONS, LEAVE_OPTIONS } from "../app/helpers";
import { PawIcon } from "../app/ui";

export function Onboarding({ onComplete, onBack }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [leaves, setLeaves] = useState(null);
  const [calm, setCalm] = useState(null);
  const [goal, setGoal] = useState(null);

  const cleanName = name.replace(/\s+/g, " ").trim();
  const canNext = [cleanName.length >= 1, leaves !== null, calm !== null, goal !== null][step];
  const displayName = cleanName || "your dog";

  const handleNext = () => {
    if (step < 3) setStep((s) => s + 1);
    else onComplete({ dogName: cleanName, leavesPerDay: leaves, currentMaxCalm: calm, goalSeconds: goal });
  };

  return (
    <div className="onboarding">
      <div className="ob-hero">
        <div className="ob-hero-icon"><PawIcon size={48} /></div>
        <div className="ob-title">PawTimer</div>
        <div className="ob-subtitle">Set up {displayName}'s training plan in 4 steps.</div>
        <div className="ob-step-indicator">
          {[0, 1, 2, 3].map((i) => <div key={i} className={`ob-step-dot ${i < step ? "done" : i === step ? "active" : ""}`} />)}
        </div>
      </div>
      <div className="ob-body">
        {step === 0 && <>
          <div className="ob-question">What's your dog's name?</div>
          <div className="ob-note prose">Names are case-insensitive, and we'll keep your dog's natural spelling.</div>
          <div className="ob-hint">Used to personalise messages throughout the app.</div>
          <input className="ob-input" placeholder="e.g. Luna, Maximilian…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && canNext && handleNext()} autoFocus />
        </>}
        {step === 1 && <>
          <div className="ob-question">How often do you leave the house per day?</div>
          <div className="ob-hint">Determines how many pattern-break exercises to recommend each day.</div>
          <div className="ob-options">
            {LEAVE_OPTIONS.map((o) => (
              <button key={o.value} className={`ob-option ${leaves === o.value ? "selected" : ""}`} onClick={() => setLeaves(o.value)}>
                <div><div className="ob-option-label">{o.label}</div><div className="ob-option-sub">{o.sub}</div></div>
              </button>
            ))}
          </div>
        </>}
        {step === 2 && <>
          <div className="ob-question">How long can {displayName} stay calm alone now?</div>
          <div className="ob-hint">The first target starts around 80% of this, then adapts using calm streaks, distress, and relapse risk.</div>
          <div className="ob-duration-grid">
            {CALM_DURATIONS.map((d) => (
              <button key={d.value} className={`ob-dur-btn ${calm === d.value ? "selected" : ""}`} onClick={() => setCalm(d.value)}>
                <div className="ob-dur-val">{d.label}</div><div className="ob-dur-lbl">{d.sub}</div>
              </button>
            ))}
          </div>
        </>}
        {step === 3 && <>
          <div className="ob-question">What's the goal for {displayName}?</div>
          <div className="ob-hint">Training is gradual. You can change this any time.</div>
          <div className="ob-duration-grid">
            {GOAL_DURATIONS.map((d) => (
              <button key={d.value} className={`ob-dur-btn ${goal === d.value ? "selected" : ""}`} onClick={() => setGoal(d.value)}>
                <div className="ob-dur-val">{d.label}</div><div className="ob-dur-lbl">{d.sub}</div>
              </button>
            ))}
          </div>
        </>}
      </div>
      <div className="ob-footer">
        <button className="ob-btn-next button-base button-primary button--lg button-size-primary-cta button--block" onClick={handleNext} disabled={!canNext}>
          {step < 3 ? "Continue →" : `Start training with ${displayName}`}
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
        <div className="ds-sub">Separation anxiety training tracker</div>
      </div>
      <div className="ds-body">
        {dogs.length > 0 && <>
          <div className="ds-section-label">Your dogs</div>
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
          <div className="ds-divider">
            <div className="ds-divider-line" /><div className="ds-divider-text">or</div><div className="ds-divider-line" />
          </div>
        </>}

        <button className="ds-btn button-base button-primary button--lg button-size-primary-cta button--block" onClick={onCreateNew}>
          <PawIcon size={20} color="rgba(255,255,255,0.85)" /> Add a new dog
        </button>

        <div className="ds-section-label u-mt-section-tight">Join with a dog ID</div>
        <div className="ds-note">Dog IDs are case-insensitive — matched automatically regardless of case.</div>
        <div className="t-helper u-mb-card-row">
          Use the same ID from your partner's phone to track the same dog together.
        </div>
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
        <div className="ds-join-hint">Find the ID in PawTimer → Settings tab.</div>
      </div>
    </div>
  );
}
