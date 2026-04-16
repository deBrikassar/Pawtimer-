import { useEffect, useId, useMemo, useState } from "react";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export function AppShell({ header, children, bottomNav, className = "", contentClassName = "", as: Tag = "div" }) {
  return (
    <Tag className={cx("pt-app-shell", className)}>
      {header ? <div className="pt-app-shell__header">{header}</div> : null}
      <main className={cx("pt-app-shell__content", contentClassName)}>{children}</main>
      {bottomNav ? <div className="pt-app-shell__bottom-nav">{bottomNav}</div> : null}
    </Tag>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  eyebrow,
  leading,
  trailing,
  className = "",
  align = "left",
}) {
  return (
    <header className={cx("pt-screen-header", `pt-screen-header--${align}`, className)}>
      {leading ? <div className="pt-screen-header__leading">{leading}</div> : null}
      <div className="pt-screen-header__copy">
        {eyebrow ? <p className="pt-screen-header__eyebrow">{eyebrow}</p> : null}
        {title ? <h1 className="pt-screen-header__title">{title}</h1> : null}
        {subtitle ? <p className="pt-screen-header__subtitle">{subtitle}</p> : null}
      </div>
      {trailing ? <div className="pt-screen-header__trailing">{trailing}</div> : null}
    </header>
  );
}

function BaseButton({ variant, children, className = "", leadingIcon, trailingIcon, ...props }) {
  return (
    <button className={cx("pt-button", `pt-button--${variant}`, className)} {...props}>
      {leadingIcon ? <span className="pt-button__icon">{leadingIcon}</span> : null}
      <span className="pt-button__label">{children}</span>
      {trailingIcon ? <span className="pt-button__icon">{trailingIcon}</span> : null}
    </button>
  );
}

export function PrimaryButton(props) {
  return <BaseButton variant="primary" {...props} />;
}

export function SecondaryButton(props) {
  return <BaseButton variant="secondary" {...props} />;
}

export function SurfaceCard({ children, className = "", interactive = false, as: Tag = "section", ...props }) {
  return (
    <Tag className={cx("pt-surface-card", interactive && "pt-surface-card--interactive", className)} {...props}>
      {children}
    </Tag>
  );
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  open,
  onOpenChange,
  className = "",
  contentClassName = "",
  trailing,
  id,
}) {
  const generatedId = useId();
  const panelId = id || `collapsible-${generatedId}`;
  const isControlled = typeof open === "boolean";
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = isControlled ? open : internalOpen;

  const toggle = () => {
    const next = !isOpen;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <section className={cx("pt-collapsible", isOpen && "is-open", className)}>
      <button
        type="button"
        className="pt-collapsible__trigger"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={toggle}
      >
        <span className="pt-collapsible__title">{title}</span>
        <span className="pt-collapsible__meta">{trailing}</span>
        <span className="pt-collapsible__chevron" aria-hidden="true">⌄</span>
      </button>
      <div id={panelId} className="pt-collapsible__panel-wrap" aria-hidden={!isOpen}>
        <div className={cx("pt-collapsible__panel", contentClassName)}>{children}</div>
      </div>
    </section>
  );
}

