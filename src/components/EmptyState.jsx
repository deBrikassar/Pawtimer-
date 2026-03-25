export default function EmptyState({ media, icon, mediaLabel, title, body, ctaLabel, onCta }) {
  const mediaNode = media ?? icon ?? null;
  const hasMedia = Boolean(mediaNode);

  return (
    <div className={`empty-state${hasMedia ? " empty-state--with-media" : ""}`}>
      {hasMedia ? (
        <div
          className="es-media"
          aria-label={mediaLabel || undefined}
          aria-hidden={mediaLabel ? undefined : "true"}
          role={mediaLabel ? "img" : undefined}
        >
          {mediaNode}
        </div>
      ) : null}
      <div className="es-title">{title}</div>
      <div className="es-body">{body}</div>
      {ctaLabel && onCta ? (
        <button className="es-cta button-size-primary-cta" onClick={onCta}>{ctaLabel}</button>
      ) : null}
    </div>
  );
}
