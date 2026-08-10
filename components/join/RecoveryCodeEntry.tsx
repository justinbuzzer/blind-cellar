import { useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { TextField } from "@/components/TextField";

interface RecoveryCodeEntryProps {
  onSubmit: (code: string) => void;
  onBack: () => void;
  error?: string | null;
  busy?: boolean;
}

/** "Enter rejoin code" — see README "Session rejoin" — "Guest recovery flow". */
export function RecoveryCodeEntry({ onSubmit, onBack, error, busy }: RecoveryCodeEntryProps) {
  const [code, setCode] = useState("");

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-cellar-maroon-dark">
          Already joined?
        </h2>
        <p className="mt-1 text-sm text-cellar-muted">Enter your rejoin code to continue.</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) onSubmit(code.trim());
        }}
        noValidate
        className="flex flex-col gap-4"
      >
        <TextField
          label="Rejoin code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          error={error ?? undefined}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          placeholder="e.g. 7XQK-4M9P"
        />
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button type="submit" fullWidth disabled={busy || !code.trim()}>
            {busy ? "Checking…" : "Continue"}
          </Button>
          <Button type="button" variant="ghost" fullWidth onClick={onBack} disabled={busy}>
            Back
          </Button>
        </div>
      </form>
    </Card>
  );
}
