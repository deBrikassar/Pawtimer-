export default function EmptyState({ icon, title, body, ctaLabel, onCta }) {
  return (
    <div className="empty-state">
      <div className="es-icon">{icon}</div>
      <div className="es-title">{title}</div>
      <div className="es-body">{body}</div>
      <button className="es-cta" onClick={onCta}>{ctaLabel}</button>
    </div>
  );
}
