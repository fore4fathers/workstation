const stroke = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
};

export function IconHome() {
  return (
    <svg {...stroke}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

export function IconTasks() {
  return (
    <svg {...stroke}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

export function IconLeaders() {
  return (
    <svg {...stroke}>
      <path d="M4 19h16" />
      <path d="M7 19V11h3v8M14 19V8h3v11M10.5 8 12 4l1.5 4z" />
    </svg>
  );
}

export function IconWallet() {
  return (
    <svg {...stroke}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M16 12.5h.01" />
      <path d="M3 10h18" />
    </svg>
  );
}

export function IconProfile() {
  return (
    <svg {...stroke}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19.5c1.4-3.2 3.9-4.8 7-4.8s5.6 1.6 7 4.8" />
    </svg>
  );
}

export function IconChat() {
  return (
    <svg {...stroke}>
      <path d="M5 6h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3V7a1 1 0 0 1 1-1z" />
    </svg>
  );
}

export function IconBack() {
  return (
    <svg {...stroke}>
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}
