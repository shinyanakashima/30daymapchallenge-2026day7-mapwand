export function Logo() {
  return (
    <div className="logo" aria-label="MapWand">
      <svg viewBox="0 0 40 40" width="30" height="30" aria-hidden="true">
        <rect x="9" y="17" width="7" height="22" rx="3.5" transform="rotate(-35 12.5 28)" fill="currentColor" />
        <path d="M27 3 l2.4 5.6 5.6 2.4 -5.6 2.4 -2.4 5.6 -2.4 -5.6 -5.6 -2.4 5.6 -2.4z" fill="var(--accent)" />
      </svg>
      <span>MapWand</span>
    </div>
  );
}
