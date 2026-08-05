export function LocalDemoNote({ className = "" }: { className?: string }) {
  return (
    <p
      className={`rounded-sm border border-cellar-gold/40 bg-cellar-gold/10 px-3 py-2 text-xs text-cellar-text/80 ${className}`}
    >
      This is a local demo only — it runs entirely in your browser and isn&rsquo;t
      saved anywhere. Real tastings created with &ldquo;Host a tasting&rdquo; are
      saved online so guests can join from their own phones.
    </p>
  );
}
