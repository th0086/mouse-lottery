type FreeBetsPillProps = {
  count: number;
  className?: string;
};

export function FreeBetsPill({ count, className }: FreeBetsPillProps) {
  return (
    <div className={`missions-bet-pill breathe${className ? ` ${className}` : ""}`} aria-live="polite">
      <img src="/mission-bet-icon.png" alt="" aria-hidden="true" />
      <span>You currently have {count} bet</span>
    </div>
  );
}
