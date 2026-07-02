
import { Img, ModalCloseButton, ViewportModal } from "../app/ui";
import { PATTERN_TYPES, isToday } from "../app/helpers";
import { useApp } from "../app/AppContext";

export function PatternModal() {
  const {
    patOpen,
    setPatOpen,
    pattern,
    patterns,
    patLabels,
    patReminderText,
    logPattern,
    name
  } = useApp();


  if (!patOpen) return null;

  return (
    <ViewportModal open onClose={() => setPatOpen(false)}>
      <div className="quick-modal-card modal-card modal-card--dialog-md modal-card--sheet quick-modal-card--sheet">
        <div className="history-session-sheet-grabber" aria-hidden="true" />
        <div className="quick-modal-head">
          <div className="quick-modal-title">Log pattern break</div>
          <ModalCloseButton onClick={() => setPatOpen(false)} />
        </div>


        <div className="tool-expand tool-expand--modal">
          <div className={`pat-reminder ${pattern.behind ? "warn" : ""}`}>{patReminderText}</div>
          <div className="pat-btns">
            {PATTERN_TYPES.map((pt) => (
              <button key={pt.type} className="btn-pat surface-row--interactive interactive-row-card" onClick={(e) => { e.stopPropagation(); logPattern(pt.type); }}>
                <span className="interactive-row-card__icon"><Img src={pt.icon} size={28} alt={pt.label} /></span>
                <div className="p-text interactive-row-card__content">
                  <div className="p-label">{patLabels[pt.type] || pt.label}</div>
                  <div className="p-desc">{pt.desc}</div>
                </div>
                <span className="p-count interactive-row-card__trailing">Today: {patterns.filter((p) => isToday(p.date) && p.type === pt.type).length}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </ViewportModal>
  );
}
