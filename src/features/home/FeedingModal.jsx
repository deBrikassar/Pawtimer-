
import { ModalCloseButton, ViewportModal } from "../app/ui";
import { useApp } from "../app/AppContext";

export function FeedingModal() {
  const {
    feedingOpen,
    feedingDraft,
    setFeedingDraft,
    cancelFeedingForm,
    saveFeeding,
    name
  } = useApp();
  

  if (!feedingOpen) return null;

  return (
    <ViewportModal open onClose={cancelFeedingForm} overlayClassName="feeding-overlay" labelledBy="feeding-title">
      <div className="feeding-card modal-card modal-card--dialog-sm modal-card--sheet quick-modal-card--sheet quick-modal-card--sheet-compact">
        <div className="history-session-sheet-grabber" aria-hidden="true" />
        <div className="quick-modal-head">
          <div className="section-title section-title--flush" id="feeding-title">Log feeding</div>
          <ModalCloseButton onClick={cancelFeedingForm} />
        </div>


        <div className="t-helper activity-time-hint">Quick log for routine consistency. You can fine-tune details in History later.</div>
        <label className="feeding-field">
          <span className="t-helper">Feeding time</span>
          <input type="datetime-local" value={feedingDraft.time} onChange={(e) => setFeedingDraft((prev) => ({ ...prev, time: e.target.value }))} />
        </label>
        <label className="feeding-field">
          <span className="t-helper">Food type</span>
          <select value={feedingDraft.foodType} onChange={(e) => setFeedingDraft((prev) => ({ ...prev, foodType: e.target.value }))}>
            <option value="meal">meal</option>
            <option value="treat">treat</option>
            <option value="kong">kong</option>
            <option value="lick mat">lick mat</option>
            <option value="chew">chew</option>
          </select>
        </label>
        <label className="feeding-field">
          <span className="t-helper">Amount</span>
          <select value={feedingDraft.amount} onChange={(e) => setFeedingDraft((prev) => ({ ...prev, amount: e.target.value }))}>
            <option value="small">small</option>
            <option value="medium">medium</option>
            <option value="large">large</option>
          </select>
        </label>
        <div className="feeding-actions">
          <button className="walk-cancel-btn button-base button-ghost button--md button--pill" type="button" onClick={cancelFeedingForm}>Cancel</button>
          <button className="walk-end-btn button-base button-primary button--md button--pill" type="button" onClick={saveFeeding}>Save</button>
        </div>
      </div>
    </ViewportModal>
  );
}
