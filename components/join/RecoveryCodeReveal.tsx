import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { SectionEyebrow } from "@/components/SectionEyebrow";

interface RecoveryCodeRevealProps {
  code: string;
  onAcknowledge: () => void;
}

/**
 * The one-time "You're in" confirmation shown right after a new guest joins
 * — see README "Session rejoin" — "Guest first-join flow". Deliberately has
 * no aria-live region: the code must never be announced automatically,
 * only read if the user navigates to it. `select-all` makes the code easy
 * to select for copying without relying on a copy button (kept out of
 * scope — no clipboard/share affordance beyond reading the code).
 */
export function RecoveryCodeReveal({ code, onAcknowledge }: RecoveryCodeRevealProps) {
  return (
    <Card className="flex flex-col gap-4 text-center">
      <div>
        <SectionEyebrow>You&rsquo;re in</SectionEyebrow>
        <p className="mt-2 text-sm text-cellar-text">
          Save this rejoin code in case you change devices or clear your browser:
        </p>
      </div>
      <p
        className="select-all rounded-sm border border-cellar-border bg-cellar-bg-deep py-4 font-mono text-2xl font-semibold tracking-[0.2em] text-cellar-maroon-dark"
        aria-label={`Your rejoin code is ${code}`}
      >
        {code}
      </p>
      <p className="text-xs text-cellar-muted">
        This code can restore your tasting access on another device.
      </p>
      <Button fullWidth onClick={onAcknowledge}>
        I&rsquo;ve saved it
      </Button>
    </Card>
  );
}
