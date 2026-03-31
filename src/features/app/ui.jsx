import React from "react";

const SvgIcon = ({ children, strokeWidth = 1.9, className = "", viewBox = "0 0 24 24" }) => (
  <svg
    className={className}
    viewBox={viewBox}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const iconByName = {
  sessionCalm: (
    <SvgIcon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 13c.7 1.1 1.8 1.8 3 1.8S14.3 14.1 15 13" />
      <path d="M9.2 10.2h.01M14.8 10.2h.01" />
    </SvgIcon>
  ),
  sessionSubtle: (
    <SvgIcon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 14h6" />
      <path d="M9.2 10.2h.01M14.8 10.2h.01" />
    </SvgIcon>
  ),
  sessionActive: (
    <SvgIcon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 15c1.1-1 2-1.3 3-1.3s1.9.3 3 1.3" />
      <path d="M9.2 10.2h.01M14.8 10.2h.01" />
    </SvgIcon>
  ),
  walk: (
    <SvgIcon>
      <circle cx="13.5" cy="5.5" r="1.5" />
      <path d="M12 11l2-2 2 1.3" />
      <path d="M10 20l1.8-4.2 2.4 1.2L16 20" />
      <path d="M8.5 14.5l3-2" />
    </SvgIcon>
  ),
  patternKeys: (
    <SvgIcon>
      <circle cx="8.5" cy="10" r="2.5" />
      <path d="M11 10h8" />
      <path d="M16 10v2" />
      <path d="M18.5 10v1.5" />
    </SvgIcon>
  ),
  patternShoes: (
    <SvgIcon>
      <path d="M4 15h16v3H4z" />
      <path d="M6 15c.8-1.2 1.8-2 3.2-2.4" />
      <path d="M10.5 12.6c1.4.6 2.1 1.5 2.8 2.4" />
    </SvgIcon>
  ),
  patternJacket: (
    <SvgIcon>
      <path d="M7 20V8l3-2 2 2 2-2 3 2v12" />
      <path d="M12 8v12" />
      <path d="M9 11h6" />
    </SvgIcon>
  ),
  feeding: (
    <SvgIcon>
      <path d="M4 14a8 8 0 0016 0H4z" />
      <path d="M8.5 10V6M12 10V5M15.5 10V6" />
    </SvgIcon>
  ),
};

export const Img = ({ src, size = 24, alt = "" }) => {
  const normalizedKey = {
    "result-calm.png": "sessionCalm",
    "result-mild.png": "sessionSubtle",
    "result-strong.png": "sessionActive",
    "walk.png": "walk",
    "pattern-keys.png": "patternKeys",
    "pattern-shoes.png": "patternShoes",
    "pattern-jacket.png": "patternJacket",
  }[src] ?? src;
  const icon = iconByName[normalizedKey] ?? null;
  if (!icon) return null;
  return (
    <span
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : "true"}
      className="icon-img"
      style={{ width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
    >
      {React.cloneElement(icon, { className: "img-icon-svg" })}
    </span>
  );
};

export const PawIcon = ({ size = 36 }) => (
  <img src="/icons/app-logo.png" width={size} height={size} alt="PawTimer" className="paw-icon-img" />
);

export const ModalCloseButton = ({ onClick, label = "Close dialog" }) => (
  <button className="modal-close-btn secondary-control secondary-control--icon" type="button" onClick={onClick} aria-label={label}>
    <span aria-hidden="true">×</span>
  </button>
);

export const HomeIcon = () => (
  <SvgIcon strokeWidth={1.8}>
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
    <path d="M9 21V12h6v9" />
  </SvgIcon>
);
export const HistoryIcon = () => (
  <SvgIcon strokeWidth={1.8}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </SvgIcon>
);
export const ChartIcon = () => (
  <SvgIcon strokeWidth={1.8}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </SvgIcon>
);
export const SettingsIcon = () => (
  <SvgIcon strokeWidth={1.8}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </SvgIcon>
);
export const ClockIcon = () => (
  <SvgIcon>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8v4.3l2.8 2.2" />
  </SvgIcon>
);
export const EditIcon = () => (
  <SvgIcon>
    <path d="M4 20h4l10-10-4-4L4 16v4z" />
    <path d="M13.5 6.5l4 4" />
  </SvgIcon>
);
export const DeleteIcon = () => (
  <SvgIcon>
    <path d="M4 7h16" />
    <path d="M9 7V5h6v2" />
    <path d="M7 7l1 12h8l1-12" />
    <path d="M10 11v5M14 11v5" />
  </SvgIcon>
);
export const FoodIcon = () => (
  <SvgIcon>
    <path d="M4 14a8 8 0 0016 0H4z" />
    <path d="M8.5 10V6M12 10V5M15.5 10V6" />
  </SvgIcon>
);
export const CameraIcon = () => (
  <SvgIcon>
    <rect x="3" y="7" width="18" height="13" rx="2.5" />
    <path d="M8 7l1.4-2h5.2L16 7" />
    <circle cx="12" cy="13.5" r="3.2" />
  </SvgIcon>
);
export const SproutIcon = () => (
  <SvgIcon>
    <path d="M12 20v-8" />
    <path d="M12 12c0-3.5-2.6-6.2-6-6 0 3.5 2.3 6.1 6 6z" />
    <path d="M12 12c0-3.5 2.6-6.2 6-6 0 3.5-2.3 6.1-6 6z" />
  </SvgIcon>
);
export const TrendIcon = () => (
  <SvgIcon>
    <path d="M4 17l5-5 4 3 7-7" />
    <path d="M15 8h5v5" />
  </SvgIcon>
);
export const ResetIcon = () => (
  <SvgIcon>
    <path d="M4 11a8 8 0 111.8 5.1" />
    <path d="M4 6v5h5" />
  </SvgIcon>
);
