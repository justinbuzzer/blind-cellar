interface StatProps {
  label: string;
  value: string | number;
}

/** A small labelled number, used in result/leaderboard stat grids. */
export function Stat({ label, value }: StatProps) {
  return (
    <div>
      <p className="text-lg font-semibold text-cellar-maroon-dark">{value}</p>
      <p className="text-xs text-cellar-text/60">{label}</p>
    </div>
  );
}
