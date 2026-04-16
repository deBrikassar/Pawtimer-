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
        <div className="ws-eyebrow">Separation training for dogs</div>
        <h1 className="ws-title">PawTimer</h1>
        <p className="ws-copy">
          Short, guided reps that help your dog feel safer when home alone.
        </p>
      </div>

      <div className="ws-footer">
        <button
          className="ws-cta button-base button-primary button--lg button-size-primary-cta button--block"
          type="button"
          onClick={onStart}
        >
          Set up my dog
        </button>
        <button className="ws-secondary" type="button" onClick={onManageDogs}>
          I already have a profile
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
        <div className="ob-eyebrow">Build {displayName}&apos;s plan</div>
        <div className="ob-title">{displayName === "your dog" ? "Start calm-alone training" : `${displayName}'s calm-alone training`}</div>
        <div className="ob-subtitle">{activeStep.progressLabel} • We&apos;ll start gently.</div>
        <div className="ob-step-indicator">
          {[0, 1, 2, 3].map((i) => <div key={i} className={`ob-step-dot ${i < step ? "done" : i === step ? "active" : ""}`} />)}
        </div>
      </div>
      <div className="ob-body">
        <div key={step} className="ob-step-panel">
          {step === 0 && <>
            <div className="ob-question">Which dog is this plan for?</div>
            <div className="ob-note prose">We&apos;ll use this name across training, logs, and insights.</div>
            <div className="ob-hint">You can change it anytime in Settings.</div>
            <input className="ob-input" placeholder="e.g. Luna, Mochi, Rocco…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && canNext && handleNext()} autoFocus />
          </>}
          {step === 1 && <>
            <div className="ob-question">How often is {displayName} home alone?</div>
            <div className="ob-hint">This helps us suggest a realistic daily pace.</div>
            <div className="ob-options">
              {LEAVE_OPTIONS.map((o) => (
                <button key={o.value} className={`ob-option ${leaves === o.value ? "selected" : ""}`} onClick={() => setLeaves(o.value)}>
                  <div><div className="ob-option-label">{o.label}</div><div className="ob-option-sub">{o.sub}</div></div>
                </button>
              ))}
            </div>
          </>}
          {step === 2 && <>
            <div className="ob-question">Today, how long can {displayName} stay calm alone?</div>
            <div className="ob-hint">We&apos;ll use this as your starting point.</div>
            <div className="ob-duration-grid">
              {CALM_DURATIONS.map((d) => (
                <button key={d.value} className={`ob-dur-btn ${calm === d.value ? "selected" : ""}`} onClick={() => setCalm(d.value)}>
                  <div className="ob-dur-val">{d.label}</div><div className="ob-dur-lbl">{d.sub}</div>
                </button>
              ))}
            </div>
          </>}
          {step === 3 && <>
            <div className="ob-question">Pick a longer-term goal for {displayName}</div>
            <div className="ob-note prose">Optional. You can skip this and set it later.</div>
            <div className="ob-hint">Goals help connect training to real-life departures.</div>
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
          {step < 3 ? "Continue →" : `Start ${displayName}'s plan`}
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
  const [joinState, setJoinState] = useState({ status: "idle", message: "", preview: null });
  const [activePath, setActivePath] = useState(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const normalizeJoinId = (value) => value.replace(/[^a-zA-Z0-9-]/g, "").replace(/\s+/g, "").toUpperCase();
  const hasValidShape = (value) => value.length >= 4 && /[A-Z]/.test(value) && /\d/.test(value) && value.includes("-");

  const validateJoinId = (value) => {
    if (!value) return "Enter the shared ID to continue.";
    if (!value.includes("-")) return "Include the dash in the shared ID (example: LUNA-4829).";
    if (value.length < 4) return "That ID looks short — please check and try again.";
    if (!/[A-Z]/.test(value) || !/\d/.test(value)) return "Use letters and numbers from the shared ID.";
    return "";
  };

  const handleLookup = async () => {
    const normalized = normalizeJoinId(joinId);
    const softValidation = validateJoinId(normalized);
    if (softValidation) {
      setJoinState({ status: "invalid", message: softValidation, preview: null });
      return;
    }
    if (typeof onSelect !== "function") return;
    setIsLookingUp(true);
    const result = await onSelect(normalized, true, { mode: "preview" });
    if (result?.ok) {
      setJoinState({
        status: "ready",
        message: "ID found. Review and confirm to join.",
        preview: result,
      });
    } else {
      setJoinState({
        status: "not-found",
        message: result?.message || "We couldn't find that ID. Please check and try again.",
        preview: null,
      });
    }
    setIsLookingUp(false);
  };

  const handleJoinConfirm = async () => {
    if (!joinState.preview?.normalizedId) return;
    await onSelect(joinState.preview.normalizedId, true, { mode: "join", preview: joinState.preview });
  };

  return (
    <div className="dog-select">
      <div className="ds-hero">
        <div className="ds-logo"><PawIcon size={68} /></div>
        <div className="ds-title">PawTimer</div>
        <div className="ds-sub">Choose how you want to start your dog&apos;s plan.</div>
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
            <div className="ds-path-title">Create a new plan</div>
            <div className="ds-path-copy">Set a calm baseline in about a minute.</div>
          </button>
          <button
            className={`ds-path-card ${activePath === "join" ? "selected" : ""}`}
            type="button"
            onClick={() => setActivePath("join")}
          >
            <div className="ds-path-title">Join with dog ID</div>
            <div className="ds-path-copy">Use a shared ID so everyone follows one plan.</div>
          </button>
        </div>

        <div className={`ds-join-panel ${activePath === "join" ? "is-open" : ""}`}>
          <div className="ds-section-label">Join using dog ID</div>
          <div className="ds-note">
            This ID links one dog profile across devices.
            You&apos;ll usually get it from your partner, trainer, or whoever set up the profile.
          </div>
          <div className="ds-join-row">
            <input
              className="ds-join-input"
              placeholder="e.g. LUNA-4829"
              value={joinId}
              onChange={(e) => {
                setJoinId(e.target.value);
                if (joinState.status !== "idle") setJoinState({ status: "idle", message: "", preview: null });
              }}
              onBlur={() => {
                const normalized = normalizeJoinId(joinId);
                const softValidation = validateJoinId(normalized);
                if (joinId && softValidation) setJoinState({ status: "invalid", message: softValidation, preview: null });
              }}
              onKeyDown={(e) => e.key === "Enter" && joinId.trim() && handleLookup()}
              maxLength={14}
            />
            <button className="ds-join-btn" onClick={handleLookup} disabled={isLookingUp || !hasValidShape(normalizeJoinId(joinId))}>
              {isLookingUp ? "Checking…" : "Check ID"}
            </button>
          </div>
          {joinState.message && <div className={`ds-join-feedback ds-join-feedback--${joinState.status}`}>{joinState.message}</div>}
          {joinState.status === "ready" && joinState.preview && (
            <div className="ds-join-confirm-card">
              <div className="ds-join-confirm-eyebrow">Ready</div>
              <div className="ds-join-confirm-title">{joinState.preview.dogName || "Shared dog profile"}</div>
              <div className="ds-join-confirm-copy">
                ID: {joinState.preview.normalizedId}
                {joinState.preview.source ? ` • ${joinState.preview.source}` : ""}
              </div>
              <button className="ds-join-btn ds-join-confirm-btn" type="button" onClick={handleJoinConfirm}>
                Join this profile
              </button>
            </div>
          )}
          <div className="ds-join-hint">Find this ID in Settings → Dog profile.</div>
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
