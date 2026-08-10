import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { IdentityMatch } from "@/lib/rejoin";

interface IdentityChooserProps {
  account: IdentityMatch;
  guest: IdentityMatch;
  onChooseAccount: () => void;
  onChooseGuest: () => void;
  onUseDifferentAccount: () => void;
  busy?: boolean;
}

/**
 * "We found two tasting identities on this device" — see README "Session
 * rejoin" — "Conflicting account and guest identity". Never merges the two
 * records; a choice here only decides which already-resolved identity this
 * browser continues as. Plain buttons (not radio+submit) so keyboard and
 * screen-reader users get one direct, unambiguous activation per option.
 */
export function IdentityChooser({
  account,
  guest,
  onChooseAccount,
  onChooseGuest,
  onUseDifferentAccount,
  busy,
}: IdentityChooserProps) {
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-cellar-maroon-dark">
          We found two tasting identities on this device.
        </h2>
        <p className="mt-1 text-sm text-cellar-muted">Continue as:</p>
      </div>
      <div
        className="flex flex-col gap-2"
        role="group"
        aria-label="Choose which identity to continue as"
      >
        <Button variant="secondary" fullWidth onClick={onChooseAccount} disabled={busy}>
          {account.displayName} — account
        </Button>
        <Button variant="secondary" fullWidth onClick={onChooseGuest} disabled={busy}>
          {guest.displayName} — guest
        </Button>
      </div>
      <Button variant="ghost" fullWidth onClick={onUseDifferentAccount} disabled={busy}>
        Use a different account
      </Button>
    </Card>
  );
}
