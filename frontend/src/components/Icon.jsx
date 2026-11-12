const paths = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1.6" />
      <rect x="14" y="14" width="7" height="7" rx="1.6" />
    </>
  ),
  building: (
    <>
      <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5V21" />
      <path d="M15 9h3.5A1.5 1.5 0 0 1 20 10.5V21" />
      <path d="M2.5 21h19" />
      <path d="M7 8h1.5M11 8h1.5M7 12h1.5M11 12h1.5M7 16h1.5M11 16h1.5" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2.2" />
      <path d="M9 4V3.2A1.2 1.2 0 0 1 10.2 2h3.6A1.2 1.2 0 0 1 15 3.2V4" />
      <path d="M9 11h6M9 15h4" />
    </>
  ),
  fileCheck: (
    <>
      <path d="M14 2H7.5A1.5 1.5 0 0 0 6 3.5v17A1.5 1.5 0 0 0 7.5 22h9a1.5 1.5 0 0 0 1.5-1.5V6z" />
      <path d="M14 2v4h4" />
      <path d="m9.5 14 1.8 1.8 3.4-3.6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.8 21a6.2 6.2 0 0 1 12.4 0" />
      <path d="M16.5 5.2a3.2 3.2 0 0 1 0 6.1" />
      <path d="M18.2 14.2A5.6 5.6 0 0 1 22 19.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-3.8 8-10V5.4L12 2 4 5.4V12c0 6.2 8 10 8 10z" />
      <path d="m8.8 11.8 2.1 2.2 4.3-4.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.4-3.4" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8.5a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18c0-1.5-3-1.5-3-8.5" />
      <path d="M10 20a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  arrowRight: <path d="M4 12h15m-6-6 6 6-6 6" />,
  arrowUpRight: <path d="M7 17 17 7M7 7h10v10" />,
  arrowUp: <path d="M12 19V5m-6 6 6-6 6 6" />,
  arrowDown: <path d="M12 5v14m6-6-6 6-6-6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 9h17M3.5 15h17" />
      <path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" />
    </>
  ),
  play: <path d="m9 7 8 5-8 5z" fill="currentColor" stroke="none" />,
  heartShield: (
    <>
      <path d="M12 21s-7.5-4.3-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 3.3C19.5 16.7 12 21 12 21z" />
      <path d="m9.1 12.1 2 2 3.8-4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  userCheck: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.8 21a6.2 6.2 0 0 1 12.4 0" />
      <path d="m16.5 10.5 2 2 3.5-4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  check: <path d="m4.5 12.5 4.5 4.5L19.5 6.5" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.3 2.7 2.7 5.6-6" />
    </>
  ),
  alertCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5h.01" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" />,
  logout: (
    <>
      <path d="M10 4H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h3" />
      <path d="M15 8l4 4-4 4M19 12H9" />
    </>
  ),
  heart: <path d="M12 21s-8-4.6-8-10.4A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 3.6C20 16.4 12 21 12 21z" />,
  heartPulse: (
    <>
      <path d="M12 21s-8-4.6-8-10.4A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 3.6C20 16.4 12 21 12 21z" />
      <path d="M4.5 12.5H8l1.5-3 2.2 5 1.7-3.5h5" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3.5 13.6 9l5.4 1.6-5.4 1.5L12 17.5l-1.6-5.4L5 10.6 10.4 9z" />
      <path d="M19 16.5 19.7 19l2.3.7-2.3.6-.7 2.2-.7-2.2-2.2-.6 2.2-.7z" />
    </>
  ),
  activity: <path d="M2 12h4l2.5-7 5 14 2.5-7H22" />,
  layers: (
    <>
      <path d="m12 2 9 5-9 5-9-5z" />
      <path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
    </>
  ),
  bed: (
    <>
      <path d="M3 18V7M21 18v-6a2 2 0 0 0-2-2H9v8" />
      <path d="M3 14h18M6.5 8.5h.01" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </>
  ),
  logout2: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h10M18 18h2" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="16" cy="18" r="2" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5z" />
      <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" />
    </>
  ),
  helpCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9a2.5 2.5 0 1 1 3.8 2.2c-.9.6-1.4 1.1-1.4 2.3M12 17h.01" />
    </>
  ),
}

const directionalIcons = new Set(['chevronRight', 'chevronLeft', 'arrowRight', 'logout', 'logout2'])

export default function Icon({ name, size = 20, strokeWidth = 1.6, className = '', ...rest }) {
  const content = paths[name]

  if (!content) return null

  const iconClass = [className, directionalIcons.has(name) ? 'sa-icon-directional' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <svg
      aria-hidden="true"
      className={iconClass}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
      {...rest}
    >
      {content}
    </svg>
  )
}
