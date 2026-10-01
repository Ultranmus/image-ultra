/** The Image Ultra mark: crop corners around a photo. Same artwork as `app/icon.svg`. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="iu-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b2f8b" />
          <stop offset="1" stopColor="#3a1240" />
        </linearGradient>
        <linearGradient id="iu-logo-sun" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd166" />
          <stop offset="1" stopColor="#ff8a5c" />
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="30" fill="url(#iu-logo-bg)" />
      <g fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M26 46V26h20" />
        <path d="M102 82v20H82" />
      </g>
      <g
        fill="none"
        stroke="#fff"
        strokeOpacity=".45"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M82 26h20v20" />
        <path d="M46 102H26V82" />
      </g>
      <circle cx="78" cy="48" r="9" fill="url(#iu-logo-sun)" />
      <path
        d="M36 90 56 63 70 80 80 69 94 90Z"
        fill="#fff"
        stroke="#fff"
        strokeWidth="5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
