const ONBOARDING_STEPS = [
  {
    title: "Welcome to PawTimer",
    body: "Track calm training and everyday behavior in one simple place.",
    cta: "Continue",
  },
  {
    title: "See progress faster",
    body: "Spot calmer stretches, reduce stress, and see steady habits over time.",
    cta: "Next",
  },
  {
    title: "Log three simple moments",
    body: "Use Walk, Pattern break, and Feeding to build a clear picture of the day.",
    cta: "Show me how",
  },
  {
    title: "Start with Walk",
    body: "Press Walk to add your first log and begin tracking right away.",
    cta: "Highlight Walk",
  },
  {
    title: "Nice first log",
    body: "PawTimer is now tracking activity so your patterns and progress can build from here.",
    cta: "What happens next?",
  },
  {
    title: "Keep it calm and consistent",
    body: "Aim to extend calm time gradually and keep logging so progress stays visible.",
    cta: "Finish onboarding",
  },
];

export default function FirstTimeOnboarding({
  step,
  walkPromptReady,
  onAdvance,
  onSkip,
}) {
  const currentStep = ONBOARDING_STEPS[step] ?? ONBOARDING_STEPS[0];
  const isWalkStep = step === 3;

  return (
    <div className={`guided-onboarding ${isWalkStep ? "guided-onboarding--walk" : ""}`} role="dialog" aria-modal="true" aria-labelledby="guided-onboarding-title">
      <div className="guided-onboarding__scrim" />
      <div className="guided-onboarding__card">
        <div className="guided-onboarding__meta">
          <span className="guided-onboarding__eyebrow">Step {Math.min(step + 1, ONBOARDING_STEPS.length)} of {ONBOARDING_STEPS.length}</span>
          <button className="guided-onboarding__skip" type="button" onClick={onSkip}>Skip</button>
        </div>

        <div className="guided-onboarding__progress" aria-hidden="true">
          {ONBOARDING_STEPS.map((item, index) => (
            <span
              key={item.title}
              className={`guided-onboarding__dot ${index < step ? "is-done" : ""} ${index === step ? "is-active" : ""}`}
            />
          ))}
        </div>

        <h2 className="guided-onboarding__title" id="guided-onboarding-title">{currentStep.title}</h2>
        <p className="guided-onboarding__body">{currentStep.body}</p>

        {isWalkStep && walkPromptReady && (
          <p className="guided-onboarding__hint">Walk is highlighted below — tap it to create your first log.</p>
        )}

        <button
          className="guided-onboarding__action"
          type="button"
          onClick={onAdvance}
          disabled={isWalkStep && walkPromptReady}
        >
          {isWalkStep && walkPromptReady ? "Waiting for Walk…" : currentStep.cta}
        </button>
      </div>
    </div>
  );
}
