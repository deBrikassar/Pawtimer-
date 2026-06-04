import { useHint } from "../app/useHint";
import { ContextHint } from "../../components/primitives/Primitives";
import { ModalCloseButton, ViewportModal } from "../app/ui";
import { WALK_TYPE_OPTIONS, fmt } from "../app/helpers";
import { useApp } from "../app/AppContext";

export function WalkModal() {
  const {
    walkPhase,
    walkElapsed,
    walkPendingDuration,
    cancelWalk,
    endWalk,
    saveWalkWithType,
    name
  } = useApp();

  const walkHint = useHint(`walk_${name}`);

  if (walkPhase === "idle") return null;

  return (
    <ViewportModal open onClose={cancelWalk}>
      <div className="quick-modal-card modal-card modal-card--dialog-md modal-card--sheet quick-modal-card--sheet">
        <div className="history-session-sheet-grabber" aria-hidden="true" />
        <div className="quick-modal-head">
          <div className="quick-modal-title">Log walk</div>
          <ModalCloseButton onClick={cancelWalk} />
        </div>

        {walkHint.isVisible && (
          <ContextHint
            title="Why track walks?"
            body="Physical and mental exercise impacts your dog's ability to settle. Logging walks helps you see this correlation."
            action={<button type="button" className="secondary-control secondary-control--inline-text" onClick={walkHint.dismiss}>Got it</button>}
            className="mb-4"
          />
        )}

        {walkPhase === "timing" && (
          <div className="walk-timer-banner">
            <div className="walk-timer-left">
              <div className="walk-timer-elapsed">{fmt(walkElapsed)}</div>
              <div className="walk-timer-lbl">Walk in progress…</div>
            </div>
            <div className="walk-timer-btns">
              <button className="walk-cancel-btn button-base button-ghost button--md button--pill" onClick={cancelWalk}>Cancel</button>
              <button className="walk-end-btn button-base button-primary button--md button--pill" onClick={endWalk}>End Walk</button>
            </div>
          </div>
        )}

        {walkPhase === "classify" && (
          <div className="walk-type-panel">
            <div className="walk-type-title">Classify this walk</div>
            <div className="walk-type-sub">{fmt(walkPendingDuration)} · select a walk type to save.</div>
            <div className="walk-type-grid">
              {WALK_TYPE_OPTIONS.map((option) => (
                <button key={option.value} className="walk-type-option" onClick={() => saveWalkWithType(option.value)} type="button">{option.label}</button>
              ))}
            </div>
            <div className="walk-type-actions">
              <button className="walk-cancel-btn button-base button-ghost button--md button--pill" type="button" onClick={cancelWalk}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </ViewportModal>
  );
}
