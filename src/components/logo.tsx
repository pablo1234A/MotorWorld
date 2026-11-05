export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none">
      <rect x="1" y="1" width="22" height="22" rx="7" fill="#7c6cff" />
      <path d="M6.5 8.5l2.2 7.5 3.3-6 3.3 6 2.2-7.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight">
      <LogoMark />
      World Builder <span className="text-muted">AI</span>
    </span>
  );
}