export function BottomNav({ items = [], activeKey, onChange, className = "", ariaLabel = "Bottom navigation" }) {
  return (
    <nav className={cx("pt-bottom-nav", className)} aria-label={ariaLabel}>
      {items.map((item) => {
        const active = item.key === activeKey;
        const handleSelect = () => {
          item.onClick?.(item.key);
          onChange?.(item.key);
        };
        return (
          <button
            key={item.key}
            type="button"
            className={cx("pt-bottom-nav__item", active && "is-active")}
            aria-current={active ? "page" : undefined}
            onClick={handleSelect}
          >
            {item.icon ? <span className="pt-bottom-nav__icon">{item.icon}</span> : null}
            <span className="pt-bottom-nav__label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function Toggle({ checked, onCheckedChange, label, description, className = "", disabled = false, id }) {
  const generatedId = useId();
  const controlId = id || `toggle-${generatedId}`;
  return (
    <label className={cx("pt-toggle", disabled && "is-disabled", className)} htmlFor={controlId}>
      <span className="pt-toggle__text">
        {label ? <span className="pt-toggle__label">{label}</span> : null}
        {description ? <span className="pt-toggle__description">{description}</span> : null}
      </span>
      <span className="pt-toggle__control-wrap">
        <input
          id={controlId}
          type="checkbox"
          className="pt-toggle__control"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onCheckedChange?.(event.target.checked)}
        />
        <span className="pt-toggle__track" aria-hidden="true">
          <span className="pt-toggle__thumb" />
        </span>
      </span>
    </label>
  );
}

export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  className = "",
  contentClassName = "",
  closeLabel = "Close panel",
  detachBackdrop = false,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onEscape = (event) => {
      if (event.key === "Escape") onOpenChange?.(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [open, onOpenChange]);

  return (
    <div className={cx("pt-bottom-sheet-host", open && "is-open", detachBackdrop && "pt-bottom-sheet-host--no-backdrop")}>
      <button
        type="button"
        className="pt-bottom-sheet__backdrop"
        aria-label={closeLabel}
        tabIndex={open ? 0 : -1}
        onClick={() => onOpenChange?.(false)}
      />
      <section className={cx("pt-bottom-sheet", className)} aria-hidden={!open}>
        <div className="pt-bottom-sheet__handle" aria-hidden="true" />
        <div className="pt-bottom-sheet__header">
          {title ? <h2 className="pt-bottom-sheet__title">{title}</h2> : null}
          <SecondaryButton className="pt-bottom-sheet__close" onClick={() => onOpenChange?.(false)}>
            Close
          </SecondaryButton>
        </div>
        <div className={cx("pt-bottom-sheet__content", contentClassName)}>{children}</div>
      </section>
    </div>
  );
}

export function ContextHint({ title, body, icon, className = "", tone = "default", action }) {
  return (
    <aside className={cx("pt-context-hint", `pt-context-hint--${tone}`, className)}>
      {icon ? <div className="pt-context-hint__icon">{icon}</div> : null}
      <div className="pt-context-hint__copy">
        {title ? <p className="pt-context-hint__title">{title}</p> : null}
        {body ? <p className="pt-context-hint__body">{body}</p> : null}
      </div>
      {action ? <div className="pt-context-hint__action">{action}</div> : null}
    </aside>
  );
}

export function InlineBanner({ title, body, tone = "info", icon, className = "", action, padded = true }) {
  return (
    <div className={cx("pt-inline-banner", `pt-inline-banner--${tone}`, padded && "pt-inline-banner--padded", className)}>
      {icon ? <div className="pt-inline-banner__icon">{icon}</div> : null}
      <div className="pt-inline-banner__copy">
        {title ? <p className="pt-inline-banner__title">{title}</p> : null}
        {body ? <p className="pt-inline-banner__body">{body}</p> : null}
      </div>
      {action ? <div className="pt-inline-banner__action">{action}</div> : null}
    </div>
  );
}

export const InsightCard = InlineBanner;

export function EmptyState({
  media,
  icon,
  mediaLabel,
  title,
  body,
  ctaLabel,
  onCta,
  className = "",
  cta,
}) {
  const mediaNode = media ?? icon ?? null;

  return (
    <div className={cx("pt-empty-state", className)}>
      {mediaNode ? (
        <div
          className="pt-empty-state__media"
          aria-label={mediaLabel || undefined}
          aria-hidden={mediaLabel ? undefined : "true"}
          role={mediaLabel ? "img" : undefined}
        >
          {mediaNode}
        </div>
      ) : null}
      {title ? <h3 className="pt-empty-state__title">{title}</h3> : null}
      {body ? <p className="pt-empty-state__body">{body}</p> : null}
      {cta ? cta : ctaLabel && onCta ? <PrimaryButton onClick={onCta}>{ctaLabel}</PrimaryButton> : null}
    </div>
  );
}

export function useBottomSheetState(initialOpen = false) {
  const [open, setOpen] = useState(initialOpen);
  return useMemo(() => ({ open, setOpen }), [open]);
}
