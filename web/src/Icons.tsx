const base = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false } as const;

/** Arrow leaving a box: "opens the original". */
export const OpenIcon = () => (
  <svg {...base}>
    <path d="M9 3h4v4" />
    <path d="M13 3 7.5 8.5" />
    <path d="M11.5 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1H6.5" />
  </svg>
);

export const CloseIcon = () => (
  <svg {...base} width={12} height={12}>
    <path d="m3.5 3.5 9 9M12.5 3.5l-9 9" />
  </svg>
);

export const ChevronIcon = () => (
  <svg {...base} width={14} height={14}>
    <path d="m4 6 4 4 4-4" />
  </svg>
);